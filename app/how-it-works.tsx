import React, { useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

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
};

// Pager snaps to full screen width. Cards are full-width cells with internal padding.
const SCREEN_WIDTH = Dimensions.get('window').width;

type Step = {
  emoji: string;
  number: string;
  title: string;
  body?: string;
  bullets?: string[];
};

const STEPS: Step[] = [
  {
    emoji: '📝',
    number: '1',
    title: 'עונים על שאלון עומק',
    body:
      'השאלון שלנו עוזר לנו להבין מה באמת חשוב לך: סגנון תקשורת, קצב בקשר, ערכים וציפיות. השאלות בנויות סביב עקרונות מוכרים ממחקרי תקשורת וזוגיות — כדי שההתאמה תהיה מבוססת על הבנה אמיתית, לא רק על תמונות.',
  },
  {
    emoji: '🎯',
    number: '2',
    title: 'מקבלים התאמה אחת איכותית',
    body:
      'במקום תור אינסופי של פרופילים, מופיעה לך התאמה אחת בכל פעם — מי שהאלגוריתם מצא כהכי מתאים עבורך כרגע. זה מאפשר להכיר את האדם שלפניך באמת, במקום להחליק על מאות פרופילים.',
  },
  {
    emoji: '💬',
    number: '3',
    title: 'נותנים לזה צ׳אנס אמיתי',
    bullets: [
      'ברגע שיש התאמה — אפשר לפתוח שיחה ולהכיר.',
      'אם לא תתחיל/י שיחה תוך 72 שעות, ההתאמה תיסגר ונציע לך את הבאה.',
      'עד 5 התאמות בחודש — כי אנחנו מאמינים בקצב איטי ומכוון, לא בהחלקה מהירה.',
    ],
  },
];

