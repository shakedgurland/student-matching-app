// =============================================================================
// Client matching surface.
//
// As of Phase 1C, all match creation goes through the backend-authoritative
// `match-create` Edge Function. This file is a thin wrapper that:
//   • invokes the function with an empty body (no client-trusted inputs),
//   • on `created`, fetches the matched profile so the UI can render it,
//   • on every other status, returns a discriminated object the UI can act on.
//
// What this file deliberately does NOT do anymore:
//   • No client-side scoring. The full TypeScript scorer lives in the Edge
//     Function (`supabase/functions/match-create/scoring.ts` + `traits.ts`).
//   • No client write into `public.matches`. The anon-key client has no
//     INSERT grant on that table; the only path is via the Edge Function's
//     service-role context invoking the SECURITY DEFINER RPC
//     `create_authorized_match`. Anyone reaching this file should keep it
//     that way — do not re-introduce a fallback that inserts from the client.
//   • No service-role key in the client bundle. The function secret lives
//     only on Supabase Edge Functions runtime.
//
// Migration 035 reverted the matching model from opt-in availability to
// automatic matching. The `setMatchingAvailability` helper + 'not_available'
// status were removed at the same time. The Edge Function no longer requires
// a matching_availability row on either side and no longer returns
// 'not_available' for the caller.
// =============================================================================

import { supabase } from './supabase';

/** Shape consumed by the matching tab UI when a match is rendered. */
export interface MatchResult {
  matchId: string;
  candidateProfile: any;
  compatibilityScore: number;
  compatibilityReasons: string[];
  depth: 'fast' | 'deep';
}

/** Non-success statuses surfaced verbatim from the Edge Function. */
export type MatchStatus =
  | 'no_candidate'
  | 'monthly_cap_reached'
  | 'already_has_active'
  | 'incomplete_profile'
  | 'unauthorized'
  | 'error';

/**
 * Either a renderable match (success) or a discriminated status the UI must
 * handle. The two cases are distinguishable by `'matchId' in result`.
 */
export type MatchOutcome = MatchResult | { status: MatchStatus };

/**
 * Ask the backend for a match. Always returns either a `MatchResult` (when
 * the Edge Function returned `created` and we successfully loaded the
 * candidate's profile) or a status object.
 *
 * The `currentUserId` parameter is preserved for API stability with the
 * pre-1C callers but is intentionally ignored — the trusted caller id is
 * derived inside the Edge Function from the verified JWT. The supabase-js
 * client attaches the current session's access token automatically.
 */
export async function findAndCreateBestMatch(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _currentUserId: string,
): Promise<MatchOutcome> {
  const { data, error } = await supabase.functions.invoke('match-create', {
    body: {},
  });

  if (error) {
    return { status: 'error' };
  }
  if (!data || typeof data !== 'object') {
    return { status: 'error' };
  }

  const payload = data as Record<string, unknown>;
  const status = payload.status;

  if (status === 'created') {
    const candidateId = payload.candidate_id;
    if (typeof candidateId !== 'string' || candidateId.length === 0) {
      return { status: 'error' };
    }

    // The Edge Function returns only the chosen candidate's id to keep its
    // response payload minimal. Fetch only the columns the matching tab
    // card consumes; never select email or other sensitive fields. Matched-
    // peer SELECT access is granted by the policy from migration 020.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, avatar_storage_path')
      .eq('id', candidateId)
      .single();
    if (profileError || !profile) {
      return { status: 'error' };
    }

    return {
      matchId: typeof payload.match_id === 'string' ? payload.match_id : '',
      candidateProfile: profile,
      compatibilityScore: typeof payload.score === 'number' ? payload.score : 0,
      compatibilityReasons: Array.isArray(payload.reasons)
        ? (payload.reasons as string[])
        : [],
      depth: payload.depth === 'deep' ? 'deep' : 'fast',
    };
  }

  if (
    status === 'no_candidate' ||
    status === 'monthly_cap_reached' ||
    status === 'already_has_active' ||
    status === 'incomplete_profile' ||
    status === 'unauthorized'
  ) {
    return { status };
  }

  // Unknown or missing status — surface as a generic error so the UI
  // shows a non-leaking Hebrew alert.
  return { status: 'error' };
}

// =============================================================================
// Behind-the-scenes activity ping.
//
// Calls public.bump_last_active() (migration 035) so the caller's
// profiles.last_active_at is updated to now(). The Edge Function reads this
// column when ranking candidates and prefers users active in the last
// 7 days — but it is NEVER exposed to the UI. There is no "last seen" or
// "active recently" surface anywhere in the app.
//
// Fire-and-forget: any failure is swallowed silently. The next bump (on
// the next foreground transition or cold start) will retry. Throttled
// in-memory to once per BUMP_THROTTLE_MS so repeated foreground events
// don't hammer the RPC.
// =============================================================================

let lastBumpAtMs = 0;
const BUMP_THROTTLE_MS = 60_000;

export async function bumpLastActive(): Promise<void> {
  const now = Date.now();
  if (now - lastBumpAtMs < BUMP_THROTTLE_MS) return;
  lastBumpAtMs = now;
  try {
    await supabase.rpc('bump_last_active');
  } catch {
    // Swallow. Activity ping is best-effort and must never block the UI
    // or surface an error to the user. The next foreground transition
    // will retry.
  }
}
