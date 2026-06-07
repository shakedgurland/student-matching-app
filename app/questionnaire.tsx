import React, { useState, useEffect } from 'react';
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
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '../lib/supabase';
import { logScreenView, logEvent, logFormSubmit, logError, logButtonTap } from '@/lib/analytics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Step = 1 | 2 | 3 | 4 | 5 | 6;

// Design Constants for Bright Premium Style
const UI_COLORS = {
  bg: '#FFF9F6',
  primary: '#FF4D3D', // Solid vivid red-coral
  accent: '#FF8A00', // Small spark accent
  branding: '#FF3D57', // Main branding color
  surface: '#FFF0EA', // Soft romantic surface
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  card: '#FFFFFF',
  progressInactive: '#E9E4E0',
  selectedBg: '#FFF0EA',
  selectedText: '#FF3D57',
};

const BrandMark = ({ size = 28, showSpark = true }: { size?: number, showSpark?: boolean }) => {
  const strokeWidth = size * 0.2;
  const innerSize = size - strokeWidth;
  const sparkSize = size * 0.14;

  return (
    <View style={{ width: size, height: size + strokeWidth, justifyContent: 'flex-end', alignItems: 'center' }}>
      <View style={{
        width: innerSize,
        height: innerSize,
        borderBottomLeftRadius: innerSize / 2,
        borderBottomRightRadius: innerSize / 2,
        borderWidth: strokeWidth,
        borderColor: UI_COLORS.branding,
        borderTopWidth: 0,
      }}>
        <View style={{
          position: 'absolute',
          top: -strokeWidth/2,
          left: -strokeWidth,
          width: strokeWidth,
          height: strokeWidth,
          backgroundColor: UI_COLORS.branding,
          borderTopLeftRadius: strokeWidth * 0.2,
          borderTopRightRadius: strokeWidth * 0.2,
        }} />
        <View style={{
          position: 'absolute',
          top: -strokeWidth/2,
          right: -strokeWidth,
          width: strokeWidth,
          height: strokeWidth,
          backgroundColor: UI_COLORS.branding,
          borderTopLeftRadius: strokeWidth * 0.2,
          borderTopRightRadius: strokeWidth * 0.2,
        }} />
      </View>
      {showSpark && (
        <View style={{
          position: 'absolute',
          top: 0,
          width: sparkSize,
          height: sparkSize,
          borderRadius: sparkSize / 2,
          backgroundColor: UI_COLORS.accent,
        }} />
      )}
    </View>
  );
};

const GENDER_OPTIONS = [
  { label: 'אישה', value: 'woman' },
  { label: 'גבר', value: 'man' },
  { label: 'אחר', value: 'other' }
];

const INTERESTED_IN_OPTIONS = [
  { label: 'נשים', value: 'woman' },
  { label: 'גברים', value: 'man' },
  { label: 'לא משנה לי', value: 'any' }
];

const HEIGHT_PREF_OPTIONS = [
  { label: 'לא חשוב לי', value: 'none' },
  { label: 'נחמד אם כן, אבל לא חובה', value: 'nice_to_have' },
  { label: 'חשוב לי מאוד', value: 'must_have' }
];

const REGION_OPTIONS = [
  { label: 'צפון', value: 'north' },
  { label: 'דרום', value: 'south' },
  { label: 'מרכז', value: 'center' },
  { label: 'ירושלים והסביבה', value: 'jerusalem' },
  { label: 'חיפה והקריות', value: 'haifa' },
];

const DEGREE_STAGE_OPTIONS = [
  { label: 'שנה א׳', value: 'year_1' },
  { label: 'שנה ב׳', value: 'year_2' },
  { label: 'שנה ג׳', value: 'year_3' },
  { label: 'שנה ד׳', value: 'year_4' },
  { label: 'תואר שני', value: 'masters' },
  { label: 'אחר', value: 'other' },
];

const HOBBY_OPTIONS = [
  { label: 'אקסטרים', value: 'extreme' },
  { label: 'אופנוע ים', value: 'jet_ski' },
  { label: 'ים', value: 'beach' },
  { label: 'יוגה', value: 'yoga' },
  { label: 'ספורט', value: 'sports' },
  { label: 'לטייל', value: 'travel' },
  { label: 'טניס', value: 'tennis' },
  { label: 'קמפינג', value: 'camping' },
];

