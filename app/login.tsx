import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('שגיאה', 'יש להזין אימייל וסיסמה');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert('שגיאה בכניסה', error.message);
        return;
      }

      router.replace('/(tabs)');
    } catch (err) {
      console.log('Unexpected login error:', err);
      Alert.alert('שגיאה', 'אירעה שגיאה לא צפויה בכניסה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveContainer style={[styles.container, { backgroundColor: theme.offBackground }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-forward" size={28} color={theme.primary} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: theme.text }]}>טוב לראות אותך! 👋</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>התחברי כדי להמשיך בחיפוש</Text>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>אימייל</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}
              placeholder="המייל האקדמי שלך"
              placeholderTextColor={theme.tabIconDefault}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              textAlign="right"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>סיסמה</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}
              placeholder="הסיסמה שלך"
              placeholderTextColor={theme.tabIconDefault}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textAlign="right"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }, Shadow.soft, loading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'מתחברת...' : 'כניסה'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.push('/signup')} style={styles.footerLink}>
          <Text style={[styles.footerLinkText, { color: theme.muted }]}>
            עוד אין לך חשבון? <Text style={{ color: theme.primary, fontWeight: '700' }}>הצטרפי עכשיו</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Spacing.xl,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    textAlign: 'right',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'right',
    marginBottom: Spacing.xxl,
  },
  form: {
    width: '100%',
    gap: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.sm,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.xs,
    textAlign: 'right',
    marginRight: 4,
  },
  input: {
    height: 60,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    fontSize: 16,
    borderWidth: 1,
  },
  primaryButton: {
    height: 64,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
  footerLink: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    padding: Spacing.md,
  },
  footerLinkText: {
    fontSize: 15,
  },
});
