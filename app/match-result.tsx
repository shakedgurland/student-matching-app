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
import { labelFor } from '@/lib/profile-labels';
import {
  type CompatibilityEvidence,
  parseEvidenceArray,
  parseEvidenceFromMetadata,
  renderEvidenceText,
} from '@/lib/match-evidence';

// PR-UI-POLISH: shifted background from off-white (#FFFCFA) to pure
// white (#FFFFFF) per QA — testers felt the off-white read as creamy
// next to the white cards. Cards still pure white; rose tint reserved
// for small accent chips/strips. Primary coral kept for the sticky CTA.
// Dark mode inherits the existing scheme — only light-mode background
// tone changes.
const UI_COLORS = {
  bg: '#FFFFFF',
  primary: '#FF4D3D',
  branding: '#FF3D57',
  surfaceRose: '#FFF3F4',
  text: '#172033',
  textLight: '#667085',
  border: '#EEEAE6',
  card: '#FFFFFF',
};

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
  // PR-PREMIUM-UI: metadata now selected so we can render per-kind premium
  // evidence cards from metadata.compatibility_evidence (introduced by
  // PR #48). Old matches created before PR #48 deploy have metadata =
  // { depth } only and no compatibility_evidence key — the UI falls back
  // to compatibility_reasons rendered as plain text cards.
  metadata: Record<string, unknown> | null;
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

// PR-MATCH-CTX (PR #56): CompatibilityEvidence type + parseEvidence*
// + renderEvidenceText moved to lib/match-evidence.ts so match-profile
// can share the same shape + rendering. Imported at the top of this
// file alongside the other lib helpers.

// Compact "hours remaining" chip. Seconds/minutes intentionally omitted —
// the previous countdown card felt like a sale timer and put pressure on
// the user. Hours-only reads as informative, not stressful.
function formatRemainingChip(msRemaining: number): string {
  if (msRemaining <= 0) return '';
  const hours = Math.floor(msRemaining / (1000 * 60 * 60));
  if (hours >= 1) return `נותרו ${hours}ש׳`;
  return 'פחות משעה';
}

