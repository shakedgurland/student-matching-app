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

export default function PrivacyPolicyScreen() {
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
      title: '1. מי אנחנו',
      body:
        'UniMatch (להלן "האפליקציה", "השירות", "אנחנו") היא אפליקציית התאמה לסטודנטים ולסטודנטיות במוסדות אקדמיים בישראל. המטרה שלנו לחבר בין סטודנטים על בסיס תחומי עניין, ערכים, פקולטה, סגנון תקשורת ומידע נוסף שהמשתמשים בוחרים לשתף. מדיניות פרטיות זו מסבירה איזה מידע נאסף, איך אנחנו משתמשים בו, ועם מי הוא עשוי להיות משותף.',
    },
    {
      title: '2. איזה מידע נאסף',
      body:
        '• פרטי חשבון: כתובת אימייל אקדמית (סיומת ‎.ac.il‎) וסיסמה (מאוחסנת מוצפנת ב-Supabase Auth).\n• פרופיל: שם תצוגה, גיל, מגדר, גובה, עיר, פקולטה, מוסד לימודים, שלב בתואר, תחומי עניין.\n• תמונות פרופיל שאת/ה מעלה.\n• תשובות שאלון ההתאמה: כוונות, סגנון תקשורת, ערכים, העדפות.\n• מידע על שימוש: צפיות במסך, לחיצות על כפתורים, השלמת שלבים בשאלון, חיפושי התאמה.\n• מידע טכני: מזהה משתמש פנימי, סוג מכשיר, גרסת אפליקציה, שגיאות לצורכי תחזוקה.',
    },
    {
      title: '3. מידע רגיש',
      body:
        'חלק מהמידע שאת/ה מספק/ת בשאלון — כמו רמת דתיות, ערכים בקשר, או תיאור אישי — עשוי להיחשב כמידע רגיש. את/ה בוחר/ת באופן עצמאי מה לשתף ומה לא. אי-מילוי שדות מסוימים עלול להשפיע על איכות ההתאמה.',
    },
    {
      title: '4. איך אנחנו משתמשים במידע',
      body:
        '• ניהול החשבון שלך ואפשור התחברות מאובטחת.\n• חישוב התאמות בין משתמשים על בסיס תשובות השאלון והפרופיל.\n• הצגת הפרופיל שלך למשתמשים שאיתם הותאמת.\n• שמירה על קהילה סטודנטיאלית בטוחה ומניעת שימוש לרעה.\n• מתן תמיכה, טיפול בתקלות, ומענה לפניות.\n• שיפור האפליקציה באמצעות מדדים מצטברים ולוגים פנימיים.',
    },
    {
      title: '5. שיתוף עם ספקי שירות',
      body:
        'כדי להפעיל את האפליקציה אנחנו משתמשים בספקי שירות מהימנים:\n• Supabase — אחסון מסד נתונים, אימות משתמשים, אחסון תמונות, ופונקציות צד-שרת.\n• OpenAI — ניתוח טקסט חופשי שעוזר לשפר את איכות ההתאמה, ככל שהפיצ\'ר פעיל.\nהמידע המועבר לספקים הללו מוצפן בהעברה ומוגן בהתאם לתנאיהם. איננו משתפים מידע אישי עם צדדים שלישיים מעבר לכך.',
    },
    {
      title: '6. אין מכירה של מידע אישי',
      body:
        'איננו מוכרים, משכירים או סוחרים במידע האישי שלך לצדדים שלישיים לצורכי שיווק.',
    },
    {
      title: '7. אבטחת מידע',
      body:
        'אנחנו נוקטים אמצעי אבטחה סבירים: הצפנת תעבורה (HTTPS), בקרת גישה ברמת השורה (Row-Level Security) ב-Supabase, והפרדה בין מפתחות לקוח לבין מפתחות שירות. עם זאת, אין דרך להבטיח באופן מוחלט אבטחה של מידע המועבר באינטרנט או מאוחסן בענן.',
    },
    {
      title: '8. שמירת מידע',
      body:
        'המידע נשמר כל עוד החשבון שלך פעיל. במחיקת חשבון, המידע האישי נמחק תוך זמן סביר, למעט מידע שעלינו לשמור על פי דרישת חוק או לצורך הגנה משפטית.',
    },
    {
      title: '9. מחיקת חשבון וזכויות',
      body:
        'יש לך זכות לבקש:\n• גישה למידע השמור עליך.\n• תיקון או עדכון של מידע שגוי.\n• מחיקה של חשבונך ושל הנתונים הקשורים אליו.\nלהגשת בקשה — פני אלינו במייל המופיע בסעיף "יצירת קשר" למטה.',
    },
    {
      title: '10. גיל מינימום',
      body:
        'האפליקציה מיועדת לבני 18 ומעלה בלבד. בעצם ההרשמה את/ה מצהיר/ה שאת/ה בן/בת 18 ומעלה. אם נגלה משתמש מתחת לגיל 18, החשבון יוסר באופן מיידי.',
    },
    {
      title: '11. אחריות המשתמש',
      body:
        'את/ה אחראי/ת באופן בלעדי לתוכן שאת/ה משתף/ת, לאופן שבו את/ה מתנהל/ת מול משתמשים אחרים, ולהחלטה אם, מתי ועם מי להיפגש פנים אל פנים. הפעל/י שיקול דעת. איננו יכולים להבטיח את אופיים, כוונותיהם או נכונות המידע של משתמשים אחרים.',
    },
    {
      title: '12. הגבלת אחריות',
      body:
        'UniMatch מסופקת "כפי שהיא" (AS-IS) וללא אחריות מכל סוג, מפורשת או משתמעת. במידה המותרת בחוק, איננו נושאים באחריות לכל נזק ישיר, עקיף, מקרי, מיוחד או תוצאתי הנובע מהשימוש באפליקציה — לרבות נזק רגשי, כלכלי או פיזי. השימוש באפליקציה הוא על אחריותך הבלעדית.',
    },
    {
      title: '13. שינויים במדיניות',
      body:
        'ייתכן שנעדכן את מדיניות הפרטיות מעת לעת. עדכונים מהותיים יוצגו באפליקציה. המשך השימוש לאחר עדכון מהווה הסכמה למדיניות המעודכנת.',
    },
    {
      title: '14. יצירת קשר',
      body:
        `לכל שאלה, בקשה או דיווח בנוגע למדיניות הפרטיות — אפשר ליצור איתנו קשר בכתובת:\n${CONTACT_EMAIL}`,
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
            מדיניות פרטיות
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
    flexDirection: 'row-reverse',
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
