import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <ResponsiveContainer style={[styles.container, { backgroundColor: theme.offBackground }]} useSafeArea={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }, Shadow.soft]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-forward" size={28} color={theme.primary} />
          </TouchableOpacity>

          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>נועם</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
              <Text style={[styles.headerStatus, { color: theme.muted }]}>מחובר/ת כרגע</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.profileThumbnail}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <View style={[styles.avatarMini, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarMiniText}>נ</Text>
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.chatArea} showsVerticalScrollIndicator={false}>
          <View style={[styles.messageLeft, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Text style={[styles.messageText, { color: theme.text }]}>היי :) ראיתי שיש לנו התאמה גבוהה</Text>
            <Text style={[styles.messageTime, { color: theme.muted }]}>10:02</Text>
          </View>

          <View style={[styles.messageRight, { backgroundColor: theme.primary }]}>
            <Text style={styles.messageRightText}>היי! כן, ממש מגניב ✨</Text>
            <Text style={styles.messageTimeRight}>10:05</Text>
          </View>

          <View style={[styles.messageLeft, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Text style={[styles.messageText, { color: theme.text }]}>גם את/ה אוהב/ת ללמוד בקפה?</Text>
            <Text style={[styles.messageTime, { color: theme.muted }]}>10:06</Text>
          </View>
        </ScrollView>

        <View style={[styles.inputRow, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <TouchableOpacity style={styles.attachButton}>
            <Ionicons name="add-circle" size={32} color={theme.primary} />
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { backgroundColor: theme.offBackground, color: theme.text, borderColor: theme.border }]}
            placeholder="כתבי הודעה..."
            placeholderTextColor={theme.tabIconDefault}
            multiline
            textAlign="right"
          />
          <TouchableOpacity style={[styles.sendButton, { backgroundColor: theme.primary }, Shadow.soft]}>
            <Ionicons name="send" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  statusRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 4,
  },
  headerStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  profileThumbnail: {
    padding: Spacing.xs,
  },
  avatarMini: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarMiniText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
  },
  chatArea: {
    padding: Spacing.lg,
    flexGrow: 1,
  },
  messageLeft: {
    padding: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderBottomLeftRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: Spacing.md,
    maxWidth: '85%',
    borderWidth: 1,
  },
  messageRight: {
    padding: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderBottomRightRadius: 4,
    alignSelf: 'flex-end',
    marginBottom: Spacing.md,
    maxWidth: '85%',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'right',
  },
  messageRightText: {
    color: 'white',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'right',
    fontWeight: '500',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'left',
  },
  messageTimeRight: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
    textAlign: 'right',
  },
  inputRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 40 : Spacing.md,
  },
  attachButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: BorderRadius.xl,
    fontSize: 16,
    maxHeight: 120,
    marginHorizontal: Spacing.xs,
    borderWidth: 1,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
