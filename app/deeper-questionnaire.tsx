import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// --- UI Components ---

const ChoiceButton = ({ label, selected, onPress, multi = false, limitReached = false, theme }: any) => (
  <TouchableOpacity 
    style={[
      styles.choiceButton, 
      { backgroundColor: selected ? theme.primary : theme.background, borderColor: selected ? theme.primary : theme.border },
      limitReached && !selected && { opacity: 0.4 },
      Shadow.soft
    ]} 
    onPress={onPress}
    disabled={limitReached && !selected}
  >
    <Text style={[styles.choiceText, { color: selected ? 'white' : theme.text }]}>{label}</Text>
    {multi && (
      <View style={[styles.checkbox, { borderColor: selected ? 'white' : theme.border, backgroundColor: selected ? theme.primary : 'transparent' }]}>
        {selected && <Ionicons name="checkmark" size={12} color="white" />}
      </View>
    )}
  </TouchableOpacity>
);

const SectionTitle = ({ title, theme }: { title: string, theme: any }) => (
  <View style={styles.sectionHeader}>
    <Text style={[styles.sectionTitleText, { color: theme.primary }]}>{title}</Text>
    <View style={[styles.sectionLine, { backgroundColor: theme.secondary }]} />
  </View>
);

// --- Options Data ---

const conflictOptions = ['רוצה לדבר מיד', 'צריך/ה זמן להירגע', 'נמנע/ת מעימותים', 'תלוי במצב'];
const relationshipIssueOptions = ['לפתור אותה מיד', 'להבין קודם את הרגשות שלי', 'לתת לזמן לעשות את שלו', 'לשמוע את הצד השני'];
const initiativeOptions = ['יוזם/ת שיחה', 'רומז/ת בעדינות', 'מחכה שיפנו אליי', 'תלוי בביטחון שלי באותו רגע'];
const reactionOptions = ['מתלהב/ת', 'בוחן/ת את המצב', 'נלחץ/ת קצת', 'שמתי לב אבל משתדל/ת לא להראות'];
const elevatorOptions = ['אפתח שיחה', 'אחייך ואבדוק אם יש עניין', 'אחכה להזדמנות אחרת', 'כנראה לא אעשה כלום'];
const karaokeOptions = ['ראשון/ה על הבמה', 'שר/ה אם משכנעים אותי', 'מעדיף/ה לצפות', 'מחפש/ת דרך להתחמק'];
const oldFriendOptions = ['ניגש/ת לדבר מיד', 'אומר/ת שלום קצר', 'מחכה שהוא ייגש', 'מעדיף/ה להמשיך בדרכי'];
const flightOptions = ['סוגר/ת מזוודה עכשיו', 'תלוי עם מי', 'צריך/ה זמן לתכנן', 'כנראה לא אטוס'];
const spontaneousOptions = ['בפנים בלי לחשוב פעמיים', 'בדרך כלל זורם/ת', 'תלוי במצב רוח', 'מעדיף/ה לתכנן מראש'];
const relationshipValuesOptions = ['אמון', 'תקשורת', 'משיכה', 'הומור', 'יציבות', 'חברות', 'עצמאות', 'שאפתנות', 'משפחתיות'];
const loveLanguageOptions = ['זמן איכות', 'מילים טובות', 'מגע', 'עזרה ומעשים', 'מתנות'];
const attractionTypeOptions = ['אנשים שדומים לי', 'אנשים שמשלימים אותי', 'אנשים שהפוכים ממני', 'שילוב של השניים'];
const perfectDateOptions = [
  'בית קפה ושיחה טובה', 'מסעדה רומנטית', 'פיקניק בטבע', 'טיול ארוך',
  'בר ודרינק', 'פעילות מיוחדת', 'ערב ביתי', 'לא משנה מה עושים, העיקר החיבור'
];
const redFlagOptions = [
  'חוסר כנות', 'חוסר תקשורת', 'חוסר משיכה', 'חוסר שאפתנות',
  'ערכים שונים מאוד', 'עישון', 'קנאה מוגזמת', 'חוסר עצמאות', 'יחס לא מכבד'
];
const strengthsOptions = [
  'תקשורת טובה', 'נאמנות', 'הקשבה', 'הומור', 'רומנטיות',
  'כנות', 'יציבות', 'תמיכה', 'ספונטניות', 'פתרון קונפליקטים'
];
const factsOptions = [
  'אני צריך/ה הרבה זמן לבד', 'אני מאוד משפחתי/ת', 'הקריירה חשובה לי מאוד',
  'אני אדם רגיש', 'אני אדם ישיר', 'אני אוהב/ת ספונטניות',
  'חשוב לי סדר וארגון', 'אני אוהב/ת הרפתקאות', 'לוקח לי זמן להיפתח'
];
const partnerSearchOptions = [
  'אינטליגנציה', 'הומור', 'אמביציה', 'רגישות', 'תקשורת טובה',
  'ביטחון עצמי', 'משפחתיות', 'משיכה פיזית', 'כנות', 'יציבות',
  'פתיחות מחשבתית', 'ספונטניות', 'ערכים דומים', 'בגרות רגשית'
];
const spaceOptions = ['צריך/ה הרבה מרחב אישי', 'צריך/ה איזון', 'אוהב/ת להיות הרבה ביחד'];
const importantFactorOptions = ['כימיה מיידית', 'התאמה לטווח ארוך', 'שניהם באותה מידה'];
const safetyVsAdventureOptions = ['יציבות וביטחון', 'ריגוש והרפתקאות', 'שילוב של שניהם'];
const feelingOptions = ['בטוחים', 'אהובים', 'מוערכים', 'רגועים', 'נרגשים', 'מובנים', 'חופשיים להיות עצמם'];

