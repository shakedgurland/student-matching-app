import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

const UI_COLORS = {
  bg: '#FFF9F6',
  branding: '#FF3D57',
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  card: '#FFFFFF',
};

export default function HowItWorksScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const isDark = colorScheme === 'dark';

  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255,255,255,0.1)' : UI_COLORS.border,
  };

  const sections: { title: string; body: string }[] = [
    {
      title: '1. מה זה UniMatch?',
      body:
        'UniMatch היא אפליקציית התאמה לסטודנטים ולסטודנטיות במוסדות אקדמיים בישראל. אנחנו עוזרים לך למצוא התאמה משמעותית אחת בכל פעם, על בסיס תשובות השאלון, ההעדפות שלך וההתאמה האמיתית שלכם — לא גלילה אינסופית של פרופילים.',
    },
    {
      title: '2. איך נוצרת התאמה?',
      body:
        'המערכת משווה את תשובות השאלון שלך לאלה של מועמדים/ות אחרים/ות ובוחרת התאמה לפי:\n• כוונות בקשר (קשר רציני, ראש פתוח, סטוץ וכו׳)\n• סגנון תקשורת וקצב התקרבות\n• ערכים בזוגיות ותחומי עניין משותפים\n• מסננים בסיסיים כמו מגדר וגובה כשהגדרת אותם כחשובים\nמה שמופיע לך הוא מי שהאלגוריתם מצא כהתאמה הכי טובה עבורך כרגע.',
    },
    {
      title: '3. כמה התאמות מקבלים?',
      body:
        '• עד 5 התאמות בחודש קלנדרי.\n• התאמה אחת זמינה בכל פעם — לא מציגים לך תור אינסופי.\n• אם אין כרגע התאמה שעומדת בהעדפות שלך, נראה לך הודעה ברורה. נחזור אלייך/אליך כשיצטרפו משתמשים מתאימים.',
    },
    {
      title: '4. מה קורה אחרי שיש התאמה?',
      body:
        'כשמופיעה לך התאמה, אפשר לפתוח שיחה ולהכיר אחד את השני. כדי לפנות מקום להתאמות חדשות — אם לא תתחיל/י שיחה תוך 72 שעות, ההתאמה עשויה לפוג. זה לא אישי, וזה עוזר לכולם לקבל הזדמנויות חדשות.',
    },
    {
      title: '5. פרטיות ובטיחות',
      body:
        '• אנחנו לא חושפים את כל המידע שלך לכל משתמש.\n• ההתאמות נוצרות בצד השרת בלבד, באמצעות backend מאובטח שלא חשוף לקוד הלקוח.\n• הסיסמאות ואסימוני ההזדהות נשמרים מוצפנים.\n• אפשר לקרוא בכל עת את מדיניות הפרטיות ואת תנאי השימוש בקישורים למטה.',
    },
    {
      title: '6. טיפ קטן',
      body:
        'פרופיל עם תמונה ועם תשובות מלאות עוזר למערכת להציע לך התאמות מדויקות יותר. כדאי לוודא שיש לך לפחות תמונה אחת ושסיימת למלא את כל השאלון — גם החלק המעמיק אם אפשר.',
    },
  ];

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: dynamicColors.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="חזרה"
          >
            <IconSymbol name="chevron.right" size={24} color={UI_COLORS.branding} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerTitle, { color: dynamicColors.text }]}>
            איך UniMatch עובד?
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText style={[styles.intro, { color: dynamicColors.textLight }]}>
            מדריך קצר שיעזור להבין איך האפליקציה עובדת מאחורי הקלעים.
          </ThemedText>

          {sections.map((s) => (
            <View key={s.title} style={styles.section}>
              <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>
                {s.title}
              </ThemedText>
              <ThemedText style={[styles.sectionBody, { color: dynamicColors.textLight }]}>
                {s.body}
              </ThemedText>
            </View>
          ))}

          <View style={[styles.linksCard, { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}>
            <TouchableOpacity
              onPress={() => router.push('/privacy-policy' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ThemedText style={[styles.linkText, { color: UI_COLORS.branding }]}>
                מדיניות פרטיות
              </ThemedText>
            </TouchableOpacity>
            <View style={[styles.linksDivider, { backgroundColor: dynamicColors.border }]} />
            <TouchableOpacity
              onPress={() => router.push('/terms-of-use' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ThemedText style={[styles.linkText, { color: UI_COLORS.branding }]}>
                תנאי שימוש
              </ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.footerSpacer} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 24,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
    gap: 24,
  },
  intro: {
    fontSize: 14,
    textAlign: 'right',
    lineHeight: 22,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'right',
  },
  linksCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 4,
    marginTop: 8,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linksDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  footerSpacer: {
    height: 20,
  },
});