const INTENT_OPTIONS = [
  { label: 'קשר רציני בלבד.', value: 'serious' },
  { label: 'קשר שיכול להתפתח, בלי לחץ.', value: 'evolve' },
  { label: 'להכיר אנשים ולראות לאן זה הולך.', value: 'explore' },
  { label: 'לא בטוח/ה עדיין.', value: 'unsure' },
  { label: 'משהו קליל ולא מחייב.', value: 'casual' },
];

const PACE_OPTIONS = [
  { label: 'לדבר הרבה ולהיפגש מהר.', value: 'fast' },
  { label: 'לבנות בהדרגה אבל לשמור על רצף.', value: 'gradual' },
  { label: 'לאט, בלי לחץ.', value: 'slow' },
  { label: 'קודם להכיר בהתכתבות ואז להיפגש.', value: 'text_first' },
  { label: 'להיפגש יחסית מהר כי רק פנים מול פנים יודעים.', value: 'face_to_face' },
];

const CONFLICT_OPTIONS = [
  { label: 'לדבר מיד ולפתור.', value: 'immediate' },
  { label: 'לקחת קצת זמן להירגע ואז לדבר.', value: 'cooldown' },
  { label: 'לכתוב הודעה כי ככה קל לי להתנסח.', value: 'texting' },
  { label: 'לקבל חיבוק/הרגעה קודם ואז לדבר.', value: 'physical_comfort' },
  { label: 'להתרחק לזמן קצר ולא להרגיש שלוחצים עליי.', value: 'space' },
];

const RESPECT_OPTIONS = [
  { label: 'שאיפות לימודיות/קריירה.', value: 'career' },
  { label: 'משפחה ומסורת.', value: 'family' },
  { label: 'חופש ועצמאות.', value: 'freedom' },
  { label: 'חיים חברתיים וחברים.', value: 'social' },
  { label: 'יציבות וביטחון.', value: 'stability' },
  { label: 'התפתחות אישית.', value: 'growth' },
];

const INTEREST_SIGNAL_OPTIONS = [
  { label: 'הוא/היא יוזם/ת שיחות ומפגשים.', value: 'initiative' },
  { label: 'הוא/היא זוכר/ת דברים קטנים עליי.', value: 'memory' },
  { label: 'הוא/היא אומר/ת במילים מה הוא/היא מרגיש/ה.', value: 'verbal' },
  { label: 'הוא/היא מפנה לי זמן איכות.', value: 'quality_time' },
  { label: 'הוא/היא עושה דברים קטנים בשבילי.', value: 'service' },
  { label: 'יש חום, קרבה ונוכחות.', value: 'warmth' },
];

const CONVERSATION_OPTIONS = [
  { label: 'שיחה עמוקה ואישית.', value: 'deep' },
  { label: 'צחוקים וקלילות.', value: 'funny' },
  { label: 'שיחה אינטלקטואלית.', value: 'intellectual' },
  { label: 'סיפורים וחוויות.', value: 'stories' },
  { label: 'פלרטוט ומשחקיות עדינה.', value: 'flirty' },
  { label: 'שיחה רגועה וטבעית בלי מאמץ.', value: 'natural' },
];

const COMPROMISE_OPTIONS = [
  { label: 'אמון ונאמנות.', value: 'trust' },
  { label: 'תקשורת.', value: 'communication' },
  { label: 'שאיפות לעתיד.', value: 'ambition' },
  { label: 'אורח חיים.', value: 'lifestyle' },
  { label: 'משפחה/דת/מסורת.', value: 'tradition' },
  { label: 'מרחב אישי.', value: 'space' },
];