export default function DeeperQuestionnaireScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<any>({
    conflict_style: '',
    problem_solving: '',
    initiative_style: '',
    attraction_reaction: '',
    elevator_scenario: '',
    karaoke_style: '',
    old_friend_reaction: '',
    spontaneous_flight: '',
    spontaneous_evening: '',
    rel_values: [],
    love_languages: [],
    attraction_preference: '',
    perfect_date_deep: '',
    red_flags: [],
    strengths: [],
    personal_facts: [],
    partner_traits: [],
    space_preference: '',
    chemistry_vs_longterm: '',
    stability_vs_excitement: '',
    partner_feelings: [],
  });

  const toggleMultiSelect = (key: string, value: string, limit?: number) => {
    const current = [...(form[key] || [])];
    const index = current.indexOf(value);
    if (index > -1) {
      current.splice(index, 1);
    } else if (!limit || current.length < limit) {
      current.push(value);
    }
    setForm({ ...form, [key]: current });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          ...form,
          questionnaire_step: 2,
          updated_at: new Date(),
        })
        .eq('id', user.id);

      if (error) throw error;

      Alert.alert('איזה יופי!', 'שאלון העומק הושלם. עכשיו ההתאמות שלך יהיו הרבה יותר מדויקות.', [
        { text: 'מעולה', onPress: () => router.replace('/(tabs)') }
      ]);
    } catch (err: any) {
      console.error(err);
      Alert.alert('שגיאה בשמירה', err.message || 'אירעה שגיאה לא צפויה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveContainer style={{ backgroundColor: theme.offBackground }} useSafeArea={false}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={[styles.logo, { color: theme.primary }]}>UniMatch</Text>
        <Text style={[styles.title, { color: theme.text }]}>שאלון עומק ✨</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>בואי נצלול פנימה כדי למצוא את ההתאמה המדויקת ביותר.</Text>

        {/* Section 1: Conflicts & Communication */}
        <SectionTitle title="קונפליקטים ותקשורת" theme={theme} />
        
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>כשיש ריב אני בדרך כלל:</Text>
          <View style={styles.choicesRow}>
            {conflictOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                selected={form.conflict_style === opt} 
                onPress={() => setForm({...form, conflict_style: opt})} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>כשיש בעיה בקשר חשוב לי:</Text>
          <View style={styles.choicesRow}>
            {relationshipIssueOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                selected={form.problem_solving === opt} 
                onPress={() => setForm({...form, problem_solving: opt})} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        {/* Section 2: Attraction & Initiative */}
        <SectionTitle title="משיכה ויוזמה" theme={theme} />

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>כשמישהו מוצא חן בעיניי אני בדרך כלל:</Text>
          <View style={styles.choicesRow}>
            {initiativeOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                selected={form.initiative_style === opt} 
                onPress={() => setForm({...form, initiative_style: opt})} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        {/* Section 3: Social Personality */}
        <SectionTitle title="אישיות חברתית" theme={theme} />

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>את/ה בקריוקי עם חברים:</Text>
          <View style={styles.choicesRow}>
            {karaokeOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                selected={form.karaoke_style === opt} 
                onPress={() => setForm({...form, karaoke_style: opt})} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        {/* Section 5: Relationship & Values */}
        <SectionTitle title="זוגיות וערכים" theme={theme} />

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>מה הכי חשוב לך בזוגיות? (עד 3)</Text>
          <View style={styles.choicesRow}>
            {relationshipValuesOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                multi
                selected={form.rel_values.includes(opt)} 
                limitReached={form.rel_values.length >= 3}
                onPress={() => toggleMultiSelect('rel_values', opt, 3)} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>איך את/ה מראה אהבה ואכפתיות?</Text>
          <View style={styles.choicesRow}>
            {loveLanguageOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                multi
                selected={form.love_languages.includes(opt)} 
                onPress={() => toggleMultiSelect('love_languages', opt)} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>מה החוזקות שלך בזוגיות? (עד 4)</Text>
          <View style={styles.choicesRow}>
            {strengthsOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                multi
                selected={form.strengths.includes(opt)} 
                limitReached={form.strengths.length >= 4}
                onPress={() => toggleMultiSelect('strengths', opt, 4)} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>מה היית רוצה שבן/בת הזוג ירגישו כשהם איתך? (עד 3)</Text>
          <View style={styles.choicesRow}>
            {feelingOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                multi
                selected={form.partner_feelings.includes(opt)} 
                limitReached={form.partner_feelings.length >= 3}
                onPress={() => toggleMultiSelect('partner_feelings', opt, 3)} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.primary }, Shadow.soft, loading && styles.disabledButton]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? 'שומר...' : 'סיום ושיפור התאמות'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    flexGrow: 1,
    paddingTop: 60,
  },
  logo: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.h2,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginVertical: Spacing.lg,
    gap: Spacing.md,
  },
  sectionLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  sectionTitleText: {
    fontSize: 18,
    fontWeight: '800',
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.md,
    textAlign: 'right',
  },
  choicesRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  choiceButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  choiceText: {
    fontSize: 14,
    fontWeight: '700',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    height: 64,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
