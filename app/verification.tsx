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

// Design Constants for Premium UniMatch Style
const UI_COLORS = {
  bg: '#FAFBFC',
  primary: '#2EC4B6',
  secondary: '#3D348B',
  accent: '#FF6B6B',
  text: '#172033',
  textLight: '#667085',
  border: '#E7ECF2',
  card: '#FFFFFF',
  softBg: '#F3F7F8',
};

export default function VerificationScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();

  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#0F172A' : UI_COLORS.bg,
    card: isDark ? '#1E293B' : UI_COLORS.card,
    text: isDark ? '#F1F5F9' : UI_COLORS.text,
    textLight: isDark ? '#94A3B8' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
    softBg: isDark ? 'rgba(46, 196, 182, 0.1)' : UI_COLORS.softBg,
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <ThemedText style={[styles.title, { color: dynamicColors.text }]}>
              אימות סטודנט
            </ThemedText>
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
            <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>אפשרויות אימות נוספות בהמשך</ThemedText>
            
            <View style={[styles.disabledCard, { backgroundColor: dynamicColors.card, borderColor: UI_COLORS.border }]}>
              <View style={styles.cardHeader}>
                <IconSymbol name="person.text.rectangle.fill" size={20} color={dynamicColors.textLight} />
                <ThemedText style={[styles.disabledCardTitle, { color: dynamicColors.textLight }]}>תעודת סטודנט / אישור לימודים</ThemedText>
              </View>
              <ThemedText style={[styles.disabledCardDescription, { color: dynamicColors.textLight }]}>
                בשלב מתקדם יותר ניתן יהיה לאמת סטטוס סטודנט גם באמצעות מסמך לימודים.
              </ThemedText>
            </View>

            <View style={[styles.disabledCard, { backgroundColor: dynamicColors.card, borderColor: UI_COLORS.border }]}>
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
            <ThemedText style={[styles.privacyNote, { color: dynamicColors.textLight }]}>
              האימות נועד לשמור על קהילה סטודנטיאלית בטוחה. מידע רגיש לא יוצג למשתמשים אחרים.
            </ThemedText>
          </View>
          
          <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}>
              <ThemedText style={[styles.backButtonText, { color: UI_COLORS.secondary }]}>
                חזרה
              </ThemedText>
          </TouchableOpacity>
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
    paddingTop: 40,
    gap: 32,
  },
  header: {
    gap: 12,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'right',
    letterSpacing: -0.5,
    lineHeight: 36,
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 4,
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