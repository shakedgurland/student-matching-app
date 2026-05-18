import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Design Constants for Bright Premium Style
const UI_COLORS = {
  bg: '#FFF9F6',
  primary: '#FF4D3D', // Solid vivid red-coral
  accent: '#FF8A00', // Small spark accent
  branding: '#FF3D57', // Main branding color
  surface: '#FFF0EA', // Soft romantic surface
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  card: '#FFFFFF',
};

const ConnectionVisual = () => {
  return (
    <View style={styles.matchVisual}>
      {/* Current User Avatar */}
      <View style={[styles.avatarCircle, { backgroundColor: UI_COLORS.surface, borderColor: UI_COLORS.branding }]}>
        <ThemedText style={[styles.avatarInitial, { color: UI_COLORS.branding }]}>ש</ThemedText>
      </View>
      
      {/* Small Warm Spark in Middle */}
      <View style={styles.sparkContainer}>
         <View style={[styles.sparkDot, { backgroundColor: UI_COLORS.accent }]} />
         <View style={[styles.sparkLine, { backgroundColor: UI_COLORS.accent + '40' }]} />
      </View>

      {/* Matched User Avatar */}
      <View style={[styles.avatarCircle, { backgroundColor: UI_COLORS.surface, borderColor: UI_COLORS.accent }]}>
        <ThemedText style={[styles.avatarInitial, { color: UI_COLORS.accent }]}>נ</ThemedText>
      </View>
    </View>
  );
};

export default function ActiveMatchScreen() {
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

  const openChat = () => {
    Alert.alert('בהכנה', 'מסך הצ׳אט ייבנה בשלב הבא');
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
             <ThemedText style={[styles.preTitle, { color: UI_COLORS.branding }]}>ההתאמה פעילה</ThemedText>
             <ThemedText style={[styles.title, { color: dynamicColors.text }]}>נועה מחכה לשיחה שלך</ThemedText>
             <ThemedText style={[styles.subtitle, { color: dynamicColors.textLight }]}>
               יש לך 72 שעות להתחיל שיחה לפני שההתאמה תפוג.
             </ThemedText>
          </View>

          <ConnectionVisual />

          {/* Timer Card */}
          <View style={[styles.card, { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}>
            <ThemedText style={[styles.cardTitle, { color: dynamicColors.text }]}>נותר זמן להתחיל שיחה</ThemedText>
            <View style={styles.timerContainer}>
              <ThemedText style={[styles.timerText, { color: UI_COLORS.primary }]}>71:59:32</ThemedText>
            </View>
            <ThemedText style={[styles.timerNote, { color: dynamicColors.textLight }]}>
              הטיימר יוצג באופן אמיתי לאחר חיבור לשרת.
            </ThemedText>
          </View>

          {/* Conversation Starter Card */}
          <View style={[styles.card, { backgroundColor: UI_COLORS.surface, borderColor: UI_COLORS.branding + '20' }]}>
            <View style={styles.starterHeader}>
              <View style={[styles.sparkDot, { backgroundColor: UI_COLORS.accent, width: 8, height: 8 }]} />
              <ThemedText style={[styles.cardTitle, { color: UI_COLORS.branding }]}>שאלת פתיחה מומלצת</ThemedText>
            </View>
            <ThemedText style={[styles.starterText, { color: UI_COLORS.text }]}>
              נועה כתבה שהיא כבר בוחרת שיר בקריוקי. אולי להתחיל ב: איזה שיר היית בוחרת לדואט
            </ThemedText>
          </View>

          <View style={styles.actions}>
             <TouchableOpacity 
               style={[styles.primaryButton, { backgroundColor: UI_COLORS.primary }]}
               onPress={openChat}
               activeOpacity={0.8}>
               <ThemedText style={styles.primaryButtonText}>פתח/י צ׳אט</ThemedText>
             </TouchableOpacity>

             <TouchableOpacity 
               style={styles.secondaryButton}
               onPress={() => router.back()}>
               <ThemedText style={[styles.secondaryButtonText, { color: dynamicColors.textLight }]}>אני צריכ/ה עוד רגע</ThemedText>
             </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
    gap: 32,
  },
  header: {
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  preTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  matchVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginVertical: 10,
  },
  avatarCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  avatarInitial: {
    fontSize: 52,
    fontWeight: '800',
  },
  sparkContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    zIndex: 1,
  },
  sparkLine: {
    position: 'absolute',
    width: 40,
    height: 2,
    borderRadius: 1,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    gap: 12,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  timerContainer: {
    paddingVertical: 8,
  },
  timerText: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  timerNote: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.7,
  },
  starterHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  starterText: {
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '500',
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF4D3D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
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