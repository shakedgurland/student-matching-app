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

// 0: Intro, 1-6: Short, 7: Choice, 8-20: Deep
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

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

const FIRST_DATE_OPTIONS = [
  { label: 'קפה קצר בקמפוס', value: 'campus_coffee' },
  { label: 'הליכה קצרה בחוץ', value: 'short_walk' },
  { label: 'בר בערב', value: 'evening_bar' },
  { label: 'למידה משותפת בספרייה', value: 'library_study' },
  { label: 'אירוע סטודנטיאלי', value: 'student_event' },
  { label: 'שיחת וידאו או צ׳אט קודם', value: 'video_chat' },
  { label: 'משהו ספונטני ולא מתוכנן מדי', value: 'spontaneous' },
];

const MONEY_STYLE_OPTIONS = [
  { label: 'אני אוהב/ת לפנק כשאני יכול/ה.', value: 'treats_when_can' },
  { label: 'הכי נוח לי שכל אחד משלם על עצמו.', value: 'split_equally' },
  { label: 'אני זורם/ת לפי הסיטואציה.', value: 'situational' },
  { label: 'חשוב לי שיהיה הוגן ומאוזן לאורך זמן.', value: 'balanced_over_time' },
  { label: 'אני פחות שם/ה לב לזה, העיקר האווירה.', value: 'not_focus' },
];

const LOVE_LANGUAGE_OPTIONS = [
  { label: 'מילים טובות', value: 'words' },
  { label: 'זמן איכות', value: 'quality_time' },
  { label: 'עזרה ומעשים', value: 'acts_of_service' },
  { label: 'מגע פיזי', value: 'physical_touch' },
  { label: 'מתנות קטנות', value: 'gifts' },
  { label: 'הקשבה ונוכחות', value: 'presence_listening' },
];

const SIMILARITY_PREF_OPTIONS = [
  { label: 'דומה לי', value: 'similar' },
  { label: 'שונה ממני', value: 'different' },
  { label: 'משלים/ה אותי', value: 'complementary' },
  { label: 'מאתגר/ת אותי לחשוב אחרת', value: 'challenging' },
  { label: 'אם יש חיבור — זה לא באמת משנה', value: 'doesnt_matter' },
];

const RELIGION_OPTIONS = [
  { label: 'חילוני/ת', value: 'secular' },
  { label: 'מסורתי/ת', value: 'traditional' },
  { label: 'דתי/ה', value: 'religious' },
  { label: 'דתי/ה לאומי/ת', value: 'religious_national' },
  { label: 'חרדי/ת', value: 'haredi' },
  { label: 'מעדיפ/ה לא לומר', value: 'prefer_not_to_say' },
];

const PERFECT_DATE_OPTIONS = [
  { label: 'קפה ושיחה טובה', value: 'coffee_talk' },
  { label: 'בר/דרינק בערב', value: 'evening_drink' },
  { label: 'ים או שקיעה', value: 'beach_sunset' },
  { label: 'טיול קצר בחוץ', value: 'short_walk' },
  { label: 'פעילות מצחיקה או לא שגרתית', value: 'fun_activity' },
  { label: 'ערב רגוע בלי יותר מדי רעש', value: 'calm_evening' },
  { label: 'משהו ספונטני שמרגיש טבעי', value: 'spontaneous_natural' },
];

const MAIN_DEALBREAKER_OPTIONS = [
  { label: 'חוסר אמון או נאמנות', value: 'trust_loyalty' },
  { label: 'תקשורת לא ברורה', value: 'unclear_communication' },
  { label: 'חוסר כבוד לגבולות', value: 'boundaries' },
  { label: 'פער גדול באורח חיים', value: 'lifestyle_gap' },
  { label: 'חוסר שאיפות לעתיד', value: 'future_ambition' },
  { label: 'לחץ או קצב שלא מתאים לי', value: 'pace_pressure' },
  { label: 'פער גדול ביחס לדת/מסורת', value: 'religion_tradition_gap' },
];

