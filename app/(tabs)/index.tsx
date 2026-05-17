import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function WelcomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="title" style={styles.appName}>
          UniMatch
        </ThemedText>

        <View style={styles.textSection}>
          <ThemedText type="title" style={styles.headline}>
            ההתאמה הסטודנטיאלית שלך מתחילה כאן
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            מערכת התאמה חכמה שמחברת בין סטודנטים וסטודנטיות לפי תחומי עניין, ערכים, פקולטה ומה שבאמת חשוב.
          </ThemedText>
        </View>

        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: Colors[colorScheme].tint }]}
            activeOpacity={0.8}
            onPress={() => router.push('/signup')}>
            <ThemedText style={styles.primaryButtonText}>התחל התאמה</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton}>
            <ThemedText type="defaultSemiBold" style={styles.secondaryButtonText}>
              כבר יש לי חשבון
            </ThemedText>
          </TouchableOpacity>
        </View>

        <ThemedText style={styles.trustNote}>מיועד לסטודנטים מאומתים בלבד</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 48,
  },
  appName: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
    color: '#0a7ea4',
  },
  textSection: {
    alignItems: 'center',
    gap: 16,
  },
  headline: {
    textAlign: 'center',
    fontSize: 32,
    lineHeight: 40,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 26,
    opacity: 0.7,
  },
  buttonSection: {
    width: '100%',
    gap: 16,
    marginTop: 20,
  },
  primaryButton: {
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  secondaryButton: {
    height: 56,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 18,
  },
  trustNote: {
    fontSize: 14,
    opacity: 0.5,
    position: 'absolute',
    bottom: 40,
    textAlign: 'center',
  },
});
