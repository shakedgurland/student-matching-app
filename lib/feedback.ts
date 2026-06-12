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
 * The function automatically retrieves the current user's ID from Supabase Auth.
 */
export async function submitMatchFeedback(feedback: MatchFeedbackData) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const { error } = await supabase
      .from('match_feedback')
      .insert({
        match_id: feedback.match_id,
        user_id: user.id,
        feedback_stage: feedback.feedback_stage,
        rating: feedback.rating,
        outcome_status: feedback.outcome_status,
        positive_reasons: feedback.positive_reasons || [],
        negative_reasons: feedback.negative_reasons || [],
        free_text: feedback.free_text,
        is_private_to_system: feedback.is_private_to_system ?? true,
      });

    if (error) {
      logError('MatchFeedbackService', 'submit_feedback_failed', error);
      return { success: false, error };
    }

    logEvent('form_submit', { 
      screen: 'MatchFeedback', 
      action: 'feedback_submitted', 
      metadata: { 
        match_id: feedback.match_id, 
        stage: feedback.feedback_stage 
      } 
    });

    return { success: true };
  } catch (error) {
    logError('MatchFeedbackService', 'submit_feedback_exception', error);
    return { success: false, error };
  }
}
