import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';

export default function QuestionnaireTransitionScreen() {
  return (
    <ResponsiveContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.logo}>UniMatch</Text>

        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🎯</Text>
        </View>

        <Text style={styles.title}>מצאנו התאמות ראשוניות!</Text>
        <Text style={styles.subtitle}>
          השלמת את השאלון הבסיסי וזה נראה מעולה. 
          האם תרצי להמשיך לשאלון עומק כדי לשפר את איכות ההתאמות שלך?
        </Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/deeper-questionnaire')}
          >
            <Text style={styles.primaryButtonText}>המשך לשאלון עומק</Text>
            <Text style={styles.buttonSubtext}>משפר את הדיוק ב-40%</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/(tabs)/explore')}
          >
            <Text style={styles.secondaryButtonText}>הצג התאמות בסיסיות בלבד</Text>
          </TouchableOpacity>
        </View>
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
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F0F7FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  icon: {
    fontSize: 50,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
    paddingHorizontal: 10,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#477D9B',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  buttonSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  secondaryButtonText: {
    color: '#666666',
    fontSize: 16,
    fontWeight: '600',
  },
});
