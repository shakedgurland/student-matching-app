import { useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
// PR #66 — shared 3-card content. Same source of truth as
// app/how-it-works.tsx so the first-launch onboarding and the
// Settings explainer cannot drift apart.
import {
  HOW_IT_WORKS_STEPS,
  HOW_IT_WORKS_TAGLINE,
} from '@/constants/howItWorksContent';

// Design Constants for Bright Premium Style
const UI_COLORS = {
  bg: '#FFF9F6',
  primary: '#FF4D3D', // Solid vivid red-coral for CTAs
  accent: '#FF8A00', // Small spark accent
  branding: '#FF3D57', // Main branding color
  surface: '#FFF0EA', // Soft romantic surface
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  card: '#FFFFFF',
};

// PR #66 — pager snaps to full screen width. Same pattern as
// app/how-it-works.tsx so the two surfaces feel identical to the user.
const SCREEN_WIDTH = Dimensions.get('window').width;

const BrandMark = ({ size = 40, showSpark = true }: { size?: number; showSpark?: boolean }) => {
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
        borderColor: UI_COLORS.branding,
        borderTopWidth: 0,
      }}>
        {/* Magnet Poles */}
        <View style={{
          position: 'absolute',
          top: -strokeWidth / 2,
          left: -strokeWidth,
          width: strokeWidth,
          height: strokeWidth,
          backgroundColor: UI_COLORS.branding,
          borderTopLeftRadius: strokeWidth * 0.2,
          borderTopRightRadius: strokeWidth * 0.2,
        }} />
        <View style={{
          position: 'absolute',
          top: -strokeWidth / 2,
          right: -strokeWidth,
          width: strokeWidth,
          height: strokeWidth,
          backgroundColor: UI_COLORS.branding,
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
          shadowOpacity: 0.6,
          shadowRadius: 8,
          elevation: 4,
        }} />
      )}
    </View>
  );
};

export default function WelcomeScreen() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(Math.max(0, Math.min(HOW_IT_WORKS_STEPS.length - 1, idx)));
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: UI_COLORS.bg }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Header — compact brand mark + name. Smaller than the legacy
            hero so the explainer pager can dominate the screen. */}
        <View style={styles.header}>
          <BrandMark size={36} />
          <ThemedText style={[styles.appName, { color: UI_COLORS.branding }]}>
            UniMatch
          </ThemedText>
        </View>

        {/* Tagline badge — frames the product before the cards. */}
        <View style={[styles.badge, { backgroundColor: UI_COLORS.surface, borderColor: UI_COLORS.branding + '20' }]}>
          <ThemedText style={[styles.badgeText, { color: UI_COLORS.branding }]}>
            {HOW_IT_WORKS_TAGLINE}
          </ThemedText>
        </View>

        {/* PR #66 — 3-card horizontal pager mirroring app/how-it-works.tsx.
            Same content (HOW_IT_WORKS_STEPS), same card shape, same RTL
            behavior. Pager flex:1 so it fills the available vertical
            space between badge and bottom action area. */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          style={styles.scroller}
          contentContainerStyle={styles.scrollerContent}>
          {HOW_IT_WORKS_STEPS.map((step) => (
            <View key={step.number} style={[styles.cardCell, { width: SCREEN_WIDTH }]}>
              <View style={[styles.card, { backgroundColor: UI_COLORS.card, borderColor: UI_COLORS.border }]}>
                <View style={[styles.emojiCircle, { backgroundColor: UI_COLORS.surface }]}>
                  <ThemedText style={styles.emoji}>{step.emoji}</ThemedText>
                </View>
                <ThemedText style={[styles.stepLabel, { color: UI_COLORS.branding }]}>
                  שלב {step.number}
                </ThemedText>
                <ThemedText style={[styles.cardTitle, { color: UI_COLORS.text }]}>
                  {step.title}
                </ThemedText>
                <ThemedText style={[styles.cardBody, { color: UI_COLORS.textLight }]}>
                  {step.body}
                </ThemedText>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Pagination dots — centered iOS convention. */}
        <View style={styles.dotsRow}>
          {HOW_IT_WORKS_STEPS.map((_, i) => {
            const isActive = i === currentIndex;
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: UI_COLORS.border },
                  isActive && { backgroundColor: UI_COLORS.branding, width: 24 },
                ]}
              />
            );
          })}
        </View>

        {/* Auth actions — signup primary, login secondary. Routing
            preserved verbatim from the previous welcome screen. */}
        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: UI_COLORS.primary }]}
            activeOpacity={0.85}
            onPress={() => router.push('/signup')}>
            <ThemedText style={styles.primaryButtonText}>הרשמה</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: UI_COLORS.border, backgroundColor: '#FFFFFF' }]}
            onPress={() => router.push('/login')}>
            <ThemedText style={[styles.secondaryButtonText, { color: UI_COLORS.text }]}>
              כבר יש לי חשבון
            </ThemedText>
          </TouchableOpacity>

          <View style={styles.trustSection}>
            <View style={[styles.trustDot, { backgroundColor: UI_COLORS.branding }]} />
            <ThemedText style={[styles.trustNote, { color: UI_COLORS.textLight }]}>
              מיועד לסטודנטים מאומתים בלבד
            </ThemedText>
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Header — compact, top-centered. Brand mark + name only; the
  // big hero headline + subtitle are replaced by the explainer pager
  // below so the screen feels like the new product, not a marketing
  // intro that hides what the app does.
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  // Tagline badge — PR #66: pulled from constants/howItWorksContent so
  // it stays consistent if wording changes. Replaces the old static
  // "התאמה משמעותית אחת בכל פעם" with a sharper product framing.
  badge: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.2,
    marginTop: 8,
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  // Pager fills the middle of the screen. Same approach as
  // app/how-it-works.tsx so both surfaces feel identical.
  scroller: { flex: 1 },
  scrollerContent: { alignItems: 'stretch' },
  cardCell: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    justifyContent: 'flex-start',
  },
  // Card — same shape/feel as how-it-works. flex:1 lets it stretch to
  // fill the cardCell so the screen doesn't have a tiny floating card.
  // alignItems:'center' keeps the emoji circle centered as a hero; text
  // styles below override with alignSelf:'stretch' + textAlign right
  // so Hebrew text right-anchors inside the card.
  card: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 3,
  },
  emojiCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  emoji: {
    fontSize: 38,
    lineHeight: 46,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // Bottom action area — signup primary, login secondary, trust note.
  // Trust note moved from absolute-positioned to inline so the layout
  // uses normal flex flow and never overlaps the buttons on small phones.
  buttonSection: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  primaryButton: {
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF4D3D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
    writingDirection: 'rtl',
  },
  secondaryButton: {
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    writingDirection: 'rtl',
  },
  trustSection: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  trustDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  trustNote: {
    fontSize: 12,
    fontWeight: '500',
  },
});
