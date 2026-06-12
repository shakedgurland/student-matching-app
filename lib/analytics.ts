
import { supabase } from './supabase';

export type EventType = 
  | 'screen_view'
  | 'button_tap'
  | 'form_submit'
  | 'scroll_depth'
  | 'section_viewed'
  | 'onboarding_step_viewed'
  | 'onboarding_started'
  | 'onboarding_submitted'
  | 'onboarding_validation_failed'
  | 'short_questionnaire_started'
  | 'short_questionnaire_completed'
  | 'deep_questionnaire_started'
  | 'deep_questionnaire_completed'
  | 'photo_upload_started'
  | 'photo_upload_succeeded'
  | 'photo_upload_failed'
  | 'photo_deleted'
  | 'match_search_started'
  | 'match_found'
  | 'match_not_found'
  | 'match_search_failed'
  | 'profile_updated'
  | 'app_error';

interface LogOptions {
  screen?: string;
  action?: string;
  metadata?: Record<string, any>;
}

/**
 * Sanitizes metadata to remove sensitive information like tokens, passwords, and signed URLs.
 */
function sanitizeMetadata(metadata: Record<string, any> = {}): Record<string, any> {
  const sensitiveKeys = ['token', 'password', 'access_token', 'refresh_token', 'signedUrl', 'url', 'uri', 'base64'];
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Core logging function. Fails silently in production to ensure app stability.
 */
export async function logEvent(eventType: EventType, options: LogOptions = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const sanitizedMetadata = sanitizeMetadata(options.metadata || {});

    const { error } = await supabase.from('app_events').insert({
      user_id: user.id,
      event_type: eventType,
      screen: options.screen,
      action: options.action,
      metadata: sanitizedMetadata,
    });

    if (error && __DEV__) {
      console.warn('Analytics Error:', error.message);
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('Analytics Exception:', err);
    }
  }
}

export const logScreenView = (screenName: string) => 
  logEvent('screen_view', { screen: screenName });

export const logButtonTap = (screenName: string, action: string, metadata?: Record<string, any>) => 
  logEvent('button_tap', { screen: screenName, action, metadata });

export const logFormSubmit = (screenName: string, action: string, metadata?: Record<string, any>) => 
  logEvent('form_submit', { screen: screenName, action, metadata });

export const logError = (screenName: string, action: string, error: any) => 
  logEvent('app_error', { 
    screen: screenName, 
    action, 
    metadata: { error: typeof error === 'string' ? error : (error.message || JSON.stringify(error)) } 
  });
