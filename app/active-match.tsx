import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';

export default function ActiveMatchScreen() {
  const [timeLeft, setTimeLeft] = useState(72 * 60 * 60); // 72 hours in seconds

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

  return (
    <ResponsiveContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.logo}>UniMatch</Text>

        <Text style={styles.title}>ההתאמה הפעילה שלך</Text>

        <View style={styles.timerContainer}>
          <Text style={styles.timerLabel}>הזמן שנותר לתחילת שיחה:</Text>
          <Text style={styles.timerValue}>{formatTime(timeLeft)}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>נ</Text>
          </View>
          <Text style={styles.name}>נועם, 25</Text>
          <Text style={styles.details}>סטודנט/ית לפסיכולוגיה</Text>
          <View style={styles.matchBadge}>
            <Text style={styles.matchText}>87% התאמה</Text>
          </View>

          <Text style={styles.bio}>
            אוהב/ת קפה בקמפוס, שיחות עומק, לימודים ביחד וטיולים בסופי שבוע.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/chat')}
        >
          <Text style={styles.primaryButtonText}>שלח/י הודעה ראשונה</Text>
        </TouchableOpacity>

        <Text style={styles.infoText}>
          זכרו: יש לכם 72 שעות להתחיל שיחה לפני שההתאמה תפוג.
        </Text>
      </ScrollView>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#477D9B',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 20,
    textAlign: 'center',
  },
  timerContainer: {
    backgroundColor: '#FFF5F5',
    padding: 16,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFDADA',
  },
  timerLabel: {
    fontSize: 14,
    color: '#E53E3E',
    fontWeight: '600',
    marginBottom: 4,
  },
  timerValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#E53E3E',
    fontVariant: ['tabular-nums'],
  },
  card: {
    backgroundColor: '#F4F4F4',
    padding: 24,
    borderRadius: 24,
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#477D9B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: 'white',
    fontSize: 32,
    fontWeight: '800',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
  },
  details: {
    fontSize: 16,
    color: '#555555',
    marginBottom: 12,
  },
  matchBadge: {
    backgroundColor: '#E6F0F5',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  matchText: {
    color: '#477D9B',
    fontWeight: '700',
    fontSize: 14,
  },
  bio: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    color: '#555555',
  },
  primaryButton: {
    backgroundColor: '#477D9B',
    padding: 18,
    borderRadius: 18,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  infoText: {
    fontSize: 13,
    color: '#999999',
    textAlign: 'center',
  },
});
