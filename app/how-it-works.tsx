import React, { useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  Dimensions,
  I18nManager,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
// PR #66 — shared 3-card content. Same source of truth as
// app/welcome.tsx so onboarding and how-it-works can't drift.
// PR-LONG-COPY: also import the headline tagline + subtitle so this
// screen shows the EXACT same hero text as welcome.tsx — no
// drift between the two surfaces.
import {
  HOW_IT_WORKS_STEPS,
  HOW_IT_WORKS_SUBTITLE,
  HOW_IT_WORKS_TAGLINE,
} from '@/constants/howItWorksContent';

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

// PR #66 — STEPS imported from constants/howItWorksContent.ts so this
// screen and welcome.tsx render the exact same explainer. The Step type
// was simplified there: body is now required (no bullet branch).
const STEPS = HOW_IT_WORKS_STEPS;

export default function HowItWorksScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const isDark = colorScheme === 'dark';
  // Build-#30-QA-hotfix — read I18nManager.isRTL at render time so the
  // header row (back-button + title + trailing spacer) and the footer
  // row (privacy / separator / terms) produce the same physical layout
  // regardless of whether `forceRTL(true)` (called once on first
  // launch in app/_layout.tsx) has actually taken effect at layout
  // time. Without this, a `flexDirection: 'row'` row that DEPENDED on
  // the auto-flip rendered LTR on the first session and the back
  // chevron appeared on the LEFT (wrong for a Hebrew RTL screen) and
  // privacy/terms order flipped. See JSX inline for explicit
  // flexDirection choice.
  const isRTL = I18nManager.isRTL;

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
        {/* Build-#30-QA-hotfix — inline flexDirection. Under isRTL active
            'row' lays right-to-left so the back button (first child)
            sits on the right; under !isRTL 'row-reverse' achieves the
            same physical layout by reversing LTR. Identical visual
            order in both states: back-on-right, title-centered,
            spacer-on-left. */}
        <View style={[styles.header, { borderBottomColor: dynamicColors.border, flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
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

        {/* PR-LONG-COPY: headline + subtitle block under the iOS
            screen header. Same strings rendered by app/welcome.tsx so
            the two surfaces show identical hero text. The iOS-style
            screen header above ("איך זה עובד?") stays for navigation;
            the headline below it is the product positioning. */}
        <View style={styles.heroBlock}>
          <View style={[styles.heroBadge, { backgroundColor: dynamicColors.surface, borderColor: UI_COLORS.branding + '20' }]}>
            <ThemedText style={[styles.heroBadgeText, { color: UI_COLORS.branding }]}>
              {HOW_IT_WORKS_TAGLINE}
            </ThemedText>
          </View>
          <ThemedText style={[styles.heroSubtitle, { color: dynamicColors.textLight }]}>
            {HOW_IT_WORKS_SUBTITLE}
          </ThemedText>
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
          {STEPS.map((step) => {
            // Dark-mode tints: tone the per-card accent down so the
            // bright peach/coral/cream don't fight a dark card surface.
            // Light mode uses the warm tint verbatim from constants.
            const iconBg = isDark
              ? 'rgba(255, 138, 0, 0.18)'
              : step.accentSurface;
            return (
              <View key={step.number} style={[styles.cardCell, { width: SCREEN_WIDTH }]}>
                <View
                  style={[
                    styles.card,
                    { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                  ]}
                >
                  {/* Per-card warm tinted icon circle. Same icon set as
                      app/welcome.tsx so onboarding and "איך זה עובד"
                      stay visually identical. */}
                  <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
                    <IconSymbol name={step.iconName} size={40} color={UI_COLORS.branding} />
                  </View>

                  <ThemedText style={[styles.stepLabel, { color: UI_COLORS.branding }]}>
                    שלב {step.number}
                  </ThemedText>

                  <ThemedText style={[styles.title, { color: dynamicColors.text }]}>
                    {step.title}
                  </ThemedText>

                  <ThemedText style={[styles.body, { color: dynamicColors.textLight }]}>
                    {step.body}
                  </ThemedText>
                </View>
              </View>
            );
          })}
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

        {/* Build-#30-QA-hotfix — inline flexDirection so the [privacy,
            separator, terms] order renders consistently as
            [privacy-right, separator-middle, terms-left] under both
            RTL-effective and pre-flip states. */}
        <View style={[styles.footer, { borderTopColor: dynamicColors.border, flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
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
  // PR-RTL-POLISH (preserved): textAlign 'center' so the title sits
  // optically centered between the back chevron and the matching-width
  // spacer (standard iOS Hebrew header).
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  headerSpacer: { width: 24 },
  // PR-LONG-COPY: hero block sits between the iOS header and the
  // pager. Same content as welcome.tsx so the two surfaces present
  // the identical hero. Center-aligned because it's product-level
  // framing, not in-card prose — the cards themselves still
  // right-align their Hebrew text via per-style overrides.
  heroBlock: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 4,
    alignItems: 'center',
    gap: 8,
  },
  heroBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.2,
  },
  heroBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  scroller: { flex: 1 },
  scrollerContent: { alignItems: 'stretch' },
  // PR #66 — full-screen card feel. cardCell + card both flex:1 so the
  // card fills the available area between header and pagination dots
  // instead of floating near the top with empty space below. Tightened
  // paddings give the card more width without losing screen-edge margin.
  cardCell: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    justifyContent: 'flex-start',
  },
  // PR-RTL-POLISH (preserved): card.alignItems stays 'center' — the
  // emoji circle inherits center (premium hero). Text styles below
  // (stepLabel/title/body) override with alignSelf:'stretch' +
  // textAlign:'right' so Hebrew text right-anchors. Net: centered hero
  // + right-anchored Hebrew block.
  // PR #66 — card.flex:1 so it stretches to fill the cardCell. Padding
  // 24→28 + gap 12→16 so the larger card breathes with the new content.
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
  // Renamed from emojiCircle — now hosts an SF Symbol via IconSymbol.
  // Per-card accent surface is supplied inline (peach / coral / cream)
  // for a happy summery progression across the pager.
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  // PR-RTL-POLISH (preserved): right-aligned + stretched to span card width.
  stepLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingHorizontal: 8,
    alignSelf: 'stretch',
  },
  body: {
    fontSize: 16,
    lineHeight: 26,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  // PR #66 — removed unused bullet styles. All cards now render body only.
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
