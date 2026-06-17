import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// --- UI Components ---

const ChoiceButton = ({ label, selected, onPress, multi = false, theme }: any) => (
  <TouchableOpacity 
    style={[
      styles.choiceButton, 
      { backgroundColor: selected ? theme.primary : theme.background, borderColor: selected ? theme.primary : theme.border },
      Shadow.soft
    ]} 
    onPress={onPress}
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

const religiosityOptions = ['חילוני/ת', 'מסורתי/ת', 'דתי/ה', 'דתי/ה לאומי/ת', 'חרדי/ת'];
const searchIntentOptions = ['קשר לטווח ארוך', 'קשר קצר', 'סטוצים / קשר לא מחייב', 'ראש פתוח וזורם'];
const fieldOfStudyOptions = ['פסיכולוגיה', 'מדעי המחשב', 'משפטים', 'רפואה', 'מנהל עסקים', 'הנדסה', 'אחר'];
const degreeOptions = ['תואר ראשון', 'תואר שני', 'דוקטורט', 'לימודי תעודה'];
const yearOptions = ["שנה א'", "שנה ב'", "שנה ג'", "שנה ד'", "שנה ה'+"];
const genderInterestOptions = ['גברים', 'נשים', 'כולם'];
const matchPreferenceOptions = [
  'מאותו מוסד לימודים',
  'מאותה פקולטה',
  'מאותו אזור בארץ',
  'באותה רמת דתיות',
  'לא משנה לי'
];
const hobbyOptions = [
  'חדר כושר', 'ריצה', 'טיולים', 'קמפינג', 'ים', 'מוזיקה', 'הופעות', 'סרטים',
  'סדרות', 'קריאה', 'גיימינג', 'בישול', 'מסעדות', 'אומנות', 'צילום', 'ריקוד',
  'כלבים', 'חתולים', 'טכנולוגיה', 'יזמות'
];
const dateTypeOptions = [
  'בית קפה', 'מסעדה', 'בר / דרינק', 'פיקניק', 'טיול בטבע',
  'פעילות אקטיבית', 'ערב ביתי', 'לא משנה מה עושים, העיקר החיבור'
];
const paceOptions = ['איטי מאוד', 'להכיר בהדרגה', 'קצב בינוני', 'כשיש חיבור אני זורם/ת מהר'];

export default function BasicQuestionnaireScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [form, setForm] = useState<any>({
    profile_image: null,
    gender: '',
    age: '',
    height: '',
    city: '',
    religiosity: '',
    intent: '',
    field_of_study: '',
    degree_type: '',
    study_year: '',
    interested_in: '',
    min_age: 18,
    max_age: 40,
    match_preferences: [],
    hobbies: [],
    shared_hobbies: [],
    ideal_date: '',
    pace: '',
    availability: 3,
  });

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setUserEmail(user.email);
    };
    fetchUser();
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('שגיאה', 'יש לאשר גישה לגלריה כדי להעלות תמונה');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setForm({ ...form, profile_image: result.assets[0].uri });
    }
  };

  const toggleMultiSelect = (key: string, value: string) => {
    const current = [...(form[key] || [])];
    const index = current.indexOf(value);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(value);
    }
    setForm({ ...form, [key]: current });
  };

  const handleSave = async () => {
    if (!form.age || !form.religiosity || !form.intent || !form.field_of_study || !form.interested_in) {
      Alert.alert('שימי לב', 'אנא מלאי את כל שדות החובה כדי שנוכל להתחיל בהתאמה');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('שגיאה', 'משתמש לא מחובר');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          ...form,
          updated_at: new Date(),
          questionnaire_step: 1
        });

      if (error) throw error;

      router.replace('/(tabs)');
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
        <Text style={[styles.title, { color: theme.text }]}>בואי נבנה את הפרופיל שלך ✨</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>כדי למצוא התאמה מדויקת, חשוב שנכיר אותך באמת.</Text>

        {/* Part 1: Personal Profile */}
        <SectionTitle title="פרופיל אישי" theme={theme} />
        
        <View style={styles.imagePickerContainer}>
          <TouchableOpacity style={[styles.imagePicker, { backgroundColor: theme.background, borderColor: theme.primary }]} onPress={pickImage}>
            {form.profile_image ? (
              <Image source={{ uri: form.profile_image }} style={styles.previewImage} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="camera" size={32} color={theme.primary} />
                <Text style={[styles.imagePickerText, { color: theme.primary }]}>העלאת תמונה</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: Spacing.md }]}>
            <Text style={[styles.label, { color: theme.text }]}>גיל *</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]} 
              keyboardType="numeric"
              placeholder="גיל"
              value={form.age.toString()}
              onChangeText={(val) => setForm({...form, age: val})}
              textAlign="right"
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: theme.text }]}>גובה (ס"מ)</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]} 
              keyboardType="numeric"
              placeholder="גובה"
              value={form.height.toString()}
              onChangeText={(val) => setForm({...form, height: val})}
              textAlign="right"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>מקום מגורים</Text>
          <TextInput 
            style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]} 
            placeholder="עיר / יישוב"
            value={form.city}
            onChangeText={(val) => setForm({...form, city: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>מידת דתיות *</Text>
          <View style={styles.choicesRow}>
            {religiosityOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                selected={form.religiosity === opt} 
                onPress={() => setForm({...form, religiosity: opt})} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>מה את/ה מחפש/ת באפליקציה? *</Text>
          <View style={styles.choicesRow}>
            {searchIntentOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                selected={form.intent === opt} 
                onPress={() => setForm({...form, intent: opt})} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        {/* Part 2: Studies */}
        <SectionTitle title="לימודים" theme={theme} />
        
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>מוסד לימודים</Text>
          <TextInput 
            style={[styles.input, styles.disabledInput, { backgroundColor: theme.secondary, color: theme.primary }]} 
            value={userEmail ? userEmail.split('@')[1] : ''}
            editable={false}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>תחום לימודים *</Text>
          <View style={styles.choicesRow}>
            {fieldOfStudyOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                selected={form.field_of_study === opt} 
                onPress={() => setForm({...form, field_of_study: opt})} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>איזה תואר?</Text>
          <View style={styles.choicesRow}>
            {degreeOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                selected={form.degree_type === opt} 
                onPress={() => setForm({...form, degree_type: opt})} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>באיזו שנה את/ה?</Text>
          <View style={styles.choicesRow}>
            {yearOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                selected={form.study_year === opt} 
                onPress={() => setForm({...form, study_year: opt})} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        {/* Part 3: Matching Preferences */}
        <SectionTitle title="העדפות היכרות" theme={theme} />

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>אני מעוניין/ת להכיר: *</Text>
          <View style={styles.choicesRow}>
            {genderInterestOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                selected={form.interested_in === opt} 
                onPress={() => setForm({...form, interested_in: opt})} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>טווח גילאים רצוי ({form.min_age} - {form.max_age})</Text>
          <View style={styles.ageRangeRow}>
            <TextInput 
              style={[styles.input, { width: 80, backgroundColor: theme.background, borderColor: theme.border }]} 
              keyboardType="numeric"
              value={form.min_age.toString()}
              onChangeText={(val) => setForm({...form, min_age: parseInt(val) || 18})}
              textAlign="center"
            />
            <Text style={[styles.rangeDash, { color: theme.muted }]}>עד</Text>
            <TextInput 
              style={[styles.input, { width: 80, backgroundColor: theme.background, borderColor: theme.border }]} 
              keyboardType="numeric"
              value={form.max_age.toString()}
              onChangeText={(val) => setForm({...form, max_age: parseInt(val) || 99})}
              textAlign="center"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>חשוב לי שההתאמה תהיה: (בחירה מרובה)</Text>
          <View style={styles.choicesRow}>
            {matchPreferenceOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                multi
                selected={form.match_preferences.includes(opt)} 
                onPress={() => toggleMultiSelect('match_preferences', opt)} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        {/* Part 4: Hobbies */}
        <SectionTitle title="תחביבים ותחומי עניין" theme={theme} />

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>מהם התחביבים שלך?</Text>
          <View style={styles.choicesRow}>
            {hobbyOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                multi
                selected={form.hobbies.includes(opt)} 
                onPress={() => toggleMultiSelect('hobbies', opt)} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        {/* Part 5: Intent & Pace */}
        <SectionTitle title="כוונות וקצב" theme={theme} />

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>איזה דייט נשמע לך הכי כיף?</Text>
          <View style={styles.choicesRow}>
            {dateTypeOptions.map(opt => (
              <ChoiceButton 
                key={opt} 
                label={opt} 
                selected={form.ideal_date === opt} 
                onPress={() => setForm({...form, ideal_date: opt})} 
                theme={theme}
              />
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>כמה את/ה פנוי/ה לזוגיות כרגע? (1-5)</Text>
          <View style={styles.sliderContainer}>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={1}
              maximumValue={5}
              step={1}
              value={form.availability}
              onValueChange={(val) => setForm({...form, availability: val})}
              minimumTrackTintColor={theme.primary}
              maximumTrackTintColor={theme.border}
              thumbTintColor={theme.primary}
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>לא פנוי/ה</Text>
              <Text style={styles.sliderLabel}>פנוי/ה מאוד</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.primary }, Shadow.soft, loading && styles.disabledButton]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? 'שומר...' : 'סיום והצגת התאמות'}
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
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.sm,
    textAlign: 'right',
  },
  input: {
    height: 56,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: 16,
    borderWidth: 1,
  },
  disabledInput: {
    opacity: 0.8,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row-reverse',
  },
  imagePickerContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  imagePicker: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
  },
  imagePickerText: {
    fontSize: 13,
    marginTop: 6,
    fontWeight: '700',
  },
  choicesRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  choiceButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
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
  ageRangeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rangeDash: {
    fontSize: 16,
    fontWeight: '600',
  },
  sliderContainer: {
    paddingHorizontal: Spacing.sm,
  },
  sliderLabels: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: -5,
  },
  sliderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
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
: 'space-between',
    marginTop: -5,
  },
  sliderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
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