export default function MatchResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ match_id?: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  // Sticky-footer safe-area inset for iPhone home indicator. Footer pads
  // to max(inset, 12) so older devices without an indicator still get a
  // comfortable bottom gap and modern iPhones don't tuck the button under
  // the home bar.
  const insets = useSafeAreaInsets();

  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255,255,255,0.10)' : UI_COLORS.border,
    surfaceRose: isDark ? 'rgba(255, 138, 0, 0.18)' : UI_COLORS.surfaceRose,
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

  // PR-MATCH-CTX (PR #56): when the stored metadata.compatibility_evidence
  // is empty (typical for matches created before the PR #48 deploy),
  // call get_match_context (migration 032) to derive concrete evidence
  // on the fly. null = not yet attempted / metadata had stored items;
  // [] = RPC attempted, returned no usable items — section will hide;
  // [items] = RPC returned derived evidence — render as cards.
  const [fallbackEvidence, setFallbackEvidence] = useState<
    CompatibilityEvidence[] | null
  >(null);

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

      // PR-PREMIUM-UI: metadata added to the SELECT so the UI can render
      // structured evidence cards (PR #48) with a clean fallback to
      // compatibility_reasons for older rows.
      const matchColumns =
        'id, user_a_id, user_b_id, compatibility_score, compatibility_reasons, icebreaker_hint, status, expires_at, created_at, metadata';

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

      // PR-MATCH-CTX: if the stored metadata has no compatibility_evidence
      // (old matches from before PR #48 deploy), call get_match_context
      // for a fresh derive. Non-fatal — RPC failure leaves the section
      // hidden (never falls back to legacy generic compatibility_reasons
      // strings like "יש חפיפה בתחומי העניין"). Fire-and-forget so the
      // peer + storage + message-state fetches below don't block on this.
      const storedEvidence = parseEvidenceFromMetadata(matchRow.metadata);
      if (storedEvidence.length === 0) {
        void (async () => {
          try {
            const { data: ctxData, error: ctxErr } = await supabase.rpc(
              'get_match_context',
              { p_match_id: matchRow.id },
            );
            if (ctxErr) {
              logError('MatchResult', 'get_match_context_failed', ctxErr);
              setFallbackEvidence([]);
              return;
            }
            if (
              ctxData &&
              typeof ctxData === 'object' &&
              !('error' in (ctxData as Record<string, unknown>))
            ) {
              const raw = (ctxData as Record<string, unknown>).compatibility_evidence;
              setFallbackEvidence(parseEvidenceArray(raw));
            } else {
              setFallbackEvidence([]);
            }
          } catch (e) {
            logError('MatchResult', 'get_match_context_exception', e);
            setFallbackEvidence([]);
          }
        })();
      }

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
        <SafeAreaView style={[styles.center, { flex: 1, gap: 14 }]}>
          <ActivityIndicator size="large" color={UI_COLORS.primary} />
          <ThemedText style={[styles.loadingNote, { color: dynamicColors.textLight }]}>
            טוען את ההתאמה שלך…
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (errorMsg || !match || !peer) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/my-profile' as any)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="מעבר לפרופיל שלי">
              <IconSymbol name="person.crop.circle" size={26} color={UI_COLORS.branding} />
            </TouchableOpacity>
            <ThemedText style={[styles.headerTitle, { color: dynamicColors.text }]}>
              ההתאמה שלך
            </ThemedText>
            <View style={styles.headerSlot} />
          </View>
          <View style={[styles.center, styles.errorBody]}>
            <ThemedText style={[styles.emptyTitle, { color: dynamicColors.text }]}>
              {errorMsg ?? 'אין כרגע התאמה פעילה'}
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: dynamicColors.textLight }]}>
              נחפש לך התאמה חדשה במסך הראשי.
            </ThemedText>
            <TouchableOpacity
              style={[styles.errorPrimaryButton, { backgroundColor: UI_COLORS.primary }]}
              onPress={() => router.replace('/(tabs)' as any)}
              activeOpacity={0.85}>
              <ThemedText style={styles.errorPrimaryButtonText}>חזרה למסך הראשי</ThemedText>
            </TouchableOpacity>
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
  //   'chat_started'  — both participants have sent at least one message;
  //                     timer is irrelevant; chat is durable; no countdown.
  //   'expired' / 'unmatched' — terminal; chat is read-only on the next
  //                     screen; CTA stays present but disabled.
  const isChatStarted = match.status === 'chat_started'
    || (messageState?.is_mutual_started ?? false);
  const isClosed = match.status === 'expired' || match.status === 'unmatched';
  const isCountdownExpired = msLeft <= 0;
  const ctaDisabled = isClosed || (match.status === 'active' && isCountdownExpired);

  const iSent = messageState?.i_have_sent ?? false;
  const peerSent = messageState?.peer_has_sent ?? false;
  const isWaitingForMyReply = !isChatStarted && !isClosed && !iSent && peerSent;
  const isWaitingForPeerReply = !isChatStarted && !isClosed && iSent && !peerSent;

  const displayName = (peer.full_name || peer.username || 'ההתאמה שלך').trim();
  const age = peer.birth_year ? new Date().getFullYear() - peer.birth_year : null;
  const nameWithAge = age ? `${displayName}, ${age}` : displayName;
  // PR-MATCH-FLOW (PR #57): compatibility_score is no longer surfaced
  // to users. The column is still SELECT-ed (line above) for backwards
  // compatibility of the MatchRow type / future analytics, but the
  // chip + label render below were removed per product decision —
  // matching is internal, not a leaderboard.
  const initial = (displayName.trim()[0] || '?').toUpperCase();
  const icebreaker = match.icebreaker_hint?.trim() || null;

  // Evidence-first reason list. Each evidence item maps to one premium
  // card with a small rose accent strip on the leading (right, under RTL)
  // edge.
  //
  // PR-MATCH-CTX (PR #56): three-tier evidence resolution:
  //   1. stored — matches.metadata.compatibility_evidence (PR #48 path
  //      for new matches; preserved verbatim for stability across loads)
  //   2. derived — get_match_context RPC (migration 032) called when
  //      stored evidence is empty, for old matches that pre-date the
  //      Edge Function update
  //   3. hide — if both are empty, the section does not render. The
  //      legacy compatibility_reasons text[] (which contains generic
  //      strings like "יש חפיפה בתחומי העניין" for old matches) is
  //      intentionally NOT used as a fallback — generic copy is worse
  //      than no section.
  const storedEvidence = parseEvidenceFromMetadata(match.metadata);
  const evidence: CompatibilityEvidence[] =
    storedEvidence.length > 0
      ? storedEvidence
      : (fallbackEvidence ?? []);
  const evidenceCards: { key: string; text: string }[] = evidence.map((ev, i) => ({
    key: `ev-${i}-${ev.kind}`,
    text: renderEvidenceText(ev),
  }));

  // Compact peer info line — "פקולטה · שנה · אוניברסיטה" with safe label
  // lookups. Empty / 'לא צוין' entries dropped so the line never reads
  // half-empty.
  const infoParts: string[] = [];
  if (peer.faculty) {
    const v = labelFor('faculty', peer.faculty);
    if (v && v !== 'לא צוין') infoParts.push(v);
  }
  if (peer.year_of_study) {
    const v = labelFor('year_of_study', peer.year_of_study);
    if (v && v !== 'לא צוין') infoParts.push(v);
  }
  if (peer.university) {
    const v = labelFor('university', peer.university);
    if (v && v !== 'לא צוין') infoParts.push(v);
  }
  const infoLine = infoParts.join(' · ');
  const cityLine = peer.campus?.trim() || null;

  // Header countdown chip — only visible while the 72h window is still
  // meaningful and the match isn't terminal or already in chat_started.
  const headerCountdown = (!isChatStarted && !isClosed && !isCountdownExpired)
    ? formatRemainingChip(msLeft)
    : '';

  // Status copy — calm, single line. No big timer card.
  const statusText: string = (() => {
    if (isClosed) return 'ההתאמה הסתיימה';
    if (isChatStarted) return 'השיחה התחילה — אפשר להמשיך לכתוב מתי שמתאים';
    if (isCountdownExpired) return 'ההתאמה הסתיימה';
    if (isWaitingForMyReply) return `${displayName} כתב/ה לך — ענה/י כדי שהשיחה תתקבע`;
    if (isWaitingForPeerReply) return 'ההודעה נשלחה — מחכים לתגובה';
    return 'אם אף אחד לא שולח הודעה בזמן — ההתאמה תיסגר';
  })();

  // CTA copy — "להמשיך לשיחה" once any messages exist or chat started,
  // otherwise the initiating "להתחיל שיחה". Disabled visual is handled
  // separately; copy doesn't change for disabled state (iOS convention).
  const ctaLabel = (isChatStarted || iSent || peerSent)
    ? 'להמשיך לשיחה'
    : 'להתחיל שיחה';

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/my-profile' as any)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="מעבר לפרופיל שלי">
            <IconSymbol name="person.crop.circle" size={26} color={UI_COLORS.branding} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerTitle, { color: dynamicColors.text }]}>
            ההתאמה שלך
          </ThemedText>
          {headerCountdown ? (
            <View
              style={[
                styles.countdownChip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
              ]}>
              <ThemedText style={[styles.countdownChipText, { color: dynamicColors.textLight }]}>
                {headerCountdown}
              </ThemedText>
            </View>
          ) : (
            <View style={styles.headerSlot} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Hero: eyebrow → name → avatar → info line → optional city → score chip.
              Single source of name+age — no second profile card below. */}
          <View style={styles.hero}>
            <ThemedText style={[styles.eyebrow, { color: UI_COLORS.branding }]}>
              ההתאמה שלך מוכנה
            </ThemedText>
            <ThemedText style={[styles.heroName, { color: dynamicColors.text }]}>
              {nameWithAge}
            </ThemedText>

            <View
              style={[
                styles.avatarCircle,
                { backgroundColor: dynamicColors.surfaceRose, borderColor: UI_COLORS.branding },
              ]}>
              {peerAvatarUrl ? (
                <Image source={{ uri: peerAvatarUrl }} style={styles.avatarImage} />
              ) : (
                <ThemedText style={[styles.avatarInitial, { color: UI_COLORS.branding }]}>
                  {initial}
                </ThemedText>
              )}
            </View>

            {infoLine.length > 0 && (
              <ThemedText style={[styles.heroInfoLine, { color: dynamicColors.textLight }]}>
                {infoLine}
              </ThemedText>
            )}
            {cityLine && (
              <ThemedText style={[styles.heroCityLine, { color: dynamicColors.textLight }]}>
                {cityLine}
              </ThemedText>
            )}

            {/* PR-MATCH-FLOW (PR #57): score chip removed (was
                "{score}% התאמה"). Score stays internal. */}
          </View>

          {/* Reasons — evidence cards (PR #48) or compatibility_reasons fallback */}
          {evidenceCards.length > 0 && (
            <View style={styles.section}>
              <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>
                למה זו התאמה טובה
              </ThemedText>
              <View style={styles.reasonsList}>
                {evidenceCards.map((card) => (
                  <View
                    key={card.key}
                    style={[
                      styles.reasonCard,
                      { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                    ]}>
                    {/* JSX: [strip, text]. Under RTL row, the strip sits on
                        the physical right (leading edge). */}
                    <View style={[styles.reasonStrip, { backgroundColor: UI_COLORS.branding }]} />
                    <View style={styles.reasonTextWrap}>
                      <ThemedText style={[styles.reasonText, { color: dynamicColors.text }]}>
                        {card.text}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Icebreaker — subtle rose-tinted card, calmer copy */}
          {icebreaker && (
            <View
              style={[
                styles.icebreakerCard,
                {
                  backgroundColor: dynamicColors.surfaceRose,
                  borderColor: UI_COLORS.branding + '20',
                },
              ]}>
              <ThemedText style={[styles.icebreakerTitle, { color: UI_COLORS.branding }]}>
                פתיח שיחה מוצע
              </ThemedText>
              <ThemedText style={[styles.icebreakerText, { color: dynamicColors.text }]}>
                {icebreaker}
              </ThemedText>
            </View>
          )}

          {/* Status line — single muted sentence in place of the old timer card */}
          <ThemedText style={[styles.statusText, { color: dynamicColors.textLight }]}>
            {statusText}
          </ThemedText>

          {/* Secondary links — quieter than the primary CTA */}
          <View style={styles.secondaryLinks}>
            <TouchableOpacity
              style={styles.secondaryLinkRow}
              onPress={() => {
                router.push({
                  pathname: '/match-profile' as any,
                  params: { match_id: match.id },
                });
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <ThemedText style={[styles.secondaryLinkText, { color: UI_COLORS.branding }]}>
                צפייה בפרופיל המלא
              </ThemedText>
              <IconSymbol name="chevron.left" size={16} color={UI_COLORS.branding} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryLinkRow}
              onPress={openFeedback}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <ThemedText style={[styles.secondaryLinkText, { color: dynamicColors.textLight }]}>
                משוב על ההתאמה
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Sticky primary CTA — slimmer footer, minimal padding, safe-area
            aware. Stays present even for terminal matches so the layout
            doesn't shift; rendered as visually disabled when ctaDisabled. */}
        <View
          style={[
            styles.stickyFooter,
            {
              backgroundColor: dynamicColors.bg,
              borderTopColor: dynamicColors.border,
              paddingBottom: Math.max(insets.bottom, 4),
            },
          ]}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: ctaDisabled ? dynamicColors.textLight : UI_COLORS.primary },
            ]}
            onPress={openChat}
            disabled={ctaDisabled}
            activeOpacity={0.85}>
            <ThemedText style={styles.primaryButtonText}>{ctaLabel}</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Header — borderless iOS-style; trailing slot holds the countdown chip
  // when active, otherwise collapses to a width-matched placeholder so the
  // title stays optically centered.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 48,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headerSlot: { minWidth: 70, height: 24 },
  countdownChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownChipText: {
    fontSize: 12,
    fontWeight: '600',
    writingDirection: 'rtl',
  },

  // Scroll body — 20pt gap between top-level sections.
  // PR-FINAL-UI: paddingBottom 96 → 84. The previous value left a
  // visibly large gap above the sticky footer on short content; 84
  // is still enough buffer to scroll past the footer (sticky footer
  // is ~52px button + ~6px top + safe-area, so 84 covers it on
  // non-home-indicator devices and home-indicator devices get the
  // natural safe-area lift from the footer itself).
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 84,
    gap: 20,
  },

  // Hero
  hero: { alignItems: 'center', gap: 8 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  heroName: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 32,
  },
  avatarCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginVertical: 4,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 48, fontWeight: '800' },
  heroInfoLine: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  heroCityLine: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  // PR-MATCH-FLOW (PR #57): removed scoreChip + scoreChipText styles
  // (sole users were the deleted "{score}% התאמה" hero chip).

  // Reasons
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    writingDirection: 'rtl',
    alignSelf: 'flex-start',
    marginBottom: 2,
  },
  reasonsList: { gap: 10 },
  // JSX: [accentStrip, textWrap]. Under RTL row the strip sits on the
  // physical right (leading edge). overflow: 'hidden' clips the strip
  // corners to the rounded card outline.
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 52,
  },
  reasonStrip: { width: 3 },
  reasonTextWrap: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  reasonText: {
    fontSize: 15,
    lineHeight: 22,
    writingDirection: 'rtl',
    alignSelf: 'flex-start',
  },

  // Icebreaker
  icebreakerCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  icebreakerTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    writingDirection: 'rtl',
    alignSelf: 'flex-start',
  },
  icebreakerText: {
    fontSize: 15,
    lineHeight: 22,
    writingDirection: 'rtl',
    alignSelf: 'flex-start',
  },

  // Lifecycle status — plain muted line, no card
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    writingDirection: 'rtl',
    alignSelf: 'flex-start',
  },

  // Secondary links — quieter than the primary CTA. Chevron uses
  // chevron.left so under RTL it points toward the destination in
  // reading-direction terms.
  secondaryLinks: { gap: 8, marginTop: 4 },
  secondaryLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  secondaryLinkText: { fontSize: 14, fontWeight: '600', writingDirection: 'rtl' },

  // Sticky footer — minimal padding so it stops feeling like a big block.
  // PR-UI-POLISH (preserved): tightened paddingTop 10 → 6.
  // PR-FINAL-UI: paddingTop 6 → 4 + paddingBottom floor 8 → 4 (in JSX
  // above). Further trim after QA flagged excess space below "להתחיל
  // שיחה". Safe-area correctness is unchanged because the JSX uses
  // Math.max(insets.bottom, 4) — devices with home indicators (insets
  // ~34px) still get the full safe-area lift; only simulator / older
  // phones see the 4px floor instead of 8px. 52pt button height stays
  // above iOS 44pt minimum tap target.
  stickyFooter: {
    paddingHorizontal: 20,
    paddingTop: 4,
    borderTopWidth: 1,
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Error / loading states
  errorBody: { flex: 1, padding: 24, gap: 12 },
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
  loadingNote: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  errorPrimaryButton: {
    height: 52,
    paddingHorizontal: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  errorPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
