import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { findAndCreateBestMatch, setMatchingAvailability } from '@/lib/matching';
import { logScreenView, logEvent, logError, logButtonTap } from '@/lib/analytics';

// Design Constants
const UI_COLORS = {
  bg: '#FFF9F6',
  primary: '#FF4D3D',
  accent: '#FF8A00',
  branding: '#FF3D57',
  surface: '#FFF0EA',
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  card: '#FFFFFF',
};

// PR-MATCH-FLOW-CLEANUP (PR #57 follow-up): removed
// SIGNED_URL_TTL_SECONDS constant. Sole users were the avatar-signing
// blocks in fetchCurrentMatch + handleFindMatch, which served the
// removed intermediate active-match card. match-profile / chat /
// match-result keep their own copies of the same 300s TTL.

// PR #63 — Friendly Hebrew countdown for the availability waiting state.
// Always rounds UP so the user never sees "0 שעות" while still technically
// available. Singular form ("יום" / "שעה") used at exactly 1; otherwise
// plural ({N} ימים / {N} שעות). Below an hour we collapse to a single
// "פחות משעה" line so the user isn't watching minutes tick down.
function formatAvailabilityCountdown(availableUntilIso: string): string {
  const diffMs = new Date(availableUntilIso).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return '';
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours >= 24) {
    const days = Math.ceil(diffHours / 24);
    return days === 1
      ? 'פנוי/ה להכיר עוד יום'
      : `פנוי/ה להכיר עוד ${days} ימים`;
  }
  if (diffHours >= 1) {
    const hours = Math.ceil(diffHours);
    return hours === 1
      ? 'פנוי/ה להכיר עוד שעה'
      : `פנוי/ה להכיר עוד ${hours} שעות`;
  }
  return 'פנוי/ה להכיר עוד פחות משעה';
}

