import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { findAndCreateBestMatch } from '@/lib/matching';
import { logScreenView, logEvent, logError } from '@/lib/analytics';

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

// PR-PREBUILD-MATCH-PRIVACY-POLISH: shorter signed-URL TTL for the
// peer/candidate avatar used in the home-tab match card. Matches the
// value used by match-profile / chat / match-result so every peer-image
// surface bounds the stale-access window to the same 5 minutes if the
// match closes after the URL is minted. Own-user images
// (my-profile, questionnaire onboarding) intentionally keep the longer
// 3600s TTL — owner access does not need bounding.
const SIGNED_URL_TTL_SECONDS = 300;

// BATCH-B: tracks match IDs we've already auto-redirected to
// /match-result during this app session. Lives at module scope so it
// survives the home-tab's mount/unmount cycle as the user navigates
// in/out of the tab. Prevents an infinite redirect loop: if the user
// taps the back arrow on /match-result and lands back on the home
// tab, we should NOT immediately bounce them right back — they
// explicitly asked to leave. Per-id rather than a single boolean so
// that if a new match is created later in the session (e.g., the
// previous one ended and they got a fresh one), the new id is treated
// as fresh and the redirect fires once for it.
const redirectedMatchIds = new Set<string>();

export default function MatchSelectionScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<any>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  // Set to true when the backend returns { status: 'monthly_cap_reached' }.
  // Drives the empty-state copy so the user sees a clear cap message instead
  // of a "still searching..." text that would never resolve. Reset on every
  // fetchCurrentMatch so a returning user (new month / new session) sees the
  // default empty state again.
  const [capReached, setCapReached] = useState(false);
  // 'fast' | 'deep' | null. Drives the fast-only tip card at the bottom of
  // the screen. Fetched once on mount alongside fetchCurrentMatch.
  const [onboardingMode, setOnboardingMode] = useState<string | null>(null);

  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
  };

  useEffect(() => {
    logScreenView('Home');
    fetchCurrentMatch();
  }, []);

  // BATCH-B: auto-forward to /match-result when a current match exists.
  // BATCH-E1: extended to also forward to /chat when the match has
  // already transitioned to 'chat_started' (i.e., at least one message
  // has been exchanged — migration 023's trigger flips the status on
  // first message INSERT). Avoids forcing returning users through the
  // match-result preview every cold launch when their conversation
  // is already underway. The match profile remains reachable from the
  // chat header avatar/title (added in PR-MATCH-PROFILE-V1).
  //
  // Status branching:
  //   - 'active'        → /match-result (no chat yet; preview is right)
  //   - 'chat_started'  → /chat (conversation is live; skip the preview)
  //   - terminal (expired/unmatched) → never reaches this point;
  //     fetchCurrentMatch filters them out via .in('status',
  //     ['active', 'chat_started']) so currentMatch stays null and
  //     the home empty state renders — correct UX.
  //
  // Uses router.replace so the home tab is dropped from the stack —
  // back-from-match-result/chat exits the (tabs) layer entirely
  // rather than re-entering this screen and re-triggering the redirect.
  // Loop guard: redirectedMatchIds (module scope) records each id
  // we've already redirected for this app session. A back navigation
  // that somehow lands us back here with the same currentMatch will
  // skip the redirect because the id is already in the set. A NEW
  // match (different id) re-triggers the redirect once.
  // Deps are [currentMatch?.id, currentMatch?.status, loading] so the
  // effect fires once currentMatch's id stabilizes; including status
  // also re-fires if the trigger flips active→chat_started mid-session
  // (e.g., the user just sent the first message and re-enters the home
  // tab) — though in practice the redirect-once guard handles that too.
  useEffect(() => {
    if (loading) return;
    const matchId = currentMatch?.id;
    if (!matchId) return;
    if (redirectedMatchIds.has(matchId)) return;
    redirectedMatchIds.add(matchId);
    const target = currentMatch?.status === 'chat_started' ? '/chat' : '/match-result';
    router.replace({ pathname: target as any, params: { match_id: matchId } });
  }, [currentMatch?.id, currentMatch?.status, loading, router]);

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
              // Confirmed: row was 'active' && expires_at < now() at UPDATE
              // time and we successfully flipped it to 'expired'. Safe to
              // fetch the next match.
              handleFindMatch(user.id, true);
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
              // Treat as no open match and look for the next one.
              handleFindMatch(user.id, true);
              return;
            }

            if (refetched.status === 'expired' || refetched.status === 'unmatched') {
              // Terminal — server cron beat us. Move on.
              handleFindMatch(user.id, true);
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

        setCurrentMatch(openMatch);

        // Fetch other user profile — minimal column set; never select email
        // or other sensitive fields. Matched-peer SELECT access is granted
        // by the policy from migration 020 (widened to chat_started by
        // migration 023).
        const otherUserId = openMatch.user_a_id === user.id ? openMatch.user_b_id : openMatch.user_a_id;
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, avatar_storage_path')
          .eq('id', otherUserId)
          .single();

        if (profileError) throw profileError;

        // Generate signed URL for avatar if storage_path exists.
        // PR-PREBUILD-MATCH-PRIVACY-POLISH: peer avatar — 300s TTL.
        let avatarUrl = profile.avatar_url;
        if (profile.avatar_storage_path) {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('profile-photos')
            .createSignedUrl(profile.avatar_storage_path, SIGNED_URL_TTL_SECONDS);
          if (!signedError) {
            avatarUrl = signedData.signedUrl;
          }
        }

        setOtherUser({ ...profile, avatar_url: avatarUrl });
      } else {
        // Automatically try to find a match if none exists
        handleFindMatch(user.id, true);
      }
    } catch (error) {
      console.error('Error fetching match:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFindMatch = async (userId?: string, silent: boolean = false) => {
    try {
      setMatching(true);
      logEvent('match_search_started');
      const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id;
      if (!targetUserId) return;

      const newMatch = await findAndCreateBestMatch(targetUserId);

      if (newMatch && 'matchId' in newMatch) {
        // Success path: backend returned 'created' and lib/matching loaded
        // the candidate profile. Sign the avatar URL for the carousel and
        // render the match card.
        logEvent('match_found', { metadata: { matchId: newMatch.matchId, score: newMatch.compatibilityScore } });
        let candidateProfile = newMatch.candidateProfile;

        if (candidateProfile.avatar_storage_path) {
          // PR-PREBUILD-MATCH-PRIVACY-POLISH: peer/candidate avatar — 300s TTL.
          const { data: signedData, error: signedError } = await supabase.storage
            .from('profile-photos')
            .createSignedUrl(candidateProfile.avatar_storage_path, SIGNED_URL_TTL_SECONDS);
          if (!signedError) {
            candidateProfile = { ...candidateProfile, avatar_url: signedData.signedUrl };
          }
        }

        setCurrentMatch({
          id: newMatch.matchId,
          compatibility_score: newMatch.compatibilityScore,
          compatibility_reasons: newMatch.compatibilityReasons,
        });
        setOtherUser(candidateProfile);
        return;
      }

      if (newMatch && 'status' in newMatch) {
        logEvent('match_not_found', { metadata: { reason: newMatch.status } });
        switch (newMatch.status) {
          case 'no_candidate':
            // Legitimate empty state — default empty-state copy already
            // covers this. No Alert.
            break;
          case 'monthly_cap_reached':
            // Drives the cap-aware empty-state copy below.
            setCapReached(true);
            break;
          case 'already_has_active':
            // Caller already has an active match (shouldn't normally fire
            // because fetchCurrentMatch would have shown it). Re-fetch as
            // a safety net so the user sees the existing one.
            fetchCurrentMatch();
            break;
          case 'incomplete_profile':
            if (!silent) {
              Alert.alert('פרופיל לא הושלם', 'יש להשלים את השאלון כדי לקבל התאמות.');
            }
            break;
          case 'unauthorized':
            if (!silent) {
              Alert.alert('שגיאת זיהוי', 'אנא היכנס/י מחדש.');
            }
            break;
          case 'error':
            if (!silent) {
              Alert.alert('שגיאה', 'אירעה שגיאה. נסה/י שוב מאוחר יותר.');
            }
            break;
        }
        return;
      }

      // Defensive: malformed response shape. Should not happen with the
      // current Edge Function contract.
      logEvent('match_not_found');
      if (!silent) {
        Alert.alert('שגיאה', 'אירעה שגיאה. נסה/י שוב מאוחר יותר.');
      }
    } catch (error) {
      logError('Home', 'match_search_failed', error);
      console.error('Error in finding match:', error);
    } finally {
      setMatching(false);
    }
  };

  const handleStartChat = () => {
    if (!currentMatch?.id) return;
    router.push({ pathname: '/match-result', params: { match_id: currentMatch.id } });
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

          {currentMatch && otherUser ? (
            <View style={styles.matchCardContainer}>
              <View style={[styles.card, { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}>
                <ThemedText style={[styles.cardLabel, { color: UI_COLORS.branding }]}>התאמה פעילה</ThemedText>
                <ThemedText style={[styles.cardTitle, { color: dynamicColors.text }]}>הכירו את {otherUser.full_name || otherUser.username || 'ההתאמה שלך'}</ThemedText>
                
                <View style={styles.visualContainer}>
                   <View style={[styles.avatarPlaceholder, { borderColor: UI_COLORS.branding }]}>
                      {otherUser.avatar_url ? (
                        <Image source={{ uri: otherUser.avatar_url }} style={styles.avatarImage} />
                      ) : (
                        <ThemedText style={styles.avatarText}>{(otherUser.full_name || otherUser.username || '?')[0]}</ThemedText>
                      )}
                   </View>
                </View>

                <ThemedText style={[styles.matchScore, { color: UI_COLORS.primary }]}>
                   {currentMatch.compatibility_score}% התאמה
                </ThemedText>

                <TouchableOpacity 
                  style={[styles.primaryButton, { backgroundColor: UI_COLORS.primary }]}
                  onPress={handleStartChat}>
                  <ThemedText style={styles.primaryButtonText}>צפייה בהתאמה</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          ) : matching ? (
            // BATCH-H6: a background find-and-create is running (post-
            // questionnaire, post-feedback, or post-end-match landing).
            // Show the same searching hero instead of the empty card
            // so the user doesn't briefly see "אין התאמה" while we're
            // still actively looking.
            searchingHero
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <IconSymbol name="sparkles" size={64} color={UI_COLORS.accent} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: dynamicColors.text }]}>
                {capReached ? 'הגעת ל-5 ההתאמות החודשיות' : 'אין התאמה חדשה כרגע'}
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: dynamicColors.textLight }]}>
                {capReached
                  ? 'בתחילת החודש הבא נוכל להציע לך התאמות חדשות.'
                  : 'זה לא אומר שאין התאמה טובה — פשוט אין כרגע התאמה שעומדת בתנאים שלך.'}
              </ThemedText>
              {!capReached && (
                <ThemedText style={[styles.emptyHint, { color: dynamicColors.textLight }]}>
                  נעדכן כשנמצא התאמה מתאימה יותר.
                </ThemedText>
              )}
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
  matchCardContainer: {
    marginTop: 20,
  },
  card: {
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  visualContainer: {
    marginVertical: 10,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF0EA',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FF3D57',
  },
  matchScore: {
    fontSize: 18,
    fontWeight: '700',
  },
  primaryButton: {
    width: '100%',
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
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
