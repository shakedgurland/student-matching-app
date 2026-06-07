import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';

export default function ChatScreen() {
  return (
    <ResponsiveContainer style={styles.container} useSafeArea={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color="#477D9B" />
          </TouchableOpacity>

          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>נועם</Text>
            <Text style={styles.headerStatus}>מחובר/ת כרגע</Text>
          </View>

          <TouchableOpacity
            style={styles.profileThumbnail}
            onPress={() => router.push('/my-profile')}
          >
            <View style={styles.avatarMini}>
              <Text style={styles.avatarMiniText}>נ</Text>
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.chatArea}>
          <View style={styles.messageLeft}>
            <Text style={styles.messageText}>היי :) ראיתי שיש לנו התאמה גבוהה</Text>
            <Text style={styles.messageTime}>10:02</Text>
          </View>

          <View style={styles.messageRight}>
            <Text style={styles.messageRightText}>היי! כן, ממש מגניב</Text>
            <Text style={styles.messageTimeRight}>10:05</Text>
          </View>

          <View style={styles.messageLeft}>
            <Text style={styles.messageText}>גם את/ה אוהב/ת ללמוד בקפה?</Text>
            <Text style={styles.messageTime}>10:06</Text>
          </View>
        </ScrollView>

        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.attachButton}>
            <Ionicons name="add" size={24} color="#477D9B" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="כתבי הודעה..."
            placeholderTextColor="#999"
            multiline
          />
          <TouchableOpacity style={styles.sendButton}>
            <Ionicons name="send" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'web' ? 20 : 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 4,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
  },
  headerStatus: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  profileThumbnail: {
    padding: 4,
  },
  avatarMini: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#477D9B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarMiniText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  chatArea: {
    padding: 20,
    flexGrow: 1,
  },
  messageLeft: {
    backgroundColor: '#F0F0F0',
    padding: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 16,
    maxWidth: '80%',
  },
  messageRight: {
    backgroundColor: '#477D9B',
    padding: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderBottomRightRadius: 4,
    alignSelf: 'flex-end',
    marginBottom: 16,
    maxWidth: '80%',
  },
  messageText: {
    color: '#111111',
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'right',
  },
  messageRightText: {
    color: 'white',
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'right',
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    textAlign: 'left',
  },
  messageTimeRight: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
    textAlign: 'right',
  },
  inputRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
    paddingBottom: Platform.OS === 'ios' ? 30 : 12,
  },
  attachButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    fontSize: 16,
    textAlign: 'right',
    maxHeight: 100,
    marginHorizontal: 8,
  },
  sendButton: {
    backgroundColor: '#477D9B',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
