import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function HomeDashboardScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <ResponsiveContainer style={[styles.container, { backgroundColor: theme.offBackground }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.logo, { color: theme.primary }]}>UniMatch</Text>
            <View style={[styles.logoDot, { backgroundColor: theme.accent }]} />
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
            <View style={[styles.avatarMini, { backgroundColor: theme.primary, borderColor: theme.background }]}>
              <Text style={styles.avatarText}>ל</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={[styles.welcomeText, { color: theme.text }]}>היי ליזה, טוב לראות אותך!</Text>

        {/* Deep Questionnaire CTA */}
        <TouchableOpacity 
          style={[styles.deepBanner, { backgroundColor: theme.background, borderColor: theme.border }, Shadow.soft]}
          onPress={() => router.push('/deeper-questionnaire')}
        >
          <View style={styles.bannerIconContainer}>
            <Ionicons name="sparkles" size={24} color={theme.primary} />
          </View>
          <View style={styles.bannerContent}>
            <Text style={[styles.bannerTitle, { color: theme.primary }]}>שיפור התאמות</Text>
            <Text style={[styles.bannerSubtitle, { color: theme.muted }]}>מלאי שאלון עומק לקבלת התאמות מדויקות יותר</Text>
          </View>
          <Ionicons name="chevron-back" size={20} color={theme.primary} />
        </TouchableOpacity>

        {/* Existing Chats Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>התכתבויות פעילות</Text>
          <TouchableOpacity 
            style={[styles.chatCard, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => router.push('/chat')}
          >
            <View style={[styles.chatAvatar, { backgroundColor: theme.secondary }]}>
              <Text style={[styles.avatarText, { color: theme.primary, fontSize: 20 }]}>נ</Text>
            </View>
            <View style={styles.chatInfo}>
              <Text style={[styles.chatName, { color: theme.text }]}>נועם</Text>
              <Text style={[styles.chatLastMsg, { color: theme.muted }]} numberOfLines={1}>גם את/ה אוהב/ת ללמוד בקפה?</Text>
            </View>
            <Text style={[styles.chatTime, { color: theme.tabIconDefault }]}>10:06</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>גילוי</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.background, borderColor: theme.border }, Shadow.soft]}
              onPress={() => router.push('/(tabs)/explore')}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: theme.secondary }]}>
                <Ionicons name="heart" size={28} color={theme.primary} />
              </View>
              <Text style={[styles.actionText, { color: theme.primary }]}>מצא התאמה</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.background, borderColor: theme.border }, Shadow.soft]}
              onPress={() => router.push('/(tabs)/profile')}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: theme.secondary }]}>
                <Ionicons name="person" size={28} color={theme.primary} />
              </View>
              <Text style={[styles.actionText, { color: theme.primary }]}>הפרופיל שלי</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.footer, { color: theme.tabIconDefault }]}>נשארו לך 5 התאמות החודש ✨</Text>
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
    marginBottom: Spacing.xl,
  },
  headerTitleContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
  },
  logo: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  logoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 2,
  },
  avatarMini: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  avatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
  welcomeText: {
    ...Typography.h2,
    textAlign: 'right',
    marginBottom: Spacing.xl,
  },
  deepBanner: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
  },
  bannerIconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(240, 98, 146, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.md,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    ...Typography.label,
    fontSize: 18,
    textAlign: 'right',
    marginBottom: 2,
  },
  bannerSubtitle: {
    fontSize: 14,
    textAlign: 'right',
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.label,
    fontSize: 18,
    textAlign: 'right',
    marginBottom: Spacing.md,
  },
  chatCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderWidth: 1,
  },
  chatAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.md,
  },
  chatInfo: {
    flex: 1,
  },
  chatName: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 2,
  },
  chatLastMsg: {
    fontSize: 14,
    textAlign: 'right',
  },
  chatTime: {
    fontSize: 12,
    marginRight: Spacing.sm,
  },
  actionsGrid: {
    flexDirection: 'row-reverse',
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '800',
  },
  footer: {
    textAlign: 'center',
    fontSize: 14,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    fontWeight: '600',
  },
});
