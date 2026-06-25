import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ChatContent } from '@/components/chat/ChatContent';

// 3-tab restructure — this file is now a thin route wrapper. All chat UI
// + send/receive flow lives in components/chat/ChatContent so the Chat
// tab can render the same component inline (persistent tab bar) while
// the legacy /chat stack screen continues to serve push-notification
// deep links (app/_layout.tsx push handler still calls
// router.push('/chat', { match_id }) on tap) and any in-app navigation
// that pushed /chat directly (e.g., from match-profile / match-result).
// Behavior preserved verbatim: reads match_id from the route, falls
// back to the caller's current open match when no param is present.
export default function ChatScreen() {
  const params = useLocalSearchParams<{ match_id?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatContent matchId={params.match_id} />
    </>
  );
}
