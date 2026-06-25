import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
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
import { findAndCreateBestMatch } from '@/lib/matching';
import { logScreenView, logEvent, logError } from '@/lib/analytics';
import { MatchResultContent } from '@/components/match-result/MatchResultContent';

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

// Migration 035 + matching-client refresh: automatic matching is restored.
// The home tab now:
//   1. fetches the user's current open match (if any) and auto-forwards
//      to /match-result | /chat via the existing redirect effect, OR
//   2. if no open match, no cap, and onboarding is complete, automatically
//      attempts ONE match creation on mount (autoSearchedRef one-shot),
//      OR
//   3. if no candidate was found, shows a calm "still searching" empty
//      state. No buttons, no opt-in flow.
//
// The previous "אני פנוי/ה להכיר" CTA + waiting state were removed along
// with the availability gate. PR #65 crash hardening (isMountedRef,
// navigatingToMatchRef, alertingRef, safeAlert serializer, synchronous
// in-flight ref) is preserved; the synchronous ref is now scoped to the
// find-match flow itself instead of the legacy availability button.

export default function MatchSelectionScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<any>(null);
  // True when the user has hit the 5/month cap. Computed proactively in
  // fetchCurrentMatch (count of this user's matches this calendar month
  // ≥ 5) AND set reactively if handleFindMatch returns
  // 'monthly_cap_reached'. Drives the cap copy + suppresses auto-search.
  const [capReached, setCapReached] = useState(false);
  // 'fast' | 'deep' | null. Drives the fast-only tip card at the bottom.
  const [onboardingMode, setOnboardingMode] = useState<string | null>(null);
  // True after an auto-search attempt has resolved with 'no_candidate'.
  // Drives the calm "no match yet" empty state copy.
  const [noMatchFound, setNoMatchFound] = useState(false);
  // 3-tab restructure — drives the "נותרו לך עוד N התאמות החודש" line in
  // the calm searching/empty states. Null until the cap check resolves
  // (suppresses a flash of the wrong number on cold start). 0 hides the
  // line because the cap-reached branch renders its own copy.
  const [monthlyRemaining, setMonthlyRemaining] = useState<number | null>(null);

  // PR-BUILD24-HARDEN: lifecycle / race-safety refs (preserved verbatim).
  //
  //   isMountedRef          — flipped on mount/unmount. All setState
  //                           calls after an await check it.
  //   findMatchInFlightRef  — SYNCHRONOUS in-flight guard for handleFindMatch.
  //                           Replaces the PR #63 settingAvailabilityRef
  //                           (button-press guard); same race-safety
  //                           pattern but now scoped to the auto-match
  //                           flow. Closes the window where two paths
  //                           could both observe `matching === false`
  //                           between an await and the setMatching(true)
  //                           call landing.
  //   alertingRef           — serializes Alert.alert calls (iOS 26
  //                           UIAlertController crash defense).
  //   autoSearchedRef       — one-shot for the on-mount auto-match
  //                           attempt. Without this, React 18 strict mode
  //                           / a re-mount after auth state change could
  //                           fire the auto-search twice.
  //
  // 3-tab restructure — the prior navigatingToMatchRef was deleted along
  // with the auto-forward useEffect. The Match tab no longer redirects
  // to /match-result; it renders <MatchResultContent /> inline when an
  // active match exists, so the persistent bottom tab bar stays visible.
  const isMountedRef = useRef(true);
  const findMatchInFlightRef = useRef(false);
  const alertingRef = useRef(false);
  const autoSearchedRef = useRef(false);

  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
  };

  // PR-BUILD24-HARDEN: mount tracking. Pairs with isMountedRef.current
  // checks scattered through the async handlers below.
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

  // 3-tab restructure — the prior auto-forward useEffect was deleted.
  // The Match tab is now the Match experience itself: when an open match
  // exists, the render branch below mounts <MatchResultContent /> inline
  // (and the user is then in the Chat tab if they tap "open chat", via
  // the onOpenChat callback). The bottom tab bar stays visible the whole
  // time.

  // PR-BUILD24-HARDEN: alert serializer. iOS 26 throws NSException from
  // a TurboModule worker when two UIAlertControllers present in
  // overlapping animation frames, which terminates the process
  // (EXC_CRASH / SIGABRT). This helper drops new alerts while one is up.
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
      setNoMatchFound(false);
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
      // message sent) count as open and block receiving a new match.
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
        // job from migration 024. Hardened: the UPDATE failure path
        // must NEVER fall through to handleFindMatch with a still-active
        // row that could trigger 'already_has_active'.
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
              console.error('passive expiry update failed; staying in safe empty state:', updateError);
              return;
            }

            if (updated && updated.length > 0) {
              // Passive expiry succeeded. With automatic matching
              // restored, immediately try to find a fresh match.
              await runAutoSearchIfEligible(user.id);
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
              await runAutoSearchIfEligible(user.id);
              return;
            }

            if (refetched.status === 'expired' || refetched.status === 'unmatched') {
              // Terminal — server cron beat us. Auto-search for a fresh match.
              await runAutoSearchIfEligible(user.id);
              return;
            }

            // status is now 'chat_started' (trigger fired between SELECT
            // and UPDATE) OR still 'active' (clock skew). In BOTH cases,
            // render the match as the current open match. Do NOT call
            // handleFindMatch — that would risk a duplicate open match.
            openMatch = refetched;
          } catch (expireErr) {
            console.error('passive expiry exception; staying in safe empty state:', expireErr);
            return;
          }
        }

        // Peer-missing resilience (PR #51): if the peer's account was
        // deleted, bail out cleanly and auto-search for a new match.
        const otherUserId = openMatch.user_a_id === user.id ? openMatch.user_b_id : openMatch.user_a_id;
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, avatar_storage_path')
          .eq('id', otherUserId)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profile) {
          logEvent('home_peer_profile_missing', { metadata: { matchId: openMatch.id } });
          await runAutoSearchIfEligible(user.id);
          return;
        }

        // Peer profile resolved successfully — set currentMatch which
        // triggers the auto-forward useEffect.
        setCurrentMatch(openMatch);
      } else {
        // No open match — automatic matching attempt.
        await runAutoSearchIfEligible(user.id);
      }
    } catch (error) {
      console.error('Error fetching match:', error);
    } finally {
      setLoading(false);
    }
  };

  // Migration 035 / automatic matching: when the user has no open match
  // (and is not capped), proactively try to create one. Cap is checked
  // here so the cap empty state can render without a wasted Edge Function
  // round-trip when there's nothing to find. autoSearchedRef is a
  // SYNCHRONOUS one-shot so React strict-mode / re-renders / multiple
  // fall-through paths in fetchCurrentMatch can't fan out into duplicate
  // RPC calls.
  const runAutoSearchIfEligible = async (userId: string) => {
    const startOfMonth = (() => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString();
    })();

    const { count, error: capErr } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .gte('created_at', startOfMonth);

    if (capErr) {
      // Cap query failed — log and fall through to "not capped". The
      // Edge Function re-checks the cap server-side, so this defensive
      // fallback cannot permit a real over-cap match.
      logError('Home', 'cap_count_failed', capErr);
    }

    const monthlyMatchCount = count ?? 0;
    if (monthlyMatchCount >= 5) {
      if (isMountedRef.current) {
        setCapReached(true);
        setMonthlyRemaining(0);
      }
      return;
    }

    if (isMountedRef.current) {
      setMonthlyRemaining(Math.max(0, 5 - monthlyMatchCount));
    }

    // One-shot per mount. Subsequent re-renders / re-runs do not retry.
    if (autoSearchedRef.current) return;
    autoSearchedRef.current = true;
    await handleFindMatch(userId, true);
  };

  const handleFindMatch = async (userId?: string, silent: boolean = false) => {
    // PR-BUILD24-HARDEN: SYNCHRONOUS ref guard. Belt-and-suspenders with
    // autoSearchedRef — even if some path bypasses the one-shot, a
    // second concurrent call returns immediately.
    if (findMatchInFlightRef.current) return;
    findMatchInFlightRef.current = true;
    try {
      if (isMountedRef.current) setMatching(true);
      logEvent('match_search_started');
      const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id;
      if (!targetUserId) return;

      const newMatch = await findAndCreateBestMatch(targetUserId);
      if (!isMountedRef.current) return;

      if (newMatch && 'matchId' in newMatch) {
        // Success path: backend returned 'created'. Set currentMatch
        // which triggers the auto-forward useEffect to /match-result.
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
            // Calm "still searching" empty state — see render below.
            if (isMountedRef.current) setNoMatchFound(true);
            break;
          case 'monthly_cap_reached':
            if (isMountedRef.current) setCapReached(true);
            break;
          case 'already_has_active':
            // Caller already has an active match — re-fetch state so
            // the auto-forward useEffect routes them to /match-result.
            await fetchCurrentMatch();
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

      // Defensive: malformed response shape.
      logEvent('match_not_found');
      if (!silent) safeAlert('שגיאה', 'אירעה שגיאה. נסה/י שוב מאוחר יותר.');
    } catch (error) {
      logError('Home', 'match_search_failed', error);
      console.error('Error in finding match:', error);
    } finally {
      findMatchInFlightRef.current = false;
      if (isMountedRef.current) setMatching(false);
    }
  };

  // 3-tab restructure — premium searching hero shared by the initial load
  // and the in-flight findAndCreate path. Centered, sparkles icon, calm
  // copy that frames the Match tab as the home of "next match".
  // Renders the monthly-remaining line only after the cap check resolves
  // (suppresses a flash of the wrong count on cold start).
  const remainingLine =
    monthlyRemaining !== null && monthlyRemaining > 0
      ? `נותרו לך עוד ${monthlyRemaining} ${monthlyRemaining === 1 ? 'התאמה' : 'התאמות'} החודש`
      : null;

  const searchingHero = (
    <View style={styles.searchingHero}>
      <View style={styles.searchingIconCircle}>
        <IconSymbol name="sparkles" size={56} color={UI_COLORS.accent} />
      </View>
      <ThemedText style={[styles.searchingTitle, { color: dynamicColors.text }]}>
        מחפשים את ההתאמה הבאה שלך…
      </ThemedText>
      <ActivityIndicator size="small" color={UI_COLORS.primary} style={{ marginTop: 4 }} />
      {remainingLine && (
        <ThemedText style={[styles.searchingNote, { color: dynamicColors.textLight }]}>
          {remainingLine}
        </ThemedText>
      )}
    </View>
  );

  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <ThemedText style={[styles.logo, { color: UI_COLORS.branding }]}>UniMatch</ThemedText>
          </View>
          {searchingHero}
        </SafeAreaView>
      </ThemedView>
    );
  }

  // 3-tab restructure — render the existing Match Result experience
  // inline when an open match exists. The component is the same one the
  // /match-result stack route renders, just hosted in the tab so the
  // bottom tab bar persists. onOpenChat switches to the Chat tab
  // (router.navigate is the Expo Router primitive for tab navigation —
  // it does not push a duplicate stack route).
  if (currentMatch?.id) {
    return (
      <MatchResultContent
        matchId={currentMatch.id}
        onOpenChat={() => router.navigate('/(tabs)/chat' as any)}
      />
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* 3-tab restructure — removed the top-right profile icon
              shortcut; "הפרופיל שלי" is now a first-class tab in the
              bottom bar. Header centers the brand mark. */}
          <View style={styles.header}>
            <ThemedText style={[styles.logo, { color: UI_COLORS.branding }]}>UniMatch</ThemedText>
          </View>

          {/* Render order (3-tab restructure — Match tab is the Match
              experience itself):
                * currentMatch with id → handled by the early return
                  above (renders <MatchResultContent />); never reaches
                  this JSX.
                1. searchingHero — auto/manual search in flight.
                2. Cap state — user hit 5/month; auto-search suppressed.
                3. No-match-found state — auto-search returned
                   no_candidate. Calm empty copy, no buttons.
              No score percentage. No "אני פנוי/ה להכיר" CTA. No "last
              seen" surface. */}
          {matching ? (
            searchingHero
          ) : capReached ? (
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
          ) : (
            // No-match-found OR auto-search hasn't yet returned a result
            // (loading already covered above). Calm empty state — no
            // retry button, no opt-in button. The next foreground
            // transition (or pull-to-refresh in a future change) will
            // re-attempt automatically.
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <IconSymbol name="sparkles" size={64} color={UI_COLORS.accent} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: dynamicColors.text }]}>
                עדיין לא מצאנו התאמה מתאימה
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: dynamicColors.textLight }]}>
                נמשיך לבדוק כשיהיו משתמשים פעילים שמתאימים להגדרות שלך.
              </ThemedText>
              {remainingLine && (
                <ThemedText style={[styles.searchingNote, { color: dynamicColors.textLight }]}>
                  {remainingLine}
                </ThemedText>
              )}
            </View>
          )}

          {onboardingMode === 'fast' && !noMatchFound && (
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
  // 3-tab restructure — header now hosts only the brand mark
  // (profile icon moved to its own tab). Center-justified for symmetry.
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
  },
  logo: {
    fontSize: 24,
    fontWeight: '900',
  },
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
