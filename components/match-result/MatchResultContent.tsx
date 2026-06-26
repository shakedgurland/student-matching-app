import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
// PR #71-follow-up polish — swap RN's SafeAreaView for the context
// version so we can opt out of the bottom inset via `edges` when this
// component is hosted inside a tab (where the tab bar already covers
// the home-indicator safe area). The drop-in API is identical for
// every other prop.
import {
  SafeAreaView,
  useSafeAreaInsets,
  type Edge,
} from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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

// 3-tab restructure — content of the legacy app/match-result.tsx lifted
// verbatim into a reusable, prop-driven component so the Match tab can
// render it inline (tab bar stays visible) AND the legacy /match-result
// stack route can keep working for deep-link navigation. NO match logic,
// scoring logic, or Supabase RPC changes — only the host wrapper differs.
//
// Props:
//   matchId    — the match to render. When undefined (legacy /match-result
//                hit without a route param), falls back to the caller's
//                current open match (active OR chat_started), preserving
//                the prior behavior. Re-renders when matchId changes.
//   onOpenChat — invoked when the user taps the primary "להתחיל שיחה /
//                חזרה לצ׳אט" CTA. Receives the resolved matchId. When
//                omitted, defaults to router.push('/chat', { match_id })
//                — the legacy stack-push behavior. The Match tab passes
//                onOpenChat = () => router.replace('/(tabs)/chat') so the
//                CTA switches tabs instead of pushing a stack screen, keeping
//                the persistent tab bar visible.

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

function formatRemainingChip(msRemaining: number): string {
  if (msRemaining <= 0) return '';
  const hours = Math.floor(msRemaining / (1000 * 60 * 60));
  if (hours >= 1) return `נותרו ${hours}ש׳`;
  return 'פחות משעה';
}

export interface MatchResultContentProps {
  matchId?: string;
  onOpenChat?: (matchId: string) => void;
  /**
   * When true, this component is rendered inside a Tab screen (the
   * Match tab). The bottom tab bar already covers the home-indicator
   * safe area, so:
   *   • SafeAreaView opts out of the bottom edge (no double padding).
   *   • Sticky footer uses a small fixed bottom padding instead of
   *     adding insets.bottom (which would compound the wasted gap).
   * Defaults to false so the legacy /match-result stack-route wrapper
   * keeps full safe-area handling unchanged.
   */
  hostedInTab?: boolean;
}

