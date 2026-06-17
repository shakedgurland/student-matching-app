import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, ActivityIndicator, Image } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { recordMatch } from '@/lib/matching';

export default function MatchResultScreen() {
  const { id, score } = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  
  const [candidate, setCandidate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCandidate = async () => {
      if (!id) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single();
        
        if (error) throw error;
        setCandidate(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchCandidate();
  }, [id]);

  const handleActivateMatch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !id) return;

      await recordMatch(user.id, id as string, parseInt(score as string), 'active');
      router.push({
        pathname: '/active-match',
        params: { id }
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <ResponsiveContainer style={[styles.container, { backgroundColor: theme.offBackground, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ResponsiveContainer>
    );
  }

  if (!candidate) {
    return (
      <ResponsiveContainer style={[styles.container, { backgroundColor: theme.offBackground, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.title, { color: theme.text }]}>אופס!</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>לא הצלחנו למצוא את פרטי ההתאמה.</Text>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.primary, width: '80%' }]} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>חזרה</Text>
        </TouchableOpacity>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer style={[styles.container, { backgroundColor: theme.offBackground }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-forward" size={28} color={theme.primary} />
          </TouchableOpacity>
          <Text style={[styles.logo, { color: theme.primary }]}>UniMatch</Text>
          <View style={{ width: 28 }} />
        </View>

        <Text style={[styles.title, { color: theme.text }]}>מצאנו לך התאמה! ✨</Text>

        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }, Shadow.medium]}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            {candidate.profile_image ? (
              <Image source={{ uri: candidate.profile_image }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{candidate.username?.charAt(0) || '?'}</Text>
            )}
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{candidate.username}, {candidate.age}</Text>
          <Text style={[styles.details, { color: theme.muted }]}>סטודנט/ית ל{candidate.field_of_study}</Text>
          
          <View style={[styles.matchBadge, { backgroundColor: theme.secondary }]}>
            <Text style={[styles.matchText, { color: theme.primary }]}>{score}% התאמה ✨</Text>
          </View>

          <Text style={[styles.bio, { color: theme.text }]}>
            מחפש/ת: {candidate.intent}
          </Text>

          <View style={[styles.tagsRow, { borderTopColor: theme.secondary }]}>
            {candidate.hobbies?.slice(0, 3).map((tag: string) => (
              <View key={tag} style={[styles.tag, { backgroundColor: theme.offBackground }]}>
                <Text style={[styles.tagText, { color: theme.primary }]}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }, Shadow.soft]}
            onPress={handleActivateMatch}
          >
            <Text style={styles.primaryButtonText}>מעבר להתאמה שלי</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: theme.primary }]}
            onPress={() => router.replace('/basic-questionnaire')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.primary }]}>עדכון העדפות</Text>
          </TouchableOpacity>
        </View>
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
    paddingTop: Spacing.sm,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  backButton: {
    padding: 4,
  },
  logo: {
    fontSize: 22,
    fontWeight: '900',
  },
  title: {
    ...Typography.h2,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  card: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    width: '100%',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: 'white',
    fontSize: 52,
    fontWeight: '800',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 2,
  },
  details: {
    fontSize: 17,
    marginBottom: Spacing.md,
  },
  matchBadge: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
  },
  matchText: {
    fontWeight: '800',
    fontSize: 16,
  },
  bio: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  tagsRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.sm,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    width: '100%',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  tag: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
  },
  tagText: {
    fontWeight: '800',
    fontSize: 13,
  },
  buttonContainer: {
    width: '100%',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
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
  secondaryButton: {
    height: 64,
    borderRadius: BorderRadius.xl,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: '800',
  },
});
