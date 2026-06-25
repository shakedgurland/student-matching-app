import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MatchResultContent } from '@/components/match-result/MatchResultContent';

// 3-tab restructure — this file is now a thin route wrapper. All match-
// result UI + data flow lives in components/match-result/MatchResultContent
// so the Match tab can render the same component inline (persistent tab
// bar) while the legacy /match-result stack screen continues to work for
// existing in-app navigation and deep links. Behavior preserved verbatim:
// reads match_id from the route, falls back to the caller's current open
// match when no param is present, default openChat pushes /chat.
export default function MatchResultScreen() {
  const params = useLocalSearchParams<{ match_id?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MatchResultContent matchId={params.match_id} />
    </>
  );
}