export default function HowItWorksScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const isDark = colorScheme === 'dark';

  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255,255,255,0.1)' : UI_COLORS.border,
    surface: isDark ? 'rgba(255, 138, 0, 0.18)' : UI_COLORS.surface,
  };

  const [currentIndex, setCurrentIndex] = useState(0);

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(Math.max(0, Math.min(STEPS.length - 1, idx)));
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: dynamicColors.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="חזרה"
          >
            <IconSymbol name="chevron.right" size={24} color={UI_COLORS.branding} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerTitle, { color: dynamicColors.text }]}>
            איך זה עובד?
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          style={styles.scroller}
          contentContainerStyle={styles.scrollerContent}
        >
          {STEPS.map((step) => (
            <View key={step.number} style={[styles.cardCell, { width: SCREEN_WIDTH }]}>
              <View
                style={[
                  styles.card,
                  { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                ]}
              >
                <View style={[styles.emojiCircle, { backgroundColor: dynamicColors.surface }]}>
                  <ThemedText style={styles.emoji}>{step.emoji}</ThemedText>
                </View>

                <ThemedText style={[styles.stepLabel, { color: UI_COLORS.branding }]}>
                  שלב {step.number}
                </ThemedText>

                <ThemedText style={[styles.title, { color: dynamicColors.text }]}>
                  {step.title}
                </ThemedText>

                {step.body && (
                  <ThemedText style={[styles.body, { color: dynamicColors.textLight }]}>
                    {step.body}
                  </ThemedText>
                )}

                {step.bullets && (
                  <View style={styles.bullets}>
                    {step.bullets.map((b, i) => (
                      <View key={i} style={styles.bulletRow}>
                        <View style={[styles.bulletDot, { backgroundColor: UI_COLORS.accent }]} />
                        <ThemedText style={[styles.bulletText, { color: dynamicColors.text }]}>
                          {b}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => {
            const isActive = i === currentIndex;
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: dynamicColors.border },
                  isActive && { backgroundColor: UI_COLORS.branding, width: 24 },
                ]}
              />
            );
          })}
        </View>

        <View style={[styles.footer, { borderTopColor: dynamicColors.border }]}>
          <TouchableOpacity
            onPress={() => router.push('/privacy-policy' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ThemedText style={[styles.footerLink, { color: UI_COLORS.branding }]}>
              מדיניות פרטיות
            </ThemedText>
          </TouchableOpacity>
          <View style={[styles.footerSeparator, { backgroundColor: dynamicColors.border }]} />
          <TouchableOpacity
            onPress={() => router.push('/terms-of-use' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ThemedText style={[styles.footerLink, { color: UI_COLORS.branding }]}>
              תנאי שימוש
            </ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  // PR-RTL-POLISH: textAlign 'right' → 'center'. The previous right-
  // alignment pinned the title against the back chevron (chevron on the
  // physical right under RTL + title right-aligned in the flex:1 middle
  // container = title visually crowding the chevron). Centering matches
  // the standard iOS Hebrew header pattern (chevron right, title
  // optically centered between chevron and matching-width spacer).
  // flex: 1 + matching headerSpacer width: 24 stay, so the title
  // centers in the row.
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  headerSpacer: { width: 24 },
  scroller: { flex: 1 },
  scrollerContent: { alignItems: 'stretch' },
  cardCell: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 16,
    justifyContent: 'flex-start',
  },
  // PR-RTL-POLISH: alignItems 'center' → 'flex-start'. Under forceRTL,
  // flex-start on the cross axis is the physical RIGHT, so every direct
  // child of the card pins to the right unless it overrides alignSelf.
  // This removes the "centered English layout" feel: the emoji circle
  // now sits top-right (the natural Hebrew reading-entry point) instead
  // of as a centered hero. Text items (stepLabel/title/body/bullets)
  // already have alignSelf:'stretch' so they remain full-width and
  // their textAlign:'right' continues to right-anchor the text inside.
  // BATCH-G1 (preserved): restrained polish — padding 28→24, gap 14→12.
  // Shadow stays at premium-soft 0.06.
  card: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    alignItems: 'flex-start',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  // BATCH-G1: emoji circle 96→80, emoji 52→42. Original size read as
  // a hero illustration; smaller circle balances the now-right-aligned
  // title and leaves room for the body without scrolling on small
  // iPhones. Still a clear visual anchor.
  emojiCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  emoji: {
    fontSize: 42,
    lineHeight: 50,
  },
  // PR #59 → PR-RTL-POLISH: stepLabel kept at textAlign:'right'. With
  // the parent card now using alignItems:'flex-start' (physical right
  // under RTL), the emoji also right-anchors and the entire card
  // content reads as one cohesive Hebrew block from the right edge.
  // alignSelf:'stretch' kept so the label spans the full card width
  // (otherwise it would shrink to content width and sit against the
  // card's flex-start right edge — visually identical for short labels
  // but worse for long-form variants).
  // BATCH-G1 (preserved): letterSpacing 1 → 0.5. Wider tracking felt
  // marketing-poster heavy; 0.5 keeps the all-caps rhythm without
  // shouting.
  stepLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  // BATCH-G1: title switched from centered to right-aligned.
  // TestFlight build 14 review found that a centered Hebrew title
  // above a right-aligned body created visual whiplash — the eye
  // jumped from a centered headline to a right-anchored paragraph.
  // Right-aligning both pins them to the same axis and reads as a
  // cohesive Hebrew block. Small badge ("שלב N") stays centered
  // as the visual anchor / step indicator.
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingHorizontal: 8,
    alignSelf: 'stretch',
  },
  // BATCH-C: body now stretches full card width. Previously the card's
  // alignItems: 'center' collapsed the body into a content-width
  // centered box, so the right-aligned text appeared to "float" in
  // the middle of the card instead of pinning to its right edge.
  body: {
    fontSize: 16,
    lineHeight: 26,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  bullets: {
    gap: 12,
    alignSelf: 'stretch',
    marginTop: 4,
  },
  // BATCH-G1: TestFlight build 14 showed bullet dots on the LEFT of
  // each bullet — wrong for Hebrew. JSX is [Dot, Text]; under RTL
  // with `row` the first JSX child (Dot) sits on the RIGHT and the
  // text flows leftward from it — natural Hebrew reading order.
  // The earlier row-reverse pin double-flipped it back to LTR.
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  footerSeparator: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
