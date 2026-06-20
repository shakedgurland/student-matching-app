import React, { useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { 
  submitMatchFeedback, 
  FeedbackStage, 
  OutcomeStatus, 
  PositiveReason, 
  NegativeReason 
} from '@/lib/feedback';

const UI_COLORS = {
  bg: '#FFF9F6',
  primary: '#FF4D3D',
  accent: '#FF8A00',
  branding: '#FF3D57',
  surface: '#FFF0EA',
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  card: '#FFFFFF',
  success: '#12B76A',
};

const POSITIVE_OPTIONS: { label: string; value: PositiveReason }[] = [
  { label: 'השיחה זרמה', value: 'good_conversation' },
  { label: 'היה עניין הדדי', value: 'mutual_interest' },
  { label: 'הייתה כימיה', value: 'chemistry' },
  { label: 'הרגשתי בנוח', value: 'comfortable' },
  { label: 'ערכים דומים', value: 'shared_values' },
  { label: 'הכוונה בקשר דומה', value: 'similar_intent' },
  { label: 'סגנון התקשורת התאים', value: 'communication_style_fit' },
  { label: 'היה רצון להמשיך', value: 'wanted_to_continue' },
];

const NEGATIVE_OPTIONS: { label: string; value: NegativeReason }[] = [
  { label: 'השיחה לא התפתחה', value: 'conversation_did_not_develop' },
  { label: 'לא הייתה מספיק יוזמה', value: 'not_enough_initiative' },
  { label: 'לא הייתה כימיה', value: 'no_chemistry' },
  { label: 'לא הייתה מספיק משיכה', value: 'not_enough_attraction' },
  { label: 'נראה/תה שונה מהתמונות', value: 'looked_different_from_photos' },
  { label: 'הכוונה בקשר לא התאימה', value: 'different_intent' },
  { label: 'הקצב לא התאים', value: 'pace_mismatch' },
  { label: 'סגנון התקשורת לא התאים', value: 'communication_mismatch' },
  { label: 'פער באורח חיים', value: 'lifestyle_mismatch' },
  { label: 'מרחק/אזור', value: 'distance_or_region' },
  { label: 'אחד הצדדים היה עסוק', value: 'busy' },
  { label: 'הייתה היכרות אחרת', value: 'other_connection' },
  { label: 'לא היה מספיק עניין', value: 'not_interested_enough' },
  { label: 'אחר', value: 'other' },
];

const OUTCOME_OPTIONS: { label: string; value: OutcomeStatus }[] = [
  { label: 'עדיין מדברים', value: 'still_chatting' },
  { label: 'קבענו דייט', value: 'date_planned' },
  { label: 'נפגשנו', value: 'date_happened' },
  { label: 'זה המשיך', value: 'continued' },
  { label: 'זה הסתיים', value: 'ended' },
  { label: 'לא התקדם', value: 'no_progress' },
  { label: 'לא היה מספיק עניין', value: 'not_interested' },
  { label: 'הייתה היכרות אחרת', value: 'other_connection' },
  { label: 'הייתי/הייתי עסוק/ה', value: 'busy' },
  { label: 'אחר', value: 'other' },
];

export default function MatchFeedbackScreen() {
  const router = useRouter();
  const { matchId, stage } = useLocalSearchParams<{ matchId: string; stage: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  const [rating, setRating] = useState<number | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<OutcomeStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
  };

  const toggleReason = (value: string) => {
    if (selectedReasons.includes(value)) {
      setSelectedReasons(prev => prev.filter(r => r !== value));
    } else {
      setSelectedReasons(prev => [...prev, value]);
    }
  };

  const handleSubmit = async () => {
    if (!matchId) return;

    setSubmitting(true);
    const result = await submitMatchFeedback({
      match_id: matchId,
      feedback_stage: (stage as FeedbackStage) || 'ended',
      rating: rating || undefined,
      outcome_status: outcome || undefined,
      positive_reasons: rating && rating >= 4 ? (selectedReasons as PositiveReason[]) : [],
      negative_reasons: rating && rating <= 3 ? (selectedReasons as NegativeReason[]) : [],
    });

    setSubmitting(false);

    if (result.success) {
      Alert.alert('תודה!', 'המשוב שלך נשמר באופן פרטי. תודה שהקדשת רגע.', [
        { text: 'חזרה', onPress: () => router.back() }
      ]);
    } else {
      Alert.alert('שגיאה', 'לא הצלחנו לשמור את המשוב. נסה שוב מאוחר יותר.');
    }
  };

  const renderRatingStars = () => (
    <View style={styles.ratingContainer}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => {
            setRating(star);
            setSelectedReasons([]);
          }}
          style={styles.starButton}
        >
          <ThemedText style={[
            styles.starText,
            { color: rating && rating >= star ? UI_COLORS.accent : dynamicColors.border }
          ]}>
            ★
          </ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ 
        headerShown: true, 
        title: 'משוב על התאמה',
        headerTitleAlign: 'center',
        headerTintColor: UI_COLORS.branding,
        headerBackTitle: 'חזור',
      }} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <ThemedText style={[styles.title, { color: dynamicColors.text }]}>איך ההתאמה הייתה עד עכשיו</ThemedText>
            <ThemedText style={[styles.subtitle, { color: dynamicColors.textLight }]}>
              המידע נשמר למערכת בלבד, כדי שנוכל לשפר התאמות עתידיות.
            </ThemedText>
          </View>

          <View style={styles.section}>
            {renderRatingStars()}
          </View>

          {rating !== null && (
            <View style={styles.section}>
              <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>
                {rating >= 4 ? 'מה עבד טוב?' : 'מה פחות התאים?'}
              </ThemedText>
              <View style={styles.chipContainer}>
                {(rating >= 4 ? POSITIVE_OPTIONS : NEGATIVE_OPTIONS).map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.chip,
                      { borderColor: dynamicColors.border },
                      selectedReasons.includes(opt.value) && { backgroundColor: UI_COLORS.surface, borderColor: UI_COLORS.branding }
                    ]}
                    onPress={() => toggleReason(opt.value)}
                  >
                    <ThemedText style={[
                      styles.chipText,
                      { color: dynamicColors.text },
                      selectedReasons.includes(opt.value) && { color: UI_COLORS.branding, fontWeight: '700' }
                    ]}>
                      {opt.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>מה הסטטוס הנוכחי?</ThemedText>
            <View style={styles.chipContainer}>
              {OUTCOME_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.chip,
                    { borderColor: dynamicColors.border },
                    outcome === opt.value && { backgroundColor: UI_COLORS.surface, borderColor: UI_COLORS.branding }
                  ]}
                  onPress={() => setOutcome(opt.value)}
                >
                  <ThemedText style={[
                    styles.chipText,
                    { color: dynamicColors.text },
                    outcome === opt.value && { color: UI_COLORS.branding, fontWeight: '700' }
                  ]}>
                    {opt.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: UI_COLORS.primary },
                (!rating && !outcome) && { opacity: 0.5 }
              ]}
              onPress={handleSubmit}
              disabled={submitting || (!rating && !outcome)}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>שליחה</ThemedText>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.back()}
              disabled={submitting}
            >
              <ThemedText style={[styles.secondaryButtonText, { color: dynamicColors.textLight }]}>דילוג</ThemedText>
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
    paddingBottom: 40,
    gap: 32,
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.8,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ratingContainer: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: 12,
  },
  starButton: {
    padding: 4,
  },
  starText: {
    fontSize: 48,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
  },
  actions: {
    gap: 12,
    marginTop: 16,
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
