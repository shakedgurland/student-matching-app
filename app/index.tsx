import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function WelcomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <ResponsiveContainer style={[styles.container, { backgroundColor: theme.offBackground }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.logo, { color: theme.primary }]}>UniMatch</Text>
          <View style={[styles.logoDot, { backgroundColor: theme.accent }]} />
        </View>

        <Text style={[styles.title, { color: theme.text }]}>התאמה סטודנטיאלית משמעותית</Text>

        <Text style={[styles.subtitle, { color: theme.muted }]}>
          מערכת חכמה שמחברת ביניכם לפי ערכים, פקולטה ומה שבאמת חשוב. 
          כי מגיע לכם להכיר באמת.
        </Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }, Shadow.soft]}
            onPress={() => router.push('/signup')}
          >
            <Text style={styles.primaryButtonText}>יצירת חשבון חדש</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => router.push('/login')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.primary }]}>כניסה לחשבון קיים</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.footer, { color: theme.tabIconDefault }]}>מיועד לסטודנטים מאומתים בלבד ✨</Text>
      </View>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.xl,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    marginBottom: Spacing.huge,
  },
  logo: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
  },
  logoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  title: {
    ...Typography.h1,
    textAlign: 'center',
    marginBottom: Spacing.md,
    lineHeight: 42,
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.huge,
    lineHeight: 26,
    paddingHorizontal: Spacing.lg,
  },
  buttonContainer: {
    width: '100%',
    gap: Spacing.md,
  },
  primaryButton: {
    width: '100%',
    height: 64,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
  secondaryButton: {
    width: '100%',
    height: 64,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  footer: {
    marginTop: Spacing.huge,
    fontSize: 14,
    fontWeight: '600',
  },
});
