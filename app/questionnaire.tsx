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

// 0: Intro, 1-5: Basic (V2 spec), 7: Choice, 8-18: Deep (V2 spec, 11 grouped sections; 18 = שוברי קרח)
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18;

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

// === v2 questionnaire spec — option sets ===
// These constants are added now so that follow-up commits can wire them into
// the UI without churning the rest of the file. They are intentionally unused
// in this commit; that's expected.

const RELIGIOUS_LEVEL_OPTIONS = [
  { label: 'חילוני/ת', value: 'secular' },
  { label: 'מסורתי/ת', value: 'traditional' },
  { label: 'דתי/ה', value: 'religious' },
  { label: 'דתי/ה לאומי/ת', value: 'religious_national' },
  { label: 'חרדי/ת', value: 'haredi' },
];

const APP_INTENT_OPTIONS = [
  { label: 'קשר לטווח ארוך', value: 'long_term' },
  { label: 'קשר קצר', value: 'short_term' },
  { label: 'סטוצים / קשר לא מחייב', value: 'casual' },
  { label: 'ראש פתוח וזורם', value: 'open_flow' },
];

const FIELD_OF_STUDY_OPTIONS = [
  { label: 'פסיכולוגיה', value: 'psychology' },
  { label: 'מדעי המחשב', value: 'cs' },
  { label: 'משפטים', value: 'law' },
  { label: 'רפואה', value: 'medicine' },
  { label: 'מנהל עסקים', value: 'business' },
  { label: 'הנדסה', value: 'engineering' },
  { label: 'אחר', value: 'other' },
];

const DEGREE_TYPE_OPTIONS = [
  { label: 'תואר ראשון', value: 'bachelors' },
  { label: 'תואר שני', value: 'masters' },
  { label: 'דוקטורט', value: 'phd' },
  { label: 'לימודי תעודה', value: 'certificate' },
  { label: 'אחר', value: 'other' },
];

const STUDY_YEAR_OPTIONS = [
  { label: 'שנה א׳', value: 'year_1' },
  { label: 'שנה ב׳', value: 'year_2' },
  { label: 'שנה ג׳', value: 'year_3' },
  { label: 'שנה ד׳', value: 'year_4' },
  { label: 'שנה ה׳+', value: 'year_5_plus' },
];

const INTERESTED_IN_OPTIONS_V2 = [
  { label: 'גברים', value: 'man' },
  { label: 'נשים', value: 'woman' },
  { label: 'כולם', value: 'any' },
];

const MATCH_PREFERENCES_OPTIONS = [
  { label: 'מאותו מוסד לימודים', value: 'same_university' },
  { label: 'מאותה פקולטה', value: 'same_faculty' },
  { label: 'מאותו אזור בארץ', value: 'same_region' },
  { label: 'באותה רמת דתיות', value: 'same_religious_level' },
  { label: 'לא משנה לי', value: 'no_preference' },
];

const HOBBY_OPTIONS_V2 = [
  { label: 'חדר כושר', value: 'gym' },
  { label: 'ריצה', value: 'running' },
  { label: 'טיולים', value: 'hiking' },
  { label: 'קמפינג', value: 'camping' },
  { label: 'ים', value: 'beach' },
  { label: 'מוזיקה', value: 'music' },
  { label: 'הופעות', value: 'concerts' },
  { label: 'סרטים', value: 'movies' },
  { label: 'סדרות', value: 'series' },
  { label: 'קריאה', value: 'reading' },
  { label: 'גיימינג', value: 'gaming' },
  { label: 'בישול', value: 'cooking' },
  { label: 'מסעדות', value: 'restaurants' },
  { label: 'אומנות', value: 'art' },
  { label: 'צילום', value: 'photography' },
  { label: 'ריקוד', value: 'dancing' },
  { label: 'כלבים', value: 'dogs' },
  { label: 'חתולים', value: 'cats' },
  { label: 'טכנולוגיה', value: 'tech' },
  { label: 'יזמות', value: 'entrepreneurship' },
  { label: 'טניס', value: 'tennis' },
  { label: 'אופנוע ים', value: 'jet_ski' },
  { label: 'אחר', value: 'other' },
];

const DATE_TYPE_OPTIONS = [
  { label: 'בית קפה', value: 'coffee' },
  { label: 'מסעדה', value: 'restaurant' },
  { label: 'בר / דרינק', value: 'bar' },
  { label: 'פיקניק', value: 'picnic' },
  { label: 'טיול בטבע', value: 'nature_walk' },
  { label: 'פעילות אקטיבית', value: 'active' },
  { label: 'ערב ביתי', value: 'home_evening' },
  { label: 'לא משנה מה עושים, העיקר החיבור', value: 'connection_matters' },
];

const RELATIONSHIP_PACE_OPTIONS_V2 = [
  { label: 'איטי מאוד', value: 'very_slow' },
  { label: 'להכיר בהדרגה', value: 'gradual' },
  { label: 'קצב בינוני', value: 'medium' },
  { label: 'כשיש חיבור אני זורם/ת מהר', value: 'fast_with_connection' },
];

const CONFLICT_RESPONSE_OPTIONS = [
  { label: 'רוצה לדבר מיד', value: 'talk_immediately' },
  { label: 'צריך/ה זמן להירגע', value: 'need_cooldown' },
  { label: 'נמנע/ת מעימותים', value: 'avoidant' },
  { label: 'תלוי במצב', value: 'situational' },
];

const PROBLEM_RESPONSE_OPTIONS = [
  { label: 'לפתור אותה מיד', value: 'solve_immediately' },
  { label: 'להבין קודם את הרגשות שלי', value: 'understand_feelings_first' },
  { label: 'לתת לזמן לעשות את שלו', value: 'let_time_help' },
  { label: 'לשמוע את הצד השני', value: 'hear_other_side' },
];

const ATTRACTION_INITIATIVE_OPTIONS = [
  { label: 'יוזם/ת שיחה', value: 'initiate_conversation' },
  { label: 'רומז/ת בעדינות', value: 'subtle_hint' },
  { label: 'מחכה שיפנו אליי', value: 'wait_for_approach' },
  { label: 'תלוי בביטחון שלי באותו רגע', value: 'confidence_dependent' },
];

const FEEL_INTEREST_OPTIONS = [
  { label: 'מתלהב/ת', value: 'excited' },
  { label: 'בוחן/ת את המצב', value: 'evaluating' },
  { label: 'נלחץ/ת קצת', value: 'slightly_anxious' },
  { label: 'שמתי לב אבל משתדל/ת לא להראות', value: 'hide_it' },
];

