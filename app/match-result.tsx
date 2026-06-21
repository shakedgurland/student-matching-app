import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { logScreenView, logError } from '@/lib/analytics';
// BATCH-C: Hebrew display labels for peer profile enum values.
// Previously the infoRow values rendered raw codes like "huji", "law",
// "year_3" — visible to users on TestFlight build 12. labelFor() also
// covers the region row, which Match Result didn't render before this
// batch but is added here for parity with the match-profile screen.
import { labelFor } from '@/lib/profile-labels';

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
// peer avatar. Bounds the stale-access window if the match closes
// after the URL is minted. Match-result is a short-lived view; 5 min
// is comfortably long enough for the user to read and act.
const SIGNED_URL_TTL_SECONDS = 300;

interface MatchRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  compatibility_score: number | null;
  compatibility_reasons: string[] | null;
  icebreaker_hint: string | null;
  status: string;
  expires_at: string;
  created_at: string;
}

interface PeerProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  birth_year: number | null;
  university: string | null;
  faculty: string | null;
  year_of_study: string | null;
  campus: string | null;
  avatar_storage_path: string | null;
}

function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return '00:00:00';
  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function MatchResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ match_id?: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  // BATCH-B: sticky-footer safe-area inset for iPhone home indicator.
  // Footer pads to max(inset, 16) so older devices without an indicator
  // still get a comfortable bottom gap and modern iPhones don't tuck the
  // button under the home bar.
  const insets = useSafeAreaInsets();

  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255,255,255,0.1)' : UI_COLORS.border,
    surface: isDark ? 'rgba(255, 138, 0, 0.18)' : UI_COLORS.surface,
  };

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [peer, setPeer] = useState<PeerProfile | null>(null);
  const [peerAvatarUrl, setPeerAvatarUrl] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Mutual-chat-start state from match_message_state RPC (migration 026).
  // Drives the three 'active' sub-states (waiting-to-start /
  // waiting-for-reply / they-wrote-back). Null until the RPC returns;
  // failure leaves it null and the UI degrades to the default
  // "waiting-to-start" copy.
  const [messageState, setMessageState] = useState<{
    i_have_sent: boolean;
    peer_has_sent: boolean;
    distinct_sender_count: number;
    is_mutual_started: boolean;
  } | null>(null);

  useEffect(() => {
    logScreenView('MatchResult');
    loadMatch();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadMatch() {
    try {
      setLoading(true);
      setErrorMsg(null);

      const { data: userRes } = await supabase.auth.getUser();
      const me = userRes.user;
      if (!me) {
        setErrorMsg('יש להתחבר מחדש');
        return;
      }

      const matchColumns =
        'id, user_a_id, user_b_id, compatibility_score, compatibility_reasons, icebreaker_hint, status, expires_at, created_at';

      let matchRow: MatchRow | null = null;
      if (params.match_id) {
        const { data, error } = await supabase
          .from('matches')
          .select(matchColumns)
          .eq('id', params.match_id)
          .maybeSingle();
        if (error) {
          logError('MatchResult', 'load_match_by_id_failed', error);
        } else if (data) {
          matchRow = data as MatchRow;
        }
      }
      if (!matchRow) {
        // Fallback when no match_id route param was provided (e.g., a deep
        // link). Widened to include 'chat_started' so a user whose match
        // has already transitioned (DB trigger fired on their first
        // message) still resolves to their current open match. Mirrors
        // the lifecycle widening in app/(tabs)/index.tsx#fetchCurrentMatch.
        const { data, error } = await supabase
          .from('matches')
          .select(matchColumns)
          .or(`user_a_id.eq.${me.id},user_b_id.eq.${me.id}`)
          .in('status', ['active', 'chat_started'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          logError('MatchResult', 'load_active_match_failed', error);
        } else if (data) {
          matchRow = data as MatchRow;
        }
      }

      if (!matchRow) {
        setErrorMsg('אין כרגע התאמה פעילה');
        return;
      }
      setMatch(matchRow);

      const peerId = matchRow.user_a_id === me.id ? matchRow.user_b_id : matchRow.user_a_id;
      const { data: peerData, error: peerErr } = await supabase
        .from('profiles')
        .select(
          'id, full_name, username, birth_year, university, faculty, year_of_study, campus, avatar_storage_path',
        )
        .eq('id', peerId)
        .maybeSingle();

      if (peerErr || !peerData) {
        logError('MatchResult', 'load_peer_failed', peerErr ?? new Error('peer not found'));
        setErrorMsg('לא ניתן לטעון את פרטי ההתאמה');
        return;
      }
      setPeer(peerData as PeerProfile);

      if (peerData.avatar_storage_path) {
        const { data: signed, error: signErr } = await supabase.storage
          .from('profile-photos')
          .createSignedUrl(peerData.avatar_storage_path, SIGNED_URL_TTL_SECONDS);
        if (!signErr && signed?.signedUrl) {
          setPeerAvatarUrl(signed.signedUrl);
        }
      }

      // Mutual-chat-start state. Non-fatal: a failure leaves messageState
      // null, and the UI falls back to the default "waiting-to-start"
      // active copy. Called once on mount; peer activity arriving while
      // this screen is open is reflected on the next visit.
      const { data: stateData, error: stateErr } = await supabase.rpc(
        'match_message_state',
        { p_match_id: matchRow.id },
      );
      if (stateErr) {
        logError('MatchResult', 'message_state_rpc_failed', stateErr);
      } else if (stateData && typeof stateData === 'object' && !('error' in stateData)) {
        setMessageState(stateData as {
          i_have_sent: boolean;
          peer_has_sent: boolean;
          distinct_sender_count: number;
          is_mutual_started: boolean;
        });
      }
    } catch (e) {
      logError('MatchResult', 'load_match_exception', e);
      setErrorMsg('אירעה שגיאה. נסה/י שוב מאוחר יותר.');
    } finally {
      setLoading(false);
    }
  }

  function openChat() {
    if (!match) return;
    router.push({ pathname: '/chat' as any, params: { match_id: match.id } });
  }

  function openFeedback() {
    if (!match) return;
    router.push({
      pathname: '/match-feedback' as any,
      params: { stage: 'after_match', match_id: match.id },
    });
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={UI_COLORS.primary} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (errorMsg || !match || !peer) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={[styles.header, { borderBottomColor: dynamicColors.border }]}>
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="חזרה">
              <IconSymbol name="chevron.right" size={24} color={UI_COLORS.branding} />
            </TouchableOpacity>
            <ThemedText style={[styles.headerTitle, { color: dynamicColors.text }]}>
              ההתאמה שלך
            </ThemedText>
            <View style={styles.headerSpacer} />
          </View>
          <View style={[styles.center, styles.errorBody]}>
            <ThemedText style={[styles.emptyTitle, { color: dynamicColors.text }]}>
              {errorMsg ?? 'אין כרגע התאמה פעילה'}
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: dynamicColors.textLight }]}>
              חזרו למסך הראשי כדי לראות התאמות חדשות.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const expiresAt = new Date(match.expires_at).getTime();
  const msLeft = Number.isFinite(expiresAt) ? expiresAt - now : 0;
  // Status-aware lifecycle flags. After migration 026:
  //   'active'        — 72h timer is meaningful. May be sub-divided into
  //                     three states using messageState:
  //                       neither sent → "waiting to start"
  //                       I sent only  → "waiting for reply"
  //                       peer sent only → "they wrote back, your turn"
  //                     Mutual-sent should NOT occur for status='active'
  //                     (the trigger transitions to chat_started), but
  //                     we defensively treat is_mutual_started as
  //                     chat_started in case a refresh races the trigger.
  //   'chat_started'  — both participants have sent at least one message;
  //                     timer is irrelevant; chat is durable; no countdown.
  //   'expired' / 'unmatched' — terminal; chat is read-only on the next
  //                     screen; no CTA here.
  const isChatStarted = match.status === 'chat_started'
    || (messageState?.is_mutual_started ?? false);
  const isClosed = match.status === 'expired' || match.status === 'unmatched';
  const isCountdownExpired = msLeft <= 0;
  // CTA disabled when the match is terminal OR active-with-elapsed-timer.
  // chat_started ignores the timer (chat already happening).
  const ctaDisabled = isClosed || (match.status === 'active' && isCountdownExpired);

  // 'active' sub-states (only meaningful when !isChatStarted && !isClosed).
  // Both default to false when messageState hasn't loaded yet, which makes
  // the UI show the safe default "waiting to start" copy.
  const iSent = messageState?.i_have_sent ?? false;
  const peerSent = messageState?.peer_has_sent ?? false;
  const isWaitingForMyReply = !isChatStarted && !isClosed && !iSent && peerSent;
  const isWaitingForPeerReply = !isChatStarted && !isClosed && iSent && !peerSent;

  const displayName = (peer.full_name || peer.username || 'ההתאמה שלך').trim();
  const age = peer.birth_year ? new Date().getFullYear() - peer.birth_year : null;
  const nameWithAge = age ? `${displayName}, ${age}` : displayName;
  const score = match.compatibility_score ?? null;
  const reasons = Array.isArray(match.compatibility_reasons)
    ? match.compatibility_reasons.filter((r) => typeof r === 'string' && r.trim().length > 0)
    : [];
  const icebreaker = match.icebreaker_hint?.trim() || null;
  const initial = (displayName.trim()[0] || '?').toUpperCase();

  // BATCH-C: pass enum codes through labelFor for Hebrew display.
  // `campus` is a free-text city name (not an enum) so it renders
  // verbatim. Don't push rows with empty values from labelFor —
  // 'לא צוין' would be misleading for fields the peer never
  // answered; treat unmapped/empty as "skip the row entirely".
  const infoRows: { label: string; value: string }[] = [];
  if (peer.faculty) {
    const v = labelFor('faculty', peer.faculty);
    if (v && v !== 'לא צוין') infoRows.push({ label: 'פקולטה', value: v });
  }
  if (peer.year_of_study) {
    const v = labelFor('year_of_study', peer.year_of_study);
    if (v && v !== 'לא צוין') infoRows.push({ label: 'שנה', value: v });
  }
  if (peer.university) {
    const v = labelFor('university', peer.university);
    if (v && v !== 'לא צוין') infoRows.push({ label: 'מוסד', value: v });
  }
  if (peer.campus) infoRows.push({ label: 'עיר', value: peer.campus });

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: dynamicColors.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="חזרה">
            <IconSymbol name="chevron.right" size={24} color={UI_COLORS.branding} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerTitle, { color: dynamicColors.text }]}>
            ההתאמה שלך
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.titleBlock}>
            <ThemedText style={[styles.preTitle, { color: UI_COLORS.branding }]}>
              ההתאמה שלך מוכנה
            </ThemedText>
            <ThemedText style={[styles.title, { color: dynamicColors.text }]}>
              הכירו את {nameWithAge}
            </ThemedText>
          </View>

          <View style={styles.avatarRow}>
            <View
              style={[
                styles.avatarCircle,
                { backgroundColor: dynamicColors.surface, borderColor: UI_COLORS.branding },
              ]}>
              {peerAvatarUrl ? (
                <Image source={{ uri: peerAvatarUrl }} style={styles.avatarImage} />
              ) : (
                <ThemedText style={[styles.avatarInitial, { color: UI_COLORS.branding }]}>
                  {initial}
                </ThemedText>
              )}
            </View>
          </View>

          <View
            style={[
              styles.profileCard,
              { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
            ]}>
            <View style={styles.profileHeader}>
              <ThemedText style={[styles.profileName, { color: dynamicColors.text }]}>
                {nameWithAge}
              </ThemedText>
              {score !== null && (
                <View style={[styles.scoreBadge, { backgroundColor: dynamicColors.surface }]}>
                  <ThemedText style={[styles.scoreText, { color: UI_COLORS.branding }]}>
                    {score}% התאמה
                  </ThemedText>
                </View>
              )}
            </View>

            {infoRows.length === 0 ? (
              <ThemedText style={[styles.noInfoNote, { color: dynamicColors.textLight }]}>
                פרטים נוספים יופיעו כשההתאמה תשלים את הפרופיל.
              </ThemedText>
            ) : (
              infoRows.map((row) => (
                <View key={row.label} style={styles.infoRow}>
                  <ThemedText style={[styles.infoLabel, { color: dynamicColors.textLight }]}>
                    {row.label}:
                  </ThemedText>
                  <ThemedText style={[styles.infoValue, { color: dynamicColors.text }]}>
                    {row.value}
                  </ThemedText>
                </View>
              ))
            )}
          </View>

          {reasons.length > 0 && (
            <View style={styles.section}>
              <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>
                למה זו התאמה טובה
              </ThemedText>
              <View style={styles.bullets}>
                {reasons.map((reason, i) => (
                  <View key={i} style={styles.bulletItem}>
                    <View style={[styles.bulletDot, { backgroundColor: UI_COLORS.branding }]} />
                    <ThemedText style={[styles.bulletText, { color: dynamicColors.text }]}>
                      {reason}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>
          )}

          {icebreaker && (
            <View
              style={[
                styles.icebreakerCard,
                {
                  backgroundColor: dynamicColors.surface,
                  borderColor: UI_COLORS.branding + '20',
                },
              ]}>
              <ThemedText style={[styles.icebreakerTitle, { color: UI_COLORS.branding }]}>
                שאלה לפתוח איתה שיחה
              </ThemedText>
              <ThemedText style={[styles.icebreakerText, { color: dynamicColors.text }]}>
                {icebreaker}
              </ThemedText>
            </View>
          )}

          <View
            style={[
              styles.timerCard,
              { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
            ]}>
            {isChatStarted ? (
              <>
                <ThemedText style={[styles.timerLabel, { color: dynamicColors.textLight }]}>
                  השיחה כבר התחילה
                </ThemedText>
                <ThemedText style={[styles.timerLabel, { color: dynamicColors.textLight, marginTop: 4 }]}>
                  אפשר להמשיך לכתוב מתי שמתאים.
                </ThemedText>
              </>
            ) : isClosed ? (
              <ThemedText style={[styles.timerLabel, { color: dynamicColors.textLight }]}>
                ההתאמה הסתיימה
              </ThemedText>
            ) : isWaitingForMyReply ? (
              <>
                <ThemedText style={[styles.timerLabel, { color: dynamicColors.textLight }]}>
                  {isCountdownExpired
                    ? 'ההתאמה הסתיימה'
                    : `${displayName} כתב/ה לך — ענה/י כדי שהשיחה תתקבע`}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.timerValue,
                    { color: isCountdownExpired ? dynamicColors.textLight : UI_COLORS.primary },
                  ]}>
                  {formatCountdown(msLeft)}
                </ThemedText>
              </>
            ) : isWaitingForPeerReply ? (
              <>
                <ThemedText style={[styles.timerLabel, { color: dynamicColors.textLight }]}>
                  {isCountdownExpired
                    ? 'ההתאמה הסתיימה'
                    : 'שלחת הודעה — מחכים לתגובה. ההתאמה תפוג אם לא תהיה תגובה בזמן.'}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.timerValue,
                    { color: isCountdownExpired ? dynamicColors.textLight : UI_COLORS.primary },
                  ]}>
                  {formatCountdown(msLeft)}
                </ThemedText>
              </>
            ) : (
              <>
                <ThemedText style={[styles.timerLabel, { color: dynamicColors.textLight }]}>
                  {isCountdownExpired ? 'ההתאמה הסתיימה' : 'נותר זמן להתחיל שיחה'}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.timerValue,
                    { color: isCountdownExpired ? dynamicColors.textLight : UI_COLORS.primary },
                  ]}>
                  {formatCountdown(msLeft)}
                </ThemedText>
              </>
            )}
          </View>

          {/*
            BATCH-B: secondary actions stay in the scroll body. The
            primary CTA was promoted to a sticky footer below so it's
            always reachable without scrolling — see the View after
            ScrollView. Secondary buttons being inside the scroll body
            keeps the footer single-purpose and uncrowded.
           */}
          <View style={styles.secondaryActions}>
            {/*
              PR-MATCH-PROFILE-V1: opens the rich match-profile screen
              (photo gallery + safe peer details + reasons + icebreaker).
              Visible for any status — even expired/unmatched lets the
              user re-view what they had.
             */}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                router.push({
                  pathname: '/match-profile' as any,
                  params: { match_id: match.id },
                });
              }}>
              <ThemedText style={[styles.secondaryButtonText, { color: UI_COLORS.branding }]}>
                צפייה בפרופיל המלא
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={openFeedback}>
              <ThemedText style={[styles.secondaryButtonText, { color: UI_COLORS.branding }]}>
                משוב על ההתאמה
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/*
          BATCH-B: sticky primary CTA. Always visible above the home
          indicator regardless of scroll position. Renders for every
          status: when isClosed, the button stays present as a disabled
          control (ctaDisabled is true) so the layout doesn't shift and
          the user still sees the chat affordance for terminal matches.
          paddingBottom uses the home-indicator safe-area inset, with a
          16pt floor for older iPhones without an indicator. Top border
          gives a visual separator from the scrollable body.
         */}
        <View
          style={[
            styles.stickyFooter,
            {
              backgroundColor: dynamicColors.bg,
              borderTopColor: dynamicColors.border,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: ctaDisabled ? dynamicColors.textLight : UI_COLORS.primary },
            ]}
            onPress={openChat}
            disabled={ctaDisabled}
            activeOpacity={0.8}>
            <ThemedText style={styles.primaryButtonText}>
              {isChatStarted ? 'המשך לצ׳אט' : 'פתח/י צ׳אט'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headerSpacer: { width: 24 },
  errorBody: { flex: 1, padding: 24, gap: 12 },
  // BATCH-B: bumped paddingBottom from 60 to 120 so the trailing
  // secondary buttons inside the scroll body clear the new sticky
  // footer height (button 56 + footer padding ~32 + buffer) and the
  // user can fully scroll to the last "משוב על ההתאמה" row without it
  // being visually clipped or tappable under the footer.
  scrollContent: { padding: 24, paddingBottom: 120, gap: 24 },
  titleBlock: { alignItems: 'center', gap: 8, marginTop: 12 },
  // BATCH-E1: premium polish — letterSpacing 1 → 0.5 + weight 800 → 700.
  // The previous combo read as ALL-CAPS-shouty next to the hero title;
  // refined letterSpacing + slightly lighter weight reads premium.
  preTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  // BATCH-E1: title weight 900 → 800. 900 was the heaviest possible
  // weight; 800 keeps the hero impact while feeling less bombastic
  // alongside the avatar and score badge below.
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 32,
  },
  avatarRow: { alignItems: 'center', marginVertical: 4 },
  // BATCH-E1: avatar border 3 → 2. A 3pt branding-red border around
  // the hero avatar competed visually with the title + score badge;
  // 2pt keeps the brand frame visible but lets the avatar breathe.
  avatarCircle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 52, fontWeight: '800' },
  profileCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  profileName: { fontSize: 22, fontWeight: '800' },
  scoreBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  scoreText: { fontSize: 14, fontWeight: '700' },
  noInfoNote: {
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
    fontStyle: 'italic',
  },
  // BATCH-C: explicit row-reverse so label sits on the RIGHT (Hebrew
  // reading order) regardless of whether the host shell's RTL auto-
  // flip is active. RN's `flexDirection: 'row'` is supposed to flip
  // under I18nManager.forceRTL but on iOS this can be inconsistent
  // across cold launches / hot-reloads. Pin it explicitly. justify
  // content keeps label-right + value-left-of-label tight (no extra
  // spread) so the pair reads as a natural "label: value" unit.
  infoRow: { flexDirection: 'row-reverse', gap: 8, justifyContent: 'flex-start' },
  infoLabel: { fontSize: 16, fontWeight: '500', textAlign: 'right', writingDirection: 'rtl' },
  infoValue: { fontSize: 16, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  section: { gap: 12 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  bullets: { gap: 10 },
  // BATCH-E2 (RTL gap fix): mirrors the Batch C fix in match-profile.tsx
  // for the same "למה זו התאמה טובה" bullet pattern. Pinned row-reverse
  // so the bullet dot sits on the RIGHT (Hebrew reading order) and text
  // flows leftward. alignItems center pairs the dot's vertical center
  // with the text mid-line — cleaner than the previous flex-start +
  // bulletDot.marginTop hack that depended on a brittle offset matching
  // a 22pt line height. Match-result and match-profile now render this
  // section identically.
  bulletItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3 },
  bulletText: {
    flex: 1,
    fontSize: 16,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
  },
  icebreakerCard: { padding: 20, borderRadius: 20, borderWidth: 1, gap: 8 },
  icebreakerTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  icebreakerText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  timerCard: {
    borderRadius: 20,
    // BATCH-B: bumped from padding: 18 to paddingVertical: 22 +
    // paddingHorizontal: 18. The previous symmetric 18 didn't give
    // the fontSize-36 + weight-900 + tabular-nums countdown enough
    // vertical room — descenders/ascenders were getting clipped on
    // iPhone, especially when wrapped in `<>` with the label above.
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  timerLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  timerValue: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
    // BATCH-B: explicit lineHeight so the large tabular-nums countdown
    // isn't clipped at top/bottom by RN's default text bounding box on
    // iOS. 44 gives ~22% leading above the 36pt glyph — comfortable
    // breathing room for the heaviest weight without affecting layout
    // outside the timerCard. textAlignVertical doesn't help here
    // because the issue is the bounding box, not the alignment.
    lineHeight: 44,
    textAlign: 'center',
  },
  // BATCH-B: secondary actions stay in the scroll body (renamed from
  // `actions`). Sticky primary CTA lives in stickyFooter below.
  secondaryActions: { gap: 12, marginTop: 4 },
  // BATCH-B: sticky footer for the primary chat CTA. Rendered outside
  // the ScrollView so the button is always reachable. Background match
  // is opaque so scroll content underneath doesn't bleed through.
  stickyFooter: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  // BATCH-E1: primary button height 56 → 52 + weight 800 → 700 +
  // fontSize 18 → 17. Still well above iOS 44pt min tap target;
  // refined visual weight reads premium. Matches the same step-down
  // applied to onboarding / login / signup primary buttons.
  primaryButton: {
    height: 52,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryButton: {
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '700' },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 22,
  },
});
