
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

// BATCH-F1: extract a never-throw helper for error→string conversion.
// The previous inline `error.message || JSON.stringify(error)` could throw
// when `error` had getters that threw (e.g., some Supabase/PostgrestError
// shapes) or when the object held circular refs (JSON.stringify TypeError).
// A throw inside an unawaited fire-and-forget analytics call became an
// unhandled rejection that, after questionnaire navigation/unmount, raced
// with React's shadow-view destruction on the main thread — a plausible
// contributor to the Hermes EXC_BAD_ACCESS observed in TestFlight build 13.
// Now the helper guards every step with try/catch and never accesses
// properties that could trigger getters on potentially-freed objects.
function safeErrorMessage(error: unknown): string {
  try {
    if (error === null || error === undefined) return 'unknown';
    if (typeof error === 'string') return error;
    if (typeof error === 'number' || typeof error === 'boolean') return String(error);
    // Guarded property access — wrapping in String(...) coerces without
    // calling .toString() on the original object (avoids getter throws).
    const maybeMessage = (error as { message?: unknown })?.message;
    if (typeof maybeMessage === 'string') return maybeMessage;
    return 'error';
  } catch {
    return 'error';
  }
}

export const logError = (screenName: string, action: string, error: any) =>
  logEvent('app_error', {
    screen: screenName,
    action,
    metadata: { error: safeErrorMessage(error) },
  });