const ELEVATOR_OPTIONS_V2 = [
  { label: 'ישר אפתח שיחה', value: 'open_conversation' },
  { label: 'אעשה כאילו אני קורא/ת הודעות בטלפון', value: 'fake_phone_reading' },
  { label: 'אנסה לבדוק אם יש קשר עין, ואם כן אפתח שיחה על מזג האוויר רק כדי שלא יהיה מביך', value: 'eye_contact_weather' },
  { label: 'אעשה כאילו אני מדבר/ת בטלפון', value: 'fake_phone_call' },
  { label: 'אלחץ, אכנס לפאניקה ואנסה למצוא דרך לצאת משם', value: 'panic_exit' },
];

const KARAOKE_OPTIONS_V2 = [
  { label: 'ראשון/ה על הבמה', value: 'first_on_stage' },
  { label: 'שר/ה אם משכנעים אותי', value: 'sing_if_convinced' },
  { label: 'מעדיף/ה לצפות', value: 'prefer_watching' },
  { label: 'אשיר רק אחרי כמה שוטים', value: 'shots_first' },
];

const FAMILIAR_FACE_OPTIONS_V2 = [
  { label: 'ישר מנופף/ת בהתלהבות וצועק/ת את השם שלו/ה שישימו לב', value: 'enthusiastic_wave' },
  { label: 'מסתכל/ת להבין אם יש קשר עין, ואם כן מנופף/ת לשלום', value: 'eye_contact_wave' },
  { label: 'מחכה לראות אם הוא/היא אומר/ת לי שלום, ורק אם כן אגיד בחזרה', value: 'wait_for_them' },
  { label: 'עושה כאילו אני בטלפון ומתעלם/ת', value: 'phone_ignore' },
  { label: 'ישר הולך/ת לכיוון השני ומאריך/ה את הדרך שלי בחצי שעה', value: 'detour' },
];

const SPONTANEITY_OPTIONS_V2 = [
  { label: 'אומר/ת להם שאני בא/ה ומארגן/ת מזוודה', value: 'pack_now' },
  { label: 'בודק/ת מי בא, אם יש לי משהו חשוב בלימודים/עבודה, ואז זורם/ת', value: 'check_then_flow' },
  { label: 'נלחץ/ת ואומר/ת שאני צריך/ה זמן לתכנן ולבקש חופש', value: 'need_planning_time' },
  { label: 'לא טס/ה', value: 'no_go' },
];

const SPONTANEOUS_PLAN_OPTIONS = [
  { label: 'בפנים בלי לחשוב פעמיים', value: 'in_immediately' },
  { label: 'בדרך כלל זורם/ת', value: 'usually_flow' },
  { label: 'תלוי במצב רוח', value: 'mood_dependent' },
  { label: 'אני גמור/ה מהעבודה, אין סיכוי', value: 'too_tired' },
  { label: 'צריך/ה התראה מראש של לפחות כמה ימים', value: 'need_advance_notice' },
];

const RELATIONSHIP_TOP_VALUES_OPTIONS = [
  { label: 'אמון', value: 'trust' },
  { label: 'תקשורת', value: 'communication' },
  { label: 'משיכה', value: 'attraction' },
  { label: 'הומור', value: 'humor' },
  { label: 'יציבות', value: 'stability' },
  { label: 'חברות', value: 'friendship' },
  { label: 'עצמאות', value: 'independence' },
  { label: 'שאפתנות', value: 'ambition' },
  { label: 'משפחתיות', value: 'family' },
  { label: 'אחר', value: 'other' },
];

const LOVE_LANGUAGE_OPTIONS_V2 = [
  { label: 'זמן איכות', value: 'quality_time' },
  { label: 'מילים טובות', value: 'words' },
  { label: 'מגע', value: 'touch' },
  { label: 'עזרה ומעשים', value: 'acts_of_service' },
  { label: 'מתנות', value: 'gifts' },
];

const SIMILARITY_PREF_OPTIONS_V2 = [
  { label: 'אנשים שדומים לי', value: 'similar' },
  { label: 'אנשים שמשלימים אותי', value: 'complementary' },
  { label: 'אנשים שהפוכים ממני', value: 'opposite' },
  { label: 'שילוב של השניים', value: 'mix' },
];

const PERFECT_DATE_OPTIONS_V2 = [
  { label: 'בית קפה ושיחה טובה', value: 'coffee_talk' },
  { label: 'מסעדה רומנטית', value: 'romantic_restaurant' },
  { label: 'פיקניק בטבע', value: 'nature_picnic' },
  { label: 'טיול ארוך', value: 'long_walk' },
  { label: 'בר ודרינק', value: 'bar_drink' },
  { label: 'פעילות מיוחדת', value: 'special_activity' },
  { label: 'ערב ביתי', value: 'home_evening' },
  { label: 'לא משנה מה עושים, העיקר החיבור', value: 'connection_matters' },
];

const DEALBREAKERS_OPTIONS = [
  { label: 'חוסר כנות', value: 'dishonesty' },
  { label: 'חוסר תקשורת', value: 'poor_communication' },
  { label: 'חוסר משיכה', value: 'no_attraction' },
  { label: 'חוסר שאפתנות', value: 'no_ambition' },
  { label: 'ערכים שונים מאוד', value: 'different_values' },
  { label: 'עישון', value: 'smoking' },
  { label: 'קנאה מוגזמת', value: 'excessive_jealousy' },
  { label: 'חוסר עצמאות', value: 'no_independence' },
  { label: 'יחס לא מכבד', value: 'disrespect' },
  { label: 'אחר', value: 'other' },
];

const RELATIONSHIP_STRENGTHS_OPTIONS = [
  { label: 'תקשורת טובה', value: 'good_communication' },
  { label: 'נאמנות', value: 'loyalty' },
  { label: 'הקשבה', value: 'listening' },
  { label: 'הומור', value: 'humor' },
  { label: 'רומנטיות', value: 'romance' },
  { label: 'כנות', value: 'honesty' },
  { label: 'יציבות', value: 'stability' },
  { label: 'תמיכה', value: 'support' },
  { label: 'ספונטניות', value: 'spontaneity' },
  { label: 'פתרון קונפליקטים', value: 'conflict_resolution' },
];

const PARTNER_SHOULD_KNOW_OPTIONS = [
  { label: 'אני צריך/ה הרבה זמן לבד', value: 'need_alone_time' },
  { label: 'אני מאוד משפחתי/ת', value: 'family_oriented' },
  { label: 'הקריירה חשובה לי מאוד', value: 'career_focused' },
  { label: 'אני אדם רגיש', value: 'sensitive' },
  { label: 'אני אדם ישיר', value: 'direct' },
  { label: 'אני אוהב/ת ספונטניות', value: 'love_spontaneity' },
  { label: 'חשוב לי סדר וארגון', value: 'order_organization' },
  { label: 'אני אוהב/ת הרפתקאות', value: 'love_adventure' },
  { label: 'לוקח לי זמן להיפתח', value: 'slow_to_open' },
];

