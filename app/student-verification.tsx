import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';

export default function StudentVerificationScreen() {
  return (
    <ResponsiveContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.logo}>UniMatch</Text>

        <Text style={styles.title}>אימות סטודנט</Text>

        <Text style={styles.subtitle}>
          כדי לשמור על קהילה סטודנטיאלית אמינה, הזיני אימייל אוניברסיטאי.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="אימייל אוניברסיטאי"
          keyboardType="email-address"
        />

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/basic-questionnaire')}
        >
          <Text style={styles.primaryButtonText}>המשך לשאלון התאמה</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>חזרה</Text>
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
    marginBottom: 16,
    color: '#111111',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666666',
    lineHeight: 24,
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#F4F4F4',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    textAlign: 'right',
  },
  primaryButton: {
    backgroundColor: '#477D9B',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },
  link: {
    textAlign: 'center',
    marginTop: 20,
    color: '#477D9B',
    fontSize: 16,
    fontWeight: '600',
  },
});
