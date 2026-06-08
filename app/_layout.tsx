import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, useGlobalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { I18nManager, View, ActivityIndicator } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

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

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const router = useRouter();
  const segments = useSegments();
  const { mode } = useGlobalSearchParams<{ mode: string }>();

  useEffect(() => {
    // Force RTL for Hebrew
    if (!I18nManager.isRTL) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(true);
    }

    // Initialize session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkOnboarding(session.user.id);
      } else {
        setInitialized(true);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkOnboarding(session.user.id);
      } else {
        setOnboardingCompleted(null);
        setInitialized(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkOnboarding = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', userId)
        .single();

      if (error) throw error;
      const completed = data?.onboarding_completed || false;
      setOnboardingCompleted(completed);
      return completed;
    } catch (error) {
      console.error('Error checking onboarding:', error);
      setOnboardingCompleted(false);
      return false;
    } finally {
      setInitialized(true);
    }
  };

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const isWelcome = segments[0] === 'welcome';
    const isLoginOrSignup = segments[0] === 'login' || segments[0] === 'signup';

    console.log(`[Auth] Session: ${!!session}, Onboarding: ${onboardingCompleted}, Path: ${segments.join('/')}, Mode: ${mode}`);

    if (!session) {
      // If not logged in, only allow welcome/login/signup
      if (!isWelcome && !isLoginOrSignup) {
        router.replace('/welcome');
      }
    } else if (onboardingCompleted === false) {
      // If logged in but onboarding not completed
      const isOnboardingFlow = segments[0] === 'student-verification' || 
                               segments[0] === 'verification' || 
                               segments[0] === 'questionnaire' ||
                               segments[0] === 'signup'; // Allow signup to finish its own redirect
      
      if (inAuthGroup) {
        // Mismatch! User is in tabs but state says onboarding not completed.
        // Re-check before redirecting.
        checkOnboarding(session.user.id).then(completed => {
          if (!completed) {
            router.replace('/student-verification');
          }
        });
        return;
      }

      if (!isOnboardingFlow) {
        // If "lost", go to the start of onboarding
        router.replace('/student-verification');
      }
    } else if (onboardingCompleted === true) {
      // If logged in and onboarding completed, don't allow welcome/login/signup
      let isForbidden = isWelcome || isLoginOrSignup;
      
      // Also forbid questionnaire UNLESS mode is edit
      if (segments[0] === 'questionnaire' && mode !== 'edit') {
        isForbidden = true;
      }
      
      if (isForbidden) {
        router.replace('/(tabs)');
      }
    }
  }, [session, initialized, onboardingCompleted, segments, mode]);

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
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
