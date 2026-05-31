import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>UniMatch</Text>

      <Text style={styles.title}>ההתאמה הסטודנטיאלית שלך מתחילה כאן</Text>

      <Text style={styles.subtitle}>
        מערכת התאמה חכמה שמחברת בין סטודנטים וסטודנטיות לפי תחומי עניין,
        ערכים, פקולטה ומה שבאמת חשוב.
      </Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push('/signup')}
      >
        <Text style={styles.primaryButtonText}>התחל התאמה</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => router.push('/login')}
      >
        <Text style={styles.secondaryButtonText}>כבר יש לי חשבון</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>מיועד לסטודנטים מאומתים בלבד</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  logo: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#477D9B',
    marginBottom: 40,
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
    marginBottom: 48,
    lineHeight: 24,
    color: '#666666',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#477D9B',
    padding: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 20,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    padding: 12,
  },
  secondaryButtonText: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '600',
  },
  footer: {
    marginTop: 80,
    fontSize: 14,
    color: '#999999',
  },
});