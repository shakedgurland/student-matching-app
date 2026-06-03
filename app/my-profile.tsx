import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function MyProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>UniMatch</Text>

      <Text style={styles.title}>הפרופיל שלי</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>ל</Text>
        </View>

        <Text style={styles.name}>ליזה, 25</Text>
        <Text style={styles.details}>סטודנטית לפסיכולוגיה ומנהל עסקים</Text>
        <Text style={styles.details}>האוניברסיטה העברית</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>עליי</Text>
          <Text style={styles.sectionText}>
            אוהבת שיחות עומק, קפה בקמפוס, ללמוד דברים חדשים ולהכיר אנשים עם לב טוב.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>מחפשת</Text>
          <Text style={styles.sectionText}>
            קשר רציני, יציב ובריא עם מישהו שאפשר לדבר איתו באמת.
          </Text>
        </View>

        <View style={styles.tagsRow}>
          <Text style={styles.tag}>קפה</Text>
          <Text style={styles.tag}>טיולים</Text>
          <Text style={styles.tag}>פסיכולוגיה</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push('/questionnaire')}
      >
        <Text style={styles.primaryButtonText}>עריכת שאלון התאמה</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.link}>חזרה לצ׳אט</Text>
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#477D9B',
    textAlign: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
    color: '#111111',
  },
  profileCard: {
    backgroundColor: '#F4F4F4',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#477D9B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarText: {
    color: 'white',
    fontSize: 36,
    fontWeight: '800',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
  },
  details: {
    fontSize: 15,
    color: '#555555',
    textAlign: 'center',
    marginBottom: 4,
  },
  section: {
    width: '100%',
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'right',
  },
  sectionText: {
    fontSize: 15,
    color: '#555555',
    lineHeight: 22,
    textAlign: 'right',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tag: {
    backgroundColor: '#FFFFFF',
    color: '#477D9B',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#477D9B',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },
  link: {
    textAlign: 'center',
    marginTop: 8,
    color: '#477D9B',
    fontSize: 16,
    fontWeight: '600',
  },
});