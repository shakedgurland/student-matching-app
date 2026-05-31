import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ChatScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>UniMatch</Text>

      <View style={styles.headerRow}>
        <Text style={styles.title}>צ׳אט עם נועם</Text>

        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push('/my-profile')}
        >
          <Text style={styles.profileButtonText}>הפרופיל שלי</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.chatArea}>
        <View style={styles.messageLeft}>
          <Text style={styles.messageText}>היי :) ראיתי שיש לנו התאמה גבוהה</Text>
        </View>

        <View style={styles.messageRight}>
          <Text style={styles.messageRightText}>היי! כן, ממש מגניב</Text>
        </View>

        <View style={styles.messageLeft}>
          <Text style={styles.messageText}>גם את/ה אוהב/ת ללמוד בקפה?</Text>
        </View>
      </View>

      <View style={styles.inputRow}>
        <TextInput style={styles.input} placeholder="כתבי הודעה..." />
        <TouchableOpacity style={styles.sendButton}>
          <Text style={styles.sendButtonText}>שלח</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  logo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#477D9B',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  headerRow: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    color: '#111111',
    marginBottom: 12,
  },
  profileButton: {
    borderColor: '#477D9B',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 18,
  },
  profileButtonText: {
    color: '#477D9B',
    fontSize: 15,
    fontWeight: '700',
  },
  chatArea: {
    flex: 1,
  },
  messageLeft: {
    backgroundColor: '#F4F4F4',
    padding: 14,
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginBottom: 12,
    maxWidth: '80%',
  },
  messageRight: {
    backgroundColor: '#477D9B',
    padding: 14,
    borderRadius: 16,
    alignSelf: 'flex-end',
    marginBottom: 12,
    maxWidth: '80%',
  },
  messageText: {
    color: '#111111',
    fontSize: 15,
  },
  messageRightText: {
    color: 'white',
    fontSize: 15,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#F4F4F4',
    padding: 14,
    borderRadius: 14,
    fontSize: 16,
    textAlign: 'right',
  },
  sendButton: {
    backgroundColor: '#477D9B',
    padding: 14,
    borderRadius: 14,
  },
  sendButtonText: {
    color: 'white',
    fontWeight: '700',
  },
});