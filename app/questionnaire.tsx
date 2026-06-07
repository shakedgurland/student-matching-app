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
import { logScreenView, logEvent, logFormSubmit, logError } from '@/lib/analytics';

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
    year: '',
    campus: '',
    
    // Step 2: Intent
    intent: [] as string[],
    connectionDepth: '',
    interestedInGenders: [] as string[],
    sameFacultyImportance: 3,
    heightPreferenceImportance: '',
    minPreferredHeightCm: '',
    
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
      console.error('Error picking image:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לבחור תמונה');
    }
  };

  const removeLocalPhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
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
            year_of_study: formData.year,
            campus: formData.campus,
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
            year_of_study: formData.year,
            campus: formData.campus,
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
  };    } catch (error: any) {
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

  const renderSingleSelect = (field: keyof typeof formData, options: string[]) => (
    <View style={styles.optionList}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          activeOpacity={0.7}
          style={[
            styles.optionButton,
            { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
            formData[field] === opt && {
              borderColor: UI_COLORS.primary,
              backgroundColor: dynamicColors.selectedBg,
            },
          ]}
          onPress={() => {
            Keyboard.dismiss();
            setFormData({ ...formData, [field]: opt });
          }}>
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
        {renderSingleSelect('campus', ['הצופים', 'גבעת רם', 'עין כרם', 'רחובות', 'אחר'])}
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
              activeOpacity={0.7}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.intent.includes(opt) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => {
                Keyboard.dismiss();
                toggleMultiSelect(opt);
              }}>
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
                activeOpacity={0.7}
                style={[
                  styles.scaleCircle,
                  { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                  formData.sameFacultyImportance === val && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  setFormData({ ...formData, sameFacultyImportance: val });
                }}>
                <ThemedText style={[styles.scaleCircleText, { color: dynamicColors.text }, formData.sameFacultyImportance === val && { color: UI_COLORS.primary }]}>
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
        <View style={styles.subtitleContainer}>
          <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.text }]}>אופי וסגנון חברתי</ThemedText>
          <View style={[styles.subtitleLine, { backgroundColor: UI_COLORS.accent }]} />
        </View>
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
        <View style={styles.subtitleContainer}>
          <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.text }]}>ערכים, תקשורת וסגנון קשר</ThemedText>
          <View style={[styles.subtitleLine, { backgroundColor: UI_COLORS.accent }]} />
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>16. מה הכי חשוב לך באדם שמולך? (עד 4)</ThemedText>
        <View style={styles.chipGrid}>
          {[
            'כנות', 'הומור', 'רגישות', 'שאפתנות', 'יציבות', 'פתיחות', 'אינטליגנציה', 'קלילות', 'נאמנות', 'יכולת להקשיב', 'עצמאות', 'חום ואכפתיות'
          ].map((opt) => (
            <TouchableOpacity
              key={opt}
              activeOpacity={0.7}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.importantInPartner.includes(opt) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => {
                Keyboard.dismiss();
                toggleMultiSelectField('importantInPartner', opt, 4);
              }}>
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
              activeOpacity={0.7}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.careLanguage.includes(opt) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => {
                Keyboard.dismiss();
                toggleMultiSelectField('careLanguage', opt);
              }}>
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
        <View style={styles.subtitleContainer}>
          <ThemedText style={[styles.stepSubtitle, { color: UI_COLORS.text }]}>העדפות, גבולות ודיל־ברייקרים</ThemedText>
          <View style={[styles.subtitleLine, { backgroundColor: UI_COLORS.accent }]} />
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={[styles.label, { color: dynamicColors.text }]}>20. מה כנראה יוריד לך את החשק להמשיך להכיר? (עד 4)</ThemedText>
        <View style={styles.chipGrid}>
          {[
            'חוסר כבוד לגבולות', 'תקשורת לא ברורה', 'יהירות', 'חוסר רצינות', 'שיפוטיות', 'פער גדול בציפיות', 'לחץ להיפגש מהר מדי', 'חוסר הומור', 'חוסר יציבות', 'יותר מדי דרמה'
          ].map((opt) => (
            <TouchableOpacity
              key={opt}
              activeOpacity={0.7}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.dealbreakers.includes(opt) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => {
                Keyboard.dismiss();
                toggleMultiSelectField('dealbreakers', opt, 4);
              }}>
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
              activeOpacity={0.7}
              style={[
                styles.chip,
                { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border },
                formData.comfortNeeds.includes(opt) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary },
              ]}
              onPress={() => {
                Keyboard.dismiss();
                toggleMultiSelectField('comfortNeeds', opt);
              }}>
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