const PARTNER_QUALITIES_OPTIONS = [
  { label: 'אינטליגנציה', value: 'intelligence' },
  { label: 'הומור', value: 'humor' },
  { label: 'אמביציה', value: 'ambition' },
  { label: 'רגישות', value: 'sensitivity' },
  { label: 'תקשורת טובה', value: 'good_communication' },
  { label: 'ביטחון עצמי', value: 'self_confidence' },
  { label: 'משפחתיות', value: 'family' },
  { label: 'משיכה פיזית', value: 'physical_attraction' },
  { label: 'כנות', value: 'honesty' },
  { label: 'יציבות', value: 'stability' },
  { label: 'פתיחות מחשבתית', value: 'open_minded' },
  { label: 'ספונטניות', value: 'spontaneity' },
  { label: 'ערכים דומים', value: 'similar_values' },
  { label: 'בגרות רגשית', value: 'emotional_maturity' },
  { label: 'אחר', value: 'other' },
];

const PERSONAL_SPACE_OPTIONS = [
  { label: 'צריך/ה הרבה מרחב אישי', value: 'need_lots_of_space' },
  { label: 'צריך/ה איזון', value: 'need_balance' },
  { label: 'אוהב/ת להיות הרבה ביחד', value: 'lots_of_togetherness' },
];

const CHEMISTRY_VS_LONGTERM_OPTIONS = [
  { label: 'כימיה מיידית', value: 'instant_chemistry' },
  { label: 'התאמה לטווח ארוך', value: 'long_term_fit' },
  { label: 'שניהם באותה מידה', value: 'both_equal' },
];

const STABILITY_VS_ADVENTURE_OPTIONS = [
  { label: 'יציבות וביטחון', value: 'stability_security' },
  { label: 'ריגוש והרפתקאות', value: 'excitement_adventure' },
  { label: 'שילוב של שניהם', value: 'mix' },
];

const PARTNER_SHOULD_FEEL_OPTIONS = [
  { label: 'בטוחים', value: 'safe' },
  { label: 'אהובים', value: 'loved' },
  { label: 'מוערכים', value: 'valued' },
  { label: 'רגועים', value: 'calm' },
  { label: 'נרגשים', value: 'excited' },
  { label: 'מובנים', value: 'understood' },
  { label: 'חופשיים להיות עצמם', value: 'free_to_be_themselves' },
];

const RELIGION_TYPE_OPTIONS = [
  { label: 'יהודי/ה', value: 'jewish' },
  { label: 'מוסלמי/ת', value: 'muslim' },
  { label: 'נוצרי/ה', value: 'christian' },
  { label: 'דרוזי/ת', value: 'druze' },
  { label: 'אחר', value: 'other' },
  { label: 'מעדיף/ה לא לומר', value: 'prefer_not_to_say' },
];

const RELIGION_IMPORTANCE_OPTIONS = [
  { label: 'לא חשוב לי', value: 'not_important' },
  { label: 'נחמד אם כן, לא חובה', value: 'nice_to_have' },
  { label: 'די חשוב לי', value: 'somewhat_important' },
  { label: 'חשוב לי מאוד', value: 'very_important' },
];

const RELIGIOUS_LEVEL_IMPORTANCE_OPTIONS = [
  { label: 'לא חשוב לי', value: 'not_important' },
  { label: 'עדיף דומה, אבל לא חובה', value: 'similar_preferred' },
  { label: 'חשוב לי שיהיה דומה', value: 'similar_important' },
  { label: 'חשוב לי מאוד', value: 'very_important' },
];

