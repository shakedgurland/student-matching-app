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
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { logScreenView, logError } from '@/lib/analytics';

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
        const { data, error } = await supabase
          .from('matches')
          .select(matchColumns)
          .or(`user_a_id.eq.${me.id},user_b_id.eq.${me.id}`)
          .eq('status', 'active')
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
          .createSignedUrl(peerData.avatar_storage_path, 3600);
        if (!signErr && signed?.signedUrl) {
          setPeerAvatarUrl(signed.signedUrl);
        }
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
  const expired = msLeft <= 0;

  const displayName = (peer.full_name || peer.username || 'ההתאמה שלך').trim();
  const age = peer.birth_year ? new Date().getFullYear() - peer.birth_year : null;
  const nameWithAge = age ? `${displayName}, ${age}` : displayName;
  const score = match.compatibility_score ?? null;
  const reasons = Array.isArray(match.compatibility_reasons)
    ? match.compatibility_reasons.filter((r) => typeof r === 'string' && r.trim().length > 0)
    : [];
  const icebreaker = match.icebreaker_hint?.trim() || null;
  const initial = (displayName.trim()[0] || '?').toUpperCase();

  const infoRows: { label: string; value: string }[] = [];
  if (peer.faculty) infoRows.push({ label: 'פקולטה', value: peer.faculty });
  if (peer.year_of_study) infoRows.push({ label: 'שנה', value: peer.year_of_study });
  if (peer.university) infoRows.push({ label: 'מוסד', value: peer.university });
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
            <ThemedText style={[styles.timerLabel, { color: dynamicColors.textLight }]}>
              {expired ? 'ההתאמה הסתיימה' : 'נותר זמן להתחיל שיחה'}
            </ThemedText>
            <ThemedText
              style={[
                styles.timerValue,
                { color: expired ? dynamicColors.textLight : UI_COLORS.primary },
              ]}>
              {formatCountdown(msLeft)}
            </ThemedText>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: expired ? dynamicColors.textLight : UI_COLORS.primary },
              ]}
              onPress={openChat}
              disabled={expired}
              activeOpacity={0.8}>
              <ThemedText style={styles.primaryButtonText}>פתח/י צ׳אט</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={openFeedback}>
              <ThemedText style={[styles.secondaryButtonText, { color: UI_COLORS.branding }]}>
                משוב על ההתאמה
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
  scrollContent: { padding: 24, paddingBottom: 60, gap: 24 },
  titleBlock: { alignItems: 'center', gap: 8, marginTop: 12 },
  preTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 32,
  },
  avatarRow: { alignItems: 'center', marginVertical: 4 },
  avatarCircle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 3,
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
  infoRow: { flexDirection: 'row', gap: 8 },
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
  bulletItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
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
    padding: 18,
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
  },
  actions: { gap: 12, marginTop: 4 },
  primaryButton: {
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
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
