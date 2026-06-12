import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

// Design Constants for Bright Premium Style
const UI_COLORS = {
  bg: '#F7F8FA', // iOS-style light grey bg
  primary: '#172033', // Deep navy for user bubbles
  premium: '#7C3AED', // Secondary Premium Accent
  accent: '#FF8A00', // Small spark accent
  branding: '#FF3D57', // Main branding color for icons/actions
  surface: '#FFF0EA', // Soft romantic surface
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  card: '#FFFFFF',
};

const MockMessage = ({ text, isMe }: { text: string, isMe: boolean }) => (
  <View style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.theirMessageWrapper]}>
    <View style={[
      styles.messageBubble, 
      isMe ? [styles.messageBubbleMe, { backgroundColor: UI_COLORS.primary }] : [styles.messageBubbleThem, { backgroundColor: UI_COLORS.card, borderColor: UI_COLORS.border, borderWidth: 1 }]
    ]}>
      <ThemedText style={[styles.messageText, { color: isMe ? '#FFFFFF' : UI_COLORS.text }]}>{text}</ThemedText>
    </View>
  </View>
);

export default function ChatScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: isDark ? dynamicColors.bg : UI_COLORS.bg }]}>
      <Stack.Screen options={{ 
        headerShown: true, 
        headerTitle: "השיחה עם נועה",
        headerTitleAlign: 'center',
        headerTintColor: UI_COLORS.branding,
        headerRight: () => (
          <TouchableOpacity 
            onPress={() => router.push({ pathname: '/match-feedback' as any, params: { stage: 'after_chat' } })}
            style={{ marginRight: 10 }}>
            <IconSymbol name="star.fill" size={20} color={UI_COLORS.branding} />
          </TouchableOpacity>
        ),
        headerStyle: { backgroundColor: isDark ? dynamicColors.bg : '#FFFFFF' },
        headerTitleStyle: { color: isDark ? '#FFFFFF' : UI_COLORS.text },
      }} />
      
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
          
          <View style={[styles.matchHeader, { borderBottomColor: dynamicColors.border, backgroundColor: isDark ? dynamicColors.bg : '#FFFFFF' }]}>
            <View style={styles.avatarGroup}>
               <View style={[styles.smallAvatar, { backgroundColor: UI_COLORS.surface, borderColor: UI_COLORS.branding }]}>
                 <ThemedText style={[styles.avatarText, { color: UI_COLORS.branding }]}>ש</ThemedText>
               </View>
               <View style={[styles.smallAvatar, { backgroundColor: UI_COLORS.surface, borderColor: UI_COLORS.premium, marginLeft: -15 }]}>
                 <ThemedText style={[styles.avatarText, { color: UI_COLORS.premium }]}>נ</ThemedText>
               </View>
            </View>
            <View style={styles.headerInfo}>
               <ThemedText style={[styles.headerSubtitle, { color: dynamicColors.textLight }]}>87% התאמה · הר הצופים</ThemedText>
               <View style={[styles.reminderBadge, { backgroundColor: UI_COLORS.surface }]}>
                 <ThemedText style={[styles.reminderText, { color: UI_COLORS.branding }]}>התחלת שיחה בזמן — ההתאמה נשמרה.</ThemedText>
               </View>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.chatContent}>
            <MockMessage text="היי נועה, ראיתי שגם את בחרת הומור וכנות — אהבתי :)" isMe={true} />
            <MockMessage text="חח לגמרי, וגם הקטע של הקריוקי הצחיק אותי" isMe={false} />
            <MockMessage text="אז השאלה החשובה: איזה שיר היית בוחרת לדואט" isMe={true} />
          </ScrollView>

          <View style={[styles.inputArea, { borderTopColor: dynamicColors.border, backgroundColor: isDark ? dynamicColors.bg : '#FFFFFF' }]}>
            <TouchableOpacity style={[styles.sendButton, { backgroundColor: UI_COLORS.branding }]}>
               <ThemedText style={styles.sendButtonText}>שלח</ThemedText>
            </TouchableOpacity>
            <TextInput 
              style={[styles.input, { color: isDark ? '#FFFFFF' : UI_COLORS.text, backgroundColor: isDark ? dynamicColors.card : '#F7F8FA', borderColor: dynamicColors.border }]}
              placeholder="כתבו הודעה..."
              placeholderTextColor={dynamicColors.textLight}
              textAlign="right"
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  matchHeader: {
    padding: 16,
    borderBottomWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  avatarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerInfo: {
    alignItems: 'center',
    gap: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  reminderBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reminderText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chatContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 20,
  },
  messageWrapper: {
    width: '100%',
    flexDirection: 'row',
  },
  myMessageWrapper: {
    justifyContent: 'flex-start', // RTL logic: I am on the left if I'm Hebrew-oriented but usually messages are opposite. Let's keep it simple.
  },
  theirMessageWrapper: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  messageBubbleMe: {
    borderBottomLeftRadius: 4,
  },
  messageBubbleThem: {
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'right',
  },
  inputArea: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    borderWidth: 1,
    fontSize: 16,
  },
  sendButton: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});