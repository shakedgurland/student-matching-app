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

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef<TextInput>(null);

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
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert('שגיאה בכניסה', 'אימייל או סיסמה שגויים');
        return;
      }
    } catch (err) {
      console.log('Unexpected login error:', err);
      Alert.alert('שגיאה', 'אירעה שגיאה לא צפויה בכניסה');
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
              <Text style={styles.headline}>ברוכים השבים</Text>
              <Text style={styles.subtitle}>התחברי כדי להמשיך להתאמה החכמה שלך</Text>
            </View>

            <View style={styles.formSection}>
              <TextInput
                style={styles.input}
                placeholder="אימייל"
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
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.disabledButton]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'מתחברת...' : 'כניסה'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.registerSection}>
              <Text style={styles.registerPrompt}>אין לך חשבון? </Text>
              <TouchableOpacity onPress={() => router.push('/signup')}>
                <Text style={styles.registerLink}>להרשמה</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.legalRow}>
              <TouchableOpacity onPress={() => router.push('/terms-of-use' as any)} hitSlop={8}>
                <Text style={styles.legalLinkText}>תנאי שימוש</Text>
              </TouchableOpacity>
              <Text style={styles.legalSeparator}> · </Text>
              <TouchableOpacity onPress={() => router.push('/privacy-policy' as any)} hitSlop={8}>
                <Text style={styles.legalLinkText}>מדיניות פרטיות</Text>
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
    gap: 32,
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
  registerSection: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerPrompt: {
    fontSize: 15,
    color: UI_COLORS.textLight,
  },
  registerLink: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.branding,
  },
  legalRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  legalLinkText: {
    fontSize: 13,
    color: UI_COLORS.textLight,
    fontWeight: '600',
  },
  legalSeparator: {
    fontSize: 13,
    color: UI_COLORS.textLight,
    paddingHorizontal: 4,
  },
});
