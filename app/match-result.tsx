import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';

export default function MatchResultScreen() {
  return (
    <ResponsiveContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.logo}>UniMatch</Text>

        <Text style={styles.title}>מצאנו לך התאמה!</Text>

        <View style={styles.card}>
          <Text style={styles.name}>נועם, 25</Text>
          <Text style={styles.details}>סטודנט/ית לפסיכולוגיה</Text>
          <Text style={styles.match}>87% התאמה</Text>

          <Text style={styles.bio}>
            אוהב/ת קפה בקמפוס, שיחות עומק, לימודים ביחד וטיולים בסופי שבוע.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/active-match')}
        >
          <Text style={styles.primaryButtonText}>מעבר להתאמה שלי</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/basic-questionnaire')}
        >
          <Text style={styles.secondaryButtonText}>חזרה לשאלון</Text>
        </TouchableOpacity>
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
  },
  logo: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#477D9B',
    textAlign: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
    color: '#111111',
  },
  card: {
    backgroundColor: '#F4F4F4',
    padding: 24,
    borderRadius: 20,
    marginBottom: 24,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    color: '#111111',
  },
  details: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
    color: '#444444',
  },
  match: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 14,
    color: '#477D9B',
  },
  bio: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    color: '#555555',
  },
  primaryButton: {
    backgroundColor: '#477D9B',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    borderColor: '#477D9B',
    borderWidth: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#477D9B',
    fontSize: 17,
    fontWeight: '700',
  },
});
