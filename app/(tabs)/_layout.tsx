import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { fetchUnreadSummary } from '@/lib/unread';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  // PR-PUSH-A: live unread badge for the matching tab.
  // Sources of truth that move the count:
  //   • A new peer message lands (postgres_changes INSERT on messages)
  //   • The caller (this device, or another device of theirs) updates
  //     conversation_reads via mark_conversation_read
  // Realtime subscriptions cover both; an initial fetch on mount seeds
  // the value. RLS makes the messages subscription only deliver events
  // for conversations the caller participates in, so a recompute on
  // every INSERT is cheap. The unread RPC excludes terminal matches.
  const [unreadTotal, setUnreadTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      fetchUnreadSummary().then((s) => {
        if (!cancelled) setUnreadTotal(s.total_unread);
      });
    };

    refresh();

    const messagesChannel = supabase
      .channel('unread:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => refresh(),
      )
      .subscribe();

    const readsChannel = supabase
      .channel('unread:reads')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_reads' },
        () => refresh(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(readsChannel);
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'התאמה',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="sparkles" color={color} />,
          // Numeric badge when > 0; undefined hides the badge entirely.
          // The RPC excludes terminal matches, so stale unread never
          // accumulates on this badge after expired/unmatched.
          tabBarBadge: unreadTotal > 0 ? unreadTotal : undefined,
        }}
      />
      <Tabs.Screen
        name="my-profile"
        options={{
          // Route stays registered so router.push('/(tabs)/my-profile') and the
          // top profile icon on the matching tab continue to work. href: null
          // only hides the tab button itself from the bottom bar.
          href: null,
          title: 'פרופיל',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
