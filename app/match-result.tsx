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
  premium: '#7C3AED', // Secondary Premium Accent
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
      <View style={[styles.avatarCircle, { backgroundColor: UI_COLORS.surface, borderColor: UI_COLORS.premium }]}>
        <ThemedText style={[styles.avatarInitial, { color: UI_COLORS.premium }]}>נ</ThemedText>
      </View>
    </View>
  );
};

export default function MatchResultScreen() {
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

  const startChat = () => {
    router.push('/chat');
  };

  const nextMatch = () => {
    Alert.alert(
      'התאמה הבאה',
      'בגרסה האמיתית נציג כאן את ההתאמה הבאה עם הציון הגבוה ביותר, עד 5 התאמות בחודש.'
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
             <ThemedText style={[styles.preTitle, { color: UI_COLORS.branding }]}>ההתאמה שלך מוכנה</ThemedText>
             <ThemedText style={[styles.title, { color: dynamicColors.text }]}>מצאנו התאמה שיכולה להיות מעניינת עבורך</ThemedText>
          </View>

          <ConnectionVisual />

          <View style={[styles.profileCard, { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}>
            <View style={styles.profileHeader}>
              <ThemedText style={[styles.profileName, { color: dynamicColors.text }]}>נועה, 23</ThemedText>
              <View style={[styles.scoreBadge, { backgroundColor: UI_COLORS.surface }]}>
                <ThemedText style={[styles.scoreText, { color: UI_COLORS.branding }]}>87% התאמה</ThemedText>
              </View>
            </View>
            
            <View style={styles.infoRow}>
              <ThemedText style={[styles.infoLabel, { color: dynamicColors.textLight }]}>פקולטה:</ThemedText>
              <ThemedText style={[styles.infoValue, { color: dynamicColors.text }]}>מנהל עסקים</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText style={[styles.infoLabel, { color: dynamicColors.textLight }]}>שנה:</ThemedText>
              <ThemedText style={[styles.infoValue, { color: dynamicColors.text }]}>שנה ב׳</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText style={[styles.infoLabel, { color: dynamicColors.textLight }]}>קמפוס:</ThemedText>
              <ThemedText style={[styles.infoValue, { color: dynamicColors.text }]}>הר הצופים</ThemedText>
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>למה זו התאמה טובה</ThemedText>
            <View style={styles.bullets}>
               {[
                 'שניכם מחפשים חיבור שמתפתח בלי לחץ',
                 'סימנתם כנות והומור כערכים חשובים',
                 'שניכם מעדיפים להתחיל בשיחה קלילה לפני מפגש',
                 'יש לכם פתיחות להכיר אנשים מפקולטות אחרות',
               ].map((bullet, idx) => (
                 <View key={idx} style={styles.bulletItem}>
                    <View style={[styles.bulletDot, { backgroundColor: UI_COLORS.branding }]} />
                    <ThemedText style={[styles.bulletText, { color: dynamicColors.text }]}>{bullet}</ThemedText>
                 </View>
               ))}
            </View>
          </View>

          <View style={[styles.comparisonBox, { backgroundColor: UI_COLORS.surface, borderColor: UI_COLORS.branding + '20' }]}>
             <ThemedText style={[styles.comparisonTitle, { color: UI_COLORS.branding }]}>משהו קטן שכבר אפשר לפתוח איתו שיחה</ThemedText>
             <ThemedText style={[styles.comparisonText, { color: UI_COLORS.text }]}>
               "את/ה כתבת שבקריוקי תעלה/י רק אם עוד מישהו מצטרף. נועה כתבה שהיא כבר בוחרת שיר. אולי זו התחלה טובה לדואט"
             </ThemedText>
          </View>

          <View style={styles.ruleBox}>
             <ThemedText style={[styles.ruleText, { color: dynamicColors.textLight }]}>
               אם תבחר/י לא להתחיל שיחה, נציג לך את ההתאמה הבאה לפי הציון — עד 5 התאמות בחודש.
             </ThemedText>
          </View>

          <View style={styles.actions}>
             <TouchableOpacity 
               style={[styles.primaryButton, { backgroundColor: UI_COLORS.primary }]}
               onPress={startChat}
               activeOpacity={0.8}>
               <ThemedText style={styles.primaryButtonText}>התחל/י שיחה</ThemedText>
             </TouchableOpacity>

             <TouchableOpacity 
               style={styles.secondaryButton}
               onPress={nextMatch}>
               <ThemedText style={[styles.secondaryButtonText, { color: dynamicColors.textLight }]}>הבא/י לי התאמה אחרת</ThemedText>
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
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 34,
  },
  matchVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginVertical: 10,
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
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
    fontSize: 48,
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
  profileCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
  },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'right',
  },
  bullets: {
    gap: 12,
  },
  bulletItem: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 16,
    textAlign: 'right',
    lineHeight: 22,
  },
  comparisonBox: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
  },
  comparisonTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  comparisonText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'right',
    opacity: 0.9,
  },
  ruleBox: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  ruleText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF4D3D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
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