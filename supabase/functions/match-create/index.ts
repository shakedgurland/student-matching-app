// supabase/functions/match-create/index.ts
//
// Phase 1B-4 — backend-authoritative match creation with retry.
//
// Flow:
//   1. CORS preflight.
//   2. Build admin client (service role).
//   3. Verify JWT and derive callerId. Request body is ignored.
//   4. Pre-flight caller checks (onboarding, monthly cap, active match,
//      questionnaire answers present).
//   5. Fetch caller's past peers (no-rematch exclusion).
//   6. Fetch candidate pool via service role.
//   7. Filter out capped candidates and candidates with active matches.
//   8. Run scoring → rankCandidates (top-N ranked by score desc).
//   9. Retry loop: call create_authorized_match RPC (service-role
//      only) for the top MIN(ranked.length, MAX_ATTEMPTS) candidates.
//      The RPC re-verifies every invariant — cap on both sides,
//      active match on both sides, no-rematch, gender bi-directional,
//      height must_have bi-directional. Only the race-condition
//      status `candidate_unavailable` triggers a retry; all other
//      statuses ('created' / 'monthly_cap_reached' / 'already_has_active'
//      / 'incomplete_profile' / 'error') stop and pass through verbatim.
//      If every attempt returns `candidate_unavailable`, the response
//      is collapsed to `no_candidate`.
//
// SECURITY:
//   - The only trusted user identifier is admin.auth.getUser(jwt).id.
//   - Request body is never read for any user_id / candidate_id /
//     score / reasons / depth. All RPC params come from server-side
//     state (verified JWT) or server-side computation (scoring output).
//   - JWT, Authorization header, service role key, env values, and raw
//     questionnaire answers are never logged.
//   - Only the chosen candidate's id + score + reasons + depth are
//     returned to the client. The full candidate pool never leaves the
//     server.
//   - The RPC is granted EXECUTE only to service_role; authenticated
//     clients calling it directly receive "permission denied for
//     function". This Edge Function is the only path that can reach it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { rankCandidates, type CandidateInput, type CompatibilityEvidence } from "./scoring.ts"
import { generateIcebreaker } from "./icebreaker.ts"

// Persist the structured compatibility evidence array onto the
// just-inserted match row via a service-role JSON merge into
// matches.metadata. The RPC already populated metadata = { depth }; we
// SELECT the current value, merge in { compatibility_evidence }, then
// UPDATE. SELECT-then-UPDATE (two round-trips) is preferred over a blind
// overwrite so that any future metadata keys added by other writers are
// preserved. The migration-016 icebreaker update writes a separate
// column (icebreaker_hint), not metadata — no race on this key.
//
// Throws on any read/write error; the caller in the main flow wraps this
// in try/catch so that an evidence-persist failure is non-fatal — the
// match is still valid, and compatibility_reasons text[] already carries
// the same data rendered as Hebrew bullets (a strict superset of what an
// old client renders today).
async function persistCompatibilityEvidence(
  admin: SupabaseClient,
  matchId: string,
  evidence: CompatibilityEvidence[],
): Promise<void> {
  const { data, error: readErr } = await admin
    .from('matches')
    .select('metadata')
    .eq('id', matchId)
    .single()
  if (readErr || !data) {
    throw readErr ?? new Error('match metadata read returned no row')
  }
  const current = (data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata))
    ? data.metadata as Record<string, unknown>
    : {}
  const merged = { ...current, compatibility_evidence: evidence }
  const { error: writeErr } = await admin
    .from('matches')
    .update({ metadata: merged })
    .eq('id', matchId)
  if (writeErr) throw writeErr
}

// Fetch the LLM-derived traits blob for a single user, if any. Returns
// null when the row is absent (fast users + deep users without enough
// free text fall here). Errors return null so a transient
// profile_ai_traits read never breaks match creation.
async function fetchAiTraitsForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from('profile_ai_traits')
    .select('traits')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data || typeof data.traits !== 'object' || data.traits === null) return null
  return data.traits as Record<string, unknown>
}

