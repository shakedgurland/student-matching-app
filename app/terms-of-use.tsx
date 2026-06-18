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

const CONTACT_EMAIL = 'unimatchapp.team@gmail.com';
const LAST_UPDATED = '2026-06-17';

export default function TermsOfUseScreen() {
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
      title: '1. הסכמה לתנאים',
      body:
        'ברוכים הבאים ל-UniMatch. תנאי שימוש אלה ("התנאים") מסדירים את השימוש שלך באפליקציית UniMatch ("השירות"). השימוש בשירות מהווה הסכמה לתנאים אלה ולמדיניות הפרטיות שלנו. אם אינך מסכים/ה לתנאים, אנא הימנע/י מהשימוש בשירות.',
    },
    {
      title: '2. השירות מסופק "כפי שהוא"',
      body:
        'השירות מסופק "כפי שהוא" (AS-IS) וללא אחריות מכל סוג, מפורשת או משתמעת, לרבות אחריות לאיכות, התאמה למטרה מסוימת או זמינות רציפה. איננו מתחייבים שהשירות יהיה נטול שגיאות, מאובטח באופן מוחלט או יפעל ללא הפרעה.',
    },
    {
      title: '3. אין הבטחת התאמות',
      body:
        'איננו מבטיחים מציאת התאמה, יצירת קשר רומנטי או חברתי, או יחסים מסוג כלשהו. אלגוריתם ההתאמה הוא כלי תומך החלטה בלבד והוא מציע התאמות אפשריות על בסיס המידע שסיפקת. ההחלטה ליצור קשר, להמשיך בשיחה או להיפגש היא שלך בלבד.',
    },
    {
      title: '4. גיל מינימום',
      body:
        'השירות מיועד לבני 18 ומעלה בלבד. בעצם השימוש את/ה מצהיר/ה שאת/ה בן/בת 18 לפחות וכי יש לך הכשרות החוקית להתקשר בהסכם זה.',
    },
    {
      title: '5. אחריות המשתמש',
      body:
        'את/ה אחראי/ת באופן בלעדי על:\n• נכונות המידע ושלמות הפרופיל שלך.\n• התמונות שאת/ה מעלה — כולל זכויות יוצרים והסכמה של המופיעים בהן.\n• האינטראקציה שלך עם משתמשים אחרים, באפליקציה ומחוצה לה.\n• ההחלטה אם, מתי, היכן ועם מי להיפגש פנים אל פנים.\nמומלץ להיפגש לראשונה במקום ציבורי ולעדכן חבר/ה קרוב/ה על המפגש.',
    },
    {
      title: '6. התנהגות אסורה',
      body:
        'אסור להשתמש בשירות כדי:\n• להתחזות לאדם אחר או למסור מידע כוזב.\n• להטריד, לאיים, או לפגוע במשתמשים אחרים.\n• להפיץ תוכן בלתי הולם, מיני בוטה, אלים או מפלה.\n• לשווק מוצרים או שירותים בלי אישור מראש.\n• להפעיל בוטים, סקרייפינג או כלים אוטומטיים.\n• להפר חוק כלשהו.\nהפרת התנאים עלולה להוביל להשעיה או למחיקה של החשבון.',
    },
    {
      title: '7. הסרת תוכן והשעיית חשבונות',
      body:
        'אנחנו שומרים לעצמנו את הזכות להסיר תוכן, להשעות או למחוק חשבונות לפי שיקול דעתנו, ובהתאם להפרות תנאים אלה, ללא הודעה מוקדמת ובלי חבות כלפיך.',
    },
    {
      title: '8. דיסקליימר על אלגוריתם ההתאמה',
      body:
        'אלגוריתם ההתאמה מבוסס על תשובות השאלון, נתוני הפרופיל וכללי התאמה כלליים. הוא איננו ערובה לאיכות הקשר, לכימיה אישית או להתאמה אמיתית. ייתכן שלא תקבל/י התאמות, או שההתאמות שתקבל/י לא יתאימו לך.',
    },
    {
      title: '9. מדיניות פרטיות',
      body:
        'מדיניות הפרטיות שלנו, המשולבת כחלק בלתי נפרד מתנאים אלה, מסבירה איזה מידע נאסף ואיך אנחנו משתמשים בו. השימוש בשירות מהווה הסכמה גם למדיניות הפרטיות.',
    },
    {
      title: '10. קניין רוחני',
      body:
        'זכויות הקניין הרוחני באפליקציה — לרבות עיצוב, קוד, לוגו, טקסטים שיווקיים ואלגוריתם ההתאמה — שייכות ל-UniMatch ואסור להעתיק, לשכפל, להפיץ או ליצור מהן עבודות נגזרות ללא אישור בכתב. המידע שאת/ה מעלה (תמונות, תשובות) נשאר שלך — אנחנו מקבלים רישיון מוגבל להציגו במסגרת השירות.',
    },
    {
      title: '11. שינויי זמינות',
      body:
        'אנחנו רשאים לשנות, להגביל, להשעות או להפסיק את השירות (או חלקים ממנו) בכל עת, ללא הודעה מוקדמת וללא חבות כלפיך.',
    },
    {
      title: '12. הגבלת אחריות',
      body:
        'במידה המקסימלית המותרת בחוק, UniMatch ובעליה לא יישאו באחריות לכל נזק ישיר, עקיף, מקרי, מיוחד או תוצאתי — לרבות נזק רגשי, כלכלי או פיזי — הנובע מהשימוש בשירות או מאינטראקציה עם משתמשים אחרים, באפליקציה ומחוצה לה. השימוש בשירות הוא על אחריותך הבלעדית.',
    },
    {
      title: '13. שיפוי',
      body:
        'את/ה מתחייב/ת לשפות את UniMatch ובעליה על כל תביעה, נזק או הוצאה (לרבות שכר טרחת עורך דין) הנובעים משימוש בלתי-ראוי שלך בשירות, מהפרת תנאים אלה, או מפגיעה במשתמשים אחרים.',
    },
    {
      title: '14. דין החל וסמכות שיפוט',
      body:
        'הדין החל הוא דיני מדינת ישראל, וסמכות השיפוט תהיה נתונה לבתי המשפט המוסמכים בישראל.',
    },
    {
      title: '15. יצירת קשר',
      body: `לכל שאלה לגבי תנאי השימוש — אפשר ליצור איתנו קשר בכתובת:\n${CONTACT_EMAIL}`,
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
            תנאי שימוש
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText style={[styles.lastUpdated, { color: dynamicColors.textLight }]}>
            עודכן לאחרונה: {LAST_UPDATED}
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
  lastUpdated: {
    fontSize: 13,
    textAlign: 'right',
    fontStyle: 'italic',
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
  footerSpacer: {
    height: 20,
  },
});
