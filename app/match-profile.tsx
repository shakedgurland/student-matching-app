// app/match-profile.tsx
//
// PR-MATCH-PROFILE-V1 — full-screen rich profile of the user's current
// matched peer. Entered from two places:
//   • tap on the chat header (title or avatar) — appends ?from=chat so we
//     know to phrase the CTA as a return rather than a forward navigation
//   • secondary "צפייה בפרופיל המלא" button on match-result
//
// Read-only screen. No mutations. No new RPCs. All required data is
// already permitted by existing RLS:
//   • matches SELECT — participant policy from migration 002
//   • profiles SELECT (peer) — peer-visibility policy from migration 023
//     (status IN ('active','chat_started'))
//   • profile_photos SELECT (peer) — participant policy from migration 002
//   • storage 'profile-photos' SELECT (peer) — match-status-gated policy
//     from migration 007 (active/chat_started)
//
// Terminal matches: peer profile/photo storage SELECTs return null/error
// for expired/unmatched. The screen gracefully shows a closed state with
// only the cached compatibility reasons / icebreaker from the matches
// row (which is still readable for any status).
//
// Safety:
//   • Never selects email, profile_ai_traits, raw questionnaire_answers,
//     dealbreakers, scoring internals, or any other sensitive field.
//   • Never displays message content (matches.icebreaker_hint is the
//     deterministic template output, not message text).
//   • Renders only what's in the safe SELECT list below.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { logScreenView, logError } from '@/lib/analytics';
// BATCH-C: shared Hebrew enum-to-label helper. Replaces the local
// REGION_LABELS_HE map and the previous raw-value rendering for
// university / faculty / year_of_study.
import { labelFor } from '@/lib/profile-labels';

const UI_COLORS = {
  bg: '#FFF9F6',
  primary: '#FF4D3D',
  branding: '#FF3D57',
  surface: '#FFF0EA',
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  card: '#FFFFFF',
};

// Carousel cell width = screen width minus the scroll content's horizontal
// padding (24 each side). pagingEnabled snaps to this width. Mirrors the
// pattern from app/(tabs)/my-profile.tsx — kept inline because the
// match-profile carousel is view-only (no delete/upload overlays).
const CAROUSEL_WIDTH = Dimensions.get('window').width - 48;

// PR-PREBUILD-MATCH-PRIVACY-POLISH: shorter signed-URL TTL for peer
// photos. Bounds the stale-access window if the match closes after
// URLs are minted (signed URLs are HMAC tokens; the storage layer
// doesn't re-check policy on each fetch, only on issuance). 5 min is
// comfortably longer than a typical view-and-swipe session, and the
// focus refresh below re-mints URLs every time the user returns to
// the screen — so even a long session won't show 404 holes.
const SIGNED_URL_TTL_SECONDS = 300;

// PR-PREBUILD-MATCH-PRIVACY-POLISH: minimum spacing between silent
// background refreshes. Prevents AppState transitions and focus events
// from hammering the matches/profiles/storage APIs when the user
// rapidly switches contexts (e.g., iOS notification-center peek which
// emits inactive→active twice within a second). 30s is short enough
// to catch a real status change soon after foregrounding, long enough
// to absorb UI thrash.
const REFRESH_THROTTLE_MS = 30_000;

// BATCH-C: REGION_LABELS_HE local copy removed — region is now mapped
// via labelFor('region', value) using the shared map in
// lib/profile-labels.ts. Same Hebrew strings as before; just unified
// with my-profile and match-result so the four screens that render
// peer info share a single source of label truth.

interface MatchRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  compatibility_score: number | null;
  compatibility_reasons: string[] | null;
  icebreaker_hint: string | null;
  status: string;
}

interface PeerProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  birth_year: number | null;
  university: string | null;
  faculty: string | null;
  year_of_study: string | null;
  campus: string | null;
  region: string | null;
  hobbies: string[] | null;
  bio: string | null;
  avatar_storage_path: string | null;
}

interface PhotoEntry {
  key: string;
  signedUrl: string;
}