export default function QuestionnaireScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const isEditMode = mode === 'edit';
  
  const [currentStep, setCurrentStep] = useState<Step>(isEditMode ? 1 : 0);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [photos, setPhotos] = useState<{ uri: string }[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  
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
    // Short Questionnaire
    age: '',
    gender: '',
    heightCm: '',
    university: '',
    faculty: '',
    degree_stage: '',
    campus: '',
    region: '',
    hobbies: [] as string[],
    intent_type: '',
    relationship_pace: '',
    conflict_style: '',
    respect_priority: '',
    interest_signals: '',
    conversation_style: '',
    compromise_area: '',
    interestedInGenders: [] as string[],
    heightPreferenceImportance: 'none',
    minPreferredHeightCm: '',
    preferred_age_min: '18',
    preferred_age_max: '45',
    preferred_first_date: '',

    // Deep Questionnaire
    spontaneity: '',
    elevatorScenario: '',
    karaokeChance: '',
    familiarFace: '',
    money_style: '',
    love_language: '',
    similarity_preference: '',
    religion: '',
    tradition_self_rating: 3,
    tradition_partner_importance: 3,
    perfect_date: '',
    main_dealbreaker: '',
    relationship_strengths_text: '',
    relationship_growth_text: '',
    about_me: '',
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
    logEvent(currentStep === 0 ? 'short_questionnaire_started' : 'onboarding_step_viewed', { metadata: { mode, step: currentStep } });
    
    if (isEditMode && !dataLoaded) {
      loadAnswers();
    } else if (!isEditMode) {
      setDataLoaded(true);
    }
  }, [isEditMode, currentStep]);

  const loadAnswers = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const [answersRes, profileRes] = await Promise.all([
        supabase.from('questionnaire_answers').select('answers').eq('user_id', user.id).single(),
        supabase.from('profiles').select('onboarding_mode').eq('id', user.id).single()
      ]);

      if (answersRes.data?.answers) {
        setFormData(prev => ({ 
          ...prev, 
          ...answersRes.data.answers,
          // Ensure new fields have defaults if they didn't exist in DB
          preferred_age_min: answersRes.data.answers.preferred_age_min || '18',
          preferred_age_max: answersRes.data.answers.preferred_age_max || '45',
          preferred_first_date: answersRes.data.answers.preferred_first_date || '',
          relationship_growth_text: answersRes.data.answers.relationship_growth_text || '',
          about_me: answersRes.data.answers.about_me || '',
          money_style: answersRes.data.answers.money_style || '',
          love_language: answersRes.data.answers.love_language || '',
          similarity_preference: answersRes.data.answers.similarity_preference || '',
          religion: answersRes.data.answers.religion || '',
          tradition_self_rating: answersRes.data.answers.tradition_self_rating || 3,
          tradition_partner_importance: answersRes.data.answers.tradition_partner_importance || 3,
          perfect_date: answersRes.data.answers.perfect_date || '',
          main_dealbreaker: answersRes.data.answers.main_dealbreaker || '',
          relationship_strengths_text: answersRes.data.answers.relationship_strengths_text || '',
        }));
      }
      if (profileRes.data) {
        setUserProfile(profileRes.data);
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

  const handleSubmit = async (submitMode: 'fast' | 'deep') => {
    const finalMode = submitMode;
    logButtonTap('Questionnaire', isEditMode ? 'save_questionnaire_edit' : `${finalMode}_match_selected`);
    
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

      // Trigger AI Traits Analysis if Deep Questionnaire is completed/updated
      if (finalMode === 'deep') {
        supabase.functions.invoke('analyze-user-traits').then(({ error }) => {
          if (error) {
            logError('Questionnaire', 'ai_traits_analysis_failed', error);
          }
        }).catch(err => {
          logError('Questionnaire', 'ai_traits_analysis_exception', err);
        });
      }

      if (!isEditMode) {
        // 2. Upload Photos
        let firstPhotoPath: string | null = null;
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          logEvent('photo_upload_started', { screen: 'Questionnaire', metadata: { index: i } });
          
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

          await supabase
            .from('profile_photos')
            .insert({
              user_id: user.id,
              storage_path: fileName,
              display_order: i,
            });
          
          logEvent('photo_upload_succeeded', { screen: 'Questionnaire', metadata: { index: i } });
        }

        // 3. Update profile
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            onboarding_completed: true,
            onboarding_mode: finalMode,
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
            bio: formData.about_me,
            avatar_storage_path: firstPhotoPath || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (profileError) {
          logError('Questionnaire', 'profile_update_failed', profileError);
          throw profileError;
        }

        logEvent(finalMode === 'fast' ? 'short_questionnaire_completed' : 'deep_questionnaire_completed');
        logFormSubmit('Questionnaire', 'onboarding_submitted', { mode: finalMode });
        router.replace('/(tabs)/my-profile');
      } else {
        // Edit mode
        const updateData: any = {
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
            bio: formData.about_me,
            updated_at: new Date().toISOString(),
        };

        // Upgrade mode if they were fast and completed deep
        if (userProfile?.onboarding_mode === 'fast' && submitMode === 'deep') {
          updateData.onboarding_mode = 'deep';
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .update(updateData)
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
    // Validation before moving next
    if (currentStep === 1) {
      if (!isEditMode && photos.length === 0) {
        logEvent('onboarding_validation_failed', { screen: 'Questionnaire', metadata: { field: 'photos' } });
        Alert.alert('חסרה תמונה', 'חובה להוסיף לפחות תמונה אחת.');
        return;
      }
      if (!formData.gender || !formData.age || !formData.heightCm) {
         logEvent('onboarding_validation_failed', { screen: 'Questionnaire', metadata: { field: 'step1_basics' } });
         Alert.alert('שדות חובה', 'יש למלא גיל, מגדר וגובה.');
         return;
      }
    }

    if (currentStep === 3) {
      const minAge = parseInt(formData.preferred_age_min);
      const maxAge = parseInt(formData.preferred_age_max);
      if (isNaN(minAge) || isNaN(maxAge)) {
        Alert.alert('שגיאה', 'נא להזין טווח גילאים תקין');
        return;
      }
      if (minAge < 18 || maxAge > 45) {
        Alert.alert('שגיאה', 'טווח הגילאים המותר הוא 18-45');
        return;
      }
      if (minAge > maxAge) {
        Alert.alert('שגיאה', 'הגיל המינימלי חייב להיות נמוך מהגיל המקסימלי');
        return;
      }
      if (formData.interestedInGenders.length === 0) {
        Alert.alert('שדות חובה', 'יש לבחור את מי היית רוצה להכיר');
        return;
      }
    }

    if (currentStep === 4) {
      if (!formData.intent_type || !formData.relationship_pace || !formData.preferred_first_date) {
        Alert.alert('שדות חובה', 'יש למלא את כל השדות בשלב זה');
        return;
      }
    }

    if (currentStep === 6) {
      if (isEditMode) {
        if (userProfile?.onboarding_mode === 'deep') {
          setCurrentStep(8);
        } else {
          // Stay on step 6 and let the footer handle the choice
        }
      } else {
        setCurrentStep(7); // Show choice screen
      }
    } else if (currentStep === 20) {
      handleSubmit('deep');
    } else {
      const next = (currentStep + 1) as Step;
      logButtonTap('Questionnaire', 'next_step', { from: currentStep, to: next });
      setCurrentStep(next);
      scrollThresholds.current.clear();
      if (next === 8) logEvent('deep_questionnaire_started');
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      const prev = (currentStep === 8 ? 6 : currentStep - 1) as Step;
      logButtonTap('Questionnaire', 'previous_step', { from: currentStep, to: prev });
      setCurrentStep(prev);
      scrollThresholds.current.clear();
    } else {
      if (isEditMode) router.back();
      else router.canGoBack() ? router.back() : router.replace('/welcome');
    }
  };

  const toggleMultiSelectField = (field: 'hobbies' | 'interestedInGenders' | 'importantInPartner' | 'careLanguage' | 'dealbreakers' | 'comfortNeeds', val: string, max?: number) => {
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

  const renderIntro = () => (
    <View style={styles.stepContent}>
      <View style={styles.introHeader}>
         <BrandMark size={60} />
         <ThemedText style={styles.introTitle}>ברוכים הבאים ל-UniMatch</ThemedText>
      </View>
      <ThemedText style={styles.introText}>
        השאלות הבאות נבנו כדי לזהות דפוסי התאמה משמעותיים — כמו כוונות, ערכים, סגנון תקשורת וקצב קשר — שעוזרים לנו להציע התאמה מדויקת ומוצלחת יותר.
      </ThemedText>
      <TouchableOpacity 
        style={[styles.primaryNav, { backgroundColor: UI_COLORS.primary, padding: 18, borderRadius: 16, marginTop: 40 }]}
        onPress={() => setCurrentStep(1)}>
        <ThemedText style={[styles.primaryNavText, { textAlign: 'center' }]}>בואו נתחיל</ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 1 מתוך 6</ThemedText>
        <ThemedText style={styles.stepSubtitle}>קצת עליי</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>1. תמונות פרופיל</ThemedText>
        <View style={styles.photoGrid}>
          {photos.map((p, i) => (
            <View key={i} style={styles.photoWrapper}>
              <Image source={{ uri: p.uri }} style={styles.gridPhoto} />
              <TouchableOpacity style={styles.deletePhotoBadge} onPress={() => removeLocalPhoto(i)}>
                <IconSymbol name="xmark" size={12} color="white" />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 6 && (
            <TouchableOpacity style={styles.addPhotoPlaceholder} onPress={pickImage}>
              <IconSymbol name="plus" size={32} color={UI_COLORS.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>2. מגדר</ThemedText>
        {renderEnumSelect('gender', GENDER_OPTIONS)}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>3. גובה (בס״מ)</ThemedText>
        <TextInput
          style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
          placeholder="170"
          keyboardType="number-pad"
          value={formData.heightCm}
          onChangeText={(v) => setFormData({ ...formData, heightCm: v })}
        />
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>4. גיל</ThemedText>
        <TextInput
          style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
          placeholder="24"
          keyboardType="number-pad"
          value={formData.age}
          onChangeText={(v) => setFormData({ ...formData, age: v })}
        />
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>5. ספר/י על עצמך בכמה מילים</ThemedText>
        <TextInput
          style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border, height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
          placeholder="משהו קצר שיעזור לצד השני להבין מי את/ה מעבר לשאלון."
          multiline
          value={formData.about_me}
          onChangeText={(v) => setFormData({ ...formData, about_me: v })}
        />
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 2 מתוך 6</ThemedText>
        <ThemedText style={styles.stepSubtitle}>לימודים ומיקום</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>5. אזור מגורים</ThemedText>
        {renderEnumSelect('region', REGION_OPTIONS)}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>6. מוסד לימודים</ThemedText>
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
        <ThemedText style={styles.label}>7. שלב בתואר</ThemedText>
        {renderEnumSelect('degree_stage', DEGREE_STAGE_OPTIONS)}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 3 מתוך 6</ThemedText>
        <ThemedText style={styles.stepSubtitle}>העדפות ותחביבים</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>8. את מי היית רוצה להכיר?</ThemedText>
        <View style={styles.chipGrid}>
          {INTERESTED_IN_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, { borderColor: dynamicColors.border }, formData.interestedInGenders.includes(opt.value) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary }]}
              onPress={() => toggleMultiSelectField('interestedInGenders', opt.value)}>
              <ThemedText style={[styles.chipText, formData.interestedInGenders.includes(opt.value) && { color: UI_COLORS.selectedText }]}>{opt.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>9. איזה גילאים היית רוצה להכיר?</ThemedText>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.label, { fontSize: 12, marginBottom: 4 }]}>גיל מינימלי</ThemedText>
            <TextInput
              style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
              placeholder="18"
              keyboardType="number-pad"
              value={formData.preferred_age_min}
              onChangeText={(v) => setFormData({ ...formData, preferred_age_min: v })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.label, { fontSize: 12, marginBottom: 4 }]}>גיל מקסימלי</ThemedText>
            <TextInput
              style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
              placeholder="45"
              keyboardType="number-pad"
              value={formData.preferred_age_max}
              onChangeText={(v) => setFormData({ ...formData, preferred_age_max: v })}
            />
          </View>
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>10. תחביבים בשעות הפנאי</ThemedText>
        <View style={styles.chipGrid}>
          {HOBBY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, { borderColor: dynamicColors.border }, formData.hobbies.includes(opt.value) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary }]}
              onPress={() => toggleMultiSelectField('hobbies', opt.value)}>
              <ThemedText style={[styles.chipText, formData.hobbies.includes(opt.value) && { color: UI_COLORS.selectedText }]}>{opt.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 4 מתוך 6</ThemedText>
        <ThemedText style={styles.stepSubtitle}>כוונות וקצב</ThemedText>
      </View>
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>11. מה את/ה מחפש/ת כרגע?</ThemedText>
        {renderEnumSelect('intent_type', INTENT_OPTIONS)}
      </View>
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>12. איזה קצב מרגיש לך נכון בתחילת קשר?</ThemedText>
        {renderEnumSelect('relationship_pace', PACE_OPTIONS)}
      </View>
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>13. איזה דייט ראשון הכי מתאים לך?</ThemedText>
        {renderEnumSelect('preferred_first_date', FIRST_DATE_OPTIONS)}
      </View>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 5 מתוך 6</ThemedText>
        <ThemedText style={styles.stepSubtitle}>תקשורת וערכים</ThemedText>
      </View>
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>14. כשיש ריב או אי־הבנה, מה נכון לך?</ThemedText>
        {renderEnumSelect('conflict_style', CONFLICT_OPTIONS)}
      </View>
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>15. מה הכי חשוב שיכבדו אצלך?</ThemedText>
        {renderEnumSelect('respect_priority', RESPECT_OPTIONS)}
      </View>
    </View>
  );

  const renderStep6 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 6 מתוך 6</ThemedText>
        <ThemedText style={styles.stepSubtitle}>חיבור והתאמה</ThemedText>
      </View>
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>16. איך את/ה מרגיש/ה שמישהו בעניין שלך?</ThemedText>
        {renderEnumSelect('interest_signals', INTEREST_SIGNAL_OPTIONS)}
      </View>
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>17. איזה סוג שיחה מושך אותך בדייט?</ThemedText>
        {renderEnumSelect('conversation_style', CONVERSATION_OPTIONS)}
      </View>
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>18. באיזה תחום הכי קשה לך להתפשר?</ThemedText>
        {renderEnumSelect('compromise_area', COMPROMISE_OPTIONS)}
      </View>
    </View>
  );

  const renderChoiceScreen = () => (
    <View style={styles.stepContent}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <BrandMark size={50} />
      </View>
      <ThemedText style={[styles.stepSubtitle, { textAlign: 'center' }]}>איזו התאמה מתאימה לך?</ThemedText>
      
      <TouchableOpacity 
        style={styles.choiceCard} 
        onPress={() => handleSubmit('fast')}>
        <View style={styles.choiceIcon}><ThemedText style={{fontSize: 24}}>⚡</ThemedText></View>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.choiceTitle}>יאללה התאמה מהירה</ThemedText>
          <ThemedText style={styles.choiceDescription}>נמצא לך התאמה לפי מה שכבר סיפרת לנו — אבל בלי להתחייב שזו תהיה ההתאמה הכי מדויקת ביקום.</ThemedText>
        </View>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.choiceCard} 
        onPress={() => nextStep()}>
        <View style={styles.choiceIcon}><ThemedText style={{fontSize: 24}}>🎯</ThemedText></View>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.choiceTitle}>אני רוצה התאמה מדויקת יותר</ThemedText>
          <ThemedText style={styles.choiceDescription}>עוד כמה שאלות שיעזרו לנו להבין אותך באמת ולשפר את איכות ההתאמה.</ThemedText>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderScale = (field: 'tradition_self_rating' | 'tradition_partner_importance') => (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingHorizontal: 10, marginTop: 10 }}>
      {[1, 2, 3, 4, 5].map((val) => (
        <TouchableOpacity
          key={val}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: formData[field] === val ? UI_COLORS.primary : dynamicColors.border,
            backgroundColor: formData[field] === val ? dynamicColors.selectedBg : dynamicColors.card,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setFormData({ ...formData, [field]: val })}>
          <ThemedText style={{ fontSize: 18, fontWeight: '700', color: formData[field] === val ? UI_COLORS.selectedText : dynamicColors.text }}>{val}</ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderDeepSteps = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שאלון מעמיק</ThemedText>
        <ThemedText style={styles.stepSubtitle}>אופי וסגנון חברתי</ThemedText>
      </View>

      {currentStep === 8 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>ספונטניות</ThemedText>
          {renderEnumSelect('spontaneity', [
            { label: 'ברור, אני כבר אורז/ת. חיים פעם אחת.', value: 'very_spontaneous' },
            { label: 'רגע, מי בא איפה ישנים כמה זה עולה ואז כנראה אזרום.', value: 'calculated_spontaneous' },
            { label: 'תלוי עם מי ותלוי מתי — אני ספונטני/ת, אבל עם גבולות.', value: 'selective_spontaneous' },
            { label: 'אין מצב. אני צריך/ה לדעת מראש', value: 'not_spontaneous' }
          ])}
        </View>
      )}

      {currentStep === 9 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>סיטואציית מעלית</ThemedText>
          {renderEnumSelect('elevatorScenario', [
            { label: 'אני אתחיל שיחה כאילו אנחנו מכירים מהצבא / מהגן.', value: 'initiator' },
            { label: 'אני אזרוק הערה מצחיקה ואבדוק אם יש עם מי לדבר.', value: 'humorous' },
            { label: 'אני אחייך בנימוס ואקווה שהשקט לא יהיה מוזר מדי.', value: 'polite_quiet' },
            { label: 'אני אבדוק את הטלפון כאילו יש לי משהו ממש חשוב.', value: 'avoidant' },
            { label: 'אני אהיה זה/זו שמנסה להרגיע את כולם וללחוץ על כל הכפתורים הנכונים.', value: 'problem_solver' }
          ])}
        </View>
      )}

      {currentStep === 10 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>קריוקי</ThemedText>
          {renderEnumSelect('karaokeChance', [
            { label: 'אני כבר בוחר/ת שיר. תנו לי מיקרופון.', value: 'performer' },
            { label: 'רק אם עוד מישהו עולה איתי.', value: 'duet' },
            { label: 'אני אעודד את כולם מהצד ואנסה שלא יקראו לי.', value: 'encourager' },
            { label: 'אולי אחרי קצת זמן ואווירה טובה.', value: 'needs_vibe' },
            { label: 'אין סיכוי. אני הקהל, לא ההופעה.', value: 'spectator' }
          ])}
        </View>
      )}

      {currentStep === 11 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>פנים מוכרות</ThemedText>
          {renderEnumSelect('familiarFace', [
            { label: 'אנופף בלי לחשוב יותר מדי.', value: 'wave' },
            { label: 'אחכה לראות אם הוא/היא מזהה אותי קודם.', value: 'wait_and_see' },
            { label: 'אסתכל בטלפון כאילו אני באמצע משימה חשובה.', value: 'phone_check' },
            { label: 'אעשה חצי חיוך כזה של "ראינו לא ראינו"', value: 'half_smile' },
            { label: 'אשנה כיוון ואעמיד פנים שזה היה מתוכנן.', value: 'change_direction' }
          ])}
        </View>
      )}

      {currentStep === 12 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>כשיוצאים יחד, מה הכי טבעי לך?</ThemedText>
          {renderEnumSelect('money_style', MONEY_STYLE_OPTIONS)}
        </View>
      )}

      {currentStep === 13 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>איך את/ה הכי נוטה להראות אהבה או אכפתיות?</ThemedText>
          {renderEnumSelect('love_language', LOVE_LANGUAGE_OPTIONS)}
        </View>
      )}

      {currentStep === 14 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>את/ה בדרך כלל נמשך/ת יותר למישהו/י ש...</ThemedText>
          {renderEnumSelect('similarity_preference', SIMILARITY_PREF_OPTIONS)}
        </View>
      )}

      {currentStep === 15 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>מה ההגדרה הדתית שלך?</ThemedText>
          {renderEnumSelect('religion', RELIGION_OPTIONS)}
        </View>
      )}

      {currentStep === 16 && (
        <View style={{ gap: 30 }}>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>עד כמה את/ה קרוב/ה למסורת?</ThemedText>
            {renderScale('tradition_self_rating')}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>עד כמה חשוב לך שבן/בת הזוג יהיו קרובים למסורת?</ThemedText>
            {renderScale('tradition_partner_importance')}
          </View>
        </View>
      )}

      {currentStep === 17 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>מה הדייט המושלם בעיניך?</ThemedText>
          {renderEnumSelect('perfect_date', PERFECT_DATE_OPTIONS)}
        </View>
      )}

      {currentStep === 18 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>מה דיל־ברייקר מבחינתך?</ThemedText>
          {renderEnumSelect('main_dealbreaker', MAIN_DEALBREAKER_OPTIONS)}
        </View>
      )}

      {currentStep === 19 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>מה לדעתך הצדדים החזקים שלך בקשר?</ThemedText>
          <TextInput
            style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border, height: 100, textAlignVertical: 'top', paddingTop: 10 }]}
            placeholder="ספר/י לנו..."
            multiline
            value={formData.relationship_strengths_text}
            onChangeText={(v) => setFormData({ ...formData, relationship_strengths_text: v })}
          />
        </View>
      )}

      {currentStep === 20 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>ומה משהו שחשוב שידעו עלייך?</ThemedText>
          <TextInput
            style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border, height: 100, textAlignVertical: 'top', paddingTop: 10 }]}
            placeholder="ספר/י לנו משהו נוסף..."
            multiline
            value={formData.relationship_growth_text}
            onChangeText={(v) => setFormData({ ...formData, relationship_growth_text: v })}
          />
        </View>
      )}
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
          {currentStep > 0 && currentStep !== 7 && (
            <View style={styles.progressHeader}>
               <View style={styles.progressContainer}>
                  {Array.from({ length: 20 }).map((_, i) => (
                     <View key={i} style={[styles.progressSegment, { backgroundColor: (i + 1) <= currentStep ? UI_COLORS.primary : UI_COLORS.progressInactive }]} />
                  ))}
               </View>
               <BrandMark size={20} />
            </View>
          )}

          <ScrollView 
            contentContainerStyle={styles.scrollContent} 
            onScroll={handleScroll}
            scrollEventThrottle={1000}
          >
            {currentStep === 0 && renderIntro()}
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
            {currentStep === 5 && renderStep5()}
            {currentStep === 6 && renderStep6()}
            {currentStep === 7 && renderChoiceScreen()}
            {currentStep >= 8 && renderDeepSteps()}

            {currentStep !== 0 && currentStep !== 7 && (
              <View style={styles.navigation}>
                {isEditMode && currentStep === 6 && userProfile?.onboarding_mode === 'fast' ? (
                  <>
                    <TouchableOpacity
                      style={[styles.navButton, { backgroundColor: UI_COLORS.primary }]}
                      onPress={() => handleSubmit('fast')}
                      disabled={loading}>
                      {loading ? <ActivityIndicator color="white" /> : <ThemedText style={styles.primaryNavText}>שמור וסיים</ThemedText>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.navButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: UI_COLORS.primary }]}
                      onPress={() => setCurrentStep(8)}
                      disabled={loading}>
                      <ThemedText style={[styles.primaryNavText, { color: UI_COLORS.primary }]}>להמשיך לשאלון המעמיק</ThemedText>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.navButton, { backgroundColor: UI_COLORS.primary }]}
                    onPress={nextStep}
                    disabled={loading}>
                    {loading ? <ActivityIndicator color="white" /> : <ThemedText style={styles.primaryNavText}>{currentStep === 20 || (isEditMode && currentStep === 6 && userProfile?.onboarding_mode === 'deep') ? 'סיום' : 'המשך'}</ThemedText>}
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.navButton} onPress={prevStep}>
                  <ThemedText style={{ color: UI_COLORS.primary, fontWeight: '700' }}>חזרה</ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 60 },
  stepContent: { gap: 24, paddingTop: 10 },
  introHeader: { alignItems: 'center', gap: 20, marginBottom: 20, marginTop: 40 },
  introTitle: { fontSize: 28, fontWeight: '900', textAlign: 'center', color: UI_COLORS.branding },
  introText: { fontSize: 18, lineHeight: 28, textAlign: 'center', color: UI_COLORS.text, paddingHorizontal: 10 },
  stepTitle: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  stepSubtitle: { fontSize: 24, fontWeight: '800', textAlign: 'right', marginBottom: 10 },
  formGroup: { gap: 12 },
  label: { fontSize: 16, fontWeight: '700', textAlign: 'right' },
  input: { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, fontSize: 16, textAlign: 'right' },
  optionList: { gap: 10 },
  optionButton: { padding: 16, borderRadius: 12, borderWidth: 1, alignItems: 'flex-end' },
  optionText: { fontSize: 15, textAlign: 'right' },
  chipGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600' },
  photoGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  photoWrapper: { width: '30%', aspectRatio: 0.8, borderRadius: 10, overflow: 'hidden' },
  gridPhoto: { width: '100%', height: '100%' },
  deletePhotoBadge: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  addPhotoPlaceholder: { width: '30%', aspectRatio: 0.8, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', borderColor: UI_COLORS.border },
  choiceCard: { flexDirection: 'row-reverse', padding: 20, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: UI_COLORS.border, gap: 15, marginBottom: 15 },
  choiceIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: UI_COLORS.surface, justifyContent: 'center', alignItems: 'center' },
  choiceTitle: { fontSize: 18, fontWeight: '800', textAlign: 'right', marginBottom: 4 },
  choiceDescription: { fontSize: 14, color: UI_COLORS.textLight, textAlign: 'right', lineHeight: 20 },
  progressHeader: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 24, gap: 15, marginTop: 10 },
  progressContainer: { flex: 1, flexDirection: 'row-reverse', height: 4, gap: 4 },
  progressSegment: { flex: 1, height: '100%', borderRadius: 2 },
  navigation: { marginTop: 30, gap: 12 },
  navButton: { height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  primaryNav: { shadowColor: UI_COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 3 },
  primaryNavText: { color: 'white', fontSize: 18, fontWeight: '800' },
});
