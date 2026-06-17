import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';

export default function SignupScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!username.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('שגיאה', 'יש למלא את כל השדות');
      return;
    }

    if (password.length < 6) {
      Alert.alert('שגיאה', 'הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('שגיאה', 'הסיסמאות אינן תואמות');
      return;
    }

    setLoading(true);

    try {
      const academicDomains = ['.ac.il', 'edu', '.ac.'];
      const isAcademic = academicDomains.some(domain => email.toLowerCase().endsWith(domain));
      
      if (!isAcademic) {
        Alert.alert('אימות סטודנט', 'אנא השתמשי באימייל אוניברסיטאי רשמי (המסתים ב-.ac.il)');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: username.trim(),
          },
        },
      });

      if (error) {
        Alert.alert('שגיאה בהרשמה', error.message);
        return;
      }

      router.replace('/basic-questionnaire');
    } catch (err) {
      console.log('Unexpected signup error:', err);
      Alert.alert('שגיאה', 'אירעה שגיאה לא צפויה בהרשמה');
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

        <Text style={[styles.title, { color: theme.text }]}>בואי נתחיל ✨</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>צרי חשבון כדי למצוא את ההתאמה שלך</Text>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>שם משתמש</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}
              placeholder="איך תרצי שנקרא לך?"
              placeholderTextColor={theme.tabIconDefault}
              value={username}
              onChangeText={setUsername}
              textAlign="right"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>אימייל אקדמי</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}
              placeholder="example@student.ac.il"
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
              placeholder="לפחות 6 תווים"
              placeholderTextColor={theme.tabIconDefault}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textAlign="right"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>אימות סיסמה</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}
              placeholder="הקלידי שוב את הסיסמה"
              placeholderTextColor={theme.tabIconDefault}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              textAlign="right"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }, Shadow.soft, loading && styles.disabledButton]}
            onPress={handleSignup}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'יוצר חשבון...' : 'המשך לשאלון התאמה'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.push('/login')} style={styles.footerLink}>
          <Text style={[styles.footerLinkText, { color: theme.muted }]}>
            כבר יש לך חשבון? <Text style={{ color: theme.primary, fontWeight: '700' }}>התחברי כאן</Text>
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
