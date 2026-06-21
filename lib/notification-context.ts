// lib/notification-context.ts
//
// PR-PUSH-D1: module-level mutable ref for "which chat (match_id) is
// the user currently viewing". Read by lib/push.ts's notification
// handler to decide whether to suppress a foreground push for a chat
// the user is already inside.
//
// Why a plain module instead of a React context / Zustand store:
//   • setNotificationHandler's callback runs OUTSIDE React's render
//     tree — hooks are unavailable there. The handler needs a
//     plain-callable read at fire time.
//   • No reactive subscribers — the handler reads on demand, not via
//     subscription. A context would just add ceremony for no benefit.
//   • Single source of truth: only app/chat.tsx writes; only the
//     handler reads.
//
// Identity is `match_id` (not `conversation_id`) because the chat
// route is `/chat?match_id=...` and send-push always includes
// match_id in notification data. See lib/push.ts comments and the
// PR-PUSH-D audit report for the rationale.

let activeChatMatchId: string | null = null;

/**
 * Mark a specific match as the chat the user is currently viewing.
 * Pass null when leaving the chat screen.
 */
export function setActiveChatMatchId(matchId: string | null): void {
  activeChatMatchId = matchId;
}

/**
 * Returns the match_id of the chat currently open in the foreground,
 * or null if the user is anywhere else (or no chat).
 */
export function getActiveChatMatchId(): string | null {
  return activeChatMatchId;
}
