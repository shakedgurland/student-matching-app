import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { InteractionManager, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { fetchUnreadSummary } from '@/lib/unread';
import { registerPushTokenIfPermitted } from '@/lib/push';

// 3-tab restructure — icons-only premium iOS tab bar.
// RTL order (with I18nManager.forceRTL(true) from app/_layout.tsx):
//   • declaration order in this file controls visual order;
//   • first declared = far right in RTL = "התאמה" (Match);
//   • second = center = "צ׳אט" (Chat);
//   • third = far left = "הפרופיל שלי" (Profile).
// Compact height, no text labels, subtle active tint.
const TAB_BAR_HEIGHT = 52;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';

  // Unread badge — moved from Match → Chat in the 3-tab restructure.
  // Chats are now their own tab, so the unread indicator belongs there.
  const [unreadTotal, setUnreadTotal] = useState(0);

  // PR-PUSH-B: register the device's Expo push token for the authenticated +
  // onboarded user. Deferred until interactions settle (HOTFIX P0).
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      registerPushTokenIfPermitted();
    });
    return () => task.cancel();
  }, []);

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

  const activeTint = '#FF3D57';
  const inactiveTint = isDark ? '#98A2B3' : '#9CA3AF';
  const barBackground = isDark ? '#1D2939' : '#FFFFFF';
  const barBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        // Compact, premium iOS bar. Height stays small; safe-area inset
        // pads the bottom on devices with a home indicator. No top
        // border on iOS to avoid a hairline that competes with the
        // active-tab tint; a very subtle border on Android for affordance.
        tabBarStyle: [
          styles.tabBar,
          {
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom,
            backgroundColor: barBackground,
            borderTopColor: barBorder,
            borderTopWidth: Platform.OS === 'ios' ? StyleSheet.hairlineWidth : 0.5,
          },
        ],
        tabBarItemStyle: styles.tabItem,
      }}>
      {/* 1. Match — far right in RTL. Default landing tab.
            tabBarBadge intentionally NOT set here anymore — the unread
            count tracks chats, not matches, so the badge now lives on
            the Chat tab below. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'התאמה',
          tabBarAccessibilityLabel: 'התאמה',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol size={focused ? 28 : 26} name="sparkles" color={color} />
          ),
        }}
      />

      {/* 2. Chat — center.
            tabBarBadge: numeric unread count when > 0; undefined hides
            the badge. Same RPC semantics as before (excludes terminal
            matches), just relocated. */}
      <Tabs.Screen
        name="chat"
        options={{
          title: 'צ׳אט',
          tabBarAccessibilityLabel: 'צ׳אט',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol size={focused ? 28 : 26} name="bubble.left.fill" color={color} />
          ),
          tabBarBadge: unreadTotal > 0 ? unreadTotal : undefined,
        }}
      />

      {/* 3. Profile — far left in RTL. Previously hidden behind a header
            icon (href: null); now a first-class destination. */}
      <Tabs.Screen
        name="my-profile"
        options={{
          title: 'הפרופיל שלי',
          tabBarAccessibilityLabel: 'הפרופיל שלי',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol size={focused ? 28 : 26} name="person.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    elevation: 0,
    shadowOpacity: 0,
  },
  tabItem: {
    paddingTop: 6,
  },
});
