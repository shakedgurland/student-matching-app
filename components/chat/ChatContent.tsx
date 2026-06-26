import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
// PR #71-follow-up polish — swap RN's SafeAreaView for the context
// version so we can opt out of the bottom inset via `edges` when this
// component is hosted inside the Chat tab (where the bottom tab bar
// already covers the home-indicator safe area). Drop-in for every
// other prop.
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { logScreenView, logError } from '@/lib/analytics';
import { markConversationRead } from '@/lib/unread';
import { setActiveChatMatchId } from '@/lib/notification-context';

// 3-tab restructure — content of the legacy app/chat.tsx lifted verbatim
// into a reusable, prop-driven component so the Chat tab can render it
// inline (tab bar stays visible) AND the legacy /chat stack route can
// keep working for push-notification deep links and existing in-app
// navigation. NO chat business logic, send/receive flow, RPC calls,
// realtime semantics, or Supabase schema touched. Only changes:
//   • matchId param replaces useLocalSearchParams lookup
//   • realtime subscription + active-chat ref are focus-scoped via
//     useFocusEffect so a tab kept mounted in the background does not
//     leak a duplicate realtime channel or claim "this chat is the
//     active one" for notification suppression while the user is on
//     another tab. Both effects re-attach when the tab is re-focused.

const UI_COLORS = {
  bg: '#F7F8FA',
  primary: '#172033',
  branding: '#FF3D57',
  accent: '#FF8A00',
  surface: '#FFF0EA',
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  card: '#FFFFFF',
};

const SIGNED_URL_TTL_SECONDS = 300;

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

interface MatchLite {
  id: string;
  user_a_id: string;
  user_b_id: string;
  compatibility_score: number | null;
  status: string;
  expires_at: string | null;
}

interface PeerLite {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_storage_path: string | null;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface ChatContentProps {
  matchId?: string;
  /**
   * When true, this component is rendered inside the Chat tab. The
   * bottom tab bar already covers the home-indicator safe area, so
   * SafeAreaView opts out of the bottom edge — otherwise the chat
   * input bar sits ~34pt above the tab bar with dead space below it.
   * Defaults to false so the legacy /chat stack-route wrapper (used
   * for push-notification deep links) keeps full safe-area handling.
   */
  hostedInTab?: boolean;
}

export function ChatContent({ matchId, hostedInTab = false }: ChatContentProps) {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  // SafeAreaView edges gated on hostedInTab. Tab-hosted: drop bottom
  // (tab bar covers home indicator). Standalone: full safe-area.
  const safeEdges: readonly Edge[] = hostedInTab
    ? ['top', 'left', 'right']
    : ['top', 'left', 'right', 'bottom'];

  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    chrome: isDark ? '#1D2939' : '#FFFFFF',
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255,255,255,0.1)' : UI_COLORS.border,
    surface: isDark ? 'rgba(255,138,0,0.18)' : UI_COLORS.surface,
    inputBg: isDark ? '#101828' : '#F7F8FA',
  };

  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchLite | null>(null);
  const [peer, setPeer] = useState<PeerLite | null>(null);
  const [peerAvatarUrl, setPeerAvatarUrl] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const navigatingToProfileRef = useRef(false);

  // 3-tab restructure — re-run init when matchId changes. The Chat tab
  // may switch its rendered match (new match created) without unmounting;
  // also covers the deep-link case where matchId is a route param value.
  useEffect(() => {
    logScreenView('Chat');
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // 3-tab restructure — realtime subscription is focus-scoped via
  // useFocusEffect (was a plain useEffect tied to mount). When the Chat
  // tab is mounted but not focused (user is on Match or Profile tab),
  // the subscription disconnects to avoid a duplicate realtime channel
  // with the still-mounted ChatContent instance the legacy /chat stack
  // route would also create. Re-attaches on focus.
  useFocusEffect(
    React.useCallback(() => {
      if (!conversationId) return;
      const channel = supabase
        .channel(`chat:${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const m = payload.new as MessageRow;
            setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
            if (meId && m.sender_id !== meId) {
              markConversationRead(conversationId);
            }
          },
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }, [conversationId, meId]),
  );

  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length]);

  // 3-tab restructure — active-chat signal is focus-scoped via
  // useFocusEffect (was a plain useEffect tied to match?.id). Without
  // this, switching from Chat → Match would still leave
  // notification-context pointing at this chat as "active" and the
  // foreground push handler would suppress notifications for it. On
  // blur we clear the ref; on re-focus we set it back.
  useFocusEffect(
    React.useCallback(() => {
      if (match?.id) {
        setActiveChatMatchId(match.id);
      }
      return () => {
        setActiveChatMatchId(null);
      };
    }, [match?.id]),
  );

  async function init() {
    try {
      setLoading(true);
      setErrorMsg(null);
      setMatch(null);
      setPeer(null);
      setPeerAvatarUrl(null);
      setConversationId(null);
      setMessages([]);

      const { data: userRes } = await supabase.auth.getUser();
      const myId = userRes.user?.id ?? null;
      if (!myId) {
        setErrorMsg('יש להתחבר מחדש');
        return;
      }
      setMeId(myId);

      const matchColumns = 'id, user_a_id, user_b_id, compatibility_score, status, expires_at';

      let matchRow: MatchLite | null = null;
      if (matchId) {
        const { data } = await supabase
          .from('matches')
          .select(matchColumns)
          .eq('id', matchId)
          .maybeSingle();
        matchRow = (data as MatchLite | null) ?? null;
      }
      if (!matchRow) {
        const { data } = await supabase
          .from('matches')
          .select(matchColumns)
          .or(`user_a_id.eq.${myId},user_b_id.eq.${myId}`)
          .in('status', ['active', 'chat_started'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        matchRow = (data as MatchLite | null) ?? null;
      }
      if (!matchRow) {
        setErrorMsg('אין כרגע התאמה פעילה');
        return;
      }
      setMatch(matchRow);

      const peerId = matchRow.user_a_id === myId ? matchRow.user_b_id : matchRow.user_a_id;
      const { data: peerData, error: peerErr } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_storage_path')
        .eq('id', peerId)
        .maybeSingle();
      if (peerErr || !peerData) {
        const matchIsTerminal =
          matchRow.status === 'expired' || matchRow.status === 'unmatched';
        if (matchIsTerminal) {
          logError('Chat', 'load_peer_terminal_match', peerErr ?? new Error('peer hidden by RLS'));
          setPeer(null);
        } else {
          logError('Chat', 'load_peer_failed', peerErr ?? new Error('peer not found'));
          setErrorMsg('לא ניתן לטעון את פרטי ההתאמה');
          return;
        }
      } else {
        setPeer(peerData as PeerLite);
        if (peerData.avatar_storage_path) {
          const { data: signed } = await supabase.storage
            .from('profile-photos')
            .createSignedUrl(peerData.avatar_storage_path, SIGNED_URL_TTL_SECONDS);
          if (signed?.signedUrl) setPeerAvatarUrl(signed.signedUrl);
        }
      }

      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('match_id', matchRow.id)
        .maybeSingle();

      let convId = existing?.id ?? null;
      if (!convId) {
        const { data: created, error: createErr } = await supabase
          .from('conversations')
          .insert({
            match_id: matchRow.id,
            user_a_id: matchRow.user_a_id,
            user_b_id: matchRow.user_b_id,
          })
          .select('id')
          .single();
        if (createErr || !created) {
          const { data: retry } = await supabase
            .from('conversations')
            .select('id')
            .eq('match_id', matchRow.id)
            .maybeSingle();
          convId = retry?.id ?? null;
          if (!convId) {
            logError('Chat', 'create_conversation_failed', createErr);
            setErrorMsg('לא ניתן לפתוח את הצ׳אט');
            return;
          }
        } else {
          convId = created.id;
        }
      }
      setConversationId(convId);

      const { data: msgs, error: msgsErr } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, read_at, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
      if (msgsErr) {
        logError('Chat', 'load_messages_failed', msgsErr);
      } else if (msgs) {
        setMessages(msgs as MessageRow[]);
      }

      markConversationRead(convId);
    } catch (e) {
      logError('Chat', 'init_exception', e);
      setErrorMsg('אירעה שגיאה');
    } finally {
      setLoading(false);
    }
  }

  async function refreshMatchStatus(): Promise<MatchLite | null> {
    if (!match?.id) return null;
    try {
      const { data } = await supabase
        .from('matches')
        .select('id, user_a_id, user_b_id, compatibility_score, status, expires_at')
        .eq('id', match.id)
        .maybeSingle();
      if (data) {
        const fresh = data as MatchLite;
        setMatch(fresh);
        return fresh;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending || !conversationId) return;
    if (isLocked) return;
    setSending(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const freshUser = authData?.user ?? null;
      if (authError || !freshUser?.id) {
        console.log('[chat-send] auth missing', {
          message: authError?.message ?? null,
          match_id: match?.id ?? null,
          conversation_id: conversationId,
        });
        logError('Chat', 'send_auth_missing', authError ?? new Error('no fresh user'));
        Alert.alert(
          'התחברות נדרשת',
          'נראה שהחיבור שלך הסתיים. התחברי מחדש ונסי שוב.',
        );
        return;
      }
      if (meId !== freshUser.id) {
        console.log('[chat-send] auth user mismatch', {
          init_me_id: meId,
          fresh_user_id: freshUser.id,
          match_id: match?.id ?? null,
          conversation_id: conversationId,
        });
        setMeId(freshUser.id);
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc('send_chat_message', {
        p_conversation_id: conversationId,
        p_content: text,
      });
      const insertedRow = (rpcData ?? null) as MessageRow | null;
      if (rpcError || !insertedRow) {
        const rpcErrCode = (rpcError as { code?: unknown } | null)?.code;
        const rpcErrMsg = (rpcError as { message?: unknown } | null)?.message;
        const safeCode = typeof rpcErrCode === 'string' ? rpcErrCode : null;
        const safeMsg = typeof rpcErrMsg === 'string' ? rpcErrMsg : null;
        console.log('[chat-send] rpc failed', {
          code: safeCode,
          message: safeMsg,
          details: typeof (rpcError as any)?.details === 'string' ? (rpcError as any).details : null,
          hint: typeof (rpcError as any)?.hint === 'string' ? (rpcError as any).hint : null,
          match_id: match?.id ?? null,
          conversation_id: conversationId,
          match_status: match?.status ?? null,
        });
        logError('Chat', 'send_message_rpc_failed', rpcError ?? new Error('rpc returned no row'));

        if (safeCode === '28000' || safeMsg === 'unauthenticated') {
          Alert.alert(
            'התחברות נדרשת',
            'נראה שהחיבור שלך הסתיים. התחברי מחדש ונסי שוב.',
          );
          return;
        }
        if (safeMsg === 'match_terminal' || safeMsg === 'match_expired') {
          await refreshMatchStatus();
          Alert.alert(
            'ההתאמה הסתיימה',
            'ההתאמה הסתיימה — אי אפשר לשלוח הודעות חדשות.',
          );
          return;
        }
        const refreshed = await refreshMatchStatus();
        const terminal = refreshed?.status === 'expired' || refreshed?.status === 'unmatched';
        if (terminal) {
          Alert.alert(
            'ההתאמה הסתיימה',
            'ההתאמה הסתיימה — אי אפשר לשלוח הודעות חדשות.',
          );
          return;
        }
        const userCode = safeCode ?? 'UNKNOWN';
        Alert.alert(
          'שגיאה',
          `לא הצלחנו לשלוח את ההודעה. קוד תקלה: CHAT_SEND_RPC_${userCode}`,
        );
        return;
      }
      setDraft('');
      setMessages((prev) =>
        prev.some((p) => p.id === insertedRow.id) ? prev : [...prev, insertedRow],
      );
    } catch (e) {
      const exErr = (e ?? null) as { message?: unknown } | null;
      console.log('[chat-send] exception', {
        message: typeof exErr?.message === 'string' ? exErr.message : String(e),
        match_id: match?.id ?? null,
        conversation_id: conversationId,
      });
      logError('Chat', 'send_message_exception', e);
      Alert.alert(
        'שגיאה',
        'לא הצלחנו לשלוח את ההודעה. קוד תקלה: CHAT_SEND_RPC_EXCEPTION',
      );
    } finally {
      setSending(false);
    }
  }

  const peerName = (peer?.full_name || peer?.username || 'ההתאמה שלך').trim();
  const peerInitial = (peerName.trim()[0] || '?').toUpperCase();

  const matchExpiresAtMs = match?.expires_at ? new Date(match.expires_at).getTime() : NaN;
  const activeButPastExpiry =
    match?.status === 'active'
    && Number.isFinite(matchExpiresAtMs)
    && matchExpiresAtMs < Date.now();
  const isLocked = !match
    || match.status === 'expired'
    || match.status === 'unmatched'
    || activeButPastExpiry;

  const canEnd =
    !!match
    && match.status === 'chat_started'
    && Number.isFinite(matchExpiresAtMs)
    && matchExpiresAtMs <= Date.now();

  const confirmEndMatch = () => {
    if (!canEnd) return;
    Alert.alert(
      'לסיים את ההתאמה?',
      'לפעמים שיחה טובה צריכה עוד רגע להתחמם. אם מסיימים, הצ׳אט יישאר לקריאה בלבד ותוכלו לקבל התאמה חדשה.',
      [
        { text: 'לתת לזה עוד צ׳אנס', style: 'cancel' },
        { text: 'כן, לסיים', style: 'destructive', onPress: () => { doEndMatch(); } },
      ],
    );
  };

  async function doEndMatch() {
    if (!match) return;
    try {
      const { data, error } = await supabase.rpc('end_match', { p_match_id: match.id });
      if (error) {
        logError('Chat', 'end_match_rpc_failed', error);
        Alert.alert('שגיאה', 'לא הצלחנו לסיים את ההתאמה. נסה/י שוב מאוחר יותר.');
        return;
      }
      const payload = (data ?? null) as Record<string, unknown> | null;
      const statusField = payload && typeof payload.status === 'string' ? payload.status : null;
      if (statusField === 'ended') {
        setMatch({ ...match, status: 'unmatched' });
        Alert.alert(
          'ההתאמה נסגרה',
          'תודה על המשוב. מחפשים לך את ההתאמה הבאה.',
          [{ text: 'אישור', onPress: () => router.replace('/(tabs)' as any) }],
        );
      } else {
        logError('Chat', 'end_match_rpc_rejected', new Error(JSON.stringify(payload)));
        Alert.alert('לא הסתיים', 'לא ניתן לסיים את ההתאמה כרגע.');
      }
    } catch (e) {
      logError('Chat', 'end_match_exception', e);
      Alert.alert('שגיאה', 'אירעה שגיאה. נסה/י שוב מאוחר יותר.');
    }
  }

  const openMatchProfile = () => {
    if (!match?.id) return;
    if (navigatingToProfileRef.current) return;
    navigatingToProfileRef.current = true;
    setTimeout(() => {
      navigatingToProfileRef.current = false;
    }, 500);
    router.push({
      pathname: '/match-profile' as any,
      params: { match_id: match.id, from: 'chat' },
    });
  };

  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <SafeAreaView edges={safeEdges} style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={UI_COLORS.branding} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (errorMsg || !conversationId || !meId) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <SafeAreaView edges={safeEdges} style={{ flex: 1 }}>
          <View
            style={[
              styles.header,
              { backgroundColor: dynamicColors.chrome, borderBottomColor: dynamicColors.border },
            ]}>
            {/* 3-tab restructure — removed the top-left profile shortcut
                since "הפרופיל שלי" is a first-class tab. Leading slot is
                a width-matched spacer so the centered title stays aligned. */}
            <View style={styles.headerSpacer} />
            <View style={styles.headerTitleBlock}>
              <ThemedText style={[styles.headerTitle, { color: dynamicColors.text }]}>
                צ׳אט
              </ThemedText>
            </View>
            <View style={styles.headerSpacer} />
          </View>
          <View style={[styles.center, { flex: 1, padding: 24, gap: 12 }]}>
            <ThemedText style={[styles.emptyTitle, { color: dynamicColors.text }]}>
              {errorMsg ?? 'לא ניתן לפתוח את הצ׳אט'}
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <SafeAreaView edges={safeEdges} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}>
          <View
            style={[
              styles.header,
              { backgroundColor: dynamicColors.chrome, borderBottomColor: dynamicColors.border },
            ]}>
            {/* 3-tab restructure — removed the leading profile shortcut.
                The user reaches "הפרופיל שלי" via the bottom tab now. */}
            <View style={styles.headerSpacer} />

            <TouchableOpacity
              style={styles.headerTitleBlock}
              onPress={openMatchProfile}
              accessibilityLabel="פרופיל ההתאמה"
              activeOpacity={0.7}>
              <ThemedText
                numberOfLines={1}
                style={[styles.headerTitle, { color: dynamicColors.text }]}>
                {peerName}
              </ThemedText>
            </TouchableOpacity>

            {canEnd && (
              <TouchableOpacity
                onPress={confirmEndMatch}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="לסיים התאמה"
                style={styles.endMatchButton}>
                <ThemedText style={[styles.endMatchText, { color: dynamicColors.textLight }]}>
                  לסיים התאמה
                </ThemedText>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.headerAvatar,
                { backgroundColor: dynamicColors.surface, borderColor: UI_COLORS.branding },
              ]}
              onPress={openMatchProfile}
              accessibilityLabel="פרופיל ההתאמה"
              activeOpacity={0.7}>
              {peerAvatarUrl ? (
                <Image source={{ uri: peerAvatarUrl }} style={styles.headerAvatarImage} />
              ) : (
                <ThemedText style={[styles.headerAvatarInitial, { color: UI_COLORS.branding }]}>
                  {peerInitial}
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled">
            {messages.length === 0 ? (
              <View style={styles.emptyChat}>
                <ThemedText style={[styles.emptyChatTitle, { color: dynamicColors.text }]}>
                  אין עדיין הודעות בשיחה הזאת
                </ThemedText>
                <ThemedText style={[styles.emptyChatBody, { color: dynamicColors.textLight }]}>
                  כתבו את ההודעה הראשונה כדי להתחיל את הקשר.
                </ThemedText>
              </View>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === meId;
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.messageWrapper,
                      mine ? styles.mineWrapper : styles.theirsWrapper,
                    ]}>
                    <View
                      style={[
                        styles.bubble,
                        mine
                          ? [styles.bubbleMine, { backgroundColor: UI_COLORS.primary }]
                          : [
                              styles.bubbleTheirs,
                              {
                                backgroundColor: dynamicColors.card,
                                borderColor: dynamicColors.border,
                              },
                            ],
                      ]}>
                      <ThemedText
                        style={[
                          styles.bubbleText,
                          { color: mine ? '#FFFFFF' : dynamicColors.text },
                        ]}>
                        {m.content}
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={[
                        styles.bubbleTime,
                        {
                          color: dynamicColors.textLight,
                          textAlign: mine ? 'left' : 'right',
                        },
                      ]}>
                      {formatTime(m.created_at)}
                    </ThemedText>
                  </View>
                );
              })
            )}
          </ScrollView>

          {isLocked && (
            <View
              style={[
                styles.lockedBanner,
                { backgroundColor: dynamicColors.surface, borderColor: dynamicColors.border },
              ]}>
              <ThemedText style={[styles.lockedBannerText, { color: dynamicColors.textLight }]}>
                ההתאמה הסתיימה — אי אפשר לשלוח הודעות חדשות. ניתן עדיין לקרוא את ההיסטוריה כאן.
              </ThemedText>
            </View>
          )}
          <View
            style={[
              styles.inputArea,
              { backgroundColor: dynamicColors.chrome, borderTopColor: dynamicColors.border },
            ]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              style={[
                styles.input,
                {
                  color: dynamicColors.text,
                  backgroundColor: dynamicColors.inputBg,
                  borderColor: dynamicColors.border,
                  writingDirection: 'rtl',
                },
              ]}
              placeholder={isLocked ? 'השליחה ננעלה' : 'כתבו הודעה...'}
              placeholderTextColor={dynamicColors.textLight}
              textAlign="right"
              multiline
              editable={!sending && !isLocked && !!conversationId && !!meId}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                {
                  backgroundColor:
                    draft.trim().length === 0 || sending || isLocked || !conversationId || !meId
                      ? dynamicColors.textLight
                      : UI_COLORS.branding,
                },
              ]}
              onPress={send}
              disabled={draft.trim().length === 0 || sending || isLocked || !conversationId || !meId}
              accessibilityLabel="שלח הודעה">
              <IconSymbol name="paperplane.fill" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitleBlock: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  headerSpacer: { width: 24 },
  endMatchButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  endMatchText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  headerAvatarImage: { width: '100%', height: '100%' },
  headerAvatarInitial: { fontSize: 18, fontWeight: '800' },
  chatContent: { padding: 16, paddingBottom: 24, gap: 10 },
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyChatTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  emptyChatBody: {
    fontSize: 14,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  messageWrapper: { maxWidth: '85%' },
  mineWrapper: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirsWrapper: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { borderWidth: 1, borderBottomLeftRadius: 4 },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  bubbleTime: {
    fontSize: 11,
    marginTop: 4,
    paddingHorizontal: 6,
  },
  lockedBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  lockedBannerText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