async function signOne(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('profile-photos')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export default function MatchProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ match_id?: string; from?: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255,255,255,0.1)' : UI_COLORS.border,
    surface: isDark ? 'rgba(255, 138, 0, 0.18)' : UI_COLORS.surface,
  };

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [peer, setPeer] = useState<PeerProfile | null>(null);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const carouselRef = useRef<ScrollView>(null);
  // PR-PREBUILD-MATCH-PRIVACY-POLISH: distinguishes first focus (full
  // spinner load) from later refocuses (silent background refresh). Lets
  // useFocusEffect serve as the single source of truth for data fetching
  // without flickering the spinner every time the user pops back from
  // chat or match-result.
  const hasLoadedRef = useRef(false);
  // PR-PREBUILD-MATCH-PRIVACY-POLISH: tracks whether this screen is the
  // currently-focused route. Used by the AppState listener to skip
  // refresh when the user is on a different screen but this component
  // is still mounted underneath in the navigator stack.
  const isFocusedRef = useRef(false);
  // PR-PREBUILD-MATCH-PRIVACY-POLISH: timestamp of the last load() call.
  // Throttles focus+AppState refreshes so they don't double-fire (e.g.,
  // navigating back to the screen and then an iOS notification-center
  // peek both within a second).
  const lastRefreshAtRef = useRef(0);

  // Whether the user got here from the chat screen — drives CTA wording
  // (return vs forward) so we don't push redundant /chat onto the stack.
  const fromChat = params.from === 'chat';

  // PR-PREBUILD-MATCH-PRIVACY-POLISH: refresh on every focus, not just
  // first mount. Covers the realistic stale-state race where the user
  // pops back from chat (which may have transitioned 'active' →
  // 'chat_started' via the message-insert trigger from migration 023,
  // or where the cron job from migration 024 flipped 'active' →
  // 'expired' while the user was on chat). useFocusEffect fires on
  // initial focus AND every refocus; the hasLoadedRef gate makes the
  // initial focus show the spinner while subsequent focuses are silent.
  // The cleanup clears isFocusedRef so the AppState listener below
  // knows not to refresh when the screen is no longer the active route.
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      logScreenView('MatchProfile');
      load({ silent: hasLoadedRef.current });
      hasLoadedRef.current = true;
      return () => {
        isFocusedRef.current = false;
      };
      // load() captures its own state via setters; no cleanup needed
      // because in-flight requests complete to setters that are no-ops
      // on unmount (React handles unmounted-setState warnings as no-ops).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // PR-PREBUILD-MATCH-PRIVACY-POLISH: AppState foreground refresh.
  // Closes the gap that useFocusEffect alone can't see: user is on
  // match-profile, backgrounds the app for hours, foregrounds without
  // any navigation. Without this listener the cached state would
  // persist; the 300s URL TTL would have expired (images would 404)
  // but the peer name/age/hobbies/score badge would all still be
  // visible. Now: state becomes 'active' → if we're the focused
  // screen AND we've already done an initial load AND the throttle
  // window has elapsed → silent refresh. Subscription is mounted once
  // for the screen's lifetime and removed on unmount.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!isFocusedRef.current) return;
      if (!hasLoadedRef.current) return;
      if (Date.now() - lastRefreshAtRef.current <= REFRESH_THROTTLE_MS) return;
      load({ silent: true });
    });
    return () => sub.remove();
  }, []);

  const handleCarouselScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_WIDTH);
    setCurrentPhotoIndex(idx);
  };

  async function load(opts: { silent?: boolean } = {}): Promise<void> {
    try {
      if (!opts.silent) setLoading(true);
      setErrorMsg(null);
      // PR-PREBUILD-MATCH-PRIVACY-POLISH: stamp before the async work
      // so the throttle window starts from the call moment, not the
      // completion moment — prevents a slow load + a quick foreground
      // event from double-firing.
      lastRefreshAtRef.current = Date.now();

      const { data: userRes } = await supabase.auth.getUser();
      const me = userRes.user;
      if (!me) {
        setErrorMsg('יש להתחבר מחדש');
        return;
      }

      if (!params.match_id) {
        setErrorMsg('לא נמצאה התאמה');
        return;
      }

      const matchColumns =
        'id, user_a_id, user_b_id, compatibility_score, compatibility_reasons, icebreaker_hint, status';

      const { data: matchData, error: matchErr } = await supabase
        .from('matches')
        .select(matchColumns)
        .eq('id', params.match_id)
        .maybeSingle();

      if (matchErr) {
        logError('MatchProfile', 'load_match_failed', matchErr);
        setErrorMsg('לא ניתן לטעון את ההתאמה');
        return;
      }
      if (!matchData) {
        setErrorMsg('ההתאמה לא נמצאה');
        return;
      }
      const matchRow = matchData as MatchRow;

      // Participant gate. Defense-in-depth — RLS already restricts SELECT
      // on matches to participants, but if we somehow saw the row, refuse
      // to derive a peer from a non-participant caller.
      if (matchRow.user_a_id !== me.id && matchRow.user_b_id !== me.id) {
        setErrorMsg('אין הרשאה לצפות בהתאמה הזו');
        return;
      }
      setMatch(matchRow);

      const peerId =
        matchRow.user_a_id === me.id ? matchRow.user_b_id : matchRow.user_a_id;

      // Safe peer columns only — no email, no AI traits, no raw answers.
      const { data: peerData, error: peerErr } = await supabase
        .from('profiles')
        .select(
          'id, full_name, username, birth_year, university, faculty, year_of_study, campus, region, hobbies, bio, avatar_storage_path',
        )
        .eq('id', peerId)
        .maybeSingle();

      // peerErr / null peerData happens for terminal matches (peer-RLS
      // restricts to active/chat_started after migration 023). NOT an
      // error here — the closed-state UI renders below with the cached
      // match-row reasons/icebreaker. Log so ops can see the rate.
      if (peerErr || !peerData) {
        const matchIsTerminal =
          matchRow.status === 'expired' || matchRow.status === 'unmatched';
        if (matchIsTerminal) {
          logError(
            'MatchProfile',
            'load_peer_terminal_match',
            peerErr ?? new Error('peer hidden by RLS'),
          );
          // PR-PREBUILD-MATCH-PRIVACY-POLISH: explicit clear so a
          // refresh that discovers terminal status drops any peer data
          // cached from a previous focus (when the match was still
          // active). Without this, the closed-state render below would
          // show the previously-cached name/age/hobbies even though
          // RLS now hides those columns.
          setPeer(null);
        } else {
          logError(
            'MatchProfile',
            'load_peer_failed',
            peerErr ?? new Error('peer not found'),
          );
          setErrorMsg('לא ניתן לטעון את פרטי ההתאמה');
          return;
        }
      } else {
        setPeer(peerData as PeerProfile);
      }

      // Photos. Storage RLS (migration 007) is match-status-gated, so
      // terminal matches will produce no signed URLs even though the
      // profile_photos rows may still be SELECTable. The carousel falls
      // through to the empty-photos state automatically.
      const { data: photoRows, error: photosErr } = await supabase
        .from('profile_photos')
        .select('id, storage_path, display_order')
        .eq('user_id', peerId)
        .order('display_order', { ascending: true });

      if (photosErr) {
        logError('MatchProfile', 'load_photos_failed', photosErr);
        // Don't bail — render carousel as empty.
      }

      // BATCH-C FINAL REVISION: layered display-level dedup. TestFlight
      // build 12 reported the same uploaded photo appearing twice in
      // the carousel. There are two plausible duplication patterns —
      // both possible from the same suspected questionnaire edit-mode
      // reconciliation bug — and we now defend against both:
      //
      //   1. Same `storage_path` twice. Defensive baseline; in theory
      //      should not happen because storage paths are unique
      //      timestamp-suffixed names, but we still guard.
      //
      //   2. Same `display_order` with DIFFERENT `storage_path`. This
      //      is the practical bug pattern: a fresh upload assigned the
      //      same logical "photo slot" as an existing kept row,
      //      producing two DB rows the user sees as duplicates even
      //      though their paths differ. Without this guard, the
      //      storage_path-only dedup would let both through.
      //
      // The .order('display_order', { ascending: true }) on the query
      // means the FIRST row at any given display_order wins — which is
      // also the row with the lower DB-side `id` ordering for ties.
      // That is stable behavior across loads.
      //
      // What this preserves:
      //   - A normal user with 3 photos at display_order 0, 1, 2 all
      //     get rendered.
      //   - Different photos at different display_orders are never
      //     collapsed.
      //   - Existing on-DB dup rows for affected users (the in-the-
      //     wild reason this fix exists) render only once.
      //
      // No DB rows are deleted. No storage objects are removed. This
      // is a render-time filter only; the underlying DB is left for a
      // separate one-shot cleanup if and when product decides.
      const seenPaths = new Set<string>();
      const seenOrders = new Set<number>();
      const collected: PhotoEntry[] = [];
      for (const row of photoRows ?? []) {
        if (!row.storage_path) continue;
        if (seenPaths.has(row.storage_path)) continue;
        // Treat display_order as a logical slot identity ONLY when
        // it's a real integer. Defensive against any legacy row that
        // somehow has a null/undefined value (migration 002 sets
        // DEFAULT 0 so this shouldn't normally happen).
        if (
          typeof row.display_order === 'number' &&
          seenOrders.has(row.display_order)
        ) {
          continue;
        }
        const url = await signOne(row.storage_path);
        if (!url) continue;
        seenPaths.add(row.storage_path);
        if (typeof row.display_order === 'number') {
          seenOrders.add(row.display_order);
        }
        collected.push({ key: row.id, signedUrl: url });
      }

      // Avatar fallback. Previously fired only when collected was
      // empty; now also skips if the avatar's storage_path is already
      // represented (closes the "avatar == first photo" duplication
      // path). Keep firing only when there are zero collected photos
      // to avoid stacking the avatar on top of an already-populated
      // carousel.
      if (
        peerData?.avatar_storage_path &&
        !seenPaths.has(peerData.avatar_storage_path) &&
        collected.length === 0
      ) {
        const url = await signOne(peerData.avatar_storage_path);
        if (url) {
          seenPaths.add(peerData.avatar_storage_path);
          collected.push({ key: 'avatar', signedUrl: url });
        }
      }

      setPhotos(collected);
    } catch (e) {
      logError('MatchProfile', 'load_exception', e);
      setErrorMsg('אירעה שגיאה. נסה/י שוב מאוחר יותר.');
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }

  function goBack(): void {
    router.back();
  }

  function goToChat(): void {
    if (!match) return;
    // When opened from chat, the chat screen is already in the stack —
    // popping back is cheaper and avoids stack growth.
    if (fromChat) {
      router.back();
      return;
    }
    router.push({ pathname: '/chat' as any, params: { match_id: match.id } });
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={UI_COLORS.primary} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (errorMsg || !match) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={[styles.header, { borderBottomColor: dynamicColors.border }]}>
            <TouchableOpacity
              onPress={goBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="חזרה">
              <IconSymbol name="chevron.right" size={24} color={UI_COLORS.branding} />
            </TouchableOpacity>
            <ThemedText style={[styles.headerTitle, { color: dynamicColors.text }]}>
              פרופיל ההתאמה
            </ThemedText>
            <View style={styles.headerSpacer} />
          </View>
          <View style={[styles.center, styles.errorBody]}>
            <ThemedText style={[styles.errorTitle, { color: dynamicColors.text }]}>
              {errorMsg ?? 'לא ניתן לטעון את פרופיל ההתאמה'}
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const isClosed = match.status === 'expired' || match.status === 'unmatched';
  const isChatStarted = match.status === 'chat_started';
  const ctaLabel = fromChat
    ? 'חזרה לשיחה'
    : isChatStarted
      ? 'להמשיך לשיחה'
      : 'פתח/י צ׳אט';
  const backLabel = fromChat ? 'חזרה לשיחה' : 'חזרה';

  // Display name + initial fallback (peer may be null on terminal match).
  const displayName = (peer?.full_name || peer?.username || 'ההתאמה שלך').trim();
  const initial = (displayName.trim()[0] || '?').toUpperCase();
  const age = peer?.birth_year ? new Date().getFullYear() - peer.birth_year : null;
  const nameWithAge = age ? `${displayName}, ${age}` : displayName;
  const score = match.compatibility_score ?? null;

  // Reasons are persisted on the match row — readable for any status
  // including terminal — so we render them even when peer fetch failed.
  const reasons = Array.isArray(match.compatibility_reasons)
    ? match.compatibility_reasons.filter(
        (r) => typeof r === 'string' && r.trim().length > 0,
      )
    : [];
  const icebreaker = match.icebreaker_hint?.trim() || null;

  // BATCH-C: same pattern as match-result — pass each enum code through
  // labelFor and skip the row if it would render the "לא צוין" fallback
  // (the peer simply didn't answer this question; don't fill the card
  // with empty rows). `campus` is free-text, no labelFor needed.
  const infoRows: { label: string; value: string }[] = [];
  if (peer?.faculty) {
    const v = labelFor('faculty', peer.faculty);
    if (v && v !== 'לא צוין') infoRows.push({ label: 'פקולטה', value: v });
  }
  if (peer?.year_of_study) {
    const v = labelFor('year_of_study', peer.year_of_study);
    if (v && v !== 'לא צוין') infoRows.push({ label: 'שנה', value: v });
  }
  if (peer?.university) {
    const v = labelFor('university', peer.university);
    if (v && v !== 'לא צוין') infoRows.push({ label: 'מוסד', value: v });
  }
  if (peer?.campus) infoRows.push({ label: 'עיר', value: peer.campus });
  if (peer?.region) {
    const v = labelFor('region', peer.region);
    if (v && v !== 'לא צוין') infoRows.push({ label: 'אזור', value: v });
  }

  const hobbies = Array.isArray(peer?.hobbies)
    ? (peer?.hobbies ?? []).filter((h) => typeof h === 'string' && h.trim().length > 0)
    : [];
  const bio = peer?.bio?.trim() || null;

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: dynamicColors.border }]}>
          <TouchableOpacity
            onPress={goBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={backLabel}>
            <IconSymbol name="chevron.right" size={24} color={UI_COLORS.branding} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerTitle, { color: dynamicColors.text }]}>
            פרופיל ההתאמה
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Hero — carousel or fallback initial */}
          {photos.length > 0 ? (
            <View style={styles.carouselSection}>
              <ScrollView
                ref={carouselRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleCarouselScrollEnd}
                scrollEventThrottle={16}>
                {photos.map((p) => (
                  <View
                    key={p.key}
                    style={[styles.carouselCell, { width: CAROUSEL_WIDTH }]}>
                    <View
                      style={[
                        styles.carouselImageWrapper,
                        { borderColor: UI_COLORS.branding },
                      ]}>
                      <Image source={{ uri: p.signedUrl }} style={styles.carouselImage} />
                    </View>
                  </View>
                ))}
              </ScrollView>
              {photos.length > 1 && (
                <View style={styles.dotsRow}>
                  {photos.map((_, idx) => {
                    const activeIndex = Math.min(currentPhotoIndex, photos.length - 1);
                    const isActive = idx === activeIndex;
                    return (
                      <View
                        key={idx}
                        style={[
                          styles.dot,
                          { backgroundColor: dynamicColors.border },
                          isActive && { backgroundColor: UI_COLORS.branding, width: 20 },
                        ]}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.carouselSection}>
              <View
                style={[
                  styles.carouselCell,
                  { width: CAROUSEL_WIDTH },
                ]}>
                <View
                  style={[
                    styles.fallbackHero,
                    {
                      backgroundColor: dynamicColors.surface,
                      borderColor: UI_COLORS.branding,
                    },
                  ]}>
                  <ThemedText style={[styles.fallbackInitial, { color: UI_COLORS.branding }]}>
                    {initial}
                  </ThemedText>
                  <ThemedText style={[styles.fallbackHint, { color: dynamicColors.textLight }]}>
                    {isClosed ? 'התמונות אינן זמינות עוד' : 'אין תמונות עדיין'}
                  </ThemedText>
                </View>
              </View>
            </View>
          )}

          {/* Profile card */}
          <View
            style={[
              styles.profileCard,
              { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
            ]}>
            <View style={styles.profileHeader}>
              <ThemedText style={[styles.profileName, { color: dynamicColors.text }]}>
                {nameWithAge}
              </ThemedText>
              {score !== null && (
                <View style={[styles.scoreBadge, { backgroundColor: dynamicColors.surface }]}>
                  <ThemedText style={[styles.scoreText, { color: UI_COLORS.branding }]}>
                    {score}% התאמה
                  </ThemedText>
                </View>
              )}
            </View>

            {infoRows.length === 0 ? (
              <ThemedText style={[styles.noInfoNote, { color: dynamicColors.textLight }]}>
                {isClosed
                  ? 'פרטי הפרופיל אינם זמינים עוד.'
                  : 'פרטים נוספים יופיעו כשההתאמה תשלים את הפרופיל.'}
              </ThemedText>
            ) : (
              infoRows.map((row) => (
                <View key={row.label} style={styles.infoRow}>
                  <ThemedText style={[styles.infoLabel, { color: dynamicColors.textLight }]}>
                    {row.label}:
                  </ThemedText>
                  <ThemedText style={[styles.infoValue, { color: dynamicColors.text }]}>
                    {row.value}
                  </ThemedText>
                </View>
              ))
            )}

            {hobbies.length > 0 && (
              <View style={styles.hobbiesBlock}>
                <ThemedText style={[styles.infoLabel, { color: dynamicColors.textLight }]}>
                  תחביבים
                </ThemedText>
                <View style={styles.hobbyChips}>
                  {hobbies.map((h) => (
                    <View
                      key={h}
                      style={[
                        styles.hobbyChip,
                        {
                          backgroundColor: dynamicColors.surface,
                          borderColor: UI_COLORS.branding + '30',
                        },
                      ]}>
                      <ThemedText style={[styles.hobbyChipText, { color: UI_COLORS.branding }]}>
                        {h}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {bio && (
              <View style={styles.bioBlock}>
                <ThemedText style={[styles.infoLabel, { color: dynamicColors.textLight }]}>
                  קצת עליה/עליו
                </ThemedText>
                <ThemedText style={[styles.bioText, { color: dynamicColors.text }]}>
                  {bio}
                </ThemedText>
              </View>
            )}
          </View>

          {/* Why this is a good match */}
          <View style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>
              למה זו התאמה טובה?
            </ThemedText>
            {reasons.length > 0 ? (
              <View style={styles.bullets}>
                {reasons.map((reason, i) => (
                  <View key={i} style={styles.bulletItem}>
                    <View style={[styles.bulletDot, { backgroundColor: UI_COLORS.branding }]} />
                    <ThemedText style={[styles.bulletText, { color: dynamicColors.text }]}>
                      {reason}
                    </ThemedText>
                  </View>
                ))}
              </View>
            ) : (
              <ThemedText style={[styles.noInfoNote, { color: dynamicColors.textLight }]}>
                הסיבות יופיעו ברגע שהן יחושבו.
              </ThemedText>
            )}
          </View>

          {icebreaker && (
            <View
              style={[
                styles.icebreakerCard,
                {
                  backgroundColor: dynamicColors.surface,
                  borderColor: UI_COLORS.branding + '20',
                },
              ]}>
              <ThemedText style={[styles.icebreakerTitle, { color: UI_COLORS.branding }]}>
                שאלה לפתוח איתה שיחה
              </ThemedText>
              <ThemedText style={[styles.icebreakerText, { color: dynamicColors.text }]}>
                {icebreaker}
              </ThemedText>
            </View>
          )}

          {/* CTA */}
          {isClosed ? (
            <View
              style={[
                styles.closedCard,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
              ]}>
              <ThemedText style={[styles.closedText, { color: dynamicColors.textLight }]}>
                ההתאמה הסתיימה. ההיסטוריה נשארת לקריאה בצ׳אט.
              </ThemedText>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: UI_COLORS.primary }]}
              onPress={goToChat}
              activeOpacity={0.8}>
              <ThemedText style={styles.primaryButtonText}>{ctaLabel}</ThemedText>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headerSpacer: { width: 24 },
  errorBody: { flex: 1, padding: 24, gap: 12 },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  scrollContent: { padding: 24, paddingBottom: 60, gap: 24 },
  carouselSection: { gap: 12, marginTop: 4 },
  carouselCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselImageWrapper: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFF0EA',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  carouselImage: { width: '100%', height: '100%' },
  fallbackHero: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  fallbackInitial: { fontSize: 84, fontWeight: '800' },
  fallbackHint: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  profileCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  profileName: { fontSize: 22, fontWeight: '800' },
  scoreBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  scoreText: { fontSize: 14, fontWeight: '700' },
  noInfoNote: {
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
    fontStyle: 'italic',
  },
  // BATCH-G1: same row-reverse → row revert as match-result. JSX is
  // [Label, Value]; under RTL with `row` label pins to right, value
  // to its left. Earlier row-reverse double-flipped to LTR.
  infoRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-start' },
  infoLabel: { fontSize: 15, fontWeight: '500', textAlign: 'right', writingDirection: 'rtl' },
  infoValue: { fontSize: 15, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  hobbiesBlock: { gap: 8, marginTop: 8 },
  hobbyChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hobbyChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  hobbyChipText: { fontSize: 13, fontWeight: '700' },
  bioBlock: { gap: 6, marginTop: 8 },
  bioText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  section: { gap: 12 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  bullets: { gap: 10 },
  // BATCH-G1: JSX is [Dot, Text]; under RTL with `row` the dot sits
  // on the RIGHT and the text flows leftward — natural Hebrew bullet
  // order. Earlier row-reverse pin double-flipped to LTR layout.
  bulletItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3 },
  bulletText: {
    flex: 1,
    fontSize: 16,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
  },
  icebreakerCard: { padding: 20, borderRadius: 20, borderWidth: 1, gap: 8 },
  icebreakerTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  icebreakerText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  closedCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    alignItems: 'center',
  },
  closedText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  primaryButton: {
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
