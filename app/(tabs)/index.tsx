import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Design Constants for Premium UniMatch Style
const UI_COLORS = {
  bg: '#FAFBFC',
  primary: '#2EC4B6',
  secondary: '#3D348B',
  accent: '#FF6B6B',
  text: '#172033',
  textLight: '#667085',
  border: '#E7ECF2',
};

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <ThemedView style={[styles.container, { backgroundColor: UI_COLORS.bg }]}>
      <View style={styles.content}>
        <ThemedText style={[styles.appName, { color: UI_COLORS.primary }]}>
          UniMatch
        </ThemedText>

        <View style={styles.textSection}>
          <ThemedText style={[styles.headline, { color: UI_COLORS.text }]}>
            ההתאמה הסטודנטיאלית שלך מתחילה כאן
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: UI_COLORS.textLight }]}>
            מערכת התאמה חכמה שמחברת בין סטודנטים וסטודנטיות לפי תחומי עניין, ערכים, פקולטה ומה שבאמת חשוב.
          </ThemedText>
        </View>

        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: UI_COLORS.primary }]}
            activeOpacity={0.8}
            onPress={() => router.push('/signup')}>
            <ThemedText style={styles.primaryButtonText}>התחלת התאמה</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.secondaryButton, { borderColor: UI_COLORS.border, borderWidth: 1 }]}>
            <ThemedText style={[styles.secondaryButtonText, { color: UI_COLORS.secondary }]}>
              כבר יש לי חשבון
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.trustSection}>
          <View style={[styles.trustDot, { backgroundColor: UI_COLORS.accent }]} />
          <ThemedText style={[styles.trustNote, { color: UI_COLORS.textLight }]}>מיועד לסטודנטים מאומתים בלבד</ThemedText>
        </View>
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
    gap: 40,
  },
  appName: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  textSection: {
    alignItems: 'center',
    gap: 16,
  },
  headline: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  buttonSection: {
    width: '100%',
    gap: 12,
    marginTop: 10,
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
    fontSize: 17,
    fontWeight: '600',
  },
  trustSection: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    position: 'absolute',
    bottom: 50,
  },
  trustDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  trustNote: {
    fontSize: 13,
    fontWeight: '500',
  },
});