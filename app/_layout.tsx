import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, useGlobalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { I18nManager, View, ActivityIndicator } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { installNotificationHandlers } from '@/lib/push';

export const unstable_settings = {
  anchor: '(tabs)',
};

const UniMatchTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#FF3D57',
    background: '#FFF9F6',
    card: '#FFFFFF',
    text: '#172033',
    border: '#E9E4E0',
  },
};

const UniMatchDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#FF3D57',
    background: '#101828',
    card: '#1D2939',
    text: '#FFFFFF',
    border: 'rgba(255, 255, 255, 0.1)',
  },
};

type ProfileState =
  | { kind: 'unknown' }
  | { kind: 'missing' }
  | { kind: 'present'; onboardingCompleted: boolean };

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [profile, setProfile] = useState<ProfileState>({ kind: 'unknown' });
  const router = useRouter();
  const segments = useSegments();
  const { mode } = useGlobalSearchParams<{ mode: string }>();

  // PR-PUSH-D1: install notification handlers once per app session.
  // Foreground suppression (no double-beep when user is inside the
  // chat the push refers to) + tap navigation (deep-link to /chat
  // when the user taps a notification, including cold-launch).
  // The helper is idempotent — multiple mounts won't stack listeners.
  // Push permission + token registration still happen post-onboarding
  // in (tabs)/_layout.tsx; this only wires the receive-side handlers.
  useEffect(() => {
    installNotificationHandlers((matchId) => {
      router.push({ pathname: '/chat', params: { match_id: matchId } });
    });
    // The router instance is stable across renders, and the install
    // function is guarded as a one-shot — empty deps is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!I18nManager.isRTL) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(true);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadProfile(session.user.id);
      } else {
        setProfile({ kind: 'unknown' });
        setInitialized(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setProfile({ kind: 'unknown' });
        loadProfile(session.user.id);
      } else {
        setProfile({ kind: 'unknown' });
        setInitialized(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setProfile({ kind: 'missing' });
      } else {
        setProfile({ kind: 'present', onboardingCompleted: !!data.onboarding_completed });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      setProfile({ kind: 'missing' });
    } finally {
      setInitialized(true);
    }
  };

  useEffect(() => {
    if (!initialized) return;

    const root: string | undefined = segments[0];

    // Legal & informational screens are reachable from any state —
    // auth or no auth, mid-onboarding or completed.
    if (
      root === 'privacy-policy' ||
      root === 'terms-of-use' ||
      root === 'how-it-works'
    ) return;

    const isQuestionnaireEdit = root === 'questionnaire' && mode === 'edit';

    console.log(`[Auth] Session: ${!!session}, Profile: ${profile.kind}, Path: ${segments.join('/')}, Mode: ${mode}`);

    if (!session) {
      const allowed = root === 'login' || root === 'signup';
      if (!allowed) {
        router.replace('/login');
      }
      return;
    }

    if (profile.kind === 'unknown') return;

    if (profile.kind === 'missing') {
      if (root !== 'signup') {
        router.replace('/signup');
      }
      return;
    }

    if (!profile.onboardingCompleted) {
      const inMainApp =
        root === '(tabs)' ||
        root === 'match-result' ||
        root === 'active-match' ||
        root === 'chat' ||
        root === 'match-feedback';

      if (inMainApp) {
        // Local profile state may be stale (e.g., the questionnaire submit just
        // flipped onboarding_completed to true and we haven't observed the DB
        // write yet). Re-fetch once before bouncing the user out of the main app.
        supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', session.user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.onboarding_completed) {
              setProfile({ kind: 'present', onboardingCompleted: true });
            } else {
              router.replace('/questionnaire');
            }
          });
        return;
      }

      if (root !== 'questionnaire') {
        router.replace('/questionnaire');
      }
      return;
    }

    const forbiddenWhenComplete =
      root === 'login' ||
      root === 'signup' ||
      root === 'welcome' ||
      root === 'student-verification' ||
      root === 'verification' ||
      (root === 'questionnaire' && !isQuestionnaireEdit);

    if (forbiddenWhenComplete) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, profile, segments, mode]);

  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF9F6' }}>
        <ActivityIndicator size="large" color="#FF3D57" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? UniMatchDarkTheme : UniMatchTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="student-verification" options={{ headerShown: false }} />
        <Stack.Screen name="verification" options={{ headerShown: false }} />
        <Stack.Screen name="questionnaire" options={{ headerShown: false }} />
        <Stack.Screen name="match-result" options={{ headerShown: false }} />
        <Stack.Screen name="active-match" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
        <Stack.Screen name="terms-of-use" options={{ headerShown: false }} />
        <Stack.Screen name="how-it-works" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
