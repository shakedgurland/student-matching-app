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

// Design Constants for Bright Premium Style
const UI_COLORS = {
  bg: '#FFF9F6',
  primary: '#FF4D3D', // Solid vivid red-coral
  premium: '#7C3AED', // Secondary Premium Accent
  accent: '#FF8A00', // Small spark accent
  branding: '#FF3D57', // Main branding color
  surface: '#FFF0EA', // Soft romantic surface
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  card: '#FFFFFF',
};

const BrandMark = ({ size = 32, showSpark = true }: { size?: number, showSpark?: boolean }) => {
  const strokeWidth = size * 0.2;
  const innerSize = size - strokeWidth;
  const sparkSize = size * 0.14;

  return (
    <View style={{ width: size, height: size + strokeWidth, justifyContent: 'flex-end', alignItems: 'center' }}>
      <View style={{
        width: innerSize,
        height: innerSize,
        borderBottomLeftRadius: innerSize / 2,
        borderBottomRightRadius: innerSize / 2,
        borderWidth: strokeWidth,
        borderColor: UI_COLORS.branding,
        borderTopWidth: 0,
      }}>
        <View style={{
          position: 'absolute',
          top: -strokeWidth/2,
          left: -strokeWidth,
          width: strokeWidth,
          height: strokeWidth,
          backgroundColor: UI_COLORS.branding,
          borderTopLeftRadius: strokeWidth * 0.2,
          borderTopRightRadius: strokeWidth * 0.2,
        }} />
        <View style={{
          position: 'absolute',
          top: -strokeWidth/2,
          right: -strokeWidth,
          width: strokeWidth,
          height: strokeWidth,
          backgroundColor: UI_COLORS.branding,
          borderTopLeftRadius: strokeWidth * 0.2,
          borderTopRightRadius: strokeWidth * 0.2,
        }} />
      </View>
      {showSpark && (
        <View style={{
          position: 'absolute',
          top: 0,
          width: sparkSize,
          height: sparkSize,
          borderRadius: sparkSize / 2,
          backgroundColor: UI_COLORS.accent,
        }} />
      )}
    </View>
  );
};

export default function SignupScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();

  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
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
            <View style={styles.topIcon}>
              <BrandMark size={36} />
            </View>
            <View style={styles.titleContainer}>
              <ThemedText style={[styles.title, { color: dynamicColors.text }]}>
                יצירת חשבון
              </ThemedText>
              <View style={[styles.titleDot, { backgroundColor: UI_COLORS.accent }]} />
            </View>
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
                  { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: errors.username ? UI_COLORS.branding : dynamicColors.border },
                ]}
                placeholder="הזן שם משתמש"
                placeholderTextColor={dynamicColors.textLight}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
              {errors.username && <ThemedText style={[styles.errorText, { color: UI_COLORS.branding }]}>{errors.username}</ThemedText>}
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={[styles.label, { color: dynamicColors.text }]}>אימייל</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: errors.email ? UI_COLORS.branding : dynamicColors.border },
                ]}
                placeholder="example@univ.ac.il"
                placeholderTextColor={dynamicColors.textLight}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {errors.email && <ThemedText style={[styles.errorText, { color: UI_COLORS.branding }]}>{errors.email}</ThemedText>}
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={[styles.label, { color: dynamicColors.text }]}>סיסמה</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: errors.password ? UI_COLORS.branding : dynamicColors.border },
                ]}
                placeholder="לפחות 6 תווים"
                placeholderTextColor={dynamicColors.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              {errors.password && <ThemedText style={[styles.errorText, { color: UI_COLORS.branding }]}>{errors.password}</ThemedText>}
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={[styles.label, { color: dynamicColors.text }]}>אימות סיסמה</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: errors.confirmPassword ? UI_COLORS.branding : dynamicColors.border },
                ]}
                placeholder="הזן את הסיסמה שנית"
                placeholderTextColor={dynamicColors.textLight}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              {errors.confirmPassword && (
                <ThemedText style={[styles.errorText, { color: UI_COLORS.branding }]}>{errors.confirmPassword}</ThemedText>
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
              <ThemedText style={[styles.secondaryButtonText, { color: UI_COLORS.text }]}>
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
  topIcon: {
    marginBottom: 16,
  },
  titleContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'right',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  titleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
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
    shadowColor: '#FF5A5F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
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