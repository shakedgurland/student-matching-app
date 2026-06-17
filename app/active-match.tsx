import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, ActivityIndicator, Image } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

export default function ActiveMatchScreen() {
  const { id } = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  
  const [candidate, setCandidate] = useState<any>(null);
  const [matchInfo, setMatchInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(72 * 60 * 60);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Fetch match record
        const matchQuery = supabase
          .from('user_matches')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active');
        
        if (id) {
          matchQuery.eq('candidate_id', id);
        }

        const { data: matchData, error: matchError } = await matchQuery.order('created_at', { ascending: false }).limit(1).single();

        if (matchError || !matchData) {
          setLoading(false);
          return;
        }

        setMatchInfo(matchData);

        // Calculate time left from created_at
        const createdAt = new Date(matchData.created_at).getTime();
        const now = new Date().getTime();
        const diff = Math.max(0, (72 * 60 * 60) - Math.floor((now - createdAt) / 1000));
        setTimeLeft(diff);

        // 2. Fetch candidate profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', matchData.candidate_id)
          .single();
        
        if (profileError) throw profileError;
        setCandidate(profile);

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m
      .toString()
      .padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
        <Ionicons name="heart-dislike-outline" size={64} color={theme.muted} />
        <Text style={[styles.title, { color: theme.text, marginTop: 24 }]}>אין התאמה פעילה</Text>
        <Text style={[styles.subtitle, { color: theme.muted, textAlign: 'center', paddingHorizontal: 40 }]}>
          נראה שאין לך התאמה פעילה כרגע. עברי לטאב הגילוי כדי למצוא אחת!
        </Text>
        <TouchableOpacity 
          style={[styles.primaryButton, { backgroundColor: theme.primary, width: '80%', marginTop: 32 }]} 
          onPress={() => router.push('/(tabs)/explore')}
        >
          <Text style={styles.primaryButtonText}>לחיפוש התאמות</Text>
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

        <Text style={[styles.title, { color: theme.text }]}>ההתאמה הפעילה שלך ✨</Text>

        <View style={[styles.timerContainer, { backgroundColor: theme.background, borderColor: theme.border }, Shadow.soft]}>
          <Ionicons name="time-outline" size={20} color={theme.primary} />
          <Text style={[styles.timerLabel, { color: theme.primary }]}>הזמן שנותר לתחילת שיחה:</Text>
          <Text style={[styles.timerValue, { color: theme.primary }]}>{formatTime(timeLeft)}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }, Shadow.medium]}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            {candidate.profile_image ? (
              <Image source={{ uri: candidate.profile_image }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{candidate.username?.charAt(0)}</Text>
            )}
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{candidate.username}, {candidate.age}</Text>
          <Text style={[styles.details, { color: theme.muted }]}>סטודנט/ית ל{candidate.field_of_study}</Text>
          
          <View style={[styles.matchBadge, { backgroundColor: theme.secondary }]}>
            <Text style={[styles.matchText, { color: theme.primary }]}>{matchInfo?.score}% התאמה ✨</Text>
          </View>

          <Text style={[styles.bio, { color: theme.text }]}>
            אוהב/ת: {candidate.hobbies?.join(', ')}
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }, Shadow.soft]}
            onPress={() => router.push({ pathname: '/chat', params: { id: candidate.id } })}
          >
            <Ionicons name="chatbubble-ellipses" size={20} color="white" style={{ marginLeft: 8 }} />
            <Text style={styles.primaryButtonText}>שלח/י הודעה ראשונה</Text>
          </TouchableOpacity>

          <Text style={[styles.infoText, { color: theme.muted }]}>
            שימי לב: אם לא תתכתבו תוך 72 שעות, ההתאמה תפוג. ⏳
          </Text>
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
    marginTop: 8,
  },
  timerContainer: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    width: '100%',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
  },
  timerLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 4,
  },
  timerValue: {
    fontSize: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
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
    width: 100,
    height: 100,
    borderRadius: 50,
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
    fontSize: 48,
    fontWeight: '800',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 2,
  },
  details: {
    fontSize: 16,
    marginBottom: Spacing.md,
  },
  matchBadge: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
  },
  matchText: {
    fontWeight: '800',
    fontSize: 14,
  },
  bio: {
    ...Typography.body,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.xxl,
  },
  primaryButton: {
    height: 64,
    borderRadius: BorderRadius.xl,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
  infoText: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 18,
    paddingHorizontal: Spacing.xl,
  },
});
