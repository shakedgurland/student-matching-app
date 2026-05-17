import React, { useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SignupScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();

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
      // For now, just show an alert or placeholder for the next step
      Alert.alert('הצלחה', 'החשבון נוצר בהצלחה! השלב הבא: אימות סטודנט.', [
        { text: 'המשך', onPress: () => console.log('Navigate to verification') },
      ]);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              יצירת חשבון
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              נתחיל בכמה פרטים בסיסיים לפני שאלון ההתאמה
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>שם משתמש</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: Colors[colorScheme].text, borderColor: errors.username ? '#ff4444' : '#ccc' },
                ]}
                placeholder="הזן שם משתמש"
                placeholderTextColor="#999"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
              {errors.username && <ThemedText style={styles.errorText}>{errors.username}</ThemedText>}
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>אימייל</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: Colors[colorScheme].text, borderColor: errors.email ? '#ff4444' : '#ccc' },
                ]}
                placeholder="example@univ.ac.il"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {errors.email && <ThemedText style={styles.errorText}>{errors.email}</ThemedText>}
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>סיסמה</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: Colors[colorScheme].text, borderColor: errors.password ? '#ff4444' : '#ccc' },
                ]}
                placeholder="לפחות 6 תווים"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              {errors.password && <ThemedText style={styles.errorText}>{errors.password}</ThemedText>}
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>אימות סיסמה</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: Colors[colorScheme].text, borderColor: errors.confirmPassword ? '#ff4444' : '#ccc' },
                ]}
                placeholder="הזן את הסיסמה שנית"
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              {errors.confirmPassword && (
                <ThemedText style={styles.errorText}>{errors.confirmPassword}</ThemedText>
              )}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: Colors[colorScheme].tint }]}
              activeOpacity={0.8}
              onPress={handleSignup}>
              <ThemedText style={styles.primaryButtonText}>המשך לאימות סטודנט</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.back()}>
              <ThemedText type="defaultSemiBold" style={styles.secondaryButtonText}>
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
    paddingTop: 80,
  },
  header: {
    marginBottom: 40,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 18,
    opacity: 0.7,
    textAlign: 'right',
    lineHeight: 24,
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    textAlign: 'right',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    textAlign: 'right',
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#0a7ea4',
  },
});
