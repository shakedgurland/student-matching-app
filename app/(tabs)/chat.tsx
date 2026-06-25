import React, { useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ChatContent } from '@/components/chat/ChatContent';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

// 3-tab restructure — Chat tab.
//
// Behavior:
//   • If the caller has an open match (active OR chat_started), renders
//     <ChatContent matchId={openMatch.id} /> INLINE — the same component
//     the legacy /chat stack route renders. The bottom tab bar stays
//     visible because we never push a stack screen; the chat experience
//     lives inside the tab.
//   • If no open match, renders the empty state with the spec copy.
//
// The active-match lookup re-runs on every tab focus (via useFocusEffect)
// so that immediately after a match is created on the Match tab, tapping
// over to Chat picks it up without needing a tab remount.
//
// All chat logic — send, realtime subscription (focus-scoped inside
// ChatContent), end-match, KeyboardAvoidingView offset, locked banner,
// foreground push suppression — is unchanged. This file owns ONLY the
// "which match (if any) is this tab showing right now" decision + the
// no-match empty state.

const UI_COLORS = {
  bg: '#FFF9F6',
  primary: '#FF4D3D',
  accent: '#FF8A00',
  branding: '#FF3D57',
  surface: '#FFF0EA',
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
};

export default function ChatTabScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);

  // Synchronous guards mirror the PR #65 hardening pattern: avoid a
  // focus-rerun race storing two different match ids during the same
  // resolution cycle.
  const isMountedRef = useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    surface: isDark ? 'rgba(255, 138, 0, 0.18)' : UI_COLORS.surface,
  };

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;

      const resolve = async () => {
        if (isMountedRef.current) setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          // PR #70 follow-up — split the previously-combined cancellation
          // and unauthenticated branches. A `cancelled` flag means the
          // tab simply lost focus mid-resolve; we must NOT clear
          // openMatchId / loading in that case (it caused a brief
          // empty-state flash on rapid tab tap-and-return). Only an
          // actually-missing user warrants resetting state.
          if (cancelled) return;
          if (!user) {
            if (isMountedRef.current) {
              setOpenMatchId(null);
              setLoading(false);
            }
            return;
          }

          const { data: matches, error } = await supabase
            .from('matches')
            .select('id')
            .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
            .in('status', ['active', 'chat_started'])
            .order('created_at', { ascending: false })
            .limit(1);

          if (cancelled) return;
          if (error) throw error;

          const matchId = matches && matches.length > 0 ? (matches[0].id as string) : null;
          if (isMountedRef.current) {
            setOpenMatchId(matchId);
            setLoading(false);
          }
        } catch (err) {
          if (cancelled) return;
          console.error('Chat tab — match resolve failed:', err);
          if (isMountedRef.current) {
            setOpenMatchId(null);
            setLoading(false);
          }
        }
      };

      resolve();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator size="small" color={UI_COLORS.primary} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (openMatchId) {
    // Inline render — the full chat experience inside the Chat tab.
    // ChatContent owns the realtime subscription (focus-scoped) and
    // every send/receive RPC; the tab bar stays visible because nothing
    // is pushed onto the stack. key={openMatchId} forces a clean
    // remount if the user's open match changes (rare — match-create
    // doesn't usually replace an open match — but defensive).
    return <ChatContent key={openMatchId} matchId={openMatchId} />;
  }

  // Empty state — no open match.
  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <SafeAreaView style={styles.center}>
        <View style={[styles.iconCircle, { backgroundColor: dynamicColors.surface }]}>
          <IconSymbol name="bubble.left.fill" size={48} color={UI_COLORS.accent} />
        </View>
        <ThemedText style={[styles.title, { color: dynamicColors.text }]}>
          הצ׳אט שלך
        </ThemedText>
        <ThemedText style={[styles.body, { color: dynamicColors.textLight }]}>
          ברגע שתימצא התאמה חדשה, כאן תתחיל השיחה שלכם.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
