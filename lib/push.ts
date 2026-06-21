// lib/push.ts
//
// Expo push-token registration (PR-PUSH-B). Internal-only: nothing here
// sends a notification — that lands in PR-PUSH-C/D. This file just:
//   1. asks for notification permission at the right moment,
//   2. fetches the device's Expo push token,
//   3. UPSERTs it via the register_push_token RPC (migration 029).
//
// Design rules baked in:
//   • Permission is never requested before the user is authenticated AND
//     onboarded. The call site is gated in app/(tabs)/_layout.tsx, which
//     only renders post-auth + post-onboarding per app/_layout.tsx routing.
//   • Permission is asked at most once per session. If the OS already has
//     a decision (granted OR denied), we never re-prompt — re-prompting
//     after denial is bad UX and OS-blocked anyway.
//   • Simulator/emulator/web runs are no-ops (token fetch throws on
//     non-physical devices; caught and treated as expected). No reliance
//     on expo-device — Platform.OS + try/catch handles this without
//     adding a dep.
//   • projectId is read from Constants.expoConfig.extra.eas.projectId
//     (verified present in app.json). If it's missing for any reason,
//     we log and return — never attempt getExpoPushTokenAsync without
//     it (Expo throws unhelpfully otherwise).
//   • All failure paths log via existing logError; none ever throw to
//     the caller. App startup and onboarding must never break because
//     the push pipeline hiccupped.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { logError } from './analytics';
import { getActiveChatMatchId } from './notification-context';

// Single in-process guard so calling registerPushTokenIfPermitted from
// multiple mount paths still only runs once per app session.
let alreadyAttempted = false;

// Independent guard for notification handler installation. Multiple
// mounts of the root layout (StrictMode, fast-refresh, navigation
// remount) must NOT re-install the foreground handler or stack
// duplicate response listeners.
let handlersInstalled = false;

function getProjectId(): string | null {
  // Expo SDK 49+ exposes the resolved app config here. The legacy
  // Constants.manifest path is gone.
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: unknown } }
    | undefined;
  const id = extra?.eas?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function currentPlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null; // web / unknown — no push surface
}

/**
 * Register the device's Expo push token for the currently authenticated
 * user. Idempotent (server UPSERT) and gated by an in-process flag so
 * repeated callers in a single session don't spam the permission prompt
 * or the OS token fetch.
 *
 * Safe to call from any post-auth + post-onboarding mount effect. No
 * argument needed — the caller is identified server-side via JWT inside
 * the SECURITY DEFINER RPC.
 *
 * Never throws. Returns void.
 */
export async function registerPushTokenIfPermitted(): Promise<void> {
  if (alreadyAttempted) return;
  alreadyAttempted = true;

  try {
    const platform = currentPlatform();
    if (!platform) {
      // Web / unsupported runtime. No-op.
      return;
    }

    const projectId = getProjectId();
    if (!projectId) {
      logError('Push', 'register_missing_project_id', new Error('extra.eas.projectId is missing'));
      return;
    }

    // Check existing permission status WITHOUT prompting first. The OS
    // returns one of granted/denied/undetermined. Only the undetermined
    // case warrants a user-facing prompt.
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.status === 'granted';

    if (existing.status === 'undetermined') {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.status === 'granted';
    }

    if (!granted) {
      // User denied (now or previously). Don't retry. The OS blocks
      // re-prompting from JS anyway; further calls would silently fail.
      return;
    }

    // getExpoPushTokenAsync requires a physical device. On simulators
    // it throws — catch and treat as a clean no-op rather than a
    // surfaced error.
    let expoToken: string | null = null;
    try {
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      expoToken = typeof result.data === 'string' ? result.data : null;
    } catch (err) {
      // Typical message: "Must use physical device for Push Notifications".
      logError('Push', 'get_token_failed', err);
      return;
    }

    if (!expoToken) {
      logError('Push', 'empty_token', new Error('getExpoPushTokenAsync returned no data'));
      return;
    }

    // UPSERT via the SECURITY DEFINER RPC. The RPC validates the token
    // shape and platform server-side; we forward without massaging.
    const { error: rpcError } = await supabase.rpc('register_push_token', {
      p_expo_token: expoToken,
      p_platform: platform,
      p_device_label: null,
    });
    if (rpcError) {
      logError('Push', 'register_rpc_failed', rpcError);
    }
  } catch (err) {
    // Belt-and-suspenders: nothing in the body should reach here, but
    // if it does, swallow + log so the surrounding mount effect never
    // sees the throw.
    logError('Push', 'register_unexpected_exception', err);
  }
}