export default function QuestionnaireScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const isEditMode = mode === 'edit';
  
  const [currentStep, setCurrentStep] = useState<Step>(isEditMode ? 1 : 0);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  // Photos already saved to profile_photos carry `id` and `storage_path`.
  // Newly picked photos have only `uri`; the edit-mode save uses this distinction
  // to decide what to upload vs. keep vs. delete.
  const [photos, setPhotos] = useState<{ uri: string; id?: string; storage_path?: string; display_order?: number }[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  
  const scrollThresholds = React.useRef<Set<number>>(new Set());
  // IDs of photos we successfully loaded from profile_photos into the photo grid.
  // handleSubmit consults this to distinguish "user explicitly removed photo X"
  // (X was loaded, then taken out of state) from "photo X failed to load and was
  // never visible" (X is not in this set, so it must NOT be treated as a removal).
  const loadedPhotoIdsRef = React.useRef<Set<string>>(new Set());

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
    firstName: '',
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

    // === v2 questionnaire spec fields — wired into UI by follow-up commits ===
    city: '',
    degree_type: '',
    match_preferences: [] as string[],
    shared_hobbies_priority: [] as string[],
    availability_level: 3,
    problem_response_style: '',
    attraction_initiative_style: '',
    feel_interest_response: '',
    spontaneous_plan_response: '',
    relationship_top_values: [] as string[],
    relationship_strengths: [] as string[],
    partner_should_know: [] as string[],
    partner_qualities: [] as string[],
    personal_space_style: '',
    chemistry_vs_longterm: '',
    stability_vs_adventure: '',
    partner_should_feel: [] as string[],

    // === v2 polish fields (TestFlight QA) ===
    university_other: '',
    faculty_other: '',
    degree_type_other: '',
    hobbies_other: '',
    religion_type: '',
    religion_type_other: '',
    religion_importance: '',
    religious_level_importance: '',
    relationship_top_values_other: '',
    dealbreakers_other: '',
    partner_qualities_other: '',
    love_languages: [] as string[],
    partner_should_know_text: '',
    conversation_starter: '',
    green_flag: '',
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
      
      const [answersRes, profileRes, photosRes] = await Promise.all([
        supabase.from('questionnaire_answers').select('answers').eq('user_id', user.id).single(),
        supabase.from('profiles').select('onboarding_mode, full_name, avatar_storage_path').eq('id', user.id).single(),
        supabase.from('profile_photos').select('id, storage_path, display_order').eq('user_id', user.id).order('display_order', { ascending: true }),
      ]);

      if (answersRes.data?.answers) {
        setFormData(prev => ({
          ...prev,
          ...answersRes.data.answers,
          // Ensure new fields have defaults if they didn't exist in DB
          firstName: answersRes.data.answers.firstName || profileRes.data?.full_name || '',
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

          // v2 spec field defaults
          city: answersRes.data.answers.city || '',
          degree_type: answersRes.data.answers.degree_type || '',
          match_preferences: answersRes.data.answers.match_preferences || [],
          shared_hobbies_priority: answersRes.data.answers.shared_hobbies_priority || [],
          availability_level: answersRes.data.answers.availability_level || 3,
          problem_response_style: answersRes.data.answers.problem_response_style || '',
          attraction_initiative_style: answersRes.data.answers.attraction_initiative_style || '',
          feel_interest_response: answersRes.data.answers.feel_interest_response || '',
          spontaneous_plan_response: answersRes.data.answers.spontaneous_plan_response || '',
          relationship_top_values: answersRes.data.answers.relationship_top_values || [],
          relationship_strengths: answersRes.data.answers.relationship_strengths || [],
          partner_should_know: answersRes.data.answers.partner_should_know || [],
          partner_qualities: answersRes.data.answers.partner_qualities || [],
          personal_space_style: answersRes.data.answers.personal_space_style || '',
          chemistry_vs_longterm: answersRes.data.answers.chemistry_vs_longterm || '',
          stability_vs_adventure: answersRes.data.answers.stability_vs_adventure || '',
          partner_should_feel: answersRes.data.answers.partner_should_feel || [],

          // v2 polish defaults (TestFlight QA)
          university_other: answersRes.data.answers.university_other || '',
          faculty_other: answersRes.data.answers.faculty_other || '',
          degree_type_other: answersRes.data.answers.degree_type_other || '',
          hobbies_other: answersRes.data.answers.hobbies_other || '',
          religion_type: answersRes.data.answers.religion_type || '',
          religion_type_other: answersRes.data.answers.religion_type_other || '',
          religion_importance: answersRes.data.answers.religion_importance || '',
          religious_level_importance: answersRes.data.answers.religious_level_importance || '',
          relationship_top_values_other: answersRes.data.answers.relationship_top_values_other || '',
          dealbreakers_other: answersRes.data.answers.dealbreakers_other || '',
          partner_qualities_other: answersRes.data.answers.partner_qualities_other || '',
          // love_languages: prefer the new array; fall back to wrapping the legacy single value if present.
          love_languages: Array.isArray(answersRes.data.answers.love_languages)
            ? answersRes.data.answers.love_languages
            : (answersRes.data.answers.love_language ? [answersRes.data.answers.love_language] : []),
          // partner_should_know_text: prefer the new text; otherwise join the legacy array as a comma-separated fallback for edit-mode display.
          partner_should_know_text:
            answersRes.data.answers.partner_should_know_text ||
            (Array.isArray(answersRes.data.answers.partner_should_know) && answersRes.data.answers.partner_should_know.length > 0
              ? answersRes.data.answers.partner_should_know.join(', ')
              : ''),
          conversation_starter: answersRes.data.answers.conversation_starter || '',
          green_flag: answersRes.data.answers.green_flag || '',
        }));
      }
      if (profileRes.data) {
        setUserProfile(profileRes.data);
        if (profileRes.data.full_name && !answersRes.data?.answers?.firstName) {
          setFormData(prev => ({ ...prev, firstName: profileRes.data.full_name }));
        }
      }

      if (photosRes.data && photosRes.data.length > 0) {
        const signed = await Promise.all(photosRes.data.map(async (p) => {
          const { data, error } = await supabase.storage
            .from('profile-photos')
            .createSignedUrl(p.storage_path, 3600);
          if (error || !data?.signedUrl) return null;
          return {
            uri: data.signedUrl,
            id: p.id,
            storage_path: p.storage_path,
            display_order: p.display_order,
          };
        }));
        const valid = signed.filter((p): p is NonNullable<typeof p> => p !== null);
        if (valid.length > 0) setPhotos(valid);
        // Record which IDs actually made it into state. Any DB row whose URL
        // failed to sign is intentionally absent here, so the save reconciliation
        // will leave that row alone instead of treating it as user-removed.
        loadedPhotoIdsRef.current = new Set(valid.map(p => p.id));
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

      // Treat any cancel/empty-asset shape as a silent no-op so dismiss gestures
      // never surface as an error to the user.
      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }
      setPhotos([...photos, { uri: result.assets[0].uri }]);
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

      // Trigger AI Traits Analysis if Deep Questionnaire is completed/updated.
      // TODO: The v2 questionnaire spec drops the free-text inputs that this
      // Edge Function (analyze-user-traits) reads — `about_me`,
      // `relationship_strengths_text`, `relationship_growth_text`. Once those
      // fields stop being populated by the new UI, the function will return its
      // "No text to analyze" no-op path. To re-enable meaningful AI traits,
      // re-introduce at least one free-text prompt (e.g. an optional
      // "ספר/י על עצמך") and wire it into the same field(s).
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
            full_name: formData.firstName.trim(),
            birth_year: formData.age ? new Date().getFullYear() - parseInt(formData.age) : null,
            gender: formData.gender,
            height_cm: formData.heightCm ? parseInt(formData.heightCm) : null,
            interested_in_genders: formData.interestedInGenders,
            university: formData.university,
            faculty: formData.faculty,
            year_of_study: formData.degree_stage,
            campus: formData.city.trim() || formData.campus || null,
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
            full_name: formData.firstName.trim(),
            birth_year: formData.age ? new Date().getFullYear() - parseInt(formData.age) : null,
            gender: formData.gender,
            height_cm: formData.heightCm ? parseInt(formData.heightCm) : null,
            interested_in_genders: formData.interestedInGenders,
            university: formData.university,
            faculty: formData.faculty,
            year_of_study: formData.degree_stage,
            campus: formData.city.trim() || formData.campus || null,
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

        // === Photo reconciliation ===
        // The questionnaire photo grid is the source of truth in edit mode.
        // After save, profile_photos + storage should mirror `photos` state:
        //   - Photos with `id` already exist in DB → keep, no-op.
        //   - Photos in state without `id` → newly picked → upload + insert.
        //   - Photos in DB whose id is no longer in state → user removed them → delete.
        const { data: currentDbPhotos } = await supabase
          .from('profile_photos')
          .select('id, storage_path, display_order')
          .eq('user_id', user.id);

        const stateIds = new Set(photos.filter(p => p.id).map(p => p.id!));
        // Only photos we actually loaded into the UI are eligible for deletion;
        // a DB row that failed to sign at load time was never shown to the user
        // and must not be deleted just because it's absent from state.
        const removedFromState = (currentDbPhotos ?? [])
          .filter(p => loadedPhotoIdsRef.current.has(p.id))
          .filter(p => !stateIds.has(p.id));
        const removedStoragePaths = new Set(removedFromState.map(p => p.storage_path).filter(Boolean));

        for (const dbPhoto of removedFromState) {
          await supabase.from('profile_photos').delete().eq('id', dbPhoto.id);
          if (dbPhoto.storage_path) {
            await supabase.storage.from('profile-photos').remove([dbPhoto.storage_path]);
          }
        }

        // Upload new photos (those in state without `id`). Track the storage path
        // assigned to each state slot so we can compute the new "first photo" for
        // the avatar cascade below.
        const pathByIndex: (string | null)[] = photos.map(p => p.storage_path ?? null);
        const survivingExistingCount = (currentDbPhotos ?? []).length - removedFromState.length;
        let nextOrder = survivingExistingCount;
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          if (p.id) continue;

          const manipResult = await ImageManipulator.manipulateAsync(
            p.uri,
            [{ resize: { width: 1200 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          if (!manipResult.base64) {
            logEvent('photo_upload_failed', { screen: 'Questionnaire', action: 'edit_compression', metadata: { index: i } });
            continue;
          }

          const fileName = `${user.id}/${Date.now()}_${i}.jpg`;
          pathByIndex[i] = fileName;

          const { error: storageError } = await supabase.storage
            .from('profile-photos')
            .upload(fileName, decode(manipResult.base64), {
              contentType: 'image/jpeg',
              cacheControl: '3600',
              upsert: false,
            });
          if (storageError) {
            logError('Questionnaire', 'edit_photo_upload_failed', storageError);
            throw storageError;
          }

          const { error: insertError } = await supabase
            .from('profile_photos')
            .insert({
              user_id: user.id,
              storage_path: fileName,
              display_order: nextOrder,
            });
          if (insertError) {
            logError('Questionnaire', 'edit_photo_db_insert_failed', insertError);
            throw insertError;
          }
          nextOrder++;
        }

        // === Avatar cascade (Option B) ===
        // Walk the visible photo order, take the first slot that has a known
        // storage_path after reconciliation. That is the new "first photo".
        const firstPhotoPath = pathByIndex.find(p => p !== null) ?? null;
        const oldAvatarPath = userProfile?.avatar_storage_path ?? null;
        const avatarPhotoWasDeleted = !!oldAvatarPath && removedStoragePaths.has(oldAvatarPath);

        // After save, the true profile_photos row count is the surviving
        // existing count plus newly inserted rows, which `nextOrder` already
        // reflects (it starts at survivingExistingCount and increments per insert).
        // Use that, NOT `firstPhotoPath === null`, to gate the "clear avatar"
        // branch — otherwise a failed photo load would null the avatar even
        // though the DB still has photos.
        const dbCountAfter = nextOrder;
        let nextAvatarPath: string | null | undefined;
        if (dbCountAfter === 0 && oldAvatarPath !== null) {
          // DB truly has no photos — clear the orphan avatar reference.
          nextAvatarPath = null;
        } else if (oldAvatarPath === null && firstPhotoPath !== null) {
          // No avatar before, but photos exist now — adopt the first.
          nextAvatarPath = firstPhotoPath;
        } else if (avatarPhotoWasDeleted) {
          // Current avatar's underlying photo was deleted — promote the first remaining.
          nextAvatarPath = firstPhotoPath;
        }
        // Otherwise (avatar still backed by a kept photo, or both null) leave it alone.

        if (nextAvatarPath !== undefined) {
          const { error: avatarUpdateError } = await supabase
            .from('profiles')
            .update({ avatar_storage_path: nextAvatarPath })
            .eq('id', user.id);
          if (avatarUpdateError) {
            logError('Questionnaire', 'edit_avatar_cascade_failed', avatarUpdateError);
            // Non-fatal: photos are saved; avatar will self-heal next time the
            // user touches photos. Don't throw.
          }
        }

        logFormSubmit('Questionnaire', 'edit_onboarding_submitted');
        Alert.alert('הצלחה', 'השאלון עודכן בהצלחה');
        router.replace('/(tabs)/my-profile');
      }
    } catch (error: any) {
      console.error('Error saving questionnaire:', error);
      Alert.alert('שגיאה', 'אירעה שגיאה בשמירת הנתונים: ' + (error.message || 'שגיאה לא ידועה'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndClose = async () => {
    if (!formData.firstName.trim()) {
      logEvent('onboarding_validation_failed', { screen: 'Questionnaire', metadata: { field: 'firstName', via: 'save_and_close' } });
      Alert.alert('שדה חובה', 'יש להזין את השם שלך');
      return;
    }
    logButtonTap('Questionnaire', 'save_and_close', { step: currentStep });
    const targetMode: 'fast' | 'deep' = userProfile?.onboarding_mode === 'deep' ? 'deep' : 'fast';
    await handleSubmit(targetMode);
  };

  const nextStep = () => {
    // Validation before moving next
    if (currentStep === 1) {
      if (!formData.firstName.trim()) {
        logEvent('onboarding_validation_failed', { screen: 'Questionnaire', metadata: { field: 'firstName' } });
        Alert.alert('שדה חובה', 'יש להזין את השם שלך');
        return;
      }
      if (!isEditMode && photos.length === 0) {
        logEvent('onboarding_validation_failed', { screen: 'Questionnaire', metadata: { field: 'photos' } });
        Alert.alert('חסרה תמונה', 'חובה להוסיף לפחות תמונה אחת.');
        return;
      }
      if (
        !formData.gender ||
        !formData.age ||
        !formData.heightCm ||
        !formData.city.trim() ||
        !formData.religion ||
        !formData.religion_type ||
        !formData.religion_importance ||
        !formData.religious_level_importance ||
        !formData.intent_type
      ) {
        logEvent('onboarding_validation_failed', { screen: 'Questionnaire', metadata: { field: 'step1_basics' } });
        Alert.alert('שדות חובה', 'יש למלא את כל השדות בשלב זה');
        return;
      }
    }

    if (currentStep === 2) {
      if (!formData.university || !formData.faculty || !formData.degree_type || !formData.degree_stage) {
        logEvent('onboarding_validation_failed', { screen: 'Questionnaire', metadata: { field: 'step2_studies' } });
        Alert.alert('שדות חובה', 'יש למלא את כל פרטי הלימודים');
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
      if (formData.match_preferences.length === 0) {
        Alert.alert('שדות חובה', 'יש לבחור לפחות העדפת התאמה אחת');
        return;
      }
    }

    if (currentStep === 4) {
      if (formData.hobbies.length === 0) {
        Alert.alert('שדות חובה', 'יש לבחור לפחות תחביב אחד');
        return;
      }
    }

    if (currentStep === 5) {
      if (!formData.preferred_first_date || !formData.relationship_pace) {
        Alert.alert('שדות חובה', 'יש למלא את כל השדות בשלב זה');
        return;
      }
      if (isEditMode) {
        if (userProfile?.onboarding_mode === 'deep') {
          setCurrentStep(8);
        } else {
          // Stay on step 5 and let the footer handle the choice
        }
      } else {
        setCurrentStep(7); // Show choice screen
      }
      return;
    }

    if (currentStep === 18) {
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
      const prev = (currentStep === 8 || currentStep === 7 ? 5 : currentStep - 1) as Step;
      logButtonTap('Questionnaire', 'previous_step', { from: currentStep, to: prev });
      setCurrentStep(prev);
      scrollThresholds.current.clear();
    } else {
      if (isEditMode) router.back();
      else router.canGoBack() ? router.back() : router.replace('/welcome');
    }
  };

  const toggleMultiSelectField = (field: 'hobbies' | 'interestedInGenders' | 'importantInPartner' | 'careLanguage' | 'dealbreakers' | 'comfortNeeds' | 'match_preferences' | 'shared_hobbies_priority' | 'relationship_top_values' | 'relationship_strengths' | 'partner_should_know' | 'partner_qualities' | 'partner_should_feel' | 'love_languages', val: string, max?: number) => {
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
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 1 מתוך 5</ThemedText>
        <ThemedText style={styles.stepSubtitle}>פרופיל אישי</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>איך קוראים לך?</ThemedText>
        <TextInput
          style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
          placeholder="השם שיופיע בפרופיל שלך"
          value={formData.firstName}
          onChangeText={(v) => setFormData({ ...formData, firstName: v })}
        />
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>תמונות פרופיל</ThemedText>
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
            <TouchableOpacity
              style={styles.addPhotoPlaceholder}
              onPress={pickImage}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <IconSymbol name="plus" size={32} color={UI_COLORS.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>מגדר</ThemedText>
        {renderEnumSelect('gender', GENDER_OPTIONS)}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>גיל</ThemedText>
        <TextInput
          style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
          placeholder="24"
          keyboardType="number-pad"
          value={formData.age}
          onChangeText={(v) => setFormData({ ...formData, age: v })}
        />
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>גובה (בס״מ)</ThemedText>
        <TextInput
          style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
          placeholder="170"
          keyboardType="number-pad"
          value={formData.heightCm}
          onChangeText={(v) => setFormData({ ...formData, heightCm: v })}
        />
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>עיר מגורים</ThemedText>
        <TextInput
          style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
          placeholder="לדוגמה: תל אביב"
          value={formData.city}
          onChangeText={(v) => setFormData({ ...formData, city: v })}
        />
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>רמת דתיות</ThemedText>
        {renderEnumSelect('religion', RELIGIOUS_LEVEL_OPTIONS)}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>מה הדת שלך?</ThemedText>
        {renderEnumSelect('religion_type', RELIGION_TYPE_OPTIONS)}
        {formData.religion_type === 'other' && (
          <TextInput
            style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
            placeholder="פרט/י..."
            placeholderTextColor={dynamicColors.textLight}
            value={formData.religion_type_other}
            onChangeText={(v) => setFormData({ ...formData, religion_type_other: v })}
          />
        )}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>עד כמה חשוב לך שבן/בת הזוג יהיו מאותה דת?</ThemedText>
        {renderEnumSelect('religion_importance', RELIGION_IMPORTANCE_OPTIONS)}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>עד כמה חשוב לך שבן/בת הזוג יהיו קרובים אלייך ברמת הדתיות?</ThemedText>
        {renderEnumSelect('religious_level_importance', RELIGIOUS_LEVEL_IMPORTANCE_OPTIONS)}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>מה את/ה מחפש/ת באפליקציה?</ThemedText>
        {renderEnumSelect('intent_type', APP_INTENT_OPTIONS)}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 2 מתוך 5</ThemedText>
        <ThemedText style={styles.stepSubtitle}>לימודים</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>מוסד לימודים</ThemedText>
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
        {formData.university === 'other' && (
          <TextInput
            style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
            placeholder="שם המוסד..."
            placeholderTextColor={dynamicColors.textLight}
            value={formData.university_other}
            onChangeText={(v) => setFormData({ ...formData, university_other: v })}
          />
        )}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>תחום לימודים</ThemedText>
        {renderEnumSelect('faculty', FIELD_OF_STUDY_OPTIONS)}
        {formData.faculty === 'other' && (
          <TextInput
            style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
            placeholder="התחום שלך..."
            placeholderTextColor={dynamicColors.textLight}
            value={formData.faculty_other}
            onChangeText={(v) => setFormData({ ...formData, faculty_other: v })}
          />
        )}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>סוג התואר</ThemedText>
        {renderEnumSelect('degree_type', DEGREE_TYPE_OPTIONS)}
        {formData.degree_type === 'other' && (
          <TextInput
            style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
            placeholder="סוג התואר שלך..."
            placeholderTextColor={dynamicColors.textLight}
            value={formData.degree_type_other}
            onChangeText={(v) => setFormData({ ...formData, degree_type_other: v })}
          />
        )}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>שנת לימודים</ThemedText>
        {renderEnumSelect('degree_stage', STUDY_YEAR_OPTIONS)}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 3 מתוך 5</ThemedText>
        <ThemedText style={styles.stepSubtitle}>העדפות היכרות</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>את מי היית רוצה להכיר?</ThemedText>
        <View style={styles.chipGrid}>
          {INTERESTED_IN_OPTIONS_V2.map((opt) => (
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
        <ThemedText style={styles.label}>טווח גילאים</ThemedText>
        <View style={{ flexDirection: 'row', gap: 10 }}>
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
        <ThemedText style={styles.label}>מה חשוב לך בהתאמה?</ThemedText>
        <View style={styles.chipGrid}>
          {MATCH_PREFERENCES_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, { borderColor: dynamicColors.border }, formData.match_preferences.includes(opt.value) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary }]}
              onPress={() => toggleMultiSelectField('match_preferences', opt.value)}>
              <ThemedText style={[styles.chipText, formData.match_preferences.includes(opt.value) && { color: UI_COLORS.selectedText }]}>{opt.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 4 מתוך 5</ThemedText>
        <ThemedText style={styles.stepSubtitle}>תחביבים</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>מה התחביבים שלך?</ThemedText>
        <View style={styles.chipGrid}>
          {HOBBY_OPTIONS_V2.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, { borderColor: dynamicColors.border }, formData.hobbies.includes(opt.value) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary }]}
              onPress={() => toggleMultiSelectField('hobbies', opt.value)}>
              <ThemedText style={[styles.chipText, formData.hobbies.includes(opt.value) && { color: UI_COLORS.selectedText }]}>{opt.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
        {formData.hobbies.includes('other') && (
          <TextInput
            style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
            placeholder="תחביב נוסף..."
            placeholderTextColor={dynamicColors.textLight}
            value={formData.hobbies_other}
            onChangeText={(v) => setFormData({ ...formData, hobbies_other: v })}
          />
        )}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>אילו תחביבים חשוב לך לחלוק?</ThemedText>
        <View style={styles.chipGrid}>
          {HOBBY_OPTIONS_V2.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, { borderColor: dynamicColors.border }, formData.shared_hobbies_priority.includes(opt.value) && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary }]}
              onPress={() => toggleMultiSelectField('shared_hobbies_priority', opt.value)}>
              <ThemedText style={[styles.chipText, formData.shared_hobbies_priority.includes(opt.value) && { color: UI_COLORS.selectedText }]}>{opt.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 5 מתוך 5</ThemedText>
        <ThemedText style={styles.stepSubtitle}>כוונות וקצב</ThemedText>
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>מה הדייט הראשון המושלם בשבילך?</ThemedText>
        {renderEnumSelect('preferred_first_date', DATE_TYPE_OPTIONS)}
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>איזה קצב מתאים לך?</ThemedText>
        {renderEnumSelect('relationship_pace', RELATIONSHIP_PACE_OPTIONS_V2)}
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

  const renderScale = (field: 'tradition_self_rating' | 'tradition_partner_importance' | 'availability_level') => (
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

  const renderMultiChips = (
    field: 'relationship_top_values' | 'dealbreakers' | 'relationship_strengths' | 'partner_should_know' | 'partner_qualities' | 'partner_should_feel' | 'love_languages',
    options: { label: string; value: string }[],
    max?: number,
  ) => (
    <View style={styles.chipGrid}>
      {options.map((opt) => {
        const selected = (formData[field] as string[]).includes(opt.value);
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, { borderColor: dynamicColors.border }, selected && { backgroundColor: dynamicColors.selectedBg, borderColor: UI_COLORS.primary }]}
            onPress={() => toggleMultiSelectField(field, opt.value, max)}>
            <ThemedText style={[styles.chipText, selected && { color: UI_COLORS.selectedText }]}>{opt.label}</ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const DEEP_SECTION_TITLES: Record<number, string> = {
    8: 'קונפליקטים ותקשורת',
    9: 'משיכה ויוזמה',
    10: 'אישיות חברתית',
    11: 'ספונטניות והרפתקנות',
    12: 'זוגיות וערכים',
    13: 'התאמה זוגית',
    14: 'חוזקות וצרכים בזוגיות',
    15: 'מה מחפשים בבן/בת זוג',
    16: 'שאלות עומק אחרונות',
    17: 'תחושה בקשר',
    18: 'שוברי קרח',
  };

  const renderDeepSteps = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שאלון מעמיק — שלב {currentStep - 7} מתוך 10</ThemedText>
        <ThemedText style={styles.stepSubtitle}>{DEEP_SECTION_TITLES[currentStep] || ''}</ThemedText>
      </View>

      {currentStep === 8 && (
        <>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>כשיש ריב אני בדרך כלל:</ThemedText>
            {renderEnumSelect('conflict_style', CONFLICT_RESPONSE_OPTIONS)}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>כשיש בעיה בקשר חשוב לי:</ThemedText>
            {renderEnumSelect('problem_response_style', PROBLEM_RESPONSE_OPTIONS)}
          </View>
        </>
      )}

      {currentStep === 9 && (
        <>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>כשמישהו מוצא חן בעיניי אני בדרך כלל:</ThemedText>
            {renderEnumSelect('attraction_initiative_style', ATTRACTION_INITIATIVE_OPTIONS)}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>כשאני מרגיש/ה שמישהו מעוניין בי:</ThemedText>
            {renderEnumSelect('feel_interest_response', FEEL_INTEREST_OPTIONS)}
          </View>
        </>
      )}

      {currentStep === 10 && (
        <>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>נתקעת עם אדם נוסף במעלית שאת/ה לא מכיר/ה. מה תעשה/י?</ThemedText>
            {renderEnumSelect('elevatorScenario', ELEVATOR_OPTIONS_V2)}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>את/ה בקריוקי עם חברים:</ThemedText>
            {renderEnumSelect('karaokeChance', KARAOKE_OPTIONS_V2)}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>את/ה רואה ברחוב מולך מישהו/י שאת/ה מכיר/ה מהלימודים:</ThemedText>
            {renderEnumSelect('familiarFace', FAMILIAR_FACE_OPTIONS_V2)}
          </View>
        </>
      )}

      {currentStep === 11 && (
        <>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>חברים מתקשרים אלייך ואומרים שהם סוגרים טיסה למחר בבוקר ובאים לאסוף אותך לשדה בעוד כמה שעות. מה תעשה/י?</ThemedText>
            {renderEnumSelect('spontaneity', SPONTANEITY_OPTIONS_V2)}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>חברים מתקשרים אלייך ואומרים לך להתארגן כי יוצאים לבאולינג. מה תעשה/י?</ThemedText>
            {renderEnumSelect('spontaneous_plan_response', SPONTANEOUS_PLAN_OPTIONS)}
          </View>
        </>
      )}

      {currentStep === 12 && (
        <>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>מה הכי חשוב לך בזוגיות? (עד 3)</ThemedText>
            {renderMultiChips('relationship_top_values', RELATIONSHIP_TOP_VALUES_OPTIONS, 3)}
            {formData.relationship_top_values.includes('other') && (
              <TextInput
                style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
                placeholder="ערך נוסף..."
                placeholderTextColor={dynamicColors.textLight}
                value={formData.relationship_top_values_other}
                onChangeText={(v) => setFormData({ ...formData, relationship_top_values_other: v })}
              />
            )}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>איך את/ה מראה אהבה ואכפתיות? (אפשר לבחור כמה)</ThemedText>
            {renderMultiChips('love_languages', LOVE_LANGUAGE_OPTIONS_V2)}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>אני בדרך כלל נמשך/ת ל:</ThemedText>
            {renderEnumSelect('similarity_preference', SIMILARITY_PREF_OPTIONS_V2)}
          </View>
        </>
      )}

      {currentStep === 13 && (
        <>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>מה הדייט המושלם מבחינתך?</ThemedText>
            {renderEnumSelect('perfect_date', PERFECT_DATE_OPTIONS_V2)}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>מה יכול לגרום לך לפסול התאמה? (עד 3)</ThemedText>
            {renderMultiChips('dealbreakers', DEALBREAKERS_OPTIONS, 3)}
            {formData.dealbreakers.includes('other') && (
              <TextInput
                style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
                placeholder="סיבה נוספת..."
                placeholderTextColor={dynamicColors.textLight}
                value={formData.dealbreakers_other}
                onChangeText={(v) => setFormData({ ...formData, dealbreakers_other: v })}
              />
            )}
          </View>
        </>
      )}

      {currentStep === 14 && (
        <>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>מה החוזקות שלך בזוגיות? (עד 4)</ThemedText>
            {renderMultiChips('relationship_strengths', RELATIONSHIP_STRENGTHS_OPTIONS, 4)}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>מה חשוב שבן/בת הזוג יידעו עלייך?</ThemedText>
            <TextInput
              style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
              placeholder="משהו קטן שחשוב להבין עליי…"
              placeholderTextColor={dynamicColors.textLight}
              value={formData.partner_should_know_text}
              onChangeText={(v) => setFormData({ ...formData, partner_should_know_text: v })}
            />
          </View>
        </>
      )}

      {currentStep === 15 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>מה את/ה מחפש/ת בבן/בת זוג? (עד 5)</ThemedText>
          {renderMultiChips('partner_qualities', PARTNER_QUALITIES_OPTIONS, 5)}
          {formData.partner_qualities.includes('other') && (
            <TextInput
              style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
              placeholder="תכונה נוספת..."
              placeholderTextColor={dynamicColors.textLight}
              value={formData.partner_qualities_other}
              onChangeText={(v) => setFormData({ ...formData, partner_qualities_other: v })}
            />
          )}
        </View>
      )}

      {currentStep === 16 && (
        <>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>בזוגיות אני בדרך כלל:</ThemedText>
            {renderEnumSelect('personal_space_style', PERSONAL_SPACE_OPTIONS)}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>מה חשוב יותר?</ThemedText>
            {renderEnumSelect('chemistry_vs_longterm', CHEMISTRY_VS_LONGTERM_OPTIONS)}
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>אם היית צריך/ה לבחור:</ThemedText>
            {renderEnumSelect('stability_vs_adventure', STABILITY_VS_ADVENTURE_OPTIONS)}
          </View>
        </>
      )}

      {currentStep === 17 && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>מה היית רוצה שבן/בת הזוג ירגישו כשהם איתך? (עד 3)</ThemedText>
          {renderMultiChips('partner_should_feel', PARTNER_SHOULD_FEEL_OPTIONS, 3)}
        </View>
      )}

      {currentStep === 18 && (
        <>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>איזה פרט קטן עלייך יכול להפוך לשיחה של שעה?</ThemedText>
            <TextInput
              style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
              placeholder="משהו מוזר, מצחיק או מפתיע שאפשר לדבר עליו מלא…"
              placeholderTextColor={dynamicColors.textLight}
              value={formData.conversation_starter}
              onChangeText={(v) => setFormData({ ...formData, conversation_starter: v })}
            />
          </View>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>מה ה־green flag הכי מוזר שלך?</ThemedText>
            <TextInput
              style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
              placeholder="משהו קטן ולא צפוי שגורם לך לחשוב: אוקיי, זה בן אדם טוב…"
              placeholderTextColor={dynamicColors.textLight}
              value={formData.green_flag}
              onChangeText={(v) => setFormData({ ...formData, green_flag: v })}
            />
          </View>
        </>
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
          {isEditMode && (
            <View style={styles.editModeHeader}>
              <TouchableOpacity
                onPress={handleSaveAndClose}
                disabled={loading}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="שמור וסגור"
              >
                <ThemedText style={styles.editModeHeaderAction}>שמור וסגור</ThemedText>
              </TouchableOpacity>
            </View>
          )}
          {currentStep > 0 && currentStep !== 7 && (
            <View style={styles.progressHeader}>
               <View style={styles.progressContainer}>
                  {(() => {
                    // 5 basic segments (steps 1-5) + 11 deep segments (steps 8-18, including שוברי קרח).
                    // For fast-only users segments 6-16 stay inactive.
                    const filled = currentStep <= 5 ? currentStep : currentStep >= 8 ? 5 + (currentStep - 7) : 5;
                    return Array.from({ length: 16 }).map((_, i) => (
                      <View key={i} style={[styles.progressSegment, { backgroundColor: (i + 1) <= filled ? UI_COLORS.primary : UI_COLORS.progressInactive }]} />
                    ));
                  })()}
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
            {currentStep === 7 && renderChoiceScreen()}
            {currentStep >= 8 && renderDeepSteps()}

            {currentStep !== 0 && currentStep !== 7 && (
              <View style={styles.navigation}>
                {isEditMode && currentStep === 5 && userProfile?.onboarding_mode === 'fast' ? (
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
                    {loading ? <ActivityIndicator color="white" /> : <ThemedText style={styles.primaryNavText}>{
                      currentStep === 18
                        ? 'סיום'
                        : (isEditMode && currentStep === 5 && userProfile?.onboarding_mode === 'deep')
                          ? 'המשך לשאלון מעמיק'
                          : 'המשך'
                    }</ThemedText>}
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
  introTitle: { fontSize: 28, fontWeight: '900', textAlign: 'center', color: UI_COLORS.branding, lineHeight: 40, paddingHorizontal: 16 },
  introText: { fontSize: 18, lineHeight: 28, textAlign: 'center', color: UI_COLORS.text, paddingHorizontal: 10 },
  stepTitle: { fontSize: 14, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  stepSubtitle: { fontSize: 24, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl', marginBottom: 10 },
  formGroup: { gap: 12 },
  label: { fontSize: 16, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  input: { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, fontSize: 16, textAlign: 'right', writingDirection: 'rtl' },
  optionList: { gap: 10 },
  optionButton: { padding: 16, borderRadius: 12, borderWidth: 1 },
  optionText: { fontSize: 15, textAlign: 'right', writingDirection: 'rtl' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrapper: { width: '30%', aspectRatio: 0.8, borderRadius: 10, overflow: 'hidden' },
  gridPhoto: { width: '100%', height: '100%' },
  deletePhotoBadge: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  addPhotoPlaceholder: { width: '30%', aspectRatio: 0.8, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', borderColor: UI_COLORS.border },
  choiceCard: { flexDirection: 'row', padding: 20, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: UI_COLORS.border, gap: 15, marginBottom: 15 },
  choiceIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: UI_COLORS.surface, justifyContent: 'center', alignItems: 'center' },
  choiceTitle: { fontSize: 18, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl', marginBottom: 4 },
  choiceDescription: { fontSize: 14, color: UI_COLORS.textLight, textAlign: 'right', writingDirection: 'rtl', lineHeight: 20 },
  progressHeader: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 24, gap: 15, marginTop: 10 },
  progressContainer: { flex: 1, flexDirection: 'row', height: 4, gap: 4 },
  progressSegment: { flex: 1, height: '100%', borderRadius: 2 },
  navigation: { marginTop: 30, gap: 12 },
  navButton: { height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  primaryNav: { shadowColor: UI_COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 3 },
  primaryNavText: { color: 'white', fontSize: 18, fontWeight: '800' },
  editModeHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  editModeHeaderAction: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    writingDirection: 'rtl',
  },
});
