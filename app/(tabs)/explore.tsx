import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { findPotentialMatches, recordMatch } from '@/lib/matching';
import { supabase } from '@/lib/supabase';

export default function MatchTabScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const [loading, setLoading] = useState(false);

  const handleFindMatch = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('שגיאה', 'אנא התחברי כדי למצוא התאמות');
        return;
      }

      // Check for active match first
      const { data: activeMatch } = await supabase
        .from('user_matches')
        .select('candidate_id, score')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (activeMatch) {
        router.push({
          pathname: '/active-match',
          params: { id: activeMatch.candidate_id }
        });
        return;
      }

      // If no active match, find new ones
      const matches = await findPotentialMatches(user.id);

      if (matches.length === 0) {
        Alert.alert('מצטערים', 'לא מצאנו התאמות חדשות כרגע. נסי שוב מאוחר יותר או עדכני את הפרופיל שלך!');
        return;
      }

      // Take the best match
      const bestMatch = matches[0];
      
      // Record as shown
      await recordMatch(user.id, bestMatch.profile.id, bestMatch.score, 'shown');

      // Redirect to results
      router.push({
        pathname: '/match-result',
        params: { 
          id: bestMatch.profile.id,
          score: bestMatch.score.toString()
        }
      });

    } catch (err: any) {
      console.error(err);
      Alert.alert('שגיאה', 'אירעה שגיאה בחיפוש התאמות');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveContainer style={[styles.container, { backgroundColor: theme.offBackground }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.logo, { color: theme.primary }]}>UniMatch</Text>

        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: theme.secondary }]}>
            {loading ? (
              <ActivityIndicator size="large" color={theme.primary} />
            ) : (
              <Ionicons name="sparkles" size={48} color={theme.primary} />
            )}
          </View>

          <Text style={[styles.title, { color: theme.text }]}>
            {loading ? 'מחפשים את ההתאמה המושלמת...' : 'מחפשים לך את ההתאמה הבאה'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            המערכת שלנו עוברת על כל הסטודנטים כדי למצוא את מי שבאמת מתאים לערכים ולשאיפות שלך. ✨
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }, Shadow.soft, loading && { opacity: 0.7 }]}
            onPress={handleFindMatch}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'מחפש...' : 'בדקי אם יש התאמה'}
            </Text>
          </TouchableOpacity>
        </View>

        {!loading && <Text style={[styles.footer, { color: theme.tabIconDefault }]}>נשארו לך 5 התאמות החודש ✨</Text>}
      </ScrollView>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: Spacing.huge,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: Spacing.md,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h2,
    textAlign: 'center',
    marginBottom: Spacing.md,
    lineHeight: 34,
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.huge,
  },
  primaryButton: {
    height: 64,
    borderRadius: BorderRadius.xl,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
  footer: {
    marginTop: Spacing.huge,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});
