import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { classifySignupError, isStudentEmail } from '../lib/auth-flow';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const handleSignup = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      Alert.alert('שגיאה', 'יש להזין אימייל');
      return;
    }

    if (!isStudentEmail(trimmedEmail)) {
      Alert.alert('שגיאה', 'ניתן להירשם רק עם אימייל אקדמי (סיומת ‎.ac.il‎).');
      return;
    }

    if (!password) {
      Alert.alert('שגיאה', 'יש להזין סיסמה');
      return;
    }

    if (password.length < 6) {
      Alert.alert('שגיאה', 'הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('שגיאה', 'הסיסמאות אינן תואמות');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });

      if (error) {
        Alert.alert('שגיאה בהרשמה', classifySignupError(error));
        return;
      }

      if (data.session) {
        router.replace('/questionnaire');
      } else {
        Alert.alert(
          'אימות אימייל נדרש',
          'נשלח אליך מייל אימות. אשרי אותו ואז התחברי.',
          [{ text: 'להתחברות', onPress: () => router.replace('/login') }]
        );
      }
    } catch (err) {
      console.log('Unexpected signup error:', err);
      Alert.alert('שגיאה בהרשמה', classifySignupError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <Text style={styles.logo}>UniMatch</Text>
            <Text style={styles.title}>הרשמה</Text>

            <TextInput
              style={styles.input}
              placeholder="אימייל אקדמי (סיומת ‎.ac.il‎)"
              placeholderTextColor="#999999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              textAlign="right"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
            />

            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="סיסמה"
              placeholderTextColor="#999999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textAlign="right"
              returnKeyType="next"
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              blurOnSubmit={false}
            />

            <TextInput
              ref={confirmPasswordRef}
              style={styles.input}
              placeholder="אימות סיסמה"
              placeholderTextColor="#999999"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              textAlign="right"
              returnKeyType="done"
              onSubmitEditing={handleSignup}
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabledButton]}
              onPress={handleSignup}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'נרשמת...' : 'הרשמה'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.link}>חזרה</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
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
    color: '#111111',
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