// Bulk fetch traits for a set of candidate user ids. Returns a Map so
// the caller can attach the right blob to each CandidateInput in O(1).
async function fetchAiTraitsForUsers(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>()
  if (userIds.length === 0) return out
  const { data, error } = await admin
    .from('profile_ai_traits')
    .select('user_id, traits')
    .in('user_id', userIds)
  if (error || !data) return out
  for (const row of data) {
    if (row.user_id && typeof row.traits === 'object' && row.traits !== null) {
      out.set(row.user_id as string, row.traits as Record<string, unknown>)
    }
  }
  return out
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Maximum RPC attempts per invocation. Bounds Edge Function latency
// (each round-trip ~50-200ms; 3 attempts ≲ 600ms worst-case) and
// caps wasted work when the top candidates lose a race.
const MAX_ATTEMPTS = 3

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Start of the current calendar month, as an ISO timestamp for `.gte()`.
function startOfMonthISO(): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

// Count this user's matches in the current calendar month across both
// sides. Mirrors public.count_user_matches_this_month — kept JS-side so
// the dry-run flow can pre-filter candidates before the RPC exists.
async function countMatchesThisMonth(admin: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await admin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .gte('created_at', startOfMonthISO())
  if (error) throw error
  return count ?? 0
}

// Get the user's current open match id if any. "Open" means active OR
// chat_started — both block receiving a new match (migration 023). expired
// and unmatched do not block. The defense-in-depth RPC re-checks with the
// same criteria.
async function fetchActiveMatchId(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('matches')
    .select('id')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .in('status', ['active', 'chat_started'])
    .limit(1)
  if (error) throw error
  return data && data.length > 0 ? data[0].id : null
}

// IDs of every user the caller has ever been matched with (any status,
// any direction). Used to enforce the no-rematch rule.
async function fetchPastPeerIds(admin: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from('matches')
    .select('user_a_id, user_b_id')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
  if (error) throw error
  const peers = new Set<string>()
  for (const row of data ?? []) {
    peers.add(row.user_a_id === userId ? row.user_b_id : row.user_a_id)
  }
  return peers
}

// For a list of candidate user ids, return the subset whose monthly
// match count is already ≥ 5 (capped). Single query + JS aggregation.
async function fetchCappedCandidateIds(
  admin: SupabaseClient,
  candidateIds: string[],
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set()
  // Build OR filter spanning both user_a_id and user_b_id for the candidate set.
  const orFilter = candidateIds
    .map(id => `user_a_id.eq.${id},user_b_id.eq.${id}`)
    .join(',')
  const { data, error } = await admin
    .from('matches')
    .select('user_a_id, user_b_id')
    .gte('created_at', startOfMonthISO())
    .or(orFilter)
  if (error) throw error
  const counts = new Map<string, number>()
  const candidateSet = new Set(candidateIds)
  for (const row of data ?? []) {
    if (candidateSet.has(row.user_a_id)) counts.set(row.user_a_id, (counts.get(row.user_a_id) ?? 0) + 1)
    if (candidateSet.has(row.user_b_id)) counts.set(row.user_b_id, (counts.get(row.user_b_id) ?? 0) + 1)
  }
  const capped = new Set<string>()
  for (const [id, n] of counts) if (n >= 5) capped.add(id)
  return capped
}

// For a list of candidate user ids, return the subset that currently
// holds an open match (active OR chat_started — both block per migration
// 023) and therefore cannot accept a new one. expired and unmatched do
// not block.
async function fetchCandidateIdsWithActive(
  admin: SupabaseClient,
  candidateIds: string[],
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set()
  const orFilter = candidateIds
    .map(id => `user_a_id.eq.${id},user_b_id.eq.${id}`)
    .join(',')
  const { data, error } = await admin
    .from('matches')
    .select('user_a_id, user_b_id')
    .in('status', ['active', 'chat_started'])
    .or(orFilter)
  if (error) throw error
  const candidateSet = new Set(candidateIds)
  const blocked = new Set<string>()
  for (const row of data ?? []) {
    if (candidateSet.has(row.user_a_id)) blocked.add(row.user_a_id)
    if (candidateSet.has(row.user_b_id)) blocked.add(row.user_b_id)
  }
  return blocked
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Admin client (service role).
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('UNIMATCH_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ status: 'error', message: 'server misconfigured' }, 500)
    }
    const admin = createClient(supabaseUrl, serviceRoleKey)

    // 2. JWT extraction + verification. The only trusted source of caller
    //    identity. Request body is intentionally ignored — no user-id,
    //    winner-id, or score input is accepted from the client.
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice('bearer '.length).trim()
      : ''
    if (!jwt) return jsonResponse({ status: 'unauthorized' }, 401)
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return jsonResponse({ status: 'unauthorized' }, 401)
    const callerId = user.id

    // 3. Pre-flight: caller's profile, onboarding, required hard-filter inputs.
    const { data: callerProfile, error: profErr } = await admin
      .from('profiles')
      .select('*')
      .eq('id', callerId)
      .single()
    if (profErr || !callerProfile) {
      console.log(JSON.stringify({
        event: 'match_create_preflight_fail',
        branch: 'A',
        callerIdPrefix: callerId.slice(0, 8),
        profileErr: !!profErr,
        profileErrCode: profErr?.code ?? null,
        profileNull: !callerProfile,
      }))
      return jsonResponse({ status: 'incomplete_profile' })
    }
    if (!callerProfile.onboarding_completed
        || !callerProfile.gender
        || !Array.isArray(callerProfile.interested_in_genders)
        || callerProfile.interested_in_genders.length === 0) {
      console.log(JSON.stringify({
        event: 'match_create_preflight_fail',
        branch: 'B',
        callerIdPrefix: callerId.slice(0, 8),
        hasOnboarding: !!callerProfile.onboarding_completed,
        hasGender: !!callerProfile.gender,
        interestedIsArray: Array.isArray(callerProfile.interested_in_genders),
        interestedLen: Array.isArray(callerProfile.interested_in_genders)
          ? callerProfile.interested_in_genders.length
          : 0,
      }))
      return jsonResponse({ status: 'incomplete_profile' })
    }

    // 4. Caller monthly cap.
    const callerCount = await countMatchesThisMonth(admin, callerId)
    if (callerCount >= 5) return jsonResponse({ status: 'monthly_cap_reached' })

    // 5. Caller active match.
    const callerActiveId = await fetchActiveMatchId(admin, callerId)
    if (callerActiveId) {
      return jsonResponse({ status: 'already_has_active', match_id: callerActiveId })
    }

    // 6. Caller's questionnaire answers (required by scoring).
    const { data: callerAnswersRow, error: ansErr } = await admin
      .from('questionnaire_answers')
      .select('answers')
      .eq('user_id', callerId)
      .single()
    if (ansErr || !callerAnswersRow) {
      console.log(JSON.stringify({
        event: 'match_create_preflight_fail',
        branch: 'C',
        callerIdPrefix: callerId.slice(0, 8),
        ansErr: !!ansErr,
        ansErrCode: ansErr?.code ?? null,
        rowNull: !callerAnswersRow,
      }))
      return jsonResponse({ status: 'incomplete_profile' })
    }
    const callerAnswers = (callerAnswersRow.answers ?? {}) as Record<string, unknown>

    // 7. Candidate pool: every onboarded user except the caller themselves,
    //    joined with their questionnaire_answers.
    const { data: rawCandidates, error: candErr } = await admin
      .from('profiles')
      .select('*, questionnaire_answers!inner(answers)')
      .neq('id', callerId)
      .eq('onboarding_completed', true)
    if (candErr) throw candErr
    if (!rawCandidates || rawCandidates.length === 0) {
      return jsonResponse({ status: 'no_candidate' })
    }

    // 8. Exclude past peers (no-rematch).
    const pastPeers = await fetchPastPeerIds(admin, callerId)
    const afterPastFilter = rawCandidates.filter((c) => !pastPeers.has(c.id))
    if (afterPastFilter.length === 0) return jsonResponse({ status: 'no_candidate' })

    // 9. Exclude capped and active-holding candidates (bi-directional rules).
    const candidateIds = afterPastFilter.map((c) => c.id as string)
    const [capped, withActive] = await Promise.all([
      fetchCappedCandidateIds(admin, candidateIds),
      fetchCandidateIdsWithActive(admin, candidateIds),
    ])
    const eligible = afterPastFilter.filter(
      (c) => !capped.has(c.id) && !withActive.has(c.id),
    )
    if (eligible.length === 0) return jsonResponse({ status: 'no_candidate' })

    // 10. Normalize to CandidateInput shape for the pure scorer.
    const candidatesForScoring: CandidateInput[] = eligible.map((c) => {
      // questionnaire_answers comes back as an array (because of !inner) or
      // an object depending on the join shape. Handle both.
      const qa = c.questionnaire_answers
      const answers = Array.isArray(qa)
        ? (qa[0]?.answers ?? {})
        : (qa?.answers ?? {})
      const profile: Record<string, unknown> = { ...c }
      delete (profile as Record<string, unknown>).questionnaire_answers
      return {
        id: c.id as string,
        profile,
        answers: answers as Record<string, unknown>,
      }
    })

    // 10b. AI traits (PR-AUDIT-D PR 2). Fetch caller's row and bulk-fetch
    //      every eligible candidate's row in parallel. Each is optional —
    //      missing rows degrade gracefully to score-contribution 0 in
    //      scoring.ts. Failure of either fetch is non-fatal: matching
    //      still proceeds without the AI complement.
    const candidateUserIds = candidatesForScoring.map((c) => c.id)
    const [callerAiTraits, candidateAiMap] = await Promise.all([
      fetchAiTraitsForUser(admin, callerId),
      fetchAiTraitsForUsers(admin, candidateUserIds),
    ])
    for (const c of candidatesForScoring) {
      c.aiTraits = candidateAiMap.get(c.id) ?? null
    }

    // 11. Rank eligible candidates by score (descending). Each candidate
    //     has already passed pre-filters (no-rematch, not-capped, no
    //     active match) so this pass adds only the hard-filter +
    //     scoring layer. AI traits enter as a capped ±8 soft complement
    //     (scoring.ts § aiTraitContribution); zero when either side
    //     lacks an AI traits row.
    const ranked = rankCandidates(callerProfile, callerAnswers, callerAiTraits, candidatesForScoring)
    if (ranked.length === 0) return jsonResponse({ status: 'no_candidate' })

    // 12. Retry loop: try the top MIN(ranked.length, MAX_ATTEMPTS)
    //     candidates until the RPC accepts one or terminates with a
    //     non-retryable status.
    //
    //     The RPC re-verifies every invariant atomically (caller +
    //     winner onboarding, gender, height must_have, no-rematch,
    //     both-sides monthly cap, both-sides active match). Only
    //     'candidate_unavailable' triggers a retry — that status
    //     signals a race condition (a candidate became capped/active
    //     in the gap between our pre-filter and the RPC's re-check).
    //     All other statuses stop the loop immediately:
    //       'created'              → success, returned verbatim
    //       'monthly_cap_reached'  → caller-side; retry can't help
    //       'already_has_active'   → caller-side; retry would race
    //       'incomplete_profile'   → caller-side
    //       'error'                → likely structural; do not retry
    //     A transport-level rpcErr also stops the loop.
    //
    //     The RPC params are entirely server-derived per attempt:
    //       p_user_id   = callerId (from verified JWT)
    //       p_winner_id = ranked[i].candidateId (server scoring)
    //       p_score     = ranked[i].score      (server-clamped)
    //       p_reasons   = ranked[i].reasons    (server Hebrew)
    //       p_depth     = ranked[i].depth      ('fast' | 'deep')
    //     Nothing here is sourced from the request body.
    //
    //     The internal 'reason' field on 'candidate_unavailable' is
    //     consumed locally to decide whether to continue, then
    //     discarded — never forwarded to the client. Rejected
    //     candidate IDs likewise never leave the function.
    const attempts = Math.min(ranked.length, MAX_ATTEMPTS)
    for (let i = 0; i < attempts; i++) {
      const candidate = ranked[i]
      const { data: rpcResult, error: rpcErr } = await admin.rpc(
        'create_authorized_match',
        {
          p_user_id:   callerId,
          p_winner_id: candidate.candidateId,
          p_score:     candidate.score,
          p_reasons:   candidate.reasons,
          p_depth:     candidate.depth,
        },
      )

      if (rpcErr) {
        // Likely paths: function not yet deployed (migration 016 not
        // applied), network blip, or unexpected SQL exception. Stop
        // the loop and surface a generic 'error' status.
        return jsonResponse({ status: 'error', message: rpcErr.message }, 500)
      }
      if (!rpcResult || typeof rpcResult !== 'object') {
        return jsonResponse({ status: 'error', message: 'empty rpc response' }, 500)
      }

      const rpcStatus = (rpcResult as Record<string, unknown>).status

      if (rpcStatus === 'candidate_unavailable') {
        // Race-condition signal. Try the next-best candidate.
        continue
      }

      // On 'created', generate a deterministic icebreaker from the
      // already-loaded caller + winner data (no extra DB read) and
      // persist via service-role UPDATE. Two-track observability:
      //   * persist success → 'icebreaker_persisted' log (matchIdPrefix only)
      //   * persist failure → 'icebreaker_persist_failed' with code + message
      //   * generation throw → 'icebreaker_generate_exception'
      // Match creation NEVER fails because of icebreaker work — the
      // user still gets their match. The generated hint is captured in
      // `icebreakerHint` and included in the JSON response as a
      // best-effort echo so callers can render immediately even if the
      // DB write was rejected by transient RLS / network.
      let icebreakerHint: string | null = null
      if (rpcStatus === 'created') {
        const newMatchId = (rpcResult as Record<string, unknown>).match_id
        const winnerForIcebreaker = candidatesForScoring.find((c) => c.id === candidate.candidateId)
        if (typeof newMatchId === 'string' && winnerForIcebreaker) {
          try {
            const hint = generateIcebreaker(
              { profile: callerProfile as Record<string, unknown>, answers: callerAnswers },
              { profile: winnerForIcebreaker.profile, answers: winnerForIcebreaker.answers },
            )
            icebreakerHint = hint
            const { error: icebreakerErr } = await admin
              .from('matches')
              .update({ icebreaker_hint: hint })
              .eq('id', newMatchId)
            if (icebreakerErr) {
              console.log(JSON.stringify({
                event: 'icebreaker_persist_failed',
                matchIdPrefix: newMatchId.slice(0, 8),
                code: icebreakerErr.code ?? null,
                message: icebreakerErr.message ?? null,
              }))
            } else {
              console.log(JSON.stringify({
                event: 'icebreaker_persisted',
                matchIdPrefix: newMatchId.slice(0, 8),
              }))
            }
          } catch (e) {
            console.log(JSON.stringify({
              event: 'icebreaker_generate_exception',
              message: e instanceof Error ? e.message : 'unknown',
            }))
          }
        }

        // PR 1: persist structured compatibility evidence into
        // matches.metadata.compatibility_evidence. Mirrors the icebreaker
        // observability pattern. Non-fatal — the concrete Hebrew strings
        // are already in matches.compatibility_reasons (written by the
        // RPC via p_reasons), so a failed evidence write leaves the user
        // with the same truthful copy a successful write would yield;
        // only the structured form (which PR 2 will surface as cards) is
        // missing. evidenceCount is logged for visibility; the contents
        // are not logged (no raw answers, codes, or labels in logs).
        if (typeof newMatchId === 'string') {
          try {
            await persistCompatibilityEvidence(admin, newMatchId, candidate.evidence)
            console.log(JSON.stringify({
              event: 'evidence_persisted',
              matchIdPrefix: newMatchId.slice(0, 8),
              evidenceCount: candidate.evidence.length,
            }))
          } catch (e) {
            const code = typeof (e as { code?: unknown }).code === 'string'
              ? (e as { code: string }).code
              : null
            console.log(JSON.stringify({
              event: 'evidence_persist_failed',
              matchIdPrefix: newMatchId.slice(0, 8),
              code,
              message: e instanceof Error ? e.message : 'unknown',
            }))
          }
        }
      }

      // Pass through 'created' / 'monthly_cap_reached' /
      // 'already_has_active' / 'incomplete_profile' / 'error' verbatim,
      // augmenting 'created' with the generated icebreaker (when we
      // produced one) so the client has it even if the DB UPDATE missed.
      const responsePayload = icebreakerHint !== null
        ? { ...(rpcResult as Record<string, unknown>), icebreaker_hint: icebreakerHint }
        : rpcResult
      return jsonResponse(responsePayload)
    }

    // Exhausted all attempts with 'candidate_unavailable'. Collapse to
    // 'no_candidate' so the client treats it as a transient empty
    // state. Attempt count and tried-candidate IDs are deliberately
    // not surfaced.
    return jsonResponse({ status: 'no_candidate' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    return jsonResponse({ status: 'error', message }, 500)
  }
})
