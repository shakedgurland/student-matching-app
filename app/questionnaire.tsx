import React, { useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Step = 1 | 2 | 3 | 4 | 5;

// Design Constants for Premium UniMatch Style
const UI_COLORS = {
  bg: '#FAFBFC', // Almost-white clean background
  softBg: '#F3F7F8', // Subtle surface
  selectedBg: '#E8F8F6', // Selected background for chips/cards
  primary: '#2EC4B6', // Fresh turquoise/aqua
  secondary: '#3D348B', // Premium indigo
  accent: '#FF6B6B', // Coral emotional accent
  text: '#172033', // Deep navy
  textLight: '#667085', // Soft gray-blue
  selectedText: '#0F766E', // Text color for selected state
  border: '#E7ECF2', // Border color
  card: '#FFFFFF',
  progressInactive: '#E7ECF2',
};

export default function QuestionnaireScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  
  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#0F172A' : UI_COLORS.bg,
    card: isDark ? '#1E293B' : UI_COLORS.card,
    text: isDark ? '#F1F5F9' : UI_COLORS.text,
    textLight: isDark ? '#94A3B8' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
    softBg: isDark ? 'rgba(46, 196, 182, 0.1)' : UI_COLORS.softBg,
    selectedBg: isDark ? 'rgba(46, 196, 182, 0.2)' : UI_COLORS.selectedBg,
  };

  const [formData, setFormData] = useState({
    // Step 1: Profile
    age: '',
    gender: '',
    university: '',
    faculty: '',
    year: '',
    campus: '',
    
    // Step 2: Intent
    intent: [] as string[],
    connectionDepth: '',
    interestedIn: '',
    sameFacultyImportance: 3,
    
    // Step 3: Social Style
    spontaneity: '',
    elevatorScenario: '',
    karaokeChance: '',
    familiarFace: '',
    
    // Step 4: Values & Communication
    importantInPartner: [] as string[],
    communicationStyle: '',
    careLanguage: [] as string[],
    connectWith: '',
    
    // Step 5: Preferences & Boundaries
    dealbreakers: [] as string[],
    comfortNeeds: [] as string[],
    meetingStyle: '',
    personalNuance: '',
  });

  const nextStep = () => {
    if (currentStep < 5) setCurrentStep((currentStep + 1) as Step);
    else {
      Alert.alert('בהכנה', 'מצא/י לי התאמה - פיצ׳ר בהכנה!');
      router.replace('/(tabs)');
    }
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep((currentStep - 1) as Step);
    else router.back();
  };

  const toggleMultiSelect = (val: string) => {
    setFormData((prev) => ({
      ...prev,
      intent: prev.intent.includes(val)
        ? prev.intent.filter((i) => i !== val)
        : [...prev.intent, val],
    }));
  };

  const toggleMultiSelectField = (field: 'importantInPartner' | 'careLanguage' | 'dealbreakers' | 'comfortNeeds', val: string, max?: number) => {
    setFormData((prev) => {
      const currentList = prev[field];
      if (currentList.includes(val)) {
        return { ...prev, [field]: currentList.filter(item => item !== val) };
      }
      if (max && currentList.length >= max) {
        return prev;
      }
      return { ...prev, [field]: [...currentList, val] };
    });
  };

  const renderProgress = () => (
    <View style={styles.progressContainer}>
      {[1, 2, 3, 4, 5].map((step) => (
        <View
          key={step}
          style={[
            styles.progressSegment,
            { 
              backgroundColor: step <= currentStep ? UI_COLORS.primary : UI_COLORS.progressInactive,
            },
          ]}
        />
      ))}
    </View>
  );

  const renderSingleSelect = (field: keyof typeof formData, options: string[]) => (
    <View style={styles.optionList}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[
            styles.optionButton,
            { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
            formData[field] === opt && {
              borderColor: UI_COLORS.primary,
              backgroundColor: dynamicColors.selectedBg,
            },
          ]}
          onPress={() => setFormData({ ...formData, [field]: opt })}>
          <ThemedText
            style={[
              styles.optionText,
              { color: dynamicColors.text },
              formData[field] === opt && { color: UI_COLORS.selectedText, fontWeight: '700' },
            ]}>
            {opt}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 1</ThemedText>
        <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.secondary }]}>מי אני כסטודנט/ית</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>2. גיל</ThemedText>
        <TextInput
          style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
          placeholder="למשל: 24"
          placeholderTextColor={dynamicColors.textLight}
          keyboardType="number-pad"
          value={formData.age}
          onChangeText={(v) => setFormData({ ...formData, age: v })}
        />
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>3. מגדר</ThemedText>
        {renderSingleSelect('gender', ['אישה', 'גבר', 'אחר'])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>4. אוניברסיטה</ThemedText>
        {renderSingleSelect('university', [
          'האוניברסיטה העברית',
          'אוניברסיטת תל אביב',
          'אוניברסיטת בן גוריון',
          'אוניברסיטת חיפה',
          'הטכניון',
          'אוניברסיטת בר אילן',
          'אוניברסיטת אריאל',
          'אחר',
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>5. פקולטה</ThemedText>
        {renderSingleSelect('faculty', [
          'משפטים',
          'מנהל עסקים',
          'מדעי החברה',
          'מדעי הרוח',
          'מדעי הטבע',
          'רפואה',
          'הנדסה / מדעי המחשב',
          'חינוך',
          'אחר',
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>6. שנה בתואר</ThemedText>
        {renderSingleSelect('year', [
          'שנה א׳',
          'שנה ב׳',
          'שנה ג׳',
          'שנה ד׳ ומעלה',
          'תואר שני',
          'דוקטורט',
          'אחר',
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>7. קמפוס</ThemedText>
        {renderSingleSelect('campus', ['הר הצופים', 'גבעת רם', 'עין כרם', 'רחובות', 'אחר'])}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 2</ThemedText>
        <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.secondary }]}>מה אני מחפש/ת ב-UniMatch</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>8. מה היית רוצה למצוא ב-UniMatch?</ThemedText>
        <View style={styles.chipGrid}>
          {[
            'זוגיות',
            'חברות חדשה',
            'שותף/ה ללמידה',
            'נטוורקינג',
            'להכיר אנשים מפקולטות אחרות',
            'מישהו/י לצאת איתו/ה לאירועים',
            'עדיין לא בטוח/ה',
          ].map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.intent.includes(opt) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => toggleMultiSelect(opt)}>
              <ThemedText style={[styles.chipText, { color: dynamicColors.text }, formData.intent.includes(opt) && { color: UI_COLORS.selectedText }]}>
                {opt}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>9. איזה סוג חיבור הכי מתאים לך כרגע?</ThemedText>
        {renderSingleSelect('connectionDepth', [
          'משהו עמוק ומשמעותי',
          'משהו קליל שיכול להתפתח',
          'להכיר קודם בלי לחץ',
          'חיבור חברי או סטודנטיאלי',
          'חיבור סביב לימודים או קריירה',
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>10. את מי היית רוצה להכיר?</ThemedText>
        {renderSingleSelect('interestedIn', ['נשים', 'גברים', 'לא משנה לי', 'מעדיף/ה לא להגדיר כרגע'])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>11. עד כמה חשוב לך שההתאמה תהיה מאותה פקולטה?</ThemedText>
        <View style={styles.scaleContainer}>
          <View style={styles.scaleLabels}>
            <ThemedText style={[styles.scaleLabelText, { color: dynamicColors.textLight }]}>1 = בכלל לא חשוב, דווקא מעניין אותי להכיר מחוץ לפקולטה</ThemedText>
            <ThemedText style={[styles.scaleLabelText, { color: dynamicColors.textLight }]}>5 = מאוד חשוב לי, אני מעדיף/ה מישהו/י מאותו עולם</ThemedText>
          </View>
          <View style={styles.scaleButtons}>
            {[1, 2, 3, 4, 5].map((val) => (
              <TouchableOpacity
                key={val}
                style={[
                  styles.scaleCircle,
                  { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                  formData.sameFacultyImportance === val && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
                ]}
                onPress={() => setFormData({ ...formData, sameFacultyImportance: val })}>
                <ThemedText style={[styles.scaleCircleText, { color: dynamicColors.text }, formData.sameFacultyImportance === val && { color: UI_COLORS.selectedText }]}>
                  {val}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 3</ThemedText>
        <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.secondary }]}>אופי וסגנון חברתי</ThemedText>
      </View>
      
      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>12. חבר/ה מתקשר/ת ואומר/ת: "תוך שעה נוסעים לסופ״ש ספונטני". מה קורה?</ThemedText>
        {renderSingleSelect('spontaneity', [
          'ברור, אני כבר אורז/ת. חיים פעם אחת.',
          'רגע, מי בא איפה ישנים כמה זה עולה ואז כנראה אזרום.',
          'תלוי עם מי ותלוי מתי — אני ספונטני/ת, אבל עם גבולות.',
          'אין מצב. אני צריך/ה לדעת מראש'
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>13. נתקעת במעלית עם מישהו/י שלא הכרת. מה הכי סביר שיקרה?</ThemedText>
        {renderSingleSelect('elevatorScenario', [
          'אני אתחיל שיחה כאילו אנחנו מכירים מהצבא / מהגן.',
          'אני אזרוק הערה מצחיקה ואבדוק אם יש עם מי לדבר.',
          'אני אחייך בנימוס ואקווה שהשקט לא יהיה מוזר מדי.',
          'אני אבדוק את הטלפון כאילו יש לי משהו ממש חשוב.',
          'אני אהיה זה/זו שמנסה להרגיע את כולם וללחוץ על כל הכפתורים הנכונים.'
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>14. מזמינים אותך לעלות לקריוקי. מה הסיכוי שזה קורה?</ThemedText>
        {renderSingleSelect('karaokeChance', [
          'אני כבר בוחר/ת שיר. תנו לי מיקרופון.',
          'רק אם עוד מישהו עולה איתי.',
          'אני אעודד את כולם מהצד ואנסה שלא יקראו לי.',
          'אולי אחרי קצת זמן ואווירה טובה.',
          'אין סיכוי. אני הקהל, לא ההופעה.'
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>15. את/ה רואה מישהו/י מוכר/ת מרחוק, אבל לא בטוח/ה שהוא/היא ראה/ראתה אותך. מה תעשה/י?</ThemedText>
        {renderSingleSelect('familiarFace', [
          'אנופף בלי לחשוב יותר מדי.',
          'אחכה לראות אם הוא/היא מזהה אותי קודם.',
          'אסתכל בטלפון כאילו אני באמצע משימה חשובה.',
          'אעשה חצי חיוך כזה של "ראינו לא ראינו"',
          'אשנה כיוון ואעמיד פנים שזה היה מתוכנן.'
        ])}
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 4</ThemedText>
        <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.secondary }]}>ערכים, תקשורת וסגנון קשר</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>16. מה הכי חשוב לך באדם שמולך? (עד 4)</ThemedText>
        <View style={styles.chipGrid}>
          {[
            'כנות', 'הומור', 'רגישות', 'שאפתנות', 'יציבות', 'פתיחות', 'אינטליגנציה', 'קלילות', 'נאמנות', 'יכולת להקשיב', 'עצמאות', 'חום ואכפתיות'
          ].map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.importantInPartner.includes(opt) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => toggleMultiSelectField('importantInPartner', opt, 4)}>
              <ThemedText style={[styles.chipText, { color: dynamicColors.text }, formData.importantInPartner.includes(opt) && { color: UI_COLORS.selectedText }]}>
                {opt}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>17. איזה סגנון תקשורת הכי מתאים לך?</ThemedText>
        {renderSingleSelect('communicationStyle', [
          'פתוח וישיר — עדיף לדבר על דברים.',
          'רגוע והדרגתי — לא חייבים לפתוח הכול מיד.',
          'קליל והומוריסטי — גם דברים רציניים אפשר לקחת בפרופורציה.',
          'עמוק ומשמעותי — אני אוהב/ת שיחות שיש בהן עומק.',
          'מעשי — פחות דיבורים, יותר מעשים.'
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>18. איך את/ה בדרך כלל מראה אכפתיות?</ThemedText>
        <View style={styles.chipGrid}>
          {[
            'מילים טובות', 'זמן איכות', 'עזרה בפועל', 'הקשבה', 'מגע פיזי', 'מתנות קטנות', 'לזכור פרטים קטנים', 'להיות שם כשצריך'
          ].map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.careLanguage.includes(opt) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => toggleMultiSelectField('careLanguage', opt)}>
              <ThemedText style={[styles.chipText, { color: dynamicColors.text }, formData.careLanguage.includes(opt) && { color: UI_COLORS.selectedText }]}>
                {opt}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>19. אני בדרך כלל מתחבר/ת יותר לאנשים שהם:</ThemedText>
        {renderSingleSelect('connectWith', [
          'דומים לי',
          'שונים ממני',
          'משלימים אותי',
          'מאתגרים אותי לחשוב אחרת',
          'אם יש חיבור — זה לא באמת משנה'
        ])}
      </View>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 5</ThemedText>
        <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.secondary }]}>העדפות, גבולות ודיל־ברייקרים</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>20. מה כנראה יוריד לך את החשק להמשיך להכיר? (עד 4)</ThemedText>
        <View style={styles.chipGrid}>
          {[
            'חוסר כבוד לגבולות', 'תקשורת לא ברורה', 'יהירות', 'חוסר רצינות', 'שיפוטיות', 'פער גדול בציפיות', 'לחץ להיפגש מהר מדי', 'חוסר הומור', 'חוסר יציבות', 'יותר מדי דרמה'
          ].map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.dealbreakers.includes(opt) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => toggleMultiSelectField('dealbreakers', opt, 4)}>
              <ThemedText style={[styles.chipText, { color: dynamicColors.text }, formData.dealbreakers.includes(opt) && { color: UI_COLORS.selectedText }]}>
                {opt}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>21. מה גורם לך להרגיש בנוח בהיכרות ראשונה?</ThemedText>
        <View style={styles.chipGrid}>
          {[
            'לדבר קצת באפליקציה לפני שנפגשים', 'להיפגש במקום ציבורי', 'שיהיה ברור מה הצד השני מחפש', 'שלא יהיה לחץ', 'פרופיל מאומת', 'הקשר סטודנטיאלי ברור', 'שיחה קלילה ולא כבדה מדי בהתחלה'
          ].map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.comfortNeeds.includes(opt) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => toggleMultiSelectField('comfortNeeds', opt)}>
              <ThemedText style={[styles.chipText, { color: dynamicColors.text }, formData.comfortNeeds.includes(opt) && { color: UI_COLORS.selectedText }]}>
                {opt}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>22. איזה מפגש ראשון הכי מתאים לך?</ThemedText>
        {renderSingleSelect('meetingStyle', [
          'קפה קצר בקמפוס',
          'הליכה קצרה בחוץ',
          'בר בערב',
          'למידה משותפת בספרייה',
          'אירוע סטודנטיאלי',
          'שיחת וידאו או צ׳אט קודם',
          'משהו ספונטני ולא מתוכנן מדי'
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>23. משהו שחשוב לדעת עליי (אופציונלי)</ThemedText>
        <TextInput
          style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border, height: 100, textAlignVertical: 'top' }]}
          placeholder="שתפ/י משהו קטן..."
          placeholderTextColor={dynamicColors.textLight}
          multiline
          value={formData.personalNuance}
          onChangeText={(v) => setFormData({ ...formData, personalNuance: v })}
        />
      </View>
    </View>
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}>
          {renderProgress()}
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
            {currentStep === 5 && renderStep5()}

            <View style={styles.navigation}>
              <TouchableOpacity
                style={[styles.navButton, styles.primaryNav, { backgroundColor: UI_COLORS.primary }]}
                onPress={nextStep}>
                <ThemedText style={styles.primaryNavText}>
                  {currentStep === 5 ? 'מצא/י לי התאמה' : 'המשך'}
                </ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.navButton} onPress={prevStep}>
                <ThemedText style={[styles.secondaryNavText, { color: UI_COLORS.secondary }]}>חזרה</ThemedText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  progressContainer: {
    flexDirection: 'row-reverse',
    height: 4,
    width: '100%',
    paddingHorizontal: 24,
    gap: 8,
    marginTop: 20,
    marginBottom: 10,
  },
  progressSegment: {
    flex: 1,
    height: '100%',
    borderRadius: 2,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
  },
  stepContent: {
    gap: 32,
    paddingTop: 20,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  stepSubtitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'right',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  formGroup: {
    gap: 16,
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'right',
    lineHeight: 24,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    textAlign: 'right',
  },
  optionList: {
    gap: 12,
  },
  optionButton: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'flex-end',
  },
  optionText: {
    fontSize: 16,
    textAlign: 'right',
    fontWeight: '600',
  },
  chipGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  scaleContainer: {
    gap: 20,
  },
  scaleLabels: {
    gap: 10,
  },
  scaleLabelText: {
    fontSize: 14,
    textAlign: 'right',
    lineHeight: 20,
    fontWeight: '500',
  },
  scaleButtons: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  scaleCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scaleCircleText: {
    fontSize: 18,
    fontWeight: '800',
  },
  navigation: {
    marginTop: 48,
    gap: 16,
  },
  navButton: {
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryNav: {
    shadowColor: '#2EC4B6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryNavText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryNavText: {
    fontSize: 16,
    fontWeight: '600',
  },
});