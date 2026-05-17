import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Design Constants for Premium UniMatch Style
const UI_COLORS = {
  bg: '#FCFCFD',
  primary: '#2EC4B6', // Main brand color (Turquoise)
  accent: '#FF7A6B', // Emotional accent (Coral)
  secondary: '#5B4DFF', // Premium Branding accent (Indigo)
  text: '#172033',
  textLight: '#667085',
  border: '#E7EAF0',
};

const BrandMark = ({ size = 48, showSpark = true }: { size?: number, showSpark?: boolean }) => {
  const strokeWidth = size * 0.2;
  const innerSize = size - strokeWidth;
  const sparkSize = size * 0.14;

  return (
    <View style={{ width: size, height: size + strokeWidth, justifyContent: 'flex-end', alignItems: 'center' }}>
      {/* Geometric Rounded U / Magnet Shape */}
      <View style={{
        width: innerSize,
        height: innerSize,
        borderBottomLeftRadius: innerSize / 2,
        borderBottomRightRadius: innerSize / 2,
        borderWidth: strokeWidth,
        borderColor: UI_COLORS.secondary, // Using Indigo for the magnet base
        borderTopWidth: 0,
      }}>
        {/* Magnet Poles */}
        <View style={{
          position: 'absolute',
          top: -strokeWidth/2,
          left: -strokeWidth,
          width: strokeWidth,
          height: strokeWidth,
          backgroundColor: UI_COLORS.secondary,
          borderTopLeftRadius: strokeWidth * 0.2,
          borderTopRightRadius: strokeWidth * 0.2,
        }} />
        <View style={{
          position: 'absolute',
          top: -strokeWidth/2,
          right: -strokeWidth,
          width: strokeWidth,
          height: strokeWidth,
          backgroundColor: UI_COLORS.secondary,
          borderTopLeftRadius: strokeWidth * 0.2,
          borderTopRightRadius: strokeWidth * 0.2,
        }} />
      </View>

      {/* Connection spark between poles */}
      {showSpark && (
        <View style={{
          position: 'absolute',
          top: 0,
          width: sparkSize,
          height: sparkSize,
          borderRadius: sparkSize / 2,
          backgroundColor: UI_COLORS.accent,
          shadowColor: UI_COLORS.accent,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.4,
          shadowRadius: 6,
          elevation: 2,
        }} />
      )}
    </View>
  );
};

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <ThemedView style={[styles.container, { backgroundColor: UI_COLORS.bg }]}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <BrandMark size={56} />
          <ThemedText style={[styles.appName, { color: UI_COLORS.text }]}>
            UniMatch
          </ThemedText>
        </View>

        <View style={styles.textSection}>
          <View style={[styles.badge, { backgroundColor: UI_COLORS.accent + '15', borderColor: UI_COLORS.accent + '30' }]}>
            <ThemedText style={[styles.badgeText, { color: UI_COLORS.accent }]}>התאמה משמעותית אחת בכל פעם</ThemedText>
          </View>
          
          <ThemedText style={[styles.headline, { color: UI_COLORS.text }]}>
            החיבור הסטודנטיאלי שלך מתחיל כאן
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
            style={[styles.secondaryButton, { borderColor: UI_COLORS.border, borderWidth: 1, backgroundColor: '#FFF' }]}>
            <ThemedText style={[styles.secondaryButtonText, { color: UI_COLORS.text }]}>
              כבר יש לי חשבון
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.trustSection}>
          <View style={[styles.trustDot, { backgroundColor: UI_COLORS.primary }]} />
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
  logoContainer: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 32,
  },
  appName: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 40,
    textAlign: 'center',
  },
  textSection: {
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '800',
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