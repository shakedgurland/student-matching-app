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
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function VerificationScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              אימות סטודנט
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              UniMatch מיועדת לסטודנטים וסטודנטיות בלבד. בשלב הראשון נאמת את הסטטוס שלך באמצעות מייל אוניברסיטאי.
            </ThemedText>
          </View>

          <View style={styles.mainCard}>
            <View style={styles.cardHeader}>
              <IconSymbol name="envelope.fill" size={24} color={Colors[colorScheme].tint} />
              <ThemedText style={styles.cardTitle}>אימות עם מייל אוניברסיטאי</ThemedText>
            </View>
            <ThemedText style={styles.cardDescription}>
              נשלח קישור אימות למייל המוסדי שלך. לאחר האימות תוכלי להמשיך לשאלון ההתאמה.
            </ThemedText>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: Colors[colorScheme].tint }]}
              activeOpacity={0.8}
              onPress={() => console.log('Send verification email')}>
              <ThemedText style={styles.primaryButtonText}>שלח מייל אימות</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.futureSection}>
            <ThemedText style={styles.sectionTitle}>אפשרויות אימות נוספות בהמשך</ThemedText>
            
            <View style={styles.disabledCard}>
              <View style={styles.cardHeader}>
                <IconSymbol name="person.text.rectangle.fill" size={20} color="#999" />
                <ThemedText style={styles.disabledCardTitle}>תעודת סטודנט / אישור לימודים</ThemedText>
              </View>
              <ThemedText style={styles.disabledCardDescription}>
                בשלב מתקדם יותר ניתן יהיה לאמת סטטוס סטודנט גם באמצעות מסמך לימודים.
              </ThemedText>
            </View>

            <View style={styles.disabledCard}>
              <View style={styles.cardHeader}>
                <IconSymbol name="checkmark.shield.fill" size={20} color="#999" />
                <ThemedText style={styles.disabledCardTitle}>בדיקה ידנית</ThemedText>
              </View>
              <ThemedText style={styles.disabledCardDescription}>
                למקרים שבהם אין מייל מוסדי או שהאימות לא הצליח.
              </ThemedText>
            </View>
          </View>

          <View style={styles.privacySection}>
            <ThemedText style={styles.privacyNote}>
              האימות נועד לשמור על קהילה סטודנטיאלית בטוחה. מידע רגיש לא יוצג למשתמשים אחרים.
            </ThemedText>
          </View>
          
          <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}>
              <ThemedText type="defaultSemiBold" style={styles.backButtonText}>
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
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 18,
    opacity: 0.7,
    textAlign: 'right',
    lineHeight: 26,
  },
  mainCard: {
    backgroundColor: 'rgba(10, 126, 164, 0.05)',
    borderRadius: 24,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(10, 126, 164, 0.2)',
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'right',
  },
  cardDescription: {
    fontSize: 16,
    opacity: 0.8,
    textAlign: 'right',
    lineHeight: 22,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  futureSection: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 4,
  },
  disabledCard: {
    backgroundColor: 'rgba(153, 153, 153, 0.05)',
    borderRadius: 20,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(153, 153, 153, 0.1)',
  },
  disabledCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    textAlign: 'right',
  },
  disabledCardDescription: {
    fontSize: 14,
    color: '#888',
    textAlign: 'right',
    lineHeight: 20,
  },
  privacySection: {
    marginTop: 8,
  },
  privacyNote: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
    lineHeight: 20,
  },
  backButton: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#0a7ea4',
  },
});
