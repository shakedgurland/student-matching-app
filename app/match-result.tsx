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

// Discriminated-union mirror of the CompatibilityEvidence type defined in
// supabase/functions/match-create/scoring.ts (PR #48). Local copy because
// Edge Function code is not importable from the app bundle. If the server
// adds a new kind in the future, parseEvidence below silently drops it
// (forward-compatible).
type CompatibilityEvidence =
  | { kind: 'shared_hobbies'; values: string[]; labels: string[] }
  | { kind: 'same_city'; value: string; label: string }
  | { kind: 'same_region'; value: string; label: string }
  | { kind: 'same_university'; value: string; label: string }
  | { kind: 'same_faculty'; value: string; label: string }
  | { kind: 'same_year_of_study'; value: string; label: string }
  | { kind: 'shared_intent'; value: string; label: string }
  | { kind: 'shared_pace'; value: string; label: string }
  | { kind: 'shared_first_date'; value: string; label: string }
  | { kind: 'shared_conflict_style'; value: string; label: string }
  | { kind: 'shared_religion_type'; value: string; label: string }
  | { kind: 'shared_top_values'; values: string[]; labels: string[] }
  | { kind: 'ai_vibe' };

// Defensive parse — accepts only items matching the expected per-kind
// shape. Malformed or unknown entries are dropped silently. Never throws.
function parseEvidence(metadata: MatchRow['metadata']): CompatibilityEvidence[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = (metadata as Record<string, unknown>).compatibility_evidence;
  if (!Array.isArray(raw)) return [];
  const out: CompatibilityEvidence[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const kind = obj.kind;
    if (typeof kind !== 'string') continue;

    if (kind === 'shared_hobbies' || kind === 'shared_top_values') {
      const values = Array.isArray(obj.values)
        ? obj.values.filter((v): v is string => typeof v === 'string')
        : [];
      const labels = Array.isArray(obj.labels)
        ? obj.labels.filter((v): v is string => typeof v === 'string')
        : [];
      out.push({ kind, values, labels } as CompatibilityEvidence);
      continue;
    }
    if (kind === 'ai_vibe') {
      out.push({ kind: 'ai_vibe' });
      continue;
    }
    if (
      kind === 'same_city' || kind === 'same_region' ||
      kind === 'same_university' || kind === 'same_faculty' ||
      kind === 'same_year_of_study' || kind === 'shared_intent' ||
      kind === 'shared_pace' || kind === 'shared_first_date' ||
      kind === 'shared_conflict_style' || kind === 'shared_religion_type'
    ) {
      const value = obj.value;
      const label = obj.label;
      if (typeof value === 'string' && typeof label === 'string') {
        out.push({ kind, value, label } as CompatibilityEvidence);
      }
      continue;
    }
    // Unknown kind from a future server version — skip silently.
  }
  return out;
}

// Mirror of supabase/functions/match-create/scoring.ts renderEvidenceText.
// Identical templates so the rendered Hebrew matches exactly what the
// server wrote into compatibility_reasons. Sensitive kinds intentionally
// render generic copy — the underlying value/label is stored for analytics
// + future UI but never surfaced on this screen.
function joinPrepBet(prefix: string, label: string): string {
  if (label.startsWith('ה')) return `${prefix}${label.slice(1)}`;
  return `${prefix}${label}`;
}
function joinHebrewList(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} ו${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} ו${labels[labels.length - 1]}`;
}
function renderEvidenceText(ev: CompatibilityEvidence): string {
  switch (ev.kind) {
    case 'shared_hobbies':
      return `שניכם סימנתם ${joinHebrewList(ev.labels)}`;
    case 'same_city':
      return joinPrepBet('שניכם ב', ev.label);
    case 'same_region':
      return `שניכם באזור ${ev.label}`;
    case 'same_university':
      return joinPrepBet('שניכם לומדים ב', ev.label);
    case 'same_faculty':
      return `שניכם בפקולטה ל${ev.label}`;
    case 'same_year_of_study':
      return joinPrepBet('שניכם ב', ev.label);
    case 'shared_intent':
      return `שניכם מחפשים ${ev.label}`;
    case 'shared_pace':
      return `שניכם מעדיפים ${ev.label}`;
    case 'shared_first_date':
      return `שניכם מעדיפים ${ev.label} לדייט ראשון`;
    case 'shared_conflict_style':
      return 'שניכם בסגנון פתרון קונפליקטים דומה';
    case 'shared_religion_type':
      return 'יש לכם רקע דתי משותף';
    case 'shared_top_values':
      return `יש לכם ${ev.values.length} ערכים זוגיים משותפים`;
    case 'ai_vibe':
      return 'וייב דומה בהומור ובערכים';
  }
}

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
  const score = match.compatibility_score ?? null;
  const initial = (displayName.trim()[0] || '?').toUpperCase();
  const icebreaker = match.icebreaker_hint?.trim() || null;

  // Evidence-first reason list. Each evidence item maps to one premium
  // card with a small rose accent strip on the leading (right, under RTL)
  // edge. Falls back to compatibility_reasons rendered as plain text-only
  // cards for old matches (created before PR #48 deploy) or matches whose
  // metadata.compatibility_evidence write failed (non-fatal — see
  // supabase/functions/match-create/index.ts).
  const evidence = parseEvidence(match.metadata);
  const reasonsArr = Array.isArray(match.compatibility_reasons)
    ? match.compatibility_reasons.filter((r) => typeof r === 'string' && r.trim().length > 0)
    : [];
  const evidenceCards: { key: string; text: string }[] = evidence.length > 0
    ? evidence.map((ev, i) => ({ key: `ev-${i}-${ev.kind}`, text: renderEvidenceText(ev) }))
    : reasonsArr.map((r, i) => ({ key: `reason-${i}`, text: r }));

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

            {score !== null && (
              <View style={[styles.scoreChip, { backgroundColor: dynamicColors.surfaceRose }]}>
                <ThemedText style={[styles.scoreChipText, { color: UI_COLORS.branding }]}>
                  {score}% התאמה
                </ThemedText>
              </View>
            )}
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
              paddingBottom: Math.max(insets.bottom, 8),
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 96,
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
  scoreChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 6,
  },
  scoreChipText: { fontSize: 13, fontWeight: '700', writingDirection: 'rtl' },

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
  // PR-UI-POLISH: tightened paddingTop 10 → 6 + paddingBottom floor 12 → 8
  // (in the JSX above) so the footer is closer to a calm iOS CTA strip
  // and stops eating vertical space. The 52pt button height stays above
  // iOS's 44pt minimum tap target.
  stickyFooter: {
    paddingHorizontal: 20,
    paddingTop: 6,
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
