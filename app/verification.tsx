import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

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

export default function VerificationScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();

  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
    surface: isDark ? 'rgba(255, 61, 87, 0.1)' : UI_COLORS.surface,
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.topIcon}>
              <BrandMark size={36} />
            </View>
            <View style={styles.titleContainer}>
              <ThemedText style={[styles.title, { color: dynamicColors.text }]}>
                אימות סטודנט
              </ThemedText>
              <View style={[styles.titleDot, { backgroundColor: UI_COLORS.accent }]} />
            </View>
            <ThemedText style={[styles.subtitle, { color: dynamicColors.textLight }]}>
              UniMatch מיועדת לסטודנטים וסטודנטיות בלבד. בשלב הראשון נאמת את הסטטוס שלך באמצעות מייל אוניברסיטאי.
            </ThemedText>
          </View>

          <View style={[styles.mainCard, { backgroundColor: dynamicColors.card, borderColor: UI_COLORS.primary }]}>
            <View style={styles.cardHeader}>
              <IconSymbol name="envelope.fill" size={24} color={UI_COLORS.primary} />
              <ThemedText style={[styles.cardTitle, { color: dynamicColors.text }]}>אימות עם מייל אוניברסיטאי</ThemedText>
            </View>
            <ThemedText style={[styles.cardDescription, { color: dynamicColors.textLight }]}>
              נשלח קישור אימות למייל המוסדי שלך. לאחר האימות תוכלי להמשיך לשאלון ההתאמה.
            </ThemedText>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: UI_COLORS.primary }]}
              activeOpacity={0.8}
              onPress={() => router.push('/questionnaire')}>
              <ThemedText style={styles.primaryButtonText}>שלח מייל אימות</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.futureSection}>
            <TitleWithDot color={UI_COLORS.premium} text="אפשרויות אימות נוספות בהמשך" />
            
            <View style={[styles.disabledCard, { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}>
              <View style={styles.cardHeader}>
                <IconSymbol name="person.text.rectangle.fill" size={20} color={dynamicColors.textLight} />
                <ThemedText style={[styles.disabledCardTitle, { color: dynamicColors.textLight }]}>תעודת סטודנט / אישור לימודים</ThemedText>
              </View>
              <ThemedText style={[styles.disabledCardDescription, { color: dynamicColors.textLight }]}>
                בשלב מתקדם יותר ניתן יהיה לאמת סטטוס סטודנט גם באמצעות מסמך לימודים.
              </ThemedText>
            </View>

            <View style={[styles.disabledCard, { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}>
              <View style={styles.cardHeader}>
                <IconSymbol name="checkmark.shield.fill" size={20} color={dynamicColors.textLight} />
                <ThemedText style={[styles.disabledCardTitle, { color: dynamicColors.textLight }]}>בדיקה ידנית</ThemedText>
              </View>
              <ThemedText style={[styles.disabledCardDescription, { color: dynamicColors.textLight }]}>
                למקרים שבהם אין מייל מוסדי או שהאימות לא הצליח.
              </ThemedText>
            </View>
          </View>

          <View style={styles.privacySection}>
            <View style={styles.privacyContent}>
               <View style={[styles.badgeDot, { backgroundColor: UI_COLORS.accent }]} />
               <ThemedText style={[styles.privacyNote, { color: dynamicColors.textLight }]}>
                האימות נועד לשמור על קהילה סטודנטיאלית בטוחה.
              </ThemedText>
            </View>
          </View>
          
          <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}>
              <ThemedText style={[styles.backButtonText, { color: UI_COLORS.text }]}>
                חזרה
              </ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const TitleWithDot = ({ text, color }: { text: string, color: string }) => (
  <View style={styles.sectionTitleContainer}>
    <ThemedText style={[styles.sectionTitle, { color: UI_COLORS.text }]}>{text}</ThemedText>
    <View style={[styles.trustDot, { backgroundColor: color }]} />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 40,
    gap: 32,
  },
  header: {
    gap: 12,
    paddingTop: 20,
  },
  topIcon: {
    marginBottom: 4,
  },
  titleContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
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
  mainCard: {
    borderRadius: 20,
    padding: 24,
    gap: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'right',
  },
  cardDescription: {
    fontSize: 15,
    textAlign: 'right',
    lineHeight: 22,
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
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
  futureSection: {
    gap: 16,
  },
  sectionTitleContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'right',
  },
  trustDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  disabledCard: {
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
  },
  disabledCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
  },
  disabledCardDescription: {
    fontSize: 13,
    textAlign: 'right',
    lineHeight: 18,
  },
  privacySection: {
    marginTop: 8,
    alignItems: 'center',
  },
  privacyContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  privacyNote: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  backButton: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});