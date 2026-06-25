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

// PR #64 — unified Step shape: every card has emoji + number + title + body.
// Bullet rendering was removed when card 3 switched from a list to a single
// paragraph; the simpler shape makes the three cards visually consistent and
// reduces JSX/style surface area.
type Step = {
  emoji: string;
  number: string;
  title: string;
  body: string;
};

// PR #64 — content refreshed to reflect the new "אני פנוי/ה להכיר" opt-in
// model. Card 1 stays on the questionnaire (lightly tightened). Card 2 is
// rewritten end-to-end — the old "we send you one quality match" copy
// implied passive auto-matching; new copy explains the explicit opt-in.
// Card 3 is rewritten — the old bullet list (72h window + 5/month) was
// process-heavy; new copy reads as a calm promise about timing instead of
// a rules list.
const STEPS: Step[] = [
  {
    emoji: '📝',
    number: '1',
    title: 'עונים על שאלון עומק',
    body:
      'השאלון עוזר לנו להבין מה באמת חשוב לך: סגנון תקשורת, קצב בקשר, ערכים וציפיות — כדי שההתאמה תהיה מבוססת על חיבור אמיתי, לא רק על תמונות.',
  },
  {
    emoji: '🎯',
    number: '2',
    title: 'מסמנים כשפנויים להכיר',
    body:
      'ב־UniMatch לא מקבלים עוד התאמה בלחיצה. כשאת/ה באמת פנוי/ה להכיר, מסמנים את זה — ואנחנו נחפש התאמה אחת איכותית ב־3 הימים הקרובים.',
  },
  {
    emoji: '💬',
    number: '3',
    title: 'התאמה אחת, בזמן הנכון',
    body:
      'כשנמצאת התאמה מתאימה, נפתח לכם חלון להתחיל שיחה. אם השיחה לא מתחילה בזמן, ההתאמה נסגרת — כדי לשמור על חוויה מכוונת ולא עמוסה.',
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

                {/* PR #64 — body is now always present (no bullet branch). */}
                <ThemedText style={[styles.body, { color: dynamicColors.textLight }]}>
                  {step.body}
                </ThemedText>
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
  // PR #64 — tightened paddings + flex:1 on the cardCell so the card below
  // can stretch to fill the available vertical space. Previously the card
  // floated near the top with a lot of empty space below, especially on
  // tall iPhones — the user reported it looking "small / lost in the
  // middle". Reduced horizontal/top/bottom padding gives the card more
  // surface area without losing margin away from screen edges.
  cardCell: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    justifyContent: 'flex-start',
  },
  // PR-RTL-POLISH (preserved): card.alignItems stays at 'center' so the
  // emoji circle remains a centered visual hero. Text right-anchoring is
  // achieved INDEPENDENTLY of this value: every text style below
  // (stepLabel / title / body) sets its own alignSelf:'stretch' +
  // textAlign:'right' + writingDirection:'rtl', which overrides the
  // card's cross-axis alignment for those children.
  //   * emoji circle → centered (no alignSelf override; inherits 'center')
  //   * stepLabel / title / body → stretched full-width, text right-aligned
  // PR #64 — card.flex:1 so the card stretches to fill the cardCell's
  // available height (cardCell is now also flex:1). Padding bumped 24→28
  // and gap 12→16 so the now-larger card breathes with the new content.
  // Shadow kept at premium-soft 0.06; border + radius unchanged.
  card: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 16,
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
  // PR #59 → PR-RTL-POLISH (final): stepLabel uses
  // alignSelf:'stretch' + textAlign:'right'. The stretch overrides the
  // card's alignItems:'center', so the label spans full card width and
  // the text right-aligns inside it. This pattern is repeated on title,
  // body, and bulletText — every text element opts out of the card's
  // center alignment in favor of its own right-anchored stretch. That
  // way the emoji circle (no alignSelf) stays centered as a premium
  // hero while the Hebrew reading flow runs cleanly from the right.
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
  // PR #64 — removed unused bullet styles (bullets, bulletRow, bulletDot,
  // bulletText) since card 3 no longer uses a bullet list. All three
  // cards now render the same body-text shape.
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
