import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { findAndCreateBestMatch } from '@/lib/matching';
import { logScreenView, logEvent, logError } from '@/lib/analytics';

// Design Constants
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

export default function MatchSelectionScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<any>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  // Set to true when the backend returns { status: 'monthly_cap_reached' }.
  // Drives the empty-state copy so the user sees a clear cap message instead
  // of a "still searching..." text that would never resolve. Reset on every
  // fetchCurrentMatch so a returning user (new month / new session) sees the
  // default empty state again.
  const [capReached, setCapReached] = useState(false);

  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
  };

  useEffect(() => {
    logScreenView('Home');
    fetchCurrentMatch();
  }, []);

  const fetchCurrentMatch = async () => {
    try {
      setLoading(true);
      setCapReached(false);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch active match
      const { data: matches, error } = await supabase
        .from('matches')
        .select('*')
        .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (matches && matches.length > 0) {
        const match = matches[0];
        setCurrentMatch(match);

        // Fetch other user profile — minimal column set; never select email
        // or other sensitive fields. Matched-peer SELECT access is granted
        // by the policy from migration 020.
        const otherUserId = match.user_a_id === user.id ? match.user_b_id : match.user_a_id;
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, avatar_storage_path')
          .eq('id', otherUserId)
          .single();

        if (profileError) throw profileError;

        // Generate signed URL for avatar if storage_path exists
        let avatarUrl = profile.avatar_url;
        if (profile.avatar_storage_path) {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('profile-photos')
            .createSignedUrl(profile.avatar_storage_path, 3600);
          if (!signedError) {
            avatarUrl = signedData.signedUrl;
          }
        }

        setOtherUser({ ...profile, avatar_url: avatarUrl });
      } else {
        // Automatically try to find a match if none exists
        handleFindMatch(user.id, true);
      }
    } catch (error) {
      console.error('Error fetching match:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFindMatch = async (userId?: string, silent: boolean = false) => {
    try {
      setMatching(true);
      logEvent('match_search_started');
      const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id;
      if (!targetUserId) return;

      const newMatch = await findAndCreateBestMatch(targetUserId);

      if (newMatch && 'matchId' in newMatch) {
        // Success path: backend returned 'created' and lib/matching loaded
        // the candidate profile. Sign the avatar URL for the carousel and
        // render the match card.
        logEvent('match_found', { metadata: { matchId: newMatch.matchId, score: newMatch.compatibilityScore } });
        let candidateProfile = newMatch.candidateProfile;

        if (candidateProfile.avatar_storage_path) {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('profile-photos')
            .createSignedUrl(candidateProfile.avatar_storage_path, 3600);
          if (!signedError) {
            candidateProfile = { ...candidateProfile, avatar_url: signedData.signedUrl };
          }
        }

        setCurrentMatch({
          id: newMatch.matchId,
          compatibility_score: newMatch.compatibilityScore,
          compatibility_reasons: newMatch.compatibilityReasons,
        });
        setOtherUser(candidateProfile);
        return;
      }

      if (newMatch && 'status' in newMatch) {
        logEvent('match_not_found', { metadata: { reason: newMatch.status } });
        switch (newMatch.status) {
          case 'no_candidate':
            // Legitimate empty state — default empty-state copy already
            // covers this. No Alert.
            break;
          case 'monthly_cap_reached':
            // Drives the cap-aware empty-state copy below.
            setCapReached(true);
            break;
          case 'already_has_active':
            // Caller already has an active match (shouldn't normally fire
            // because fetchCurrentMatch would have shown it). Re-fetch as
            // a safety net so the user sees the existing one.
            fetchCurrentMatch();
            break;
          case 'incomplete_profile':
            if (!silent) {
              Alert.alert('פרופיל לא הושלם', 'יש להשלים את השאלון כדי לקבל התאמות.');
            }
            break;
          case 'unauthorized':
            if (!silent) {
              Alert.alert('שגיאת זיהוי', 'אנא היכנס/י מחדש.');
            }
            break;
          case 'error':
            if (!silent) {
              Alert.alert('שגיאה', 'אירעה שגיאה. נסה/י שוב מאוחר יותר.');
            }
            break;
        }
        return;
      }

      // Defensive: malformed response shape. Should not happen with the
      // current Edge Function contract.
      logEvent('match_not_found');
      if (!silent) {
        Alert.alert('שגיאה', 'אירעה שגיאה. נסה/י שוב מאוחר יותר.');
      }
    } catch (error) {
      logError('Home', 'match_search_failed', error);
      console.error('Error in finding match:', error);
    } finally {
      setMatching(false);
    }
  };

  const handleStartChat = () => {
    if (!currentMatch?.id) return;
    router.push({ pathname: '/match-result', params: { match_id: currentMatch.id } });
  };

  const handleProfile = () => {
    router.push('/(tabs)/my-profile');
  };

  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={UI_COLORS.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleProfile}>
               <IconSymbol name="person.crop.circle" size={32} color={UI_COLORS.branding} />
            </TouchableOpacity>
            <ThemedText style={[styles.logo, { color: UI_COLORS.branding }]}>UniMatch</ThemedText>
            <View style={{ width: 32 }} />
          </View>

          {currentMatch && otherUser ? (
            <View style={styles.matchCardContainer}>
              <View style={[styles.card, { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}>
                <ThemedText style={[styles.cardLabel, { color: UI_COLORS.branding }]}>התאמה פעילה</ThemedText>
                <ThemedText style={[styles.cardTitle, { color: dynamicColors.text }]}>הכירו את {otherUser.full_name || otherUser.username || 'ההתאמה שלך'}</ThemedText>
                
                <View style={styles.visualContainer}>
                   <View style={[styles.avatarPlaceholder, { borderColor: UI_COLORS.branding }]}>
                      {otherUser.avatar_url ? (
                        <Image source={{ uri: otherUser.avatar_url }} style={styles.avatarImage} />
                      ) : (
                        <ThemedText style={styles.avatarText}>{(otherUser.full_name || otherUser.username || '?')[0]}</ThemedText>
                      )}
                   </View>
                </View>

                <ThemedText style={[styles.matchScore, { color: UI_COLORS.primary }]}>
                   {currentMatch.compatibility_score}% התאמה
                </ThemedText>

                <TouchableOpacity 
                  style={[styles.primaryButton, { backgroundColor: UI_COLORS.primary }]}
                  onPress={handleStartChat}>
                  <ThemedText style={styles.primaryButtonText}>צפייה בהתאמה</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <IconSymbol name="sparkles" size={64} color={UI_COLORS.accent} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: dynamicColors.text }]}>
                {capReached ? 'הגעת ל-5 ההתאמות החודשיות' : 'עדיין לא מצאנו לך התאמה'}
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: dynamicColors.textLight }]}>
                {capReached
                  ? 'בתחילת החודש הבא נוכל להציע לך התאמות חדשות.'
                  : 'כרגע אין מספיק משתמשים שעומדים בהעדפות שלך. כשיצטרפו משתמשים מתאימים, נוכל להציע לך התאמה חדשה.'}
              </ThemedText>
            </View>
          )}

          <View style={styles.tipContainer}>
             <ThemedText style={[styles.tipTitle, { color: dynamicColors.text }]}>טיפ קטן</ThemedText>
             <ThemedText style={[styles.tipText, { color: dynamicColors.textLight }]}>
               פרופיל עם תמונה וביו מעניין מקבל התאמות מדויקות יותר. כדאי לוודא שהפרופיל שלך מעודכן!
             </ThemedText>
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
    gap: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
  },
  logo: {
    fontSize: 24,
    fontWeight: '900',
  },
  matchCardContainer: {
    marginTop: 20,
  },
  card: {
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  visualContainer: {
    marginVertical: 10,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF0EA',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FF3D57',
  },
  matchScore: {
    fontSize: 18,
    fontWeight: '700',
  },
  primaryButton: {
    width: '100%',
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 20,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF0EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  outlineButton: {
    paddingHorizontal: 24,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tipContainer: {
    marginTop: 20,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    gap: 8,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  tipText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
