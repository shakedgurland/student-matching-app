import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert('שגיאה', 'יש להזין אימייל');
      return;
    }

    if (!password) {
      Alert.alert('שגיאה', 'יש להזין סיסמה');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      console.log('Login data:', data);
      console.log('Login error:', error);

      if (error) {
        Alert.alert('שגיאה בכניסה', error.message);
        return;
      }

      router.replace('/questionnaire');
    } catch (err) {
      console.log('Unexpected login error:', err);
      Alert.alert('שגיאה', 'אירעה שגיאה לא צפויה בכניסה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>UniMatch</Text>
      <Text style={styles.title}>כניסה לחשבון קיים</Text>

      <TextInput
        style={styles.input}
        placeholder="אימייל"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        textAlign="right"
      />

      <TextInput
        style={styles.input}
        placeholder="סיסמה"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textAlign="right"
      />

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.disabledButton]}
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? 'מתחברת...' : 'כניסה'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.link}>חזרה</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
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
  input: {
    backgroundColor: '#F4F4F4',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#477D9B',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  disabledButton: {
    opacity: 0.6,
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