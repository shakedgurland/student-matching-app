import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { logScreenView, logError } from '@/lib/analytics';
import { markConversationRead } from '@/lib/unread';
import { setActiveChatMatchId } from '@/lib/notification-context';

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

// PR-PREBUILD-MATCH-PRIVACY-POLISH: shorter signed-URL TTL for peer
// images. Bounds the stale-access window if the match closes after the
// URL is minted (signed URLs are HMAC tokens; the storage layer doesn't
// re-check policy on each fetch, only on issuance). 5 min easily covers
// a typical chat session; if the user lingers past expiry the avatar
// falls back to the initial.
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
  // Needed to compute the locked-composer state for active-but-past-
  // expiry matches (the cron may not have flipped the status yet).
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

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ match_id?: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

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

  useEffect(() => {
    logScreenView('Chat');
    init();
  }, []);

  // Realtime subscription for incoming peer messages.
  // If the table is not part of the supabase_realtime publication, the
  // subscription silently no-ops; sending and initial load still work.
  //
  // PR-PUSH-A addition: whenever a NEW peer message arrives while this
  // screen is mounted, mark the conversation as read (UPSERT
  // last_read_at=now()). Own-message INSERTs are skipped because their
  // sender_id matches the caller and would be a no-op anyway, but
  // filtering here avoids the round-trip.
  useEffect(() => {
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
            // Fire-and-forget; the helper logs failures.
            markConversationRead(conversationId);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, meId]);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length]);

  // PR-PUSH-D1: tell the notification handler that this chat is the
  // currently-viewed one, so it can suppress foreground pushes whose
  // match_id matches. Cleanup clears the ref on unmount (back, screen
  // pop, app background). If the user navigates directly between two
  // chats, the prior screen's cleanup fires before this screen's
  // effect, so the ref correctly transitions A → null → B.
  useEffect(() => {
    if (match?.id) {
      setActiveChatMatchId(match.id);
    }
    return () => {
      setActiveChatMatchId(null);
    };
  }, [match?.id]);

  async function init() {
    try {
      setLoading(true);
      setErrorMsg(null);

      const { data: userRes } = await supabase.auth.getUser();
      const myId = userRes.user?.id ?? null;
      if (!myId) {
        setErrorMsg('יש להתחבר מחדש');
        return;
      }
      setMeId(myId);

      const matchColumns = 'id, user_a_id, user_b_id, compatibility_score, status, expires_at';

      let matchRow: MatchLite | null = null;
      if (params.match_id) {
        const { data } = await supabase
          .from('matches')
          .select(matchColumns)
          .eq('id', params.match_id)
          .maybeSingle();
        matchRow = (data as MatchLite | null) ?? null;
      }
      if (!matchRow) {
        // Fallback when no match_id route param was provided (e.g., a deep
        // link). Widened to include 'chat_started' so a user whose match
        // has already transitioned (DB trigger fired on their first
        // message) still resolves to their current open match. Mirrors
        // the lifecycle widening in app/(tabs)/index.tsx#fetchCurrentMatch.
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
        // For terminal matches the peer-profile RLS from migration 023
        // intentionally hides the peer (visibility limited to
        // active/chat_started). That is NOT an error here — we still
        // want the user to view their existing chat history (messages
        // RLS is participant-keyed, so messages remain readable). Fall
        // through with peer=null; the header renders with the generic
        // fallback name "ההתאמה שלך" and the composer is locked below
        // by the isLocked guard.
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

      // Find or create the conversation for this match.
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
          // Race fallback: peer may have created it between our SELECT and INSERT.
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

      // PR-PUSH-A: only mark read on a successful, fully-loaded chat.
      // A failed load shouldn't clear the user's unread state. Fire-
      // and-forget; helper logs failures.
      markConversationRead(convId);
    } catch (e) {
      logError('Chat', 'init_exception', e);
      setErrorMsg('אירעה שגיאה');
    } finally {
      setLoading(false);
    }
  }

  // BATCH-H1: re-fetch this match's current status from the DB so we
  // can detect a status flip that happened between chat init and a
  // failed send (peer ended the match, cron flipped to expired, etc.).
  // Awaited from send()'s error branch — no fire-and-forget races
  // (this screen stays mounted on send failure; nothing navigates).
  // Returns the fresh row on success, null on failure / no row.
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
    // BATCH-H7 REFINEMENT: dropped `!meId` from the precondition list.
    // The suspected failure mode is precisely that meId went stale or
    // never matched the current auth user — gating on it would silently
    // swallow the very case we're trying to diagnose + recover. The
    // fresh supabase.auth.getUser() call below is now the single source
    // of truth for "is the user authenticated."
    if (!text || sending || !conversationId) return;
    // Safety belt — the UI disables the send button when isLocked, but
    // a stale render or a programmatic click could still call send().
    // Refuse if the match is terminal or active-but-past-expiry.
    if (isLocked) return;
    setSending(true);
    try {
      // BATCH-H7: re-read the authenticated user immediately before
      // insert. TestFlight evidence: the failing send hit the generic
      // "שגיאה" alert (not "ההתאמה הסתיימה"), while live SELECT
      // confirmed the match was active+future, conversation existed,
      // and caller was a participant. The remaining plausible cause
      // is meId captured at init() going stale vs the current
      // auth.uid() at send-time (token rotation / session refresh /
      // background user switch). Re-reading auth.getUser() here
      // ensures sender_id matches the live auth.uid() the RLS sees.
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
        // Fresh user wins. Diagnostic + sync local meId so bubble
        // own-vs-peer rendering (m.sender_id === meId) and any
        // subsequent send in this session use the live auth user.
        // Diagnostic logs UUIDs only — no tokens, emails, or content.
        console.log('[chat-send] auth user mismatch', {
          init_me_id: meId,
          fresh_user_id: freshUser.id,
          match_id: match?.id ?? null,
          conversation_id: conversationId,
        });
        setMeId(freshUser.id);
      }

      // BATCH-H8: backend-authorized send via SECURITY DEFINER RPC.
      // Real-device evidence (PR #44 H7 build) confirmed direct
      // `from('messages').insert()` was failing with opaque PostgREST
      // 42501 even when getUser() succeeded, match was active+future,
      // and caller was a conversation participant — the JWT was
      // dropping between getUser() and the REST INSERT. The new
      // `send_chat_message` RPC (migration 030) reads auth.uid()
      // server-side once, performs explicit participant + lifecycle
      // validation, and INSERTs with SECURITY DEFINER bypassing
      // messages RLS. Returns the inserted public.messages row.
      const { data: rpcData, error: rpcError } = await supabase.rpc('send_chat_message', {
        p_conversation_id: conversationId,
        p_content: text,
      });
      const insertedRow = (rpcData ?? null) as MessageRow | null;
      if (rpcError || !insertedRow) {
        // rpcError.code is the SQLSTATE raised by the function:
        //   28000 unauthenticated
        //   22023 empty_content
        //   P0001 conversation_not_found / not_participant /
        //         match_not_found / match_terminal / match_expired
        //         (discriminated by rpcError.message)
        // Non-sensitive only — excludes content, tokens, emails.
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

        // Map known discriminators to specific Hebrew copy.
        if (safeCode === '28000' || safeMsg === 'unauthenticated') {
          Alert.alert(
            'התחברות נדרשת',
            'נראה שהחיבור שלך הסתיים. התחברי מחדש ונסי שוב.',
          );
          return;
        }
        if (safeMsg === 'match_terminal' || safeMsg === 'match_expired') {
          // Sync local match state so the composer locks via isLocked
          // and the banner explains.
          await refreshMatchStatus();
          Alert.alert(
            'ההתאמה הסתיימה',
            'ההתאמה הסתיימה — אי אפשר לשלוח הודעות חדשות.',
          );
          return;
        }
        // Defensive: refresh in case the failure was a transient match
        // transition not caught by the explicit branches above.
        const refreshed = await refreshMatchStatus();
        const terminal = refreshed?.status === 'expired' || refreshed?.status === 'unmatched';
        if (terminal) {
          Alert.alert(
            'ההתאמה הסתיימה',
            'ההתאמה הסתיימה — אי אפשר לשלוח הודעות חדשות.',
          );
          return;
        }
        // Generic beta-safe failure code. Uses SQLSTATE when present,
        // else 'UNKNOWN'. Lets a tester report a single short string.
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
      // HOTFIX P0: same surfacing as the error-result branch above.
      // Catches transport-layer failures (offline, DNS, Supabase
      // unreachable) that would otherwise be invisible.
      // BATCH-H1: also log message + ids for the next TestFlight.
      const exErr = (e ?? null) as { message?: unknown } | null;
      console.log('[chat-send] exception', {
        message: typeof exErr?.message === 'string' ? exErr.message : String(e),
        match_id: match?.id ?? null,
        conversation_id: conversationId,
      });
      logError('Chat', 'send_message_exception', e);
      // BATCH-H8: exception failure code uses the new RPC prefix so
      // logs + tester reports stay consistent with the RPC-rejection
      // alert above.
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
  // PR-MATCH-FLOW (PR #57): removed the "{compatibility_score}% התאמה"
  // header subtitle. compatibility_score is still SELECT-ed for the
  // MatchLite type / future analytics; only the user-facing render
  // was removed per product decision.

  // Composer lock. The match is read-only when:
  //   - status is terminal ('expired' or 'unmatched'), OR
  //   - status='active' but expires_at is already in the past
  //     (cron may not have flipped to 'expired' yet).
  // chat_started never auto-locks (it stops auto-expiring; only manual
  // end-match — a future PR — can flip it to 'unmatched').
  const matchExpiresAtMs = match?.expires_at ? new Date(match.expires_at).getTime() : NaN;
  const activeButPastExpiry =
    match?.status === 'active'
    && Number.isFinite(matchExpiresAtMs)
    && matchExpiresAtMs < Date.now();
  const isLocked = !match
    || match.status === 'expired'
    || match.status === 'unmatched'
    || activeButPastExpiry;

  // Manual end-match affordance (PR-END-MATCH). Visible only when the
  // match is durable (chat_started — both sides have already messaged)
  // AND the original 72h window has fully elapsed. Before 72h, ending
  // is not allowed — see the product rule documented in migration 027.
  // Computed inline rather than via a `now` timer state: the 72h cliff
  // crosses once, and a next interaction (message, navigation) will
  // pick up the boundary cheaply.
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
        // Reflect the new status locally. isLocked already covers
        // status==='unmatched' so the composer locks automatically on
        // the next render; the lock banner takes over.
        setMatch({ ...match, status: 'unmatched' });
        // BATCH-H6: prompt + auto-navigate to the home tab on OK so the
        // user lands on the premium searching/empty hero instead of
        // being stranded on a locked chat with no clear next step.
        // Alert is user-driven (no auto-timer that could race a render).
        Alert.alert(
          'ההתאמה נסגרה',
          'תודה על המשוב. מחפשים לך את ההתאמה הבאה.',
          [{ text: 'אישור', onPress: () => router.replace('/(tabs)' as any) }],
        );
      } else {
        // RPC returned a non-fatal refusal (race, not_allowed_yet,
        // etc.). Log the discriminator without surfacing internals.
        logError('Chat', 'end_match_rpc_rejected', new Error(JSON.stringify(payload)));
        Alert.alert('לא הסתיים', 'לא ניתן לסיים את ההתאמה כרגע.');
      }
    } catch (e) {
      logError('Chat', 'end_match_exception', e);
      Alert.alert('שגיאה', 'אירעה שגיאה. נסה/י שוב מאוחר יותר.');
    }
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={UI_COLORS.branding} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (errorMsg || !conversationId || !meId) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }}>
          <View
            style={[
              styles.header,
              { backgroundColor: dynamicColors.chrome, borderBottomColor: dynamicColors.border },
            ]}>
            {/*
              BATCH-H3: replaced the back chevron with a profile-access
              affordance. Chat is often the user's primary screen for
              returning users (router.replace from home tab when
              match.status='chat_started'), so router.back() had no
              meaningful target. The profile icon takes the user to
              /(tabs)/my-profile where they can edit their profile and
              reach Privacy Policy / Terms. iOS swipe-from-edge still
              works for users who pushed chat on top of match-result.
              The peer avatar on the trailing edge of this header still
              opens match-profile for the peer view, so the leading /
              trailing actions remain visually balanced.
             */}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/my-profile' as any)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="מעבר לפרופיל שלי">
              <IconSymbol name="person.crop.circle" size={26} color={UI_COLORS.branding} />
            </TouchableOpacity>
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
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        {/*
          BATCH-H1: keyboardVerticalOffset 90 -> 0. The 90pt was meant to
          compensate for a fixed navigation header ABOVE the avoiding
          view, but this screen uses `headerShown: false` and renders
          its custom header INSIDE the SafeAreaView/KeyboardAvoidingView.
          The 90pt was therefore pure dead space between the keyboard
          and the input. SafeAreaView still handles the bottom safe-area
          inset on notched devices.
         */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}>
          <View
            style={[
              styles.header,
              { backgroundColor: dynamicColors.chrome, borderBottomColor: dynamicColors.border },
            ]}>
            {/*
              BATCH-H3: replaced the back chevron with a profile-access
              affordance. Chat is often the user's primary screen for
              returning users (router.replace from home tab when
              match.status='chat_started'), so router.back() had no
              meaningful target. The profile icon takes the user to
              /(tabs)/my-profile where they can edit their profile and
              reach Privacy Policy / Terms. iOS swipe-from-edge still
              works for users who pushed chat on top of match-result.
              The peer avatar on the trailing edge of this header still
              opens match-profile for the peer view, so the leading /
              trailing actions remain visually balanced.
             */}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/my-profile' as any)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="מעבר לפרופיל שלי">
              <IconSymbol name="person.crop.circle" size={26} color={UI_COLORS.branding} />
            </TouchableOpacity>

            {/*
              PR-MATCH-PROFILE-V1: title block + avatar both open the
              rich match-profile screen. Wrapped in separate
              TouchableOpacities so the back arrow + end-match button
              remain independent tap targets and don't swallow events.
              `from=chat` so match-profile knows the back/CTA wording.
             */}
            <TouchableOpacity
              style={styles.headerTitleBlock}
              onPress={() => {
                if (match?.id) {
                  router.push({
                    pathname: '/match-profile' as any,
                    params: { match_id: match.id, from: 'chat' },
                  });
                }
              }}
              accessibilityLabel="פרופיל ההתאמה"
              activeOpacity={0.7}>
              <ThemedText
                numberOfLines={1}
                style={[styles.headerTitle, { color: dynamicColors.text }]}>
                {peerName}
              </ThemedText>
              {/* PR-MATCH-FLOW (PR #57): headerSubtitle removed. */}
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
              onPress={() => {
                if (match?.id) {
                  router.push({
                    pathname: '/match-profile' as any,
                    params: { match_id: match.id, from: 'chat' },
                  });
                }
              }}
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
          {/*
            HOTFIX P0: derive sendDisabled from EVERY precondition that
            `send()` early-returns on, not just draft/sending/isLocked.
            Previously the disabled state and the function's guard list
            diverged — !conversationId and !meId were unreachable in
            practice (error screen catches them at line 422), but the
            divergence is the kind of latent bug that bites later. One
            source of truth, mirrored in the button and the input.
           */}
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
  // PR-MATCH-FLOW (PR #57): removed headerSubtitle style (sole user
  // was the deleted "{compatibility_score}% התאמה" subtitle).
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