// ---------------------------------------------------------------------------
// Notification handlers (PR-PUSH-D1)
//
// Two things to wire on the client once notifications can arrive:
//   1. Foreground suppression — when a chat push arrives while the user
//      is already inside that chat, do NOT show a banner, list entry,
//      or play a sound. We still let realtime + markConversationRead
//      keep the chat live.
//   2. Tap navigation — when the user taps a chat push from background
//      or cold start, deep-link straight to the relevant /chat?match_id.
//
// Both register against the installed expo-notifications@0.32.17 API:
//   • setNotificationHandler requires {shouldShowBanner, shouldShowList,
//     shouldPlaySound, shouldSetBadge} — all boolean. The legacy
//     `shouldShowAlert` is deprecated and intentionally NOT used.
//   • Tap responses arrive via addNotificationResponseReceivedListener
//     for warm/background, and getLastNotificationResponseAsync for
//     cold-start (app was launched by the tap).
//
// The handler logic is defensive: malformed or missing data fields
// always fall through to "show normally" rather than crash. Only the
// specific case of `data.type === 'chat_message'` AND
// `typeof data.match_id === 'string'` AND match equal to the active
// chat suppresses. Any future notification type defaults to show.
// ---------------------------------------------------------------------------

// Internal helper. Pure function — no imports, no side effects beyond
// the navigate callback. Safe to call from both warm-tap and cold-start
// code paths.
function dispatchNotificationResponse(
  response: Notifications.NotificationResponse | null,
  navigateToMatch: (matchId: string) => void,
): void {
  if (!response) return;
  try {
    const data = response.notification?.request?.content?.data as
      | Record<string, unknown>
      | undefined;
    if (!data || data.type !== 'chat_message') return;
    const matchId = data.match_id;
    if (typeof matchId !== 'string' || matchId.length === 0) return;
    navigateToMatch(matchId);
  } catch (err) {
    logError('Push', 'notification_response_dispatch_failed', err);
  }
}

/**
 * Install the foreground handler + the tap-response listener exactly
 * once per app session.
 *
 * Pass the navigate callback from the call site (the root layout owns
 * the router instance). Keeping navigation as an injected dependency
 * lets the install function stay free of expo-router imports.
 *
 * Idempotent. Safe to call from multiple mount points (StrictMode,
 * fast-refresh, navigation remounts) — only the first call wires
 * anything; subsequent calls return immediately. Never throws.
 */
export function installNotificationHandlers(
  navigateToMatch: (matchId: string) => void,
): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  try {
    // 1. Foreground handler — suppress if user is already in that chat.
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        let inSameChat = false;
        try {
          const data = notification.request?.content?.data as
            | Record<string, unknown>
            | undefined;
          if (data && data.type === 'chat_message') {
            const notifMatchId = data.match_id;
            if (typeof notifMatchId === 'string' && notifMatchId.length > 0) {
              inSameChat = notifMatchId === getActiveChatMatchId();
            }
          }
        } catch {
          // Defensive: never let a malformed payload throw out of the
          // handler. Fall through to show.
          inSameChat = false;
        }
        return {
          shouldShowBanner: !inSameChat,
          shouldShowList:   !inSameChat,
          shouldPlaySound:  !inSameChat,
          // Unread badge is DB-backed (PR-PUSH-A, conversation_reads +
          // unread_summary RPC); never let push hand-control the OS
          // app badge to avoid two competing counters.
          shouldSetBadge:   false,
        };
      },
    });

    // 2. Warm/background tap listener.
    Notifications.addNotificationResponseReceivedListener((response) => {
      dispatchNotificationResponse(response, navigateToMatch);
    });

    // 3. Cold-start tap — app launched FROM the notification tap.
    //    getLastNotificationResponseAsync returns the most recent
    //    response (or null). We call it exactly once because
    //    handlersInstalled gates this entire function; subsequent
    //    mounts won't re-fire and won't re-navigate.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => dispatchNotificationResponse(response, navigateToMatch))
      .catch((err) => {
        logError('Push', 'cold_start_notification_response_failed', err);
      });
  } catch (err) {
    // If any of the three Notifications.* calls throw synchronously
    // (e.g., native module not yet linked), recover by leaving the
    // app un-handled. Token registration still works; notifications
    // just fall back to the OS default.
    logError('Push', 'install_handlers_failed', err);
    // Allow a retry on the next mount in case the native module wakes
    // up after a hot-reload. Without this, a transient failure would
    // permanently disable handler installation for the session.
    handlersInstalled = false;
  }
}