export default function MatchSelectionScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<any>(null);
  // PR-MATCH-FLOW-CLEANUP (PR #57 follow-up): otherUser state removed —
  // sole consumer was the intermediate active-match card removed in
  // PR #57. The Match tab no longer renders peer details; it auto-
  // forwards to /match-result (or /chat for chat_started) where the
  // peer is loaded fresh with the right column set.
  // Set to true when the user has reached the 5/month cap. Computed
  // proactively in fetchCurrentMatch (count of this user's matches this
  // calendar month ≥ 5) AND set reactively if a button-press flow returns
  // 'monthly_cap_reached'. Drives the cap copy and hides the availability
  // CTA. Reset on every fetchCurrentMatch so a returning user (new month
  // / new session) sees the right state.
  const [capReached, setCapReached] = useState(false);
  // PR #63 — Current user's matching_availability.available_until, if a
  // live row exists. Null means "not available" (row missing or expired).
  // RLS scopes the read to the caller's own row only — peers cannot see
  // this. Drives the waiting state vs the CTA state under "no open match
  // && not capped".
  const [availableUntil, setAvailableUntil] = useState<string | null>(null);
  // PR #63 — True while the "אני פנוי/ה להכיר" button-press RPC is in
  // flight. Used to disable the button + show a spinner.
  const [settingAvailability, setSettingAvailability] = useState(false);
  // 'fast' | 'deep' | null. Drives the fast-only tip card at the bottom of
  // the screen. Fetched once on mount alongside fetchCurrentMatch.
  const [onboardingMode, setOnboardingMode] = useState<string | null>(null);

  // PR-BUILD24-HARDEN: lifecycle / race-safety refs.
  //
  // isMountedRef — flipped on mount and on unmount cleanup. All setState
  //   calls after an await check it. Without this, a button press that
  //   triggers navigation to /match-result can land setState back on the
  //   unmounted Home tab, producing native warnings and (under iOS 26)
  //   contributing to RCTTurboModule SIGABRT chains.
  //
  // settingAvailabilityRef — SYNCHRONOUS in-flight guard for the "אני
  //   פנוי/ה להכיר" button. The previous PR #63 implementation used the
  //   state value `settingAvailability` directly:
  //     if (settingAvailability) return;
  //     setSettingAvailability(true);
  //   State updates are async, so two taps fired within a single React
  //   frame both observed `settingAvailability === false` and both
  //   proceeded. That produced 2× set_matching_availability RPC calls,
  //   2× findAndCreateBestMatch invocations, and 2× setCurrentMatch
  //   writes — which fanned out into 2× router.replace from the auto-
  //   forward useEffect below. iOS 26's stricter UIAlertController /
  //   navigation timing turned that race into the EXC_CRASH (SIGABRT)
  //   reported in TestFlight Build #24 (Thread 11, performVoidMethod-
  //   Invocation). A ref is synchronous and closes the window.
  //
  // navigatingToMatchRef — one-shot guard for the auto-forward useEffect.
  //   Tracks the match-id we've already redirected to so a re-render with
  //   the same currentMatch doesn't fire router.replace twice. We also
  //   release it when the match-id genuinely changes.
  //
  // alertingRef — serializes Alert.alert calls. iOS will throw NSException
  //   if two UIAlertControllers are presented in overlapping animation
  //   frames. Even though this code shouldn't reach two alerts per press,
  //   defense-in-depth via safeAlert() keeps that path closed.
  const isMountedRef = useRef(true);
  const settingAvailabilityRef = useRef(false);
  const navigatingToMatchRef = useRef<string | null>(null);
  const alertingRef = useRef(false);

  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
  };

  // PR-BUILD24-HARDEN: mount tracking. Pairs with isMountedRef.current
  // checks scattered through the async handlers below. Empty deps → runs
  // once on mount, cleanup runs once on unmount.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    logScreenView('Home');
    fetchCurrentMatch();
  }, []);

  // Auto-forward to the actual match screen whenever an active match is
  // resolved. The Match tab is purely a router — it never renders an
  // intermediate "active match" card.
  //
  // Status branching:
  //   - 'active'        → /match-result (no chat yet; preview is right)
  //   - 'chat_started'  → /chat (conversation is live; skip the preview)
  //   - terminal (expired/unmatched) → never reaches this point;
  //     fetchCurrentMatch filters them out via .in('status',
  //     ['active', 'chat_started']) so currentMatch stays null and
  //     the home empty state renders — correct UX.
  //
  // PR-MATCH-FLOW (PR #57): removed the redirectedMatchIds Set +
  // dedupe guard. Previously the Match tab showed a redundant
  // "התאמה פעילה / צפייה בהתאמה" card when the guard blocked a
  // re-redirect (e.g., user tapped the Match tab pill after backing
  // out of /match-result). With the card removed, re-redirecting is
  // the correct behavior: the Match tab IS the match entry point and
  // should always land on the actual match screen. router.replace
  // (not push) is used so the (tabs) screen does not stack on top of
  // /match-result; the only way back to the home tab is the tab pill
  // itself, which is the user's explicit ask to land on the match.
  useEffect(() => {
    if (loading) return;
    const matchId = currentMatch?.id;
    if (!matchId) {
      // No open match — release the guard so a future match resolution
      // can navigate cleanly.
      navigatingToMatchRef.current = null;
      return;
    }
    // PR-BUILD24-HARDEN: one-shot per match-id. If state churn re-runs
    // this effect with the SAME match-id (e.g., fetchCurrentMatch and
    // handleFindMatch both call setCurrentMatch with the same row), do
    // not fire a second router.replace. Two router.replace calls in
    // overlapping frames is one of the suspected vectors for the iOS 26
    // SIGABRT (Thread 11, RCTTurboModule path).
    if (navigatingToMatchRef.current === matchId) return;
    navigatingToMatchRef.current = matchId;
    const target = currentMatch?.status === 'chat_started' ? '/chat' : '/match-result';
    router.replace({ pathname: target as any, params: { match_id: matchId } });
  }, [currentMatch?.id, currentMatch?.status, loading, router]);

  // PR-BUILD24-HARDEN: alert serializer. iOS 26 is stricter about
  // concurrent UIAlertController presentations — overlapping presentations
  // can throw NSException from a TurboModule worker thread, which
  // terminates the process (EXC_CRASH / SIGABRT). This helper drops new
  // alerts while one is already up. The buttons callback releases the
  // lock so the next alert can present cleanly. Also short-circuits if
  // the component is unmounted (e.g., after navigation away).
  const safeAlert = (title: string, message?: string) => {
    if (!isMountedRef.current) return;
    if (alertingRef.current) return;
    alertingRef.current = true;
    Alert.alert(title, message, [
      {
        text: 'אישור',
        onPress: () => {
          alertingRef.current = false;
        },
      },
    ]);
  };

  const fetchCurrentMatch = async () => {
    try {
      setLoading(true);
      setCapReached(false);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch self's onboarding_mode in parallel with the matches query so
      // the fast-only tip card can gate without an extra render pass.
      // Failure is non-fatal: tip card just stays hidden if this errors.
      supabase
        .from('profiles')
        .select('onboarding_mode')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          const mode = typeof data?.onboarding_mode === 'string' ? data.onboarding_mode : null;
          setOnboardingMode(mode);
        });

      // Fetch the user's currently OPEN match. After migration 023, both
      // 'active' (timer running, no chat yet) and 'chat_started' (first
      // message sent — trigger flipped status) count as open and block
      // receiving a new match.
      const { data: matches, error } = await supabase
        .from('matches')
        .select('*')
        .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
        .in('status', ['active', 'chat_started'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (matches && matches.length > 0) {
        let openMatch = matches[0];

        // Client-side passive expiry — defense-in-depth with the pg_cron
        // job from migration 024 (which runs every 5 minutes globally).
        // This gives snappy UX inside the cron's tick window for the user's
        // own match. Hardened: the UPDATE failure path must NEVER fall
        // through to handleFindMatch (which could create a duplicate
        // 'active' row if the UPDATE didn't actually expire the match).
        //
        // Scoping is strict and RLS-safe:
        //   - .eq('id', openMatch.id)          — only this user's own match
        //   - .eq('status', 'active')          — no-op for chat_started/expired
        //   - .lt('expires_at', now())         — no-op for not-yet-stale
        //   - migration 002's RLS UPDATE policy further restricts to
        //     auth.uid() ∈ (user_a_id, user_b_id).
        const expiresAtMs = openMatch.expires_at ? new Date(openMatch.expires_at).getTime() : NaN;
        if (
          openMatch.status === 'active' &&
          Number.isFinite(expiresAtMs) &&
          expiresAtMs < Date.now()
        ) {
          try {
            const { data: updated, error: updateError } = await supabase
              .from('matches')
              .update({ status: 'expired' })
              .eq('id', openMatch.id)
              .eq('status', 'active')
              .lt('expires_at', new Date().toISOString())
              .select('id');

            if (updateError) {
              // Postgrest/SQL error from the UPDATE. Do NOT call
              // handleFindMatch — the row may still be 'active' on the DB
              // and a new INSERT would either trigger 'already_has_active'
              // or, worse, be permitted by some race we haven't anticipated.
              // Leave currentMatch unset; the existing empty-state UI
              // shows; on next mount the server cron will have reconciled.
              console.error('passive expiry update failed; staying in safe empty state:', updateError);
              return;
            }

            if (updated && updated.length > 0) {
              // PR #63: do NOT auto-search after passive expiry. The
              // matching_availability rows for both participants were
              // cleared atomically when this match was created
              // (migration 034 section m), so the user is already
              // not-available. They must explicitly tap "אני פנוי/ה
              // להכיר" to opt in again. Load the availability + cap
              // state so the state-driven render shows the CTA.
              await fetchAvailabilityAndCapState(user.id);
              return;
            }

            // Zero rows changed: someone else changed the row between our
            // SELECT and our UPDATE. Re-fetch authoritatively to decide.
            const { data: refetched, error: refetchError } = await supabase
              .from('matches')
              .select('*')
              .eq('id', openMatch.id)
              .maybeSingle();

            if (refetchError) {
              console.error('passive expiry refetch failed; staying in safe empty state:', refetchError);
              return;
            }

            if (!refetched) {
              // Row not visible (deleted or RLS no longer permits read).
              // PR #63: do NOT auto-search. Load availability + cap
              // state so the CTA / waiting render shows.
              await fetchAvailabilityAndCapState(user.id);
              return;
            }

            if (refetched.status === 'expired' || refetched.status === 'unmatched') {
              // Terminal — server cron beat us. PR #63: do NOT auto-
              // search. Load availability + cap state.
              await fetchAvailabilityAndCapState(user.id);
              return;
            }

            // status is now 'chat_started' (DB trigger fired between our
            // SELECT and UPDATE because peer's first message landed) OR
            // still 'active' (clock skew — the DB sees the row as not yet
            // expired). In BOTH cases, render the match as the current
            // open match. Do NOT call handleFindMatch — that would risk a
            // duplicate open match.
            openMatch = refetched;
          } catch (expireErr) {
            // Network/transport-layer failure. Same safe path as
            // updateError above: do not trigger a new match.
            console.error('passive expiry exception; staying in safe empty state:', expireErr);
            return;
          }
        }

        // Fetch other user profile — minimal column set; never select email
        // or other sensitive fields. Matched-peer SELECT access is granted
        // by the policy from migration 020 (widened to chat_started by
        // migration 023).
        //
        // PR-DEL-CLIENT: changed .single() -> .maybeSingle() and deferred
        // setCurrentMatch until the peer profile is confirmed present. If
        // the peer's account was deleted (via PR #50 delete-account or a
        // manual Supabase Dashboard delete), the FK cascade chain has
        // either already removed the matches row OR is about to. Until
        // the cascade lands on this client we can briefly observe a match
        // row whose peer profile is gone. Setting currentMatch before
        // checking the peer would trigger the auto-forward useEffect
        // (lines 116-124) and push the user into a broken match-result
        // preview. Instead: bail out cleanly and let the empty-state /
        // auto-search path take over so the surviving user can search
        // for a new match without being stuck.
        const otherUserId = openMatch.user_a_id === user.id ? openMatch.user_b_id : openMatch.user_a_id;
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, avatar_storage_path')
          .eq('id', otherUserId)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profile) {
          // Peer profile missing — peer was deleted and the cascade
          // either has already removed this match row or will momentarily.
          // Do NOT setCurrentMatch (avoids auto-forward to a broken
          // /match-result). PR #63: do NOT auto-search either. Load
          // the availability + cap state so the user sees the calm
          // CTA / waiting render and decides for themselves when to
          // opt in again.
          logEvent('home_peer_profile_missing', { metadata: { matchId: openMatch.id } });
          await fetchAvailabilityAndCapState(user.id);
          return;
        }

        // PR-MATCH-FLOW-CLEANUP (PR #57 follow-up): avatar signing and
        // setOtherUser were removed — sole consumer was the deleted
        // intermediate active-match card. The peer-missing resilience
        // check above (PR #51) still verifies the profile exists; we
        // just no longer hold any peer detail in state here. The
        // /match-result and /chat screens load the peer afresh with
        // their own column sets and signed-URL minting.
        //
        // Peer profile resolved successfully — set currentMatch which
        // triggers the auto-forward useEffect.
        setCurrentMatch(openMatch);
      } else {
        // PR #63: NO automatic match search on home-tab mount. Per the
        // new product model, matching is opt-in only — the user must
        // explicitly tap "אני פנוי/ה להכיר" to open a 3-day window.
        // Just load the availability + cap state so the render shows
        // the right empty state (CTA / waiting / cap copy).
        await fetchAvailabilityAndCapState(user.id);
      }
    } catch (error) {
      console.error('Error fetching match:', error);
    } finally {
      setLoading(false);
    }
  };

  // PR #63 — Load the caller's matching_availability + monthly cap so the
  // render can show CTA / waiting / cap. Called from every fall-through
  // path in fetchCurrentMatch (no open match, passive expiry, peer
  // missing). Does NOT trigger a match search — that only happens after
  // an explicit button tap.
  //
  // Both queries are scoped to the caller:
  //   * matching_availability — RLS allows self-SELECT only (migration 033)
  //   * matches — bi-directional caller filter via .or()
  // No peer data is read here; we never expose another user's availability.
  const fetchAvailabilityAndCapState = async (userId: string) => {
    const nowIso = new Date().toISOString();
    const startOfMonth = (() => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString();
    })();

    const [availRes, capRes] = await Promise.all([
      supabase
        .from('matching_availability')
        .select('available_until')
        .eq('user_id', userId)
        .gt('available_until', nowIso)
        .maybeSingle(),
      supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .gte('created_at', startOfMonth),
    ]);

    if (capRes.error) {
      // Cap query failed — log and fall through to "not capped" so the
      // CTA still renders. The set_matching_availability RPC re-checks
      // the cap server-side, so this defensive fallback can't permit
      // a real over-cap match.
      logError('Home', 'cap_count_failed', capRes.error);
    }
    const monthlyMatchCount = capRes.count ?? 0;
    if (monthlyMatchCount >= 5) {
      setCapReached(true);
      setAvailableUntil(null);
      return;
    }

    if (availRes.error) {
      logError('Home', 'availability_read_failed', availRes.error);
    }
    const until = typeof availRes.data?.available_until === 'string'
      ? availRes.data.available_until
      : null;
    setAvailableUntil(until);
  };

  // PR #63 — Button handler for "אני פנוי/ה להכיר". Sets a 3-day
  // availability window server-side via set_matching_availability RPC,
  // then triggers ONE explicit match search. This is the only client
  // path that initiates matching anymore — no more silent auto-searches
  // on home-tab mount.
  const handleSetAvailability = async () => {
    // PR-BUILD24-HARDEN: SYNCHRONOUS ref guard. Replaces the old
    // state-based `if (settingAvailability) return;` which had a tap
    // race — two rapid taps both saw `settingAvailability === false`
    // before either's setSettingAvailability(true) landed, both
    // proceeded, and fanned out into 2× RPC + 2× setCurrentMatch +
    // 2× router.replace. iOS 26 turned that race into the
    // EXC_CRASH (SIGABRT) reported in Build #24.
    if (settingAvailabilityRef.current) return;
    settingAvailabilityRef.current = true;
    setSettingAvailability(true);
    try {
      logButtonTap('Home', 'set_availability');
      const result = await setMatchingAvailability();
      if (!isMountedRef.current) return;

      switch (result.status) {
        case 'set':
        case 'already_available':
          setAvailableUntil(result.availableUntil);
          // User explicitly opted in — run one match search attempt.
          // findAndCreateBestMatch handles its own loading state via
          // setMatching. If it lands a match, the auto-forward useEffect
          // redirects to /match-result.
          await handleFindMatch();
          return;
        case 'already_has_active':
          // PR-BUILD24-HARDEN: await fetchCurrentMatch so the finally
          // releases the in-flight guard AFTER state has settled. The
          // previous fire-and-forget call could have setCurrentMatch
          // resolve AFTER settingAvailability flipped back to false,
          // re-enabling the button mid-navigation.
          await fetchCurrentMatch();
          return;
        case 'monthly_cap_reached':
          if (isMountedRef.current) {
            setCapReached(true);
            setAvailableUntil(null);
          }
          return;
        case 'incomplete_profile':
          safeAlert('פרופיל לא הושלם', 'יש להשלים את השאלון כדי לקבל התאמות.');
          return;
        case 'profile_missing':
        case 'unauthorized':
          safeAlert('שגיאת זיהוי', 'אנא היכנס/י מחדש.');
          return;
        case 'error':
        default:
          safeAlert('שגיאה', 'אירעה שגיאה. נסה/י שוב מאוחר יותר.');
          return;
      }
    } catch (e) {
      logError('Home', 'set_availability_failed', e);
      safeAlert('שגיאה', 'אירעה שגיאה. נסה/י שוב מאוחר יותר.');
    } finally {
      settingAvailabilityRef.current = false;
      if (isMountedRef.current) setSettingAvailability(false);
    }
  };

  const handleFindMatch = async (userId?: string, silent: boolean = false) => {
    try {
      if (isMountedRef.current) setMatching(true);
      logEvent('match_search_started');
      const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id;
      if (!targetUserId) return;

      const newMatch = await findAndCreateBestMatch(targetUserId);
      if (!isMountedRef.current) return;

      if (newMatch && 'matchId' in newMatch) {
        // Success path: backend returned 'created'. Set currentMatch
        // which triggers the auto-forward useEffect to /match-result
        // (or /chat if a subsequent fetch shows the match already
        // transitioned to chat_started).
        //
        // PR-MATCH-FLOW-CLEANUP (PR #57 follow-up): the candidate-
        // profile avatar-signing + setOtherUser call were removed.
        // Sole consumer was the intermediate active-match card that
        // PR #57 deleted. /match-result loads the peer afresh with
        // its own column set and signed-URL minting.
        logEvent('match_found', { metadata: { matchId: newMatch.matchId, score: newMatch.compatibilityScore } });
        setCurrentMatch({
          id: newMatch.matchId,
          compatibility_score: newMatch.compatibilityScore,
          compatibility_reasons: newMatch.compatibilityReasons,
        });
        return;
      }

      if (newMatch && 'status' in newMatch) {
        logEvent('match_not_found', { metadata: { reason: newMatch.status } });
        switch (newMatch.status) {
          case 'no_candidate':
            // Legitimate empty state. PR #63: if availability is live,
            // the waiting state already covers this; no Alert. If
            // availability is NOT live (shouldn't happen post-PR-#63
            // since we only call handleFindMatch right after setting
            // availability), the CTA empty state shows.
            break;
          case 'monthly_cap_reached':
            // Drives the cap empty-state copy below.
            if (isMountedRef.current) {
              setCapReached(true);
              setAvailableUntil(null);
            }
            break;
          case 'already_has_active':
            // Caller already has an active match — re-fetch state so
            // the auto-forward useEffect routes them to /match-result.
            // PR-BUILD24-HARDEN: awaited so callers (e.g.,
            // handleSetAvailability) settle state before their finally.
            await fetchCurrentMatch();
            break;
          case 'not_available':
            // PR #63: caller has no live availability window. This
            // shouldn't normally fire because handleFindMatch is only
            // called right after a successful set_matching_availability,
            // but if a race consumed the window in between, re-fetch
            // the availability state so the CTA renders again.
            await fetchAvailabilityAndCapState(targetUserId);
            break;
          case 'incomplete_profile':
            if (!silent) safeAlert('פרופיל לא הושלם', 'יש להשלים את השאלון כדי לקבל התאמות.');
            break;
          case 'unauthorized':
            if (!silent) safeAlert('שגיאת זיהוי', 'אנא היכנס/י מחדש.');
            break;
          case 'error':
            if (!silent) safeAlert('שגיאה', 'אירעה שגיאה. נסה/י שוב מאוחר יותר.');
            break;
        }
        return;
      }

      // Defensive: malformed response shape. Should not happen with the
      // current Edge Function contract.
      logEvent('match_not_found');
      if (!silent) safeAlert('שגיאה', 'אירעה שגיאה. נסה/י שוב מאוחר יותר.');
    } catch (error) {
      logError('Home', 'match_search_failed', error);
      console.error('Error in finding match:', error);
    } finally {
      if (isMountedRef.current) setMatching(false);
    }
  };

  const handleProfile = () => {
    router.push('/(tabs)/my-profile');
  };

  // BATCH-H6: premium searching state used on initial load AND while a
  // background find-and-create is in flight. Replaces the old bare
  // ActivityIndicator which felt abrupt right after questionnaire
  // submission or post-feedback navigation. Reused as a JSX block — kept
  // local to this file (no new component) to minimize surface area.
  const searchingHero = (
    <View style={styles.searchingHero}>
      <View style={styles.searchingIconCircle}>
        <IconSymbol name="sparkles" size={56} color={UI_COLORS.accent} />
      </View>
      <ThemedText style={[styles.searchingTitle, { color: dynamicColors.text }]}>
        מחפשים התאמה שמתאימה לך באמת
      </ThemedText>
      <ThemedText style={[styles.searchingBody, { color: dynamicColors.textLight }]}>
        אנחנו בודקים התאמות לפי השאלון שלך, ולא לפי החלקה מהירה.
      </ThemedText>
      <ActivityIndicator size="small" color={UI_COLORS.primary} style={{ marginTop: 4 }} />
      <ThemedText style={[styles.searchingNote, { color: dynamicColors.textLight }]}>
        זה יכול לקחת רגע.
      </ThemedText>
    </View>
  );

  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <View style={{ width: 32 }} />
            <ThemedText style={[styles.logo, { color: UI_COLORS.branding }]}>UniMatch</ThemedText>
            <View style={{ width: 32 }} />
          </View>
          {searchingHero}
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleProfile}>
               <IconSymbol name="person.crop.circle" size={32} color={UI_COLORS.branding} />
            </TouchableOpacity>
            <ThemedText style={[styles.logo, { color: UI_COLORS.branding }]}>UniMatch</ThemedText>
            <View style={{ width: 32 }} />
          </View>

          {/* PR #63 — Render order:
                1. searchingHero — currentMatch resolved OR a button-press
                   search is in flight (the auto-forward useEffect redirects
                   to /match-result | /chat when currentMatch lands).
                2. Cap state — user hit 5/month; no availability CTA shown.
                3. Waiting state — availability live, no open match yet.
                4. CTA state — availability missing/expired, no open match.
              PR-MATCH-FLOW (PR #57): no intermediate "התאמה פעילה / צפייה
              בהתאמה" card. PR-FINAL-UI (PR #60): no score percentage.
              PR #63: NO silent auto-search on mount — matching is opt-in
              only via the "אני פנוי/ה להכיר" CTA below. */}
          {(currentMatch || matching) ? (
            searchingHero
          ) : capReached ? (
            // 2. Cap reached.
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <IconSymbol name="sparkles" size={64} color={UI_COLORS.accent} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: dynamicColors.text }]}>
                הגעת ל-5 ההתאמות החודשיות
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: dynamicColors.textLight }]}>
                בתחילת החודש הבא נוכל להציע לך התאמות חדשות.
              </ThemedText>
            </View>
          ) : availableUntil ? (
            // 3. Availability live — calm waiting state, no button.
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <IconSymbol name="sparkles" size={64} color={UI_COLORS.accent} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: dynamicColors.text }]}>
                מחפשים לך התאמה איכותית
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: dynamicColors.textLight }]}>
                סימנת שאת/ה פנוי/ה להכיר. נעדכן ברגע שנמצא התאמה שמתאימה לשאלון שלך.
              </ThemedText>
              <ThemedText style={[styles.availabilityCountdown, { color: dynamicColors.textLight }]}>
                {formatAvailabilityCountdown(availableUntil)}
              </ThemedText>
            </View>
          ) : (
            // 4. Not available — CTA to opt in.
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <IconSymbol name="sparkles" size={64} color={UI_COLORS.accent} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: dynamicColors.text }]}>
                מוכנ/ה להכיר מישהו חדש?
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: dynamicColors.textLight }]}>
                נסמן שאת/ה פנוי/ה להכיר ל־3 הימים הקרובים ונחפש התאמה אחת איכותית.
              </ThemedText>
              <TouchableOpacity
                style={[
                  styles.primaryCtaButton,
                  {
                    backgroundColor: settingAvailability
                      ? dynamicColors.textLight
                      : UI_COLORS.primary,
                  },
                ]}
                onPress={handleSetAvailability}
                disabled={settingAvailability}
                activeOpacity={0.85}
                accessibilityLabel="אני פנוי/ה להכיר"
                accessibilityState={{ disabled: settingAvailability }}
              >
                {settingAvailability ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.primaryCtaButtonText}>
                    אני פנוי/ה להכיר
                  </ThemedText>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/*
            Tip card is gated to fast-onboarding users. Deep users have
            already done the long form; the encouragement isn't actionable
            for them. Stays hidden until onboardingMode resolves (avoids a
            flash of the wrong copy on cold start).
           */}
          {onboardingMode === 'fast' && (
            <View style={styles.tipContainer}>
               <ThemedText style={[styles.tipTitle, { color: dynamicColors.text }]}>טיפ קטן</ThemedText>
               <ThemedText style={[styles.tipText, { color: dynamicColors.textLight }]}>
                 ככל שהשאלון מלא יותר, ההתאמה מדויקת יותר.{'\n'}
                 כן, גם השאלות הקצת מוזרות שם בכוונה 🙂
               </ThemedText>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
  },
  logo: {
    fontSize: 24,
    fontWeight: '900',
  },
  // PR-MATCH-FLOW (PR #57): removed dead styles that only served the
  // old intermediate "התאמה פעילה / הכירו את / צפייה בהתאמה" card:
  //   matchCardContainer, card, cardLabel, cardTitle, visualContainer,
  //   avatarPlaceholder, avatarImage, avatarText, matchScore,
  //   primaryButton, primaryButtonText.
  // Confirmed unreferenced elsewhere in this file before deletion.
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 20,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF0EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  // BATCH-H6: secondary line under the empty-state subtitle. Lighter
  // weight + smaller size so the main subtitle reads as the explanation
  // and this reads as a calm assurance.
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
    marginTop: -8,
  },
  // PR #63 — Soft countdown under the waiting state's subtitle. Calmer
  // than the body copy above so it reads as a small status line, not a
  // hero element.
  availabilityCountdown: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 4,
  },
  // PR #63 — Primary CTA for "אני פנוי/ה להכיר". 52pt height matches
  // the rest of the app's primary buttons (above iOS 44pt min tap
  // target). 24pt horizontal padding so the text breathes; full-width
  // would feel heavier than the calm tone the screen needs.
  primaryCtaButton: {
    minHeight: 52,
    paddingHorizontal: 28,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    alignSelf: 'stretch',
  },
  primaryCtaButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  // BATCH-H6: premium searching hero shared by the initial load and the
  // in-flight findAndCreate path. Intentionally centered (hero pattern)
  // and uses the same sparkles icon as the empty state so the user sees
  // a continuous visual language between "looking" and "nothing yet".
  searchingHero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  searchingIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFF0EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  searchingTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingHorizontal: 8,
  },
  searchingBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingHorizontal: 12,
  },
  searchingNote: {
    fontSize: 13,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  outlineButton: {
    paddingHorizontal: 24,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tipContainer: {
    marginTop: 20,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    gap: 8,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  tipText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
