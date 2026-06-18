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

const UI_COLORS = {
  bg: '#FFF9F6',
  primary: '#FF4D3D',
  accent: '#FF8A00',
  branding: '#FF3D57',
  surface: '#FFF0EA',
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  inputBg: '#F4F4F4',
  inputText: '#111111',
  placeholder: '#999999',
};

const BrandMark = ({ size = 60, showSpark = true }: { size?: number; showSpark?: boolean }) => {
  const strokeWidth = size * 0.2;
  const innerSize = size - strokeWidth;
  const sparkSize = size * 0.14;

  return (
    <View style={{ width: size, height: size + strokeWidth, justifyContent: 'flex-end', alignItems: 'center' }}>
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderBottomLeftRadius: innerSize / 2,
          borderBottomRightRadius: innerSize / 2,
          borderWidth: strokeWidth,
          borderColor: UI_COLORS.branding,
          borderTopWidth: 0,
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: -strokeWidth / 2,
            left: -strokeWidth,
            width: strokeWidth,
            height: strokeWidth,
            backgroundColor: UI_COLORS.branding,
            borderTopLeftRadius: strokeWidth * 0.2,
            borderTopRightRadius: strokeWidth * 0.2,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: -strokeWidth / 2,
            right: -strokeWidth,
            width: strokeWidth,
            height: strokeWidth,
            backgroundColor: UI_COLORS.branding,
            borderTopLeftRadius: strokeWidth * 0.2,
            borderTopRightRadius: strokeWidth * 0.2,
          }}
        />
      </View>
      {showSpark && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            width: sparkSize,
            height: sparkSize,
            borderRadius: sparkSize / 2,
            backgroundColor: UI_COLORS.accent,
            shadowColor: UI_COLORS.accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 8,
            elevation: 4,
          }}
        />
      )}
    </View>
  );
};

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
            <View style={styles.brandSection}>
              <BrandMark size={60} />
              <Text style={styles.appName}>UniMatch</Text>
            </View>

            <View style={styles.copySection}>
              <Text style={styles.headline}>יצירת חשבון</Text>
              <Text style={styles.subtitle}>הצטרפי לקהילה הסטודנטיאלית עם אימייל אקדמי</Text>
            </View>

            <View style={styles.formSection}>
              <TextInput
                style={styles.input}
                placeholder="אימייל אקדמי (סיומת ‎.ac.il‎)"
                placeholderTextColor={UI_COLORS.placeholder}
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
                placeholderTextColor={UI_COLORS.placeholder}
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
                placeholderTextColor={UI_COLORS.placeholder}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                textAlign="right"
                returnKeyType="done"
                onSubmitEditing={handleSignup}
              />

              <Text style={styles.legalAck}>
                בהרשמה לאפליקציה את/ה מאשר/ת את{' '}
                <Text style={styles.legalLink} onPress={() => router.push('/terms-of-use' as any)}>
                  תנאי השימוש
                </Text>
                {' '}ו
                <Text style={styles.legalLink} onPress={() => router.push('/privacy-policy' as any)}>
                  מדיניות הפרטיות
                </Text>
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.disabledButton]}
                onPress={handleSignup}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'נרשמת...' : 'הרשמה'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.loginSection}>
              <Text style={styles.loginPrompt}>יש לך כבר חשבון? </Text>
              <TouchableOpacity onPress={() => router.replace('/login')} hitSlop={8}>
                <Text style={styles.loginLink}>להתחברות</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: UI_COLORS.bg,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 28,
    backgroundColor: UI_COLORS.bg,
  },
  brandSection: {
    alignItems: 'center',
    gap: 14,
  },
  appName: {
    fontSize: 32,
    fontWeight: '900',
    color: UI_COLORS.branding,
    letterSpacing: -0.5,
  },
  copySection: {
    alignItems: 'center',
    gap: 8,
  },
  headline: {
    fontSize: 26,
    fontWeight: '800',
    color: UI_COLORS.text,
    textAlign: 'center',
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 16,
    color: UI_COLORS.textLight,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  formSection: {
    gap: 12,
  },
  input: {
    backgroundColor: UI_COLORS.inputBg,
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    color: UI_COLORS.inputText,
  },
  legalAck: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    color: UI_COLORS.textLight,
    marginTop: 4,
    paddingHorizontal: 12,
  },
  legalLink: {
    color: UI_COLORS.branding,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: UI_COLORS.primary,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: UI_COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  loginSection: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginPrompt: {
    fontSize: 15,
    color: UI_COLORS.textLight,
  },
  loginLink: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.branding,
  },
});
