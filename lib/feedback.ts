import { supabase } from './supabase';
import { logError, logEvent } from './analytics';

export type FeedbackStage =
  | 'after_match'
  | 'after_chat'
  | 'no_date'
  | 'after_date'
  | 'ended';

export type OutcomeStatus =
  | 'still_chatting'
  | 'date_planned'
  | 'date_happened'
  | 'continued'
  | 'ended'
  | 'no_progress'
  | 'not_interested'
  | 'other_connection'
  | 'busy'
  | 'other';

export type PositiveReason =
  | 'good_conversation'
  | 'mutual_interest'
  | 'chemistry'
  | 'comfortable'
  | 'shared_values'
  | 'similar_intent'
  | 'communication_style_fit'
  | 'lifestyle_fit'
  | 'wanted_to_continue';

export type NegativeReason =
  | 'conversation_did_not_develop'
  | 'not_enough_initiative'
  | 'no_chemistry'
  | 'not_enough_attraction'
  | 'looked_different_from_photos'
  | 'different_intent'
  | 'pace_mismatch'
  | 'communication_mismatch'
  | 'lifestyle_mismatch'
  | 'values_mismatch'
  | 'distance_or_region'
  | 'busy'
  | 'other_connection'
  | 'not_interested_enough'
  | 'not_enough_information'
  | 'other';

export interface MatchFeedbackData {
  match_id: string;
  feedback_stage: FeedbackStage;
  rating?: number; // 1-5
  outcome_status?: OutcomeStatus;
  positive_reasons?: PositiveReason[];
  negative_reasons?: NegativeReason[];
  free_text?: string;
  is_private_to_system?: boolean;
}

/**
 * Submits feedback for a match.
 *
 * Migration 036 — this helper now invokes the SECURITY DEFINER RPC
 * `public.send_match_feedback` instead of doing a direct
 * `.from('match_feedback').insert(...)`. The RPC reads `auth.uid()`
 * server-side as the trusted caller id and INSERTs under definer
 * privileges, which bypasses the JWT-drop bug that produced opaque
 * PostgREST 42501 from the table's INSERT RLS policy (same class of
 * failure as the chat send bug fixed by migration 030's
 * `send_chat_message`).
 *
 * Public API of this function is unchanged: same `MatchFeedbackData`
 * input, same `{ success, error? }` return shape. No screen needs to
 * change. The `is_private_to_system` field on `MatchFeedbackData` is
 * preserved on the interface for backwards compatibility but is no
 * longer forwarded — the RPC always inserts `true` (matches the
 * previous client default and the only value any caller has ever sent).
 */
export async function submitMatchFeedback(feedback: MatchFeedbackData) {
  try {
    // Fast-fail: surface a clearer error before hitting the network if
    // we already know there's no session. The RPC also re-checks
    // server-side via auth.uid() and returns { status: 'unauthenticated' }
    // — this check just saves a round-trip.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const err = new Error('User not authenticated');
      logError('MatchFeedbackService', 'submit_feedback_unauthenticated', err);
      return { success: false, error: err };
    }

    const { data, error: rpcError } = await supabase.rpc('send_match_feedback', {
      p_match_id: feedback.match_id,
      p_feedback_stage: feedback.feedback_stage,
      p_rating: feedback.rating ?? null,
      p_outcome_status: feedback.outcome_status ?? null,
      p_positive_reasons: feedback.positive_reasons ?? [],
      p_negative_reasons: feedback.negative_reasons ?? [],
      p_free_text: feedback.free_text ?? null,
    });

    if (rpcError) {
      logError('MatchFeedbackService', 'submit_feedback_rpc_failed', rpcError);
      return { success: false, error: rpcError };
    }

    // The RPC envelope is { status: 'ok' | 'unauthenticated' | 'invalid_args'
    // | 'invalid_stage' | 'invalid_rating' | 'invalid_outcome'
    // | 'match_not_found' | 'not_participant' | 'error', id?: uuid, reason?: text }.
    // Any non-'ok' status is a client-actionable failure — surface as
    // { success: false } with the discriminator preserved on the error
    // so existing screen telemetry (BATCH-H2 diagnostic log) can read
    // it as `result.error.code`-style info.
    const payload = (data ?? null) as Record<string, unknown> | null;
    const status = payload && typeof payload.status === 'string'
      ? (payload.status as string)
      : 'error';

    if (status !== 'ok') {
      const reason = typeof payload?.reason === 'string' ? payload.reason : null;
      const code = reason ? `${status}:${reason}` : status;
      const err = new Error(`send_match_feedback returned ${code}`);
      (err as Error & { code?: string }).code = code;
      logError('MatchFeedbackService', 'submit_feedback_rejected', err);
      return { success: false, error: err };
    }

    logEvent('form_submit', {
      screen: 'MatchFeedback',
      action: 'feedback_submitted',
      metadata: {
        match_id: feedback.match_id,
        stage: feedback.feedback_stage,
      },
    });

    return { success: true };
  } catch (error) {
    logError('MatchFeedbackService', 'submit_feedback_exception', error);
    return { success: false, error };
  }
}
