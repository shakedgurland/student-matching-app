// lib/unread.ts
//
// Thin wrappers around the unread RPCs from migration 028. Centralised
// so the tab-bar badge and chat.tsx use the same types, the same error
// fallbacks, and so a future change (e.g. swapping the read marker
// design) only touches one file.
//
// No push-notification surface here. PR-PUSH-A is unread-only. PR-PUSH-B
// will add token registration in a separate lib/push.ts.

import { supabase } from './supabase';
import { logError } from './analytics';

export interface UnreadConversation {
  conversation_id: string;
  match_id: string;
  unread_count: number;
}

export interface UnreadSummary {
  total_unread: number;
  conversations: UnreadConversation[];
}

// Empty-state value the UI can safely render before the first RPC
// resolves or when the RPC fails.
export const EMPTY_UNREAD_SUMMARY: UnreadSummary = {
  total_unread: 0,
  conversations: [],
};

/**
 * Fetch the caller's unread summary. Returns EMPTY_UNREAD_SUMMARY on
 * any failure — the badge should not appear/disappear because the
 * network blipped. Real RPC errors are logged.
 */
export async function fetchUnreadSummary(): Promise<UnreadSummary> {
  try {
    const { data, error } = await supabase.rpc('unread_summary');
    if (error) {
      logError('Unread', 'fetch_unread_summary_failed', error);
      return EMPTY_UNREAD_SUMMARY;
    }
    if (!data || typeof data !== 'object') return EMPTY_UNREAD_SUMMARY;
    const payload = data as Record<string, unknown>;
    if (typeof payload.status === 'string' && payload.status === 'error') {
      return EMPTY_UNREAD_SUMMARY;
    }
    const total = typeof payload.total_unread === 'number' ? payload.total_unread : 0;
    const convsRaw = Array.isArray(payload.conversations) ? payload.conversations : [];
    const conversations: UnreadConversation[] = convsRaw
      .map((c) => {
        if (!c || typeof c !== 'object') return null;
        const row = c as Record<string, unknown>;
        if (
          typeof row.conversation_id !== 'string' ||
          typeof row.match_id !== 'string' ||
          typeof row.unread_count !== 'number'
        ) {
          return null;
        }
        return {
          conversation_id: row.conversation_id,
          match_id: row.match_id,
          unread_count: row.unread_count,
        };
      })
      .filter((c): c is UnreadConversation => c !== null);
    return { total_unread: total, conversations };
  } catch (e) {
    logError('Unread', 'fetch_unread_summary_exception', e);
    return EMPTY_UNREAD_SUMMARY;
  }
}

/**
 * Mark a conversation as read for the current user (UPSERTs
 * last_read_at to now). Idempotent. Failures are logged but never
 * surfaced — a missed mark just means the badge stays one second longer.
 */
export async function markConversationRead(conversationId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
    });
    if (error) {
      logError('Unread', 'mark_conversation_read_failed', error);
    }
  } catch (e) {
    logError('Unread', 'mark_conversation_read_exception', e);
  }
}
