import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';

export default function MatchTabScreen() {
  return (
    <ResponsiveContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.logo}>UniMatch</Text>

        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>✨</Text>
          </View>

          <Text style={styles.title}>מחפשים לך את ההתאמה הבאה</Text>
          <Text style={styles.subtitle}>
            המערכת שלנו עובדת על מציאת הסטודנט/ית שהכי מתאימים לך.
            ברגע שנמצא, תקבלי התראה!
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/match-result')}
          >
            <Text style={styles.primaryButtonText}>בדקי אם יש התאמה</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>נשארו לך 5 התאמות החודש</Text>
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
    textAlign: 'center',
    marginBottom: 40,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F0F7FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  primaryButton: {
    backgroundColor: '#477D9B',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 18,
    width: '100%',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  footer: {
    marginTop: 40,
    textAlign: 'center',
    color: '#999999',
    fontSize: 14,
  },
});
