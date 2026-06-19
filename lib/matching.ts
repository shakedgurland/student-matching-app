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
    // response payload minimal. Fetch the full profile row separately;
    // RLS allows reading any user we share a match row with (per the
    // policy created in migration 002).
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
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
