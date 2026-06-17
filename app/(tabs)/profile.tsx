import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';

export default function MyProfileScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <ResponsiveContainer style={[styles.container, { backgroundColor: theme.offBackground }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.logo, { color: theme.primary }]}>UniMatch</Text>
          <TouchableOpacity style={styles.settingsButton}>
            <Ionicons name="settings-outline" size={24} color={theme.primary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>הפרופיל שלי ✨</Text>

        <View style={[styles.profileCard, { backgroundColor: theme.background, borderColor: theme.border }, Shadow.medium]}>
          <View style={[styles.avatarContainer, { borderColor: theme.secondary }]}>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>ל</Text>
            </View>
            <TouchableOpacity style={[styles.editAvatarButton, { backgroundColor: theme.primary }]}>
              <Ionicons name="camera" size={16} color="white" />
            </TouchableOpacity>
          </View>

          <Text style={[styles.name, { color: theme.text }]}>ליזה, 25</Text>
          <Text style={[styles.details, { color: theme.primary, fontWeight: '700' }]}>האוניברסיטה העברית</Text>
          <Text style={[styles.details, { color: theme.muted }]}>סטודנטית לפסיכולוגיה ומנהל עסקים</Text>

          <View style={[styles.divider, { backgroundColor: theme.secondary }]} />

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>קצת עליי</Text>
            <Text style={[styles.sectionText, { color: theme.muted }]}>
              אוהבת שיחות עומק, קפה בקמפוס, ללמוד דברים חדשים ולהכיר אנשים עם לב טוב.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>מחפשת</Text>
            <Text style={[styles.sectionText, { color: theme.muted }]}>
              קשר רציני, יציב ובריא עם מישהו שאפשר לדבר איתו באמת.
            </Text>
          </View>

          <View style={styles.tagsRow}>
            {['קפה ☕', 'טיולים 🌲', 'פסיכולוגיה 🧠'].map(tag => (
              <View key={tag} style={[styles.tag, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
                <Text style={[styles.tagText, { color: theme.primary }]}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }, Shadow.soft]}
            onPress={() => router.push('/basic-questionnaire')}
          >
            <Ionicons name="create-outline" size={20} color="white" style={{ marginLeft: 8 }} />
            <Text style={styles.primaryButtonText}>עריכת שאלון התאמה</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => router.push('/deeper-questionnaire')}
          >
            <Ionicons name="sparkles-outline" size={20} color={theme.primary} style={{ marginLeft: 8 }} />
            <Text style={[styles.secondaryButtonText, { color: theme.primary }]}>עריכת שאלון עומק</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/')} style={styles.logoutButton}>
            <Text style={[styles.logoutLink, { color: theme.muted }]}>התנתקות מהחשבון</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Spacing.sm,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  title: {
    ...Typography.h2,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  profileCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  avatarText: {
    color: 'white',
    fontSize: 44,
    fontWeight: '800',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  details: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 2,
  },
  divider: {
    width: '100%',
    height: 1,
    marginVertical: Spacing.xl,
  },
  section: {
    width: '100%',
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.label,
    fontSize: 18,
    marginBottom: Spacing.xs,
    textAlign: 'right',
  },
  sectionText: {
    ...Typography.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'right',
  },
  tagsRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tag: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  tagText: {
    fontWeight: '800',
    fontSize: 13,
  },
  buttonContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  primaryButton: {
    height: 60,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryButton: {
    height: 60,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexDirection: 'row-reverse',
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '800',
  },
  logoutButton: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  logoutLink: {
    fontSize: 15,
    fontWeight: '700',
  },
});
