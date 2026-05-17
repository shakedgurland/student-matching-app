import React, { useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Design Constants for Premium UniMatch Style
const UI_COLORS = {
  bg: '#FAFBFC',
  primary: '#2EC4B6',
  secondary: '#3D348B',
  accent: '#FF6B6B',
  text: '#172033',
  textLight: '#667085',
  border: '#E7ECF2',
  card: '#FFFFFF',
};

export default function SignupScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();

  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#0F172A' : UI_COLORS.bg,
    card: isDark ? '#1E293B' : UI_COLORS.card,
    text: isDark ? '#F1F5F9' : UI_COLORS.text,
    textLight: isDark ? '#94A3B8' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
  };

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validate = () => {
    const newErrors: { [key: string]: string } = {};

    if (!username.trim()) newErrors.username = 'נא להזין שם משתמש';
    if (!email.trim()) {
      newErrors.email = 'נא להזין כתובת אימייל';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'כתובת האימייל אינה תקינה';
    }

    if (!password) {
      newErrors.password = 'נא להזין סיסמה';
    } else if (password.length < 6) {
      newErrors.password = 'הסיסמה חייבת להכיל לפחות 6 תווים';
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'הסיסמאות אינן תואמות';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignup = () => {
    if (validate()) {
      router.push('/verification');
    }
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText style={[styles.title, { color: dynamicColors.text }]}>
              יצירת חשבון
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: dynamicColors.textLight }]}>
              נתחיל בכמה פרטים בסיסיים לפני שאלון ההתאמה
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <ThemedText style={[styles.label, { color: dynamicColors.text }]}>שם משתמש</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: errors.username ? UI_COLORS.accent : dynamicColors.border },
                ]}
                placeholder="הזן שם משתמש"
                placeholderTextColor={dynamicColors.textLight}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
              {errors.username && <ThemedText style={[styles.errorText, { color: UI_COLORS.accent }]}>{errors.username}</ThemedText>}
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={[styles.label, { color: dynamicColors.text }]}>אימייל</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: errors.email ? UI_COLORS.accent : dynamicColors.border },
                ]}
                placeholder="example@univ.ac.il"
                placeholderTextColor={dynamicColors.textLight}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {errors.email && <ThemedText style={[styles.errorText, { color: UI_COLORS.accent }]}>{errors.email}</ThemedText>}
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={[styles.label, { color: dynamicColors.text }]}>סיסמה</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: errors.password ? UI_COLORS.accent : dynamicColors.border },
                ]}
                placeholder="לפחות 6 תווים"
                placeholderTextColor={dynamicColors.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              {errors.password && <ThemedText style={[styles.errorText, { color: UI_COLORS.accent }]}>{errors.password}</ThemedText>}
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={[styles.label, { color: dynamicColors.text }]}>אימות סיסמה</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: errors.confirmPassword ? UI_COLORS.accent : dynamicColors.border },
                ]}
                placeholder="הזן את הסיסמה שנית"
                placeholderTextColor={dynamicColors.textLight}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              {errors.confirmPassword && (
                <ThemedText style={[styles.errorText, { color: UI_COLORS.accent }]}>{errors.confirmPassword}</ThemedText>
              )}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: UI_COLORS.primary }]}
              activeOpacity={0.8}
              onPress={handleSignup}>
              <ThemedText style={styles.primaryButtonText}>המשך לאימות סטודנט</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.back()}>
              <ThemedText style={[styles.secondaryButtonText, { color: UI_COLORS.secondary }]}>
                כבר יש לי חשבון
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
  },
  header: {
    marginBottom: 32,
    alignItems: 'flex-start',
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'right',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'right',
    lineHeight: 24,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    gap: 6,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    textAlign: 'right',
  },
  errorText: {
    fontSize: 13,
    textAlign: 'right',
    fontWeight: '500',
    marginTop: -2,
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#2EC4B6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});