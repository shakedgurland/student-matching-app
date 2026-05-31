import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';

export default function QuestionnaireScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.logo}>UniMatch</Text>

      <Text style={styles.title}>שאלון התאמה</Text>

      <Text style={styles.subtitle}>
        עני/ה על כמה שאלות קצרות כדי שנוכל למצוא התאמה שמתאימה לך יותר.
      </Text>

      <Text style={styles.label}>מה את/ה לומד/ת?</Text>
      <TextInput style={styles.input} placeholder="לדוגמה: פסיכולוגיה, מדעי המחשב, מנהל עסקים" />

      <Text style={styles.label}>איזה סוג קשר את/ה מחפש/ת?</Text>
      <TextInput style={styles.input} placeholder="קשר רציני / היכרות / חברים / עדיין לא בטוח/ה" />

      <Text style={styles.label}>מה חשוב לך באדם שמולך?</Text>
      <TextInput style={styles.input} placeholder="ערכים, תחומי עניין, סגנון חיים..." />

      <Text style={styles.label}>איך את/ה אוהב/ת לבלות?</Text>
      <TextInput style={styles.input} placeholder="קפה, מסיבות, טיולים, לימודים יחד..." />

      <Text style={styles.label}>ספר/י קצת על עצמך</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="כמה משפטים קצרים עלייך"
        multiline
      />

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push('/match-result')}
      >
        <Text style={styles.primaryButtonText}>מצא/י התאמה</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.link}>חזרה</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    flexGrow: 1,
  },
  logo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#477D9B',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    color: '#111111',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666666',
    lineHeight: 24,
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 12,
    textAlign: 'right',
    color: '#111111',
  },
  input: {
    backgroundColor: '#F4F4F4',
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
    textAlign: 'right',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: '#477D9B',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 24,
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