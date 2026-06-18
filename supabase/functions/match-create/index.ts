// supabase/functions/match-create/index.ts
//
// Phase 1B-3 — backend-authoritative match creation.
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
//   8. Run scoring → pickBestCandidate.
//   9. Call create_authorized_match RPC (service-role only) for the
//      atomic INSERT. The RPC re-verifies every invariant — cap on
//      both sides, active match on both sides, no-rematch, gender
//      bi-directional, height must_have bi-directional. Phase 1B-3
//      maps the RPC's `candidate_unavailable` status to `no_candidate`;
//      retry-next-best is deferred to Phase 1B-4.
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
import { pickBestCandidate, type CandidateInput } from "./scoring.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

// Get the user's current active match id if any.
async function fetchActiveMatchId(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('matches')
    .select('id')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .eq('status', 'active')
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
// holds an 'active' match (and therefore cannot accept a new one).
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
    .eq('status', 'active')
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
      return jsonResponse({ status: 'incomplete_profile' })
    }
    if (!callerProfile.onboarding_completed
        || !callerProfile.gender
        || !Array.isArray(callerProfile.interested_in_genders)
        || callerProfile.interested_in_genders.length === 0) {
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

    // 11. Score.
    const winner = pickBestCandidate(callerProfile, callerAnswers, candidatesForScoring)
    if (!winner) return jsonResponse({ status: 'no_candidate' })

    // 12. Atomic insert via service-role RPC. The RPC re-verifies all
    //     invariants (caller + winner onboarding, gender, height
    //     must_have, no-rematch, both-sides monthly cap, both-sides
    //     active-match) and returns a jsonb status payload. We surface
    //     its result verbatim to the client, mapping the race-condition
    //     "candidate_unavailable" outcome to "no_candidate" for this
    //     phase. Retry-next-best is planned for Phase 1B-4.
    //
    //     The RPC params are entirely server-derived:
    //       p_user_id   = callerId (from verified JWT)
    //       p_winner_id = winner.candidateId (from server scoring)
    //       p_score     = winner.score      (server-clamped)
    //       p_reasons   = winner.reasons    (server-generated Hebrew)
    //       p_depth     = winner.depth      ('fast' | 'deep')
    //     Nothing here is sourced from the request body.
    const { data: rpcResult, error: rpcErr } = await admin.rpc(
      'create_authorized_match',
      {
        p_user_id:   callerId,
        p_winner_id: winner.candidateId,
        p_score:     winner.score,
        p_reasons:   winner.reasons,
        p_depth:     winner.depth,
      },
    )

    if (rpcErr) {
      // Likely paths here: function not yet deployed (migration 016 not
      // applied), network blip, or an unexpected SQL exception. Surface a
      // generic 'error' status; do not echo internal details beyond what
      // the supabase-js client already exposed.
      return jsonResponse({ status: 'error', message: rpcErr.message }, 500)
    }
    if (!rpcResult || typeof rpcResult !== 'object') {
      return jsonResponse({ status: 'error', message: 'empty rpc response' }, 500)
    }

    const rpcStatus = (rpcResult as Record<string, unknown>).status

    if (rpcStatus === 'candidate_unavailable') {
      // Phase 1B-3: collapse to no_candidate so the client treats it as a
      // transient empty-state. The internal `reason` (gender_mismatch /
      // candidate_capped / candidate_has_active / etc.) is intentionally
      // not surfaced to the client to avoid leaking other-user state.
      // Phase 1B-4 will replace this branch with a retry-next-best loop.
      return jsonResponse({ status: 'no_candidate' })
    }

    // Pass through 'created' / 'monthly_cap_reached' / 'already_has_active'
    // / 'incomplete_profile' / 'error' verbatim.
    return jsonResponse(rpcResult)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    return jsonResponse({ status: 'error', message }, 500)
  }
})