export default function QuestionnaireScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const isEditMode = mode === 'edit';
  const totalSteps = isEditMode ? 5 : 6;
  
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [photos, setPhotos] = useState<{ uri: string }[]>([]);
  
  const scrollThresholds = React.useRef<Set<number>>(new Set());

  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
    selectedBg: isDark ? 'rgba(255, 61, 87, 0.2)' : UI_COLORS.selectedBg,
  };

  const [formData, setFormData] = useState({
    // Step 1: Profile
    age: '',
    gender: '',
    heightCm: '',
    university: '',
    faculty: '',
    degree_stage: '',
    campus: '',
    region: '',
    hobbies: [] as string[],

    // Core Dynamics & Connection
    intent_type: '',
    relationship_pace: '',
    conflict_style: '',
    respect_priority: '',
    interest_signals: '',
    conversation_style: '',
    compromise_area: '',

    // Preferences & Hard Filters
    interestedInGenders: [] as string[],
    heightPreferenceImportance: 'none',
    minPreferredHeightCm: '',

    // Step 3: Social Style (Deep)
    spontaneity: '',
    elevatorScenario: '',
    karaokeChance: '',
    familiarFace: '',

    // Deep questionnaire extras (legacy or additional)
    importantInPartner: [] as string[],
    communicationStyle: '',
    careLanguage: [] as string[],
    connectWith: '',

    dealbreakers: [] as string[],
    comfortNeeds: [] as string[],
    meetingStyle: '',
    personalNuance: '',
  });

  useEffect(() => {
    logScreenView('Questionnaire');
    logEvent('onboarding_started', { metadata: { mode } });
    logEvent('onboarding_step_viewed', { metadata: { step: currentStep } });
    if (isEditMode) {
      loadAnswers();
    } else {
      setDataLoaded(true);
    }
  }, [isEditMode]);

  const loadAnswers = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from('questionnaire_answers').select('answers').eq('user_id', user.id).single();
      if (data?.answers) {
        setFormData(prev => ({ ...prev, ...data.answers }));
      }
    } catch (e) {
      console.error('Failed to load answers for edit', e);
    } finally {
      setLoading(false);
      setDataLoaded(true);
    }
  };

  const pickImage = async () => {
    try {
      logButtonTap('Questionnaire', 'add_profile_photo');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 1,
      });

      if (!result.canceled) {
        setPhotos([...photos, { uri: result.assets[0].uri }]);
      }
    } catch (error) {
      logError('Questionnaire', 'pickImage_failed', error);
      console.error('Error picking image:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לבחור תמונה');
    }
  };

  const removeLocalPhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    logButtonTap('Questionnaire', isEditMode ? 'save_questionnaire_edit' : 'submit_questionnaire');
    // 1. Mandatory Fields Validation
    if (!formData.gender) {
      logEvent('onboarding_validation_failed', { screen: 'Questionnaire', action: 'submit', metadata: { field: 'gender' } });
      Alert.alert('שדה חובה', 'יש לבחור מגדר כדי להמשיך.');
      return;
    }
    if (!formData.heightCm) {
      logEvent('onboarding_validation_failed', { screen: 'Questionnaire', action: 'submit', metadata: { field: 'heightCm' } });
      Alert.alert('שדה חובה', 'יש להזין גובה כדי להמשיך.');
      return;
    }
    if (!formData.interestedInGenders || formData.interestedInGenders.length === 0) {
      logEvent('onboarding_validation_failed', { screen: 'Questionnaire', action: 'submit', metadata: { field: 'interestedInGenders' } });
      Alert.alert('שדה חובה', 'יש לבחור במי את/ה מעוניין/ת כדי להמשיך.');
      return;
    }

    if (!isEditMode && photos.length === 0) {
      logEvent('onboarding_validation_failed', { screen: 'Questionnaire', action: 'submit', metadata: { field: 'photos' } });
      Alert.alert('חסרה תמונה', 'כדי למצוא התאמה טובה, חובה להוסיף לפחות תמונה אחת לפרופיל.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('שגיאה', 'משתמש לא מחובר');
        return;
      }

      // 1. Save questionnaire answers
      const { error: answersError } = await supabase
        .from('questionnaire_answers')
        .upsert({
          user_id: user.id,
          answers: formData,
        }, { onConflict: 'user_id' });

      if (answersError) {
        logError('Questionnaire', 'save_answers_failed', answersError);
        throw answersError;
      }

      if (!isEditMode) {
        // 2. Upload Photos
        let firstPhotoPath: string | null = null;
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          logEvent('photo_upload_started', { screen: 'Questionnaire', metadata: { index: i } });
          
          // Compress and resize
          const manipResult = await ImageManipulator.manipulateAsync(
            photo.uri,
            [{ resize: { width: 1200 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );

          if (!manipResult.base64) {
            logEvent('photo_upload_failed', { screen: 'Questionnaire', action: 'compression', metadata: { index: i } });
            continue;
          }

          const fileName = `${user.id}/${Date.now()}_${i}.jpg`;
          if (i === 0) firstPhotoPath = fileName;
          
          const { error: storageError } = await supabase.storage
            .from('profile-photos')
            .upload(fileName, decode(manipResult.base64), {
              contentType: 'image/jpeg',
              cacheControl: '3600',
              upsert: false,
            });

          if (storageError) {
            logError('Questionnaire', 'photo_upload_failed', storageError);
            throw storageError;
          }

          // Save to profile_photos table
          const { error: dbError } = await supabase
            .from('profile_photos')
            .insert({
              user_id: user.id,
              storage_path: fileName,
              display_order: i,
            });
            
          if (dbError) {
            logError('Questionnaire', 'photo_db_insert_failed', dbError);
          } else {
            logEvent('photo_upload_succeeded', { screen: 'Questionnaire', metadata: { index: i } });
          }
        }

        // 3. Update profile
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            onboarding_completed: true,
            birth_year: formData.age ? new Date().getFullYear() - parseInt(formData.age) : null,
            gender: formData.gender,
            height_cm: formData.heightCm ? parseInt(formData.heightCm) : null,
            interested_in_genders: formData.interestedInGenders,
            university: formData.university,
            faculty: formData.faculty,
            year_of_study: formData.degree_stage,
            campus: formData.campus,
            region: formData.region,
            hobbies: formData.hobbies,
            avatar_storage_path: firstPhotoPath,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (profileError) {
          logError('Questionnaire', 'profile_update_failed', profileError);
          throw profileError;
        }

        logFormSubmit('Questionnaire', 'onboarding_submitted');
        router.replace('/(tabs)');
      } else {
        // Edit mode: Just update basic profile fields and go back
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            birth_year: formData.age ? new Date().getFullYear() - parseInt(formData.age) : null,
            gender: formData.gender,
            height_cm: formData.heightCm ? parseInt(formData.heightCm) : null,
            interested_in_genders: formData.interestedInGenders,
            university: formData.university,
            faculty: formData.faculty,
            year_of_study: formData.degree_stage,
            campus: formData.campus,
            region: formData.region,
            hobbies: formData.hobbies,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (profileError) {
          logError('Questionnaire', 'edit_profile_update_failed', profileError);
          throw profileError;
        }

        logFormSubmit('Questionnaire', 'edit_onboarding_submitted');
        Alert.alert('הצלחה', 'השאלון עודכן בהצלחה');
        router.back();
      }
    } catch (error: any) {
      console.error('Error saving questionnaire:', error);
      Alert.alert('שגיאה', 'אירעה שגיאה בשמירת הנתונים: ' + (error.message || 'שגיאה לא ידועה'));
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      const next = (currentStep + 1) as Step;
      logButtonTap('Questionnaire', 'next_step', { fromStep: currentStep, toStep: next });
      logEvent('onboarding_step_viewed', { metadata: { step: next } });
      setCurrentStep(next);
      scrollThresholds.current.clear();
    }
    else {
      handleSubmit();
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      const prev = (currentStep - 1) as Step;
      logButtonTap('Questionnaire', 'previous_step', { fromStep: currentStep, toStep: prev });
      logEvent('onboarding_step_viewed', { metadata: { step: prev } });
      setCurrentStep(prev);
      scrollThresholds.current.clear();
    }
    else {
      if (isEditMode) {
        router.back();
      } else {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/welcome');
        }
      }
    }
  };

  const toggleMultiSelectField = (field: 'hobbies' | 'importantInPartner' | 'careLanguage' | 'dealbreakers' | 'comfortNeeds', val: string, max?: number) => {
    setFormData((prev) => {
      const currentList = prev[field] as string[];
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
    <View style={styles.progressHeader}>
      <View style={styles.progressContainer}>
        {[1, 2, 3, 4, 5, 6].map((step) => (
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
      <View style={styles.headerBadge}>
        <BrandMark size={20} />
        <ThemedText style={styles.badgeText}>התאמה חכמה</ThemedText>
      </View>
    </View>
  );

  const renderEnumSelect = (field: keyof typeof formData, options: {label: string, value: string}[]) => (
    <View style={styles.optionList}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          activeOpacity={0.7}
          style={[
            styles.optionButton,
            { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
            formData[field] === opt.value && {
              borderColor: UI_COLORS.primary,
              backgroundColor: dynamicColors.selectedBg,
            },
          ]}
          onPress={() => {
            Keyboard.dismiss();
            setFormData({ ...formData, [field]: opt.value });
          }}>
          <ThemedText
            style={[
              styles.optionText,
              { color: dynamicColors.text },
              formData[field] === opt.value && { color: UI_COLORS.selectedText, fontWeight: '700' },
            ]}>
            {opt.label}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 1</ThemedText>
        <View style={styles.subtitleContainer}>
          <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.text }]}>מי אני כסטודנט/ית</ThemedText>
          <View style={[styles.subtitleLine, { backgroundColor: UI_COLORS.accent }]} />
        </View>
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
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>3. מגדר</ThemedText>
        {renderEnumSelect('gender', GENDER_OPTIONS)}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>3.5. גובה (בס״מ)</ThemedText>
        <TextInput
          style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
          placeholder="למשל: 170"
          placeholderTextColor={dynamicColors.textLight}
          keyboardType="number-pad"
          value={formData.heightCm}
          onChangeText={(v) => setFormData({ ...formData, heightCm: v })}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>4. אוניברסיטה</ThemedText>
        {renderEnumSelect('university', [
          { label: 'האוניברסיטה העברית', value: 'huji' },
          { label: 'אוניברסיטת תל אביב', value: 'tau' },
          { label: 'אוניברסיטת בן גוריון', value: 'bgu' },
          { label: 'אוניברסיטת חיפה', value: 'haifa' },
          { label: 'הטכניון', value: 'technion' },
          { label: 'אוניברסיטת בר אילן', value: 'biu' },
          { label: 'אוניברסיטת אריאל', value: 'ariel' },
          { label: 'אחר', value: 'other' },
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>5. פקולטה</ThemedText>
        {renderEnumSelect('faculty', [
          { label: 'משפטים', value: 'law' },
          { label: 'מנהל עסקים', value: 'business' },
          { label: 'מדעי החברה', value: 'social_science' },
          { label: 'מדעי הרוח', value: 'humanities' },
          { label: 'מדעי הטבע', value: 'natural_science' },
          { label: 'רפואה', value: 'medicine' },
          { label: 'הנדסה / מדעי המחשב', value: 'engineering' },
          { label: 'חינוך', value: 'education' },
          { label: 'אחר', value: 'other' },
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>6. שנה בתואר</ThemedText>
        {renderEnumSelect('degree_stage', DEGREE_STAGE_OPTIONS)}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>7. קמפוס</ThemedText>
        {renderEnumSelect('campus', [
            { label: 'הצופים', value: 'scopus' }, 
            { label: 'גבעת רם', value: 'givat_ram' }, 
            { label: 'עין כרם', value: 'ein_kerem' }, 
            { label: 'רחובות', value: 'rehovot' }, 
            { label: 'אחר', value: 'other' }
        ])}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 2</ThemedText>
        <View style={styles.subtitleContainer}>
          <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.text }]}>מה אני מחפש/ת ב-UniMatch</ThemedText>
          <View style={[styles.subtitleLine, { backgroundColor: UI_COLORS.accent }]} />
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>8. מה היית רוצה למצוא ב-UniMatch?</ThemedText>
        {renderEnumSelect('intent_type', INTENT_OPTIONS)}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>10. את מי היית רוצה להכיר?</ThemedText>
        <View style={styles.chipGrid}>
          {INTERESTED_IN_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              activeOpacity={0.7}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.interestedInGenders.includes(opt.value) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => {
                Keyboard.dismiss();
                if (opt.value === 'any') {
                   setFormData({ ...formData, interestedInGenders: ['any'] });
                } else {
                   const newList = formData.interestedInGenders.filter(v => v !== 'any');
                   if (newList.includes(opt.value)) {
                      setFormData({ ...formData, interestedInGenders: newList.filter(v => v !== opt.value) });
                   } else {
                      setFormData({ ...formData, interestedInGenders: [...newList, opt.value] });
                   }
                }
              }}>
              <ThemedText style={[styles.chipText, { color: dynamicColors.text }, formData.interestedInGenders.includes(opt.value) && { color: UI_COLORS.selectedText }]}>
                {opt.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>10.5. האם יש לך העדפת גובה?</ThemedText>
        {renderEnumSelect('heightPreferenceImportance', HEIGHT_PREF_OPTIONS)}
      </View>

      {(formData.heightPreferenceImportance === 'nice_to_have' || formData.heightPreferenceImportance === 'must_have') && (
        <View style={styles.formGroup}>
          <ThemedText style={[styles.label, { color: dynamicColors.text }]}>גובה מינימלי מועדף (בס״מ)</ThemedText>
          <TextInput
            style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
            placeholder="למשל: 175"
            placeholderTextColor={dynamicColors.textLight}
            keyboardType="number-pad"
            value={formData.minPreferredHeightCm}
            onChangeText={(v) => setFormData({ ...formData, minPreferredHeightCm: v })}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        </View>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 3</ThemedText>
        <View style={styles.subtitleContainer}>
          <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.text }]}>אופי וסגנון חברתי</ThemedText>
          <View style={[styles.subtitleLine, { backgroundColor: UI_COLORS.accent }]} />
        </View>
      </View>
      
      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>12. חבר/ה מתקשר/ת ואומר/ת: "תוך שעה נוסעים לסופ״ש ספונטני". מה קורה?</ThemedText>
        {renderEnumSelect('spontaneity', [
          { label: 'ברור, אני כבר אורז/ת. חיים פעם אחת.', value: 'very_spontaneous' },
          { label: 'רגע, מי בא איפה ישנים כמה זה עולה ואז כנראה אזרום.', value: 'calculated_spontaneous' },
          { label: 'תלוי עם מי ותלוי מתי — אני ספונטני/ת, אבל עם גבולות.', value: 'selective_spontaneous' },
          { label: 'אין מצב. אני צריך/ה לדעת מראש', value: 'not_spontaneous' }
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>13. נתקעת במעלית עם מישהו/י שלא הכרת. מה הכי סביר שיקרה?</ThemedText>
        {renderEnumSelect('elevatorScenario', [
          { label: 'אני אתחיל שיחה כאילו אנחנו מכירים מהצבא / מהגן.', value: 'initiator' },
          { label: 'אני אזרוק הערה מצחיקה ואבדוק אם יש עם מי לדבר.', value: 'humorous' },
          { label: 'אני אחייך בנימוס ואקווה שהשקט לא יהיה מוזר מדי.', value: 'polite_quiet' },
          { label: 'אני אבדוק את הטלפון כאילו יש לי משהו ממש חשוב.', value: 'avoidant' },
          { label: 'אני אהיה זה/זו שמנסה להרגיע את כולם וללחוץ על כל הכפתורים הנכונים.', value: 'problem_solver' }
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>14. מזמינים אותך לעלות לקריוקי. מה הסיכוי שזה קורה?</ThemedText>
        {renderEnumSelect('karaokeChance', [
          { label: 'אני כבר בוחר/ת שיר. תנו לי מיקרופון.', value: 'performer' },
          { label: 'רק אם עוד מישהו עולה איתי.', value: 'duet' },
          { label: 'אני אעודד את כולם מהצד ואנסה שלא יקראו לי.', value: 'encourager' },
          { label: 'אולי אחרי קצת זמן ואווירה טובה.', value: 'needs_vibe' },
          { label: 'אין סיכוי. אני הקהל, לא ההופעה.', value: 'spectator' }
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>15. את/ה רואה מישהו/י מוכר/ת מרחוק, אבל לא בטוח/ה שהוא/היא ראה/ראתה אותך. מה תעשה/י?</ThemedText>
        {renderEnumSelect('familiarFace', [
          { label: 'אנופף בלי לחשוב יותר מדי.', value: 'wave' },
          { label: 'אחכה לראות אם הוא/היא מזהה אותי קודם.', value: 'wait_and_see' },
          { label: 'אסתכל בטלפון כאילו אני באמצע משימה חשובה.', value: 'phone_check' },
          { label: 'אעשה חצי חיוך כזה של "ראינו לא ראינו"', value: 'half_smile' },
          { label: 'אשנה כיוון ואעמיד פנים שזה היה מתוכנן.', value: 'change_direction' }
        ])}
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 4</ThemedText>
        <View style={styles.subtitleContainer}>
          <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.text }]}>ערכים, תקשורת וסגנון קשר</ThemedText>
          <View style={[styles.subtitleLine, { backgroundColor: UI_COLORS.accent }]} />
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>16. מה הכי חשוב לך באדם שמולך? (עד 4)</ThemedText>
        <View style={styles.chipGrid}>
          {[
            {label:'כנות', value:'honesty'}, {label:'הומור', value:'humor'}, {label:'רגישות', value:'sensitivity'}, 
            {label:'שאפתנות', value:'ambition'}, {label:'יציבות', value:'stability'}, {label:'פתיחות', value:'openness'}, 
            {label:'אינטליגנציה', value:'intelligence'}, {label:'קלילות', value:'lightness'}, {label:'נאמנות', value:'loyalty'}, 
            {label:'יכולת להקשיב', value:'listening'}, {label:'עצמאות', value:'independence'}, {label:'חום ואכפתיות', value:'warmth'}
          ].map((opt) => (
            <TouchableOpacity
              key={opt.value}
              activeOpacity={0.7}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.importantInPartner.includes(opt.value) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => {
                Keyboard.dismiss();
                toggleMultiSelectField('importantInPartner', opt.value, 4);
              }}>
              <ThemedText style={[styles.chipText, { color: dynamicColors.text }, formData.importantInPartner.includes(opt.value) && { color: UI_COLORS.selectedText }]}>
                {opt.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>17. איזה סגנון תקשורת הכי מתאים לך?</ThemedText>
        {renderEnumSelect('communicationStyle', [
          { label: 'פתוח וישיר — עדיף לדבר על דברים.', value: 'open_direct' },
          { label: 'רגוע והדרגתי — לא חייבים לפתוח הכול מיד.', value: 'calm_gradual' },
          { label: 'קליל והומוריסטי — גם דברים רציניים אפשר לקחת בפרופורציה.', value: 'light_humorous' },
          { label: 'עמוק ומשמעותי — אני אוהב/ת שיחות שיש בהן עומק.', value: 'deep_meaningful' },
          { label: 'מעשי — פחות דיבורים, יותר מעשים.', value: 'practical' }
        ])}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>18. איך את/ה בדרך כלל מראה אכפתיות?</ThemedText>
        <View style={styles.chipGrid}>
          {[
            {label:'מילים טובות', value:'kind_words'}, {label:'זמן איכות', value:'quality_time'}, {label:'עזרה בפועל', value:'practical_help'}, 
            {label:'הקשבה', value:'listening'}, {label:'מגע פיזי', value:'physical_touch'}, {label:'מתנות קטנות', value:'small_gifts'}, 
            {label:'לזכור פרטים קטנים', value:'remembering_details'}, {label:'להיות שם כשצריך', value:'being_there'}
          ].map((opt) => (
            <TouchableOpacity
              key={opt.value}
              activeOpacity={0.7}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.careLanguage.includes(opt.value) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => {
                Keyboard.dismiss();
                toggleMultiSelectField('careLanguage', opt.value);
              }}>
              <ThemedText style={[styles.chipText, { color: dynamicColors.text }, formData.careLanguage.includes(opt.value) && { color: UI_COLORS.selectedText }]}>
                {opt.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>19. אני בדרך כלל מתחבר/ת יותר לאנשים שהם:</ThemedText>
        {renderEnumSelect('connectWith', [
          { label: 'דומים לי', value: 'similar' },
          { label: 'שונים ממני', value: 'different' },
          { label: 'משלימים אותי', value: 'complementary' },
          { label: 'מאתגרים אותי לחשוב אחרת', value: 'challenging' },
          { label: 'אם יש חיבור — זה לא באמת משנה', value: 'doesnt_matter' }
        ])}
      </View>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 5</ThemedText>
        <View style={styles.subtitleContainer}>
          <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.text }]}>העדפות, גבולות ודיל־ברייקרים</ThemedText>
          <View style={[styles.subtitleLine, { backgroundColor: UI_COLORS.accent }]} />
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>20. מה כנראה יוריד לך את החשק להמשיך להכיר? (עד 4)</ThemedText>
        <View style={styles.chipGrid}>
          {[
            {label:'חוסר כבוד לגבולות', value:'disrespect_boundaries'}, {label:'תקשורת לא ברורה', value:'unclear_communication'}, 
            {label:'יהירות', value:'arrogance'}, {label:'חוסר רצינות', value:'lack_of_seriousness'}, {label:'שיפוטיות', value:'judgmentalness'}, 
            {label:'פער גדול בציפיות', value:'expectation_gap'}, {label:'לחץ להיפגש מהר מדי', value:'pressure_to_meet'}, 
            {label:'חוסר הומור', value:'lack_of_humor'}, {label:'חוסר יציבות', value:'instability'}, {label:'יותר מדי דרמה', value:'too_much_drama'}
          ].map((opt) => (
            <TouchableOpacity
              key={opt.value}
              activeOpacity={0.7}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.dealbreakers.includes(opt.value) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => {
                Keyboard.dismiss();
                toggleMultiSelectField('dealbreakers', opt.value, 4);
              }}>
              <ThemedText style={[styles.chipText, { color: dynamicColors.text }, formData.dealbreakers.includes(opt.value) && { color: UI_COLORS.selectedText }]}>
                {opt.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>21. מה גורם לך להרגיש בנוח בהיכרות ראשונה?</ThemedText>
        <View style={styles.chipGrid}>
          {[
            {label:'לדבר קצת באפליקציה לפני שנפגשים', value:'chat_first'}, {label:'להיפגש במקום ציבורי', value:'public_meeting'}, 
            {label:'שיהיה ברור מה הצד השני מחפש', value:'clear_intent'}, {label:'שלא יהיה לחץ', value:'no_pressure'}, 
            {label:'פרופיל מאומת', value:'verified_profile'}, {label:'הקשר סטודנטיאלי ברור', value:'student_context'}, 
            {label:'שיחה קלילה ולא כבדה מדי בהתחלה', value:'light_conversation'}
          ].map((opt) => (
            <TouchableOpacity
              key={opt.value}
              activeOpacity={0.7}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.comfortNeeds.includes(opt.value) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => {
                Keyboard.dismiss();
                toggleMultiSelectField('comfortNeeds', opt.value);
              }}>
              <ThemedText style={[styles.chipText, { color: dynamicColors.text }, formData.comfortNeeds.includes(opt.value) && { color: UI_COLORS.selectedText }]}>
                {opt.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>22. איזה מפגש ראשון הכי מתאים לך?</ThemedText>
        {renderEnumSelect('meetingStyle', [
          { label: 'קפה קצר בקמפוס', value: 'campus_coffee' },
          { label: 'הליכה קצרה בחוץ', value: 'short_walk' },
          { label: 'בר בערב', value: 'evening_bar' },
          { label: 'למידה משותפת בספרייה', value: 'library_study' },
          { label: 'אירוע סטודנטיאלי', value: 'student_event' },
          { label: 'שיחת וידאו או צ׳אט קודם', value: 'video_chat' },
          { label: 'משהו ספונטני ולא מתוכנן מדי', value: 'spontaneous' }
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
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
      </View>
    </View>
  );

  const renderStep6 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 6</ThemedText>
        <View style={styles.subtitleContainer}>
          <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.text }]}>תמונות פרופיל</ThemedText>
          <View style={[styles.subtitleLine, { backgroundColor: UI_COLORS.accent }]} />
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>הוספת תמונות (לפחות אחת חובה)</ThemedText>
        <ThemedText style={[styles.subtitle, { color: dynamicColors.textLight, textAlign: 'right' }]}>
           תמונות ברורות עוזרות לקבל התאמות טובות יותר.
        </ThemedText>
        
        <View style={styles.photoGrid}>
          {photos.map((photo, index) => (
            <View key={index} style={styles.photoWrapper}>
              <Image source={{ uri: photo.uri }} style={styles.gridPhoto} />
              <TouchableOpacity style={styles.deletePhotoBadge} onPress={() => removeLocalPhoto(index)}>
                <IconSymbol name="xmark" size={12} color="white" />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 6 && (
            <TouchableOpacity style={[styles.addPhotoPlaceholder, { borderColor: dynamicColors.border }]} onPress={pickImage}>
              <IconSymbol name="plus" size={32} color={dynamicColors.textLight} />
              <ThemedText style={{ color: dynamicColors.textLight, marginTop: 8 }}>הוספה</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const currentScroll = layoutMeasurement.height + contentOffset.y;
    const totalHeight = contentSize.height;
    const scrollPercent = Math.floor((currentScroll / totalHeight) * 100);

    [25, 50, 75, 100].forEach(threshold => {
      if (scrollPercent >= threshold && !scrollThresholds.current.has(threshold)) {
        scrollThresholds.current.add(threshold);
        logEvent('scroll_depth', { 
          screen: 'Questionnaire', 
          metadata: { percent: threshold, step: currentStep } 
        });
      }
    });
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          {renderProgress()}
          <ScrollView 
            contentContainerStyle={styles.scrollContent} 
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={1000}
          >
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
            {currentStep === 5 && renderStep5()}
            {currentStep === 6 && renderStep6()}

            <View style={styles.navigation}>
              <TouchableOpacity
                style={[styles.navButton, styles.primaryNav, { backgroundColor: UI_COLORS.primary }]}
                activeOpacity={0.8}
                onPress={nextStep}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <ThemedText style={styles.primaryNavText}>
                    {currentStep === 6 ? 'סיום והתחלה' : 'המשך'}
                  </ThemedText>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.navButton} 
                activeOpacity={0.6}
                onPress={prevStep} 
                disabled={loading}>
                <ThemedText style={[styles.secondaryNavText, { color: UI_COLORS.primary }]}>חזרה</ThemedText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  progressHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 10,
  },
  progressContainer: {
    flexDirection: 'row-reverse',
    height: 4,
    flex: 1,
    gap: 6,
  },
  headerBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginLeft: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textLight,
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
  subtitleContainer: {
    alignItems: 'flex-end',
  },
  stepSubtitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'right',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  subtitleLine: {
    width: 40,
    height: 3,
    borderRadius: 2,
    marginTop: 4,
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
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
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
  photoGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  photoWrapper: {
    width: '30%',
    aspectRatio: 0.8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#eee',
  },
  gridPhoto: {
    width: '100%',
    height: '100%',
  },
  deletePhotoBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoPlaceholder: {
    width: '30%',
    aspectRatio: 0.8,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
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
    shadowColor: '#FF4D3D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
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