export function MatchResultContent({
  matchId,
  onOpenChat,
  hostedInTab = false,
}: MatchResultContentProps) {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  // SafeAreaView edges + sticky-footer bottom padding are both
  // gated on hostedInTab. Tab-hosted: drop bottom inset everywhere
  // (the tab bar provides it). Standalone: full safe-area behavior.
  const safeEdges: readonly Edge[] = hostedInTab
    ? ['top', 'left', 'right']
    : ['top', 'left', 'right', 'bottom'];
  const stickyFooterBottomPad = hostedInTab ? 8 : Math.max(insets.bottom, 4);

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
  const [messageState, setMessageState] = useState<{
    i_have_sent: boolean;
    peer_has_sent: boolean;
    distinct_sender_count: number;
    is_mutual_started: boolean;
  } | null>(null);

  const [fallbackEvidence, setFallbackEvidence] = useState<
    CompatibilityEvidence[] | null
  >(null);

  // 3-tab restructure — re-run load when matchId changes. The Match tab
  // may switch its rendered match (new match created) without unmounting
  // the component; we want a fresh load in that case. When the prop is
  // unchanged, deps unchanged → loadMatch runs once per matchId value.
  useEffect(() => {
    logScreenView('MatchResult');
    loadMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadMatch() {
    try {
      setLoading(true);
      setErrorMsg(null);
      setMatch(null);
      setPeer(null);
      setPeerAvatarUrl(null);
      setMessageState(null);
      setFallbackEvidence(null);

      const { data: userRes } = await supabase.auth.getUser();
      const me = userRes.user;
      if (!me) {
        setErrorMsg('יש להתחבר מחדש');
        return;
      }

      const matchColumns =
        'id, user_a_id, user_b_id, compatibility_score, compatibility_reasons, icebreaker_hint, status, expires_at, created_at, metadata';

      let matchRow: MatchRow | null = null;
      if (matchId) {
        const { data, error } = await supabase
          .from('matches')
          .select(matchColumns)
          .eq('id', matchId)
          .maybeSingle();
        if (error) {
          logError('MatchResult', 'load_match_by_id_failed', error);
        } else if (data) {
          matchRow = data as MatchRow;
        }
      }
      if (!matchRow) {
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
    if (onOpenChat) {
      onOpenChat(match.id);
      return;
    }
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
        <SafeAreaView edges={safeEdges} style={[styles.center, { flex: 1, gap: 14 }]}>
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
        <SafeAreaView edges={safeEdges} style={{ flex: 1 }}>
          <View style={styles.header}>
            <View style={styles.headerSlot} />
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
  const initial = (displayName.trim()[0] || '?').toUpperCase();
  const icebreaker = match.icebreaker_hint?.trim() || null;

  const storedEvidence = parseEvidenceFromMetadata(match.metadata);
  const evidence: CompatibilityEvidence[] =
    storedEvidence.length > 0
      ? storedEvidence
      : (fallbackEvidence ?? []);
  const evidenceCards: { key: string; text: string }[] = evidence.map((ev, i) => ({
    key: `ev-${i}-${ev.kind}`,
    text: renderEvidenceText(ev),
  }));

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

  const headerCountdown = (!isChatStarted && !isClosed && !isCountdownExpired)
    ? formatRemainingChip(msLeft)
    : '';

  const statusText: string = (() => {
    if (isClosed) return 'ההתאמה הסתיימה';
    if (isChatStarted) return 'השיחה התחילה — אפשר להמשיך לכתוב מתי שמתאים';
    if (isCountdownExpired) return 'ההתאמה הסתיימה';
    if (isWaitingForMyReply) return `${displayName} כתב/ה לך — ענה/י כדי שהשיחה תתקבע`;
    if (isWaitingForPeerReply) return 'ההודעה נשלחה — מחכים לתגובה';
    return 'אם אף אחד לא שולח הודעה בזמן — ההתאמה תיסגר';
  })();

  const ctaLabel = (isChatStarted || iSent || peerSent)
    ? 'חזרה לצ׳אט'
    : 'להתחיל שיחה';

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <SafeAreaView edges={safeEdges} style={{ flex: 1 }}>
        <View style={styles.header}>
          {/* 3-tab restructure — the top-right profile shortcut was
              removed; "הפרופיל שלי" is now a first-class tab in the
              bottom bar (visible on both the inline tab render AND the
              legacy /match-result stack screen). The leading slot is
              kept as a width-matched placeholder so the title stays
              optically centered between it and the trailing countdown
              chip slot. */}
          <View style={styles.headerSlot} />
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
          </View>

          {evidenceCards.length > 0 && (
            <View style={styles.section}>
              <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>
                למה זו התאמה טובה
              </ThemedText>
              {/* PR #70 follow-up polish — replaced the legacy outlined
                  card + red vertical stripe with a soft warm pill row
                  per reason. Background reuses the existing surfaceRose
                  token (already in this screen's palette for the
                  icebreaker card), no border, no shadow. A small
                  sparkles glyph on the leading edge keeps brand presence
                  as an accent, not a block. Reason calculation,
                  evidence ordering, and copy are untouched. */}
              <View style={styles.reasonsList}>
                {evidenceCards.map((card) => (
                  <View
                    key={card.key}
                    style={[
                      styles.reasonRow,
                      { backgroundColor: dynamicColors.surfaceRose },
                    ]}>
                    <View style={styles.reasonIcon}>
                      <IconSymbol
                        name="sparkles"
                        size={16}
                        color={UI_COLORS.branding}
                      />
                    </View>
                    <ThemedText style={[styles.reasonText, { color: dynamicColors.text }]}>
                      {card.text}
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

          <ThemedText style={[styles.statusText, { color: dynamicColors.textLight }]}>
            {statusText}
          </ThemedText>

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

        <View
          style={[
            styles.stickyFooter,
            {
              backgroundColor: dynamicColors.bg,
              borderTopColor: dynamicColors.border,
              paddingBottom: stickyFooterBottomPad,
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

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 84,
    gap: 20,
  },

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

  section: { gap: 10 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    writingDirection: 'rtl',
    alignSelf: 'flex-start',
    marginBottom: 2,
  },
  // PR #70 follow-up polish — softer, premium native-iOS reason rows.
  // Tighter vertical gap so the list feels integrated into the screen
  // instead of stacked like slide content.
  reasonsList: { gap: 8 },
  // Soft warm pill row. No border, no shadow — the surfaceRose tint
  // alone carries the card feel. JSX order [icon, text] under
  // flexDirection 'row' renders the icon on the physical right
  // (RTL leading edge) for Hebrew readers, mirroring the prior
  // stripe-on-the-right anchor without the heavy block.
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  // Small fixed-width slot for the sparkles glyph so multi-line reason
  // text wraps cleanly under itself instead of around the icon.
  reasonIcon: {
    width: 20,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  reasonText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

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

  statusText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    writingDirection: 'rtl',
    alignSelf: 'flex-start',
  },

  secondaryLinks: { gap: 8, marginTop: 4 },
  secondaryLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  secondaryLinkText: { fontSize: 14, fontWeight: '600', writingDirection: 'rtl' },

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
