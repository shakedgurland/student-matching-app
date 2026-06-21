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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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

// BATCH-E1: Hebrew section labels for the new continuous progress bar
// (replaces the 16-segment discrete bar that read as "many empty steps
// ahead"). Steps 1-5 are the basic section; steps 8-18 fall through to
// the in-component DEEP_SECTION_TITLES which already exists. Step 7 is
// the fast/deep choice screen and has no progress bar (see the
// `currentStep !== 7` guard on the renderer).
const BASIC_SECTION_TITLES: Record<number, string> = {
  1: 'פרופיל אישי',
  2: 'לימודים',
  3: 'העדפות היכרות',
  4: 'תחביבים',
  5: 'סגנון קשר ראשוני',
};

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

// V2 height-preference options (PR-AUDIT-D). 'important' requires
// migration 025 to be applied first — until then, CHECK violates with
// 23514 on submit.
//
// BATCH-E1 retune (UI-only):
//   - Dropped the 'must_have' UI row. CHECK constraint still allows it
//     (migration 025), and legacy profiles that already wrote
//     'must_have' continue to work (their hard-filter behavior in
//     create_authorized_match keeps applying on their behalf until
//     they re-edit). New users cannot pick must_have any more — the
//     copy "חשוב לי מאוד" was reading as overly intense for what is
//     really just a strong preference.
//   - Retuned the 'nice_to_have' label to "יש לי העדפה, אבל לא קריטי"
//     — clearer signal that the user DOES have a preference (just not
//     a dealbreaker), versus the prior "נחמד אם מתאים" which read as
//     "I don't really care". DB value unchanged → no migration, no
//     legacy impact.
//
//   none           → no algorithmic effect, no min asked.
//   nice_to_have   → stored only, no scoring effect, no min asked.
//   important      → soft penalty in scoring when candidate < min height.
//                    Min height required.
const HEIGHT_PREF_OPTIONS_V2 = [
  { label: 'לא חשוב לי', value: 'none' },
  { label: 'יש לי העדפה, אבל לא קריטי', value: 'nice_to_have' },
  { label: 'חשוב לי', value: 'important' },
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
  // True when profiles.full_name was set at signup (or backfilled at
  // login) and pre-populated into formData.firstName at mount. Drives
  // the conditional hide of the "איך קוראים לך?" step so the user is not
  // asked the same name twice. Stays false for legacy users / mid-flow
  // users whose profile has no full_name — they still see the field.
  const [hideNameField, setHideNameField] = useState(false);
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
  // HOTFIX P0: track whether this component is still mounted, so the
  // tail of handleSubmit (analyze-user-traits microtasks, photo upload
  // awaits, `finally { setLoading(false) }`) doesn't try to push state
  // into a freed React tree after router.replace has unmounted us. The
  // Hermes EXC_BAD_ACCESS observed in TestFlight build 12 had a stack
  // consistent with a post-unmount setState landing in drainJobs.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    // Initial blank so onboarding validation forces a real answer instead
    // of silently treating "no answer" as "no preference".
    heightPreferenceImportance: '',
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
    } else if (!isEditMode && !dataLoaded) {
      // For new-user flow, pre-fill firstName from profiles.full_name
      // (set during signup or backfilled at first login). When found, the
      // "איך קוראים לך?" field is hidden via hideNameField so the user
      // isn't asked the same question twice. Falls through gracefully if
      // full_name is missing — the field stays visible.
      supabase.auth.getUser().then(({ data: userRes }) => {
        const user = userRes?.user;
        if (!user) {
          setDataLoaded(true);
          return;
        }
        supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle()
          .then(({ data }) => {
            const fn = typeof data?.full_name === 'string' ? data.full_name.trim() : '';
            if (fn) {
              setFormData((prev) => ({ ...prev, firstName: fn }));
              setHideNameField(true);
            }
            setDataLoaded(true);
          });
      });
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
      // After both pre-fills above settle, hide the "איך קוראים לך?" step
      // if firstName ended up non-empty (from answers OR profile.full_name).
      const resolvedName =
        (answersRes.data?.answers?.firstName as string | undefined)?.trim() ||
        profileRes.data?.full_name?.trim() ||
        '';
      if (resolvedName) {
        setHideNameField(true);
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
    // BATCH-F1: skip non-essential fire-and-forget analytics on edit-save
    // entry. The previous logButtonTap kicked off an unawaited Supabase
    // INSERT that continued running across navigation/unmount — one of
    // the suspected contributors to the Hermes crash in TestFlight build
    // 13. New-user flow still logs because it isn't part of the crash
    // path and the funnel signal is valuable for first-time onboarding.
    if (!isEditMode) {
      logButtonTap('Questionnaire', `${finalMode}_match_selected`);
    }
    if (isEditMode) {
      console.log('[edit-save] start');
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('שגיאה', 'משתמש לא מחובר');
        return;
      }

      // 1. Save questionnaire answers
      if (isEditMode) console.log('[edit-save] answers-upsert start');
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
      if (isEditMode) console.log('[edit-save] answers-upsert done');

      // AI traits analysis (PR-AUDIT-D PR 2). Internal-only matching
      // signal — no user-facing "AI analyzes you" claim. Gated client-
      // side so we don't even open a network connection unless:
      //   (a) the user completed the deep questionnaire, AND
      //   (b) there is meaningful free text to analyze.
      // The Edge Function applies the same gate as defense in depth and
      // additionally hash-caches the input fingerprint, so a resave with
      // unchanged free text is free (no OpenAI call).
      //
      // For deep + meaningful-text users we BOUNDED-AWAIT the call so the
      // user's first match-create invocation can see a populated
      // profile_ai_traits row instead of racing the Edge Function. The
      // 9s ceiling covers a typical gpt-4o-mini round-trip (~2-5s) with
      // headroom and never traps the user — on timeout or error we log
      // and proceed. The first match then falls back to deterministic-
      // only scoring; subsequent matches pick up the AI signal once the
      // backend write lands. The wait happens inside the existing
      // submit-loading state — no new UI flow needed.
      // BATCH-F1: skip the entire AI traits race in edit mode. This race
      // (Promise.race against a 9-second setTimeout sentinel that
      // constructs a `new Error('ai_traits_timeout')`) was the largest
      // async surface in the edit-save path and the most plausible
      // contributor to the Hermes JSError::recordStackTrace crash. The
      // Edge Function hash-caches input fingerprints, so the server will
      // pick up any free-text changes on the next match-create call
      // anyway — there's no functional cost to skipping pre-match
      // analysis on edit-save. The race remains in place for new-user
      // submit, where the first-match latency matters more and the
      // overall async surface is smaller.
      const psk = (formData.partner_should_know_text || '').trim();
      const cs  = (formData.conversation_starter || '').trim();
      const gf  = (formData.green_flag || '').trim();
      const meaningfulTextLen = psk.length + cs.length + gf.length;
      if (!isEditMode && finalMode === 'deep' && meaningfulTextLen >= 30) {
        const TRAITS_TIMEOUT_MS = 9000;
        // HOTFIX P0: keep a handle on the timeout id so we can clear it
        // the moment the Edge Function resolves. Previously the setTimeout
        // fired even when the function won the race, leaving an orphan
        // callback that resolved a dead promise after navigation/unmount.
        // The orphan was a plausible contributor to the post-save Hermes
        // crash and is unsafe regardless.
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
          const timeoutSentinel = new Promise<{ error: Error; data?: unknown }>((resolve) => {
            timeoutId = setTimeout(
              () => resolve({ error: new Error('ai_traits_timeout') }),
              TRAITS_TIMEOUT_MS,
            );
          });
          const result = (await Promise.race([
            supabase.functions.invoke('analyze-user-traits'),
            timeoutSentinel,
          ])) as { error?: unknown; data?: unknown };
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (result.error) {
            // Logged but not surfaced. First match proceeds without AI
            // traits; deterministic + region + intent + values + height
            // remain in play. Subsequent matches use AI once the row lands.
            logError('Questionnaire', 'ai_traits_pre_match_wait_failed', result.error);
          }
        } catch (err) {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          logError('Questionnaire', 'ai_traits_pre_match_wait_exception', err);
        }
      }
      // Deep users without enough free text simply skip AI traits — that
      // is expected, not an error. They get deterministic-only matching,
      // same as fast users.

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

        // 3. Update profile.
        //    min_preferred_height_cm is nulled out when the user picked
        //    none/nice_to_have (no threshold) — keeps the DB column from
        //    holding a stale threshold from a prior answer the user
        //    bounced away from. Migration 025 must already be applied for
        //    'important' to satisfy the CHECK constraint.
        const heightPrefForDb = formData.heightPreferenceImportance || null;
        const minHeightForDb =
          (formData.heightPreferenceImportance === 'important' ||
            formData.heightPreferenceImportance === 'must_have') &&
          formData.minPreferredHeightCm
            ? parseInt(formData.minPreferredHeightCm)
            : null;
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            onboarding_completed: true,
            onboarding_mode: finalMode,
            full_name: formData.firstName.trim(),
            birth_year: formData.age ? new Date().getFullYear() - parseInt(formData.age) : null,
            gender: formData.gender,
            height_cm: formData.heightCm ? parseInt(formData.heightCm) : null,
            height_preference_importance: heightPrefForDb,
            min_preferred_height_cm: minHeightForDb,
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
        // BATCH-B: route new-user onboarding submit to the home tab,
        // not directly to my-profile. The home tab then either finds an
        // existing open match (rare here — they just onboarded) or
        // creates a fresh one via match-create, and the redirect effect
        // in (tabs)/index.tsx forwards them straight to /match-result.
        // If no match can be created (cap / no candidates), the home
        // tab's existing empty state copy is shown — exactly the right
        // surface for "we couldn't pair you yet". Edit-mode flow below
        // still returns to /my-profile, which is the natural edit
        // destination.
        router.replace('/(tabs)');
      } else {
        // Edit mode. Same null-discipline for min_preferred_height_cm as
        // the new-user branch above — a returning user who switches from
        // 'important' back to 'nice_to_have' should clear their old
        // threshold, not silently keep it.
        const heightPrefForDb = formData.heightPreferenceImportance || null;
        const minHeightForDb =
          (formData.heightPreferenceImportance === 'important' ||
            formData.heightPreferenceImportance === 'must_have') &&
          formData.minPreferredHeightCm
            ? parseInt(formData.minPreferredHeightCm)
            : null;
        const updateData: any = {
            full_name: formData.firstName.trim(),
            birth_year: formData.age ? new Date().getFullYear() - parseInt(formData.age) : null,
            gender: formData.gender,
            height_cm: formData.heightCm ? parseInt(formData.heightCm) : null,
            height_preference_importance: heightPrefForDb,
            min_preferred_height_cm: minHeightForDb,
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

        console.log('[edit-save] profile-update start');
        const { error: profileError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', user.id);

        if (profileError) {
          logError('Questionnaire', 'edit_profile_update_failed', profileError);
          throw profileError;
        }
        console.log('[edit-save] profile-update done');

        // === Photo reconciliation ===
        // The questionnaire photo grid is the source of truth in edit mode.
        // After save, profile_photos + storage should mirror `photos` state:
        //   - Photos with `id` already exist in DB → keep, no-op.
        //   - Photos in state without `id` → newly picked → upload + insert.
        //   - Photos in DB whose id is no longer in state → user removed them → delete.
        //
        // BATCH-C REVISION: defensive source-level dedup of `photos`
        // state before reconciliation. Three protections:
        //   (a) dedupe existing photos by `id` (impossible normally but
        //       cheap insurance against state-level dups from save-
        //       interruption + retry sequences).
        //   (b) dedupe new photos by `uri` (the local file path) so a
        //       user who somehow added the same image twice via the
        //       picker doesn't create two storage rows for it.
        //   (c) treat any photo whose uri looks like an http(s) URL
        //       (e.g., a Supabase signed URL) as an EXISTING photo —
        //       must already carry an `id`. If it doesn't (id stripped
        //       by some upstream bug), skip the upload step entirely
        //       rather than re-uploading the image as a fresh row.
        //       This is the protection against the suspected root cause
        //       of the duplicate-photo report from TestFlight build 12.
        //
        // Source-of-truth `photos` state is left unchanged — only the
        // local `dedupedPhotos` view drives the rest of this block.
        const _seenIds = new Set<string>();
        const _seenUris = new Set<string>();
        const dedupedPhotos = photos.filter((p) => {
          if (p.id) {
            if (_seenIds.has(p.id)) return false;
            _seenIds.add(p.id);
            return true;
          }
          if (_seenUris.has(p.uri)) return false;
          _seenUris.add(p.uri);
          return true;
        });

        console.log('[edit-save] photos-select start');
        const { data: currentDbPhotos } = await supabase
          .from('profile_photos')
          .select('id, storage_path, display_order')
          .eq('user_id', user.id);
        console.log('[edit-save] photos-select done count=', currentDbPhotos?.length ?? 0);

        const stateIds = new Set(dedupedPhotos.filter(p => p.id).map(p => p.id!));
        // Only photos we actually loaded into the UI are eligible for deletion;
        // a DB row that failed to sign at load time was never shown to the user
        // and must not be deleted just because it's absent from state.
        const removedFromState = (currentDbPhotos ?? [])
          .filter(p => loadedPhotoIdsRef.current.has(p.id))
          .filter(p => !stateIds.has(p.id));
        const removedStoragePaths = new Set(removedFromState.map(p => p.storage_path).filter(Boolean));

        if (removedFromState.length > 0) console.log('[edit-save] photo-delete start count=', removedFromState.length);
        for (const dbPhoto of removedFromState) {
          await supabase.from('profile_photos').delete().eq('id', dbPhoto.id);
          if (dbPhoto.storage_path) {
            await supabase.storage.from('profile-photos').remove([dbPhoto.storage_path]);
          }
        }
        if (removedFromState.length > 0) console.log('[edit-save] photo-delete done');

        // Upload new photos (those in state without `id`). Track the storage path
        // assigned to each state slot so we can compute the new "first photo" for
        // the avatar cascade below.
        const pathByIndex: (string | null)[] = dedupedPhotos.map(p => p.storage_path ?? null);
        const survivingExistingCount = (currentDbPhotos ?? []).length - removedFromState.length;
        let nextOrder = survivingExistingCount;
        const newPhotoCount = dedupedPhotos.filter(p => !p.id).length;
        if (newPhotoCount > 0) console.log('[edit-save] photo-upload start count=', newPhotoCount);
        for (let i = 0; i < dedupedPhotos.length; i++) {
          const p = dedupedPhotos[i];
          if (p.id) continue;
          // BATCH-C REVISION: defensive guard — never re-upload a photo
          // whose uri is already a remote URL. Such photos came from
          // Supabase Storage and should already be backed by a
          // profile_photos row; if their `id` was somehow stripped,
          // skipping the upload is safer than creating a duplicate
          // row pointing at the same image bytes with a fresh
          // ${Date.now()} path.
          if (/^https?:\/\//i.test(p.uri)) {
            // Reuse the existing 'photo_upload_failed' EventType; the
            // action discriminator records that this skip is the
            // remote-uri-without-id guard, not a real upload failure.
            logEvent('photo_upload_failed', { screen: 'Questionnaire', action: 'edit_remote_uri_no_id_skipped', metadata: { index: i } });
            continue;
          }

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
        if (newPhotoCount > 0) console.log('[edit-save] photo-upload done');

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
          console.log('[edit-save] avatar-cascade start');
          const { error: avatarUpdateError } = await supabase
            .from('profiles')
            .update({ avatar_storage_path: nextAvatarPath })
            .eq('id', user.id);
          if (avatarUpdateError) {
            logError('Questionnaire', 'edit_avatar_cascade_failed', avatarUpdateError);
            // Non-fatal: photos are saved; avatar will self-heal next time the
            // user touches photos. Don't throw.
          }
          console.log('[edit-save] avatar-cascade done');
        }

        // BATCH-F1: REMOVED the trailing `logFormSubmit('Questionnaire',
        // 'edit_onboarding_submitted')` that previously fire-and-forgot a
        // background Supabase INSERT immediately before navigation. Its
        // unawaited async body continued running across the screen
        // unmount, with closures capturing the call-site arguments —
        // one of the suspected contributors to the Hermes crash in
        // TestFlight build 13. Edit-save completion is not a critical
        // analytics event; if we want it back later, await it inside
        // a guarded try/catch BEFORE the tombstone.

        // BATCH-F1: drain any pending microtasks (Supabase response
        // handlers, internal continuations) before we tear down. A 0-ms
        // setTimeout yields one event-loop tick so the JS thread can
        // settle to a quiescent state, dramatically reducing the
        // chance of a continuation resuming after the React tree has
        // started unmounting on the main thread.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        // BATCH-F1: tombstone the mountedRef BEFORE navigation. The
        // useEffect cleanup that flips it only runs AFTER React commits
        // the unmount — there's a window where any racing continuation
        // would still see `mountedRef.current === true` and attempt
        // state updates / Alerts. Tombstone-before-navigation closes
        // that window. After this line we MUST NOT call any setState
        // on this component.
        mountedRef.current = false;

        console.log('[edit-save] before-navigation');
        // BATCH-F1: prefer router.back() for edit-save. Edit mode is
        // entered via router.push('/questionnaire?mode=edit') from
        // my-profile (verified at app/(tabs)/my-profile.tsx:531), so
        // back() pops the stack one entry and lands on the original
        // my-profile screen — a softer navigation than router.replace
        // (no rebuild of the (tabs) stack), which means less main-
        // thread shadow-view mutation work racing with the JS thread's
        // remaining microtasks.
        router.back();
      }
    } catch (error: any) {
      // BATCH-F1: use safeErrorMessage helper instead of inline
      // `error.message || 'שגיאה לא ידועה'`. The previous pattern
      // accessed `.message` directly, which can trigger getter throws
      // on certain Supabase/PostgrestError shapes. The helper guards
      // every step and never throws.
      const errStr = safeErrorMessage(error);
      console.log('[edit-save] caught:', errStr);
      // Only surface on the error path — and only if we're still mounted.
      if (mountedRef.current) {
        Alert.alert('שגיאה', 'אירעה שגיאה בשמירת הנתונים: ' + errStr);
      }
    } finally {
      // HOTFIX P0: guard against setState-after-unmount. On the BATCH-F1
      // success path mountedRef was tombstoned synchronously before
      // router.back(), so this branch is naturally a no-op for happy
      // paths. The guard still protects error paths where we stay on
      // screen (mountedRef stayed true) and need to clear the loading
      // spinner.
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // BATCH-F1: never-throw helper local to this screen — safer than
  // accessing `error.message` directly on arbitrary catch values. Avoids
  // getter throws on Supabase/PostgrestError shapes; bounded output size
  // so we don't accidentally include sensitive payload bodies.
  function safeErrorMessage(error: unknown): string {
    try {
      if (error === null || error === undefined) return 'unknown';
      if (typeof error === 'string') return error;
      if (typeof error === 'number' || typeof error === 'boolean') return String(error);
      const maybeMessage = (error as { message?: unknown })?.message;
      if (typeof maybeMessage === 'string') return maybeMessage;
      return 'error';
    } catch {
      return 'error';
    }
  }

  const handleSaveAndClose = async () => {
    if (!formData.firstName.trim()) {
      // Validation logging is safe: nothing happens after this beyond
      // an Alert — no navigation, no unmount, the analytics promise
      // resolves on the still-mounted questionnaire screen.
      logEvent('onboarding_validation_failed', { screen: 'Questionnaire', metadata: { field: 'firstName', via: 'save_and_close' } });
      Alert.alert('שדה חובה', 'יש להזין את השם שלך');
      return;
    }
    // BATCH-F1: removed the entry-point `logButtonTap` fire-and-forget
    // from the edit-save path. The unawaited Supabase INSERT it kicked
    // off continued running across the screen unmount that follows
    // handleSubmit's navigation — a contributor to the suspected race
    // behind the Hermes crash in TestFlight build 13. Save action
    // itself is the signal that matters; the tap event is nice-to-have.
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
        !formData.heightPreferenceImportance ||
        !formData.city.trim() ||
        !formData.region ||
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
      // Min height is required only when the user expressed a real
      // threshold-bearing preference. Bounds match the DB CHECK from
      // migration 005 (120-230).
      if (
        formData.heightPreferenceImportance === 'important' ||
        formData.heightPreferenceImportance === 'must_have'
      ) {
        const minH = parseInt(formData.minPreferredHeightCm);
        if (isNaN(minH) || minH < 120 || minH > 230) {
          logEvent('onboarding_validation_failed', { screen: 'Questionnaire', metadata: { field: 'min_preferred_height_cm' } });
          Alert.alert('גובה מינימלי', 'יש להזין גובה מינימלי תקין (בין 120 ל-230 ס״מ)');
          return;
        }
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
    // PR-QUESTIONNAIRE-EDIT-POLISH: in edit mode, the questionnaire
    // starts at step 1 — there is no welcome/intro for returning users.
    // Tapping "חזרה" at step 1 must exit the questionnaire rather than
    // step into step 0 (which would render the new-user "בואו נתחיל"
    // intro screen). Bail to the previous route directly.
    if (isEditMode && currentStep <= 1) {
      logButtonTap('Questionnaire', 'previous_step', { from: currentStep, to: 'back_to_profile' });
      router.back();
      return;
    }
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

  // BATCH-D: post-signup onboarding intro. Replaces the previous
  // single-screen welcome with a 4-card paged carousel that explains
  // the product before the user starts the questionnaire. Visible
  // ONLY for new users (isEditMode === false AND currentStep === 0).
  // Existing users who already completed onboarding are routed away
  // from /questionnaire entirely by the rule at app/_layout.tsx:198,
  // so they never reach this screen — no extra gate needed.
  //
  // Design references how-it-works.tsx's pager pattern (horizontal
  // pagingEnabled ScrollView + dot indicators + safe-area aware footer)
  // for visual consistency. RTL-correct: card text uses textAlign
  // right + alignSelf stretch + writingDirection rtl, matching the
  // Batch C right-edge alignment standard.
  //
  // No DB state tracks "saw onboarding" — the existing
  // profile.onboarding_completed flag handles re-entry naturally:
  // once the user finishes the questionnaire, they can never come
  // back to step 0 unless they sign up again.
  // BATCH-D REVISION: copy retuned for more emotional / premium tone.
  // Highlights moved to the top of the spec (read first, frames the
  // card), body kept short and scannable. Icon choices stay subtle —
  // one per card, mirrors the "deep but not childish" goal.
  //   Card 1: positioning vs the swipe-app market.
  //   Card 2: scarcity-as-quality framing (less noise, more depth).
  //   Card 3: the questionnaire is the differentiator, not friction.
  //   Card 4: the match itself comes with conversation scaffolding.
  const onboardingCards: { title: string; body: string; highlight: string; icon: string }[] = [
    {
      highlight: 'התאמה אחת בכל פעם',
      title: 'לא עוד אפליקציית החלקות אינסופית',
      body: 'במקום לדפדף בלי סוף, UniMatch נותנת לך התאמה אחת שנבחרה לפי השאלון — כדי שיהיה קל להתמקד באמת.',
      icon: '✨',
    },
    {
      highlight: 'פחות רעש, יותר עומק',
      title: 'עד 5 התאמות בחודש',
      body: 'עונים על שאלון מדויק, ומקבלים עד 5 התאמות בחודש. אם אין התחלה של שיחה תוך 72 שעות — ההתאמה נסגרת וממשיכים להתאמה הבאה.',
      icon: '🎯',
    },
    {
      highlight: 'שאלון שבונה התאמה',
      title: 'עונים על מה שבאמת חשוב',
      body: 'השאלון עוזר להבין סגנון קשר, קצב, תקשורת, ערכים ומה גורם לכם להרגיש שזה יכול לעבוד.',
      icon: '💡',
    },
    {
      highlight: 'מתחילים להכיר',
      title: 'מקבלים התאמה איכותית',
      body: 'במקום לנחש איך להתחיל, מקבלים התאמה עם סיבות ברורות ופתיח לשיחה — כדי שהצעד הראשון יהיה פשוט יותר.',
      icon: '💬',
    },
  ];

  const [onboardingIndex, setOnboardingIndex] = React.useState(0);
  const onboardingScrollRef = React.useRef<ScrollView>(null);
  const onboardingCardWidth = SCREEN_WIDTH - 48; // 24pt scrollContent padding × 2

  const handleOnboardingScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / onboardingCardWidth);
    setOnboardingIndex(Math.max(0, Math.min(onboardingCards.length - 1, idx)));
  };

  const advanceOnboarding = () => {
    if (onboardingIndex < onboardingCards.length - 1) {
      const next = onboardingIndex + 1;
      onboardingScrollRef.current?.scrollTo({ x: next * onboardingCardWidth, animated: true });
      setOnboardingIndex(next);
      return;
    }
    // Last card → start the questionnaire.
    logButtonTap('Questionnaire', 'onboarding_intro_finished');
    setCurrentStep(1);
  };

  const renderIntro = () => {
    const isLastCard = onboardingIndex === onboardingCards.length - 1;
    return (
      <View style={styles.onboardingContainer}>
        <View style={styles.onboardingBrandRow}>
          <BrandMark size={40} />
          <ThemedText style={styles.onboardingBrandName}>UniMatch</ThemedText>
        </View>

        <ScrollView
          ref={onboardingScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleOnboardingScrollEnd}
          scrollEventThrottle={16}
          style={styles.onboardingPager}
          contentContainerStyle={styles.onboardingPagerContent}
        >
          {onboardingCards.map((card, i) => (
            <View key={i} style={[styles.onboardingCardCell, { width: onboardingCardWidth }]}>
              <View style={styles.onboardingCard}>
                <View style={styles.onboardingIconCircle}>
                  <ThemedText style={styles.onboardingIcon}>{card.icon}</ThemedText>
                </View>
                <View style={styles.onboardingHighlightPill}>
                  <ThemedText style={styles.onboardingHighlightText}>{card.highlight}</ThemedText>
                </View>
                <ThemedText style={styles.onboardingCardTitle}>{card.title}</ThemedText>
                <ThemedText style={styles.onboardingCardBody}>{card.body}</ThemedText>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.onboardingDotsRow}>
          {onboardingCards.map((_, i) => {
            const active = i === onboardingIndex;
            return (
              <View
                key={i}
                style={[
                  styles.onboardingDot,
                  active && styles.onboardingDotActive,
                ]}
              />
            );
          })}
        </View>

        <View style={styles.onboardingFooter}>
          <TouchableOpacity
            style={styles.onboardingPrimaryButton}
            onPress={advanceOnboarding}
            activeOpacity={0.85}
          >
            <ThemedText style={styles.onboardingPrimaryButtonText}>
              {isLastCard ? 'מתחילים את השאלון' : 'הבא'}
            </ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.onboardingPrivacyLine}>
            הטלפון והמייל שלך לא נחשפים אוטומטית.
          </ThemedText>
        </View>
      </View>
    );
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View>
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שלב 1 מתוך 5</ThemedText>
        <ThemedText style={styles.stepSubtitle}>פרופיל אישי</ThemedText>
      </View>

      {!hideNameField && (
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>איך קוראים לך?</ThemedText>
          <TextInput
            style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
            placeholder="השם שיופיע בפרופיל שלך"
            value={formData.firstName}
            onChangeText={(v) => setFormData({ ...formData, firstName: v })}
          />
        </View>
      )}

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
        <ThemedText style={styles.label}>האם גובה הוא משהו שחשוב לך בהתאמה?</ThemedText>
        {renderEnumSelect('heightPreferenceImportance', HEIGHT_PREF_OPTIONS_V2)}
        {(formData.heightPreferenceImportance === 'important' ||
          formData.heightPreferenceImportance === 'must_have') && (
          <TextInput
            style={[styles.input, { color: dynamicColors.text, backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}
            placeholder="גובה מינימלי מועדף (בס״מ) — למשל 170"
            placeholderTextColor={dynamicColors.textLight}
            keyboardType="number-pad"
            value={formData.minPreferredHeightCm}
            onChangeText={(v) => setFormData({ ...formData, minPreferredHeightCm: v })}
          />
        )}
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
        <ThemedText style={styles.label}>אזור מגורים בארץ</ThemedText>
        {renderEnumSelect('region', REGION_OPTIONS)}
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
        <ThemedText style={[styles.stepTitle, { color: dynamicColors.textLight }]}>שאלון מעמיק — שלב {currentStep - 7} מתוך {Object.keys(DEEP_SECTION_TITLES).length}</ThemedText>
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
            <ThemedText style={styles.label}>מה מבחינתך סימן שזה מתחיל טוב?</ThemedText>
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
          {currentStep > 0 && currentStep !== 7 && (() => {
            // BATCH-E1: continuous slim progress bar replaces the 16-
            // segment discrete bar. Reading "you have 15 empty segments
            // ahead" at step 1 was being received as "this is long" —
            // a continuous fill with a calm section label communicates
            // momentum without dwelling on remaining count. Section
            // labels come from BASIC_SECTION_TITLES (1-5) and the
            // existing DEEP_SECTION_TITLES (8-18). Microcopy on step 1
            // only, framed as encouragement rather than instruction.
            const filled =
              currentStep <= 5
                ? currentStep
                : currentStep >= 8
                  ? 5 + (currentStep - 7)
                  : 5;
            const sectionLabel =
              currentStep <= 5
                ? BASIC_SECTION_TITLES[currentStep] ?? ''
                : DEEP_SECTION_TITLES[currentStep] ?? '';
            const fillPct = Math.max(2, Math.min(100, Math.round((filled / 16) * 100)));
            return (
              <View style={styles.progressHeader}>
                <View style={styles.progressTopRow}>
                  <ThemedText style={[styles.progressSectionLabel, { color: dynamicColors.textLight }]}>
                    {sectionLabel}
                  </ThemedText>
                  <BrandMark size={20} />
                </View>
                <View style={[styles.progressTrack, { backgroundColor: UI_COLORS.progressInactive }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: UI_COLORS.primary, width: `${fillPct}%` },
                    ]}
                  />
                </View>
                {currentStep === 1 && (
                  <ThemedText style={[styles.progressMicrocopy, { color: dynamicColors.textLight }]}>
                    עוד כמה דקות ויש לנו כיוון טוב
                  </ThemedText>
                )}
              </View>
            );
          })()}

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
                ) : isEditMode && currentStep === 18 ? (
                  // PR-QUESTIONNAIRE-EDIT-POLISH: in edit mode at the
                  // final deep step ("שוברי קרח"), don't render a bottom
                  // "סיום" button. The top "שמור וסגור" action is the
                  // canonical save path in edit mode; a duplicate bottom
                  // submit reads as an onboarding-only finish flow.
                  // The "חזרה" back button below still renders so the
                  // user can navigate to other steps if they want.
                  null
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
  // BATCH-C REVISION: formGroup is now `alignSelf: 'stretch'` so every
  // form section pins to the full ScrollView content width — its child
  // text/inputs can then right-align against the actual right edge of
  // the card area instead of shrinking to content width and floating.
  // stepContent same — its gap 24 children should span full width.
  stepContent: { gap: 24, paddingTop: 10, alignSelf: 'stretch' },
  introHeader: { alignItems: 'center', gap: 20, marginBottom: 20, marginTop: 40, alignSelf: 'stretch' },
  introTitle: { fontSize: 28, fontWeight: '900', textAlign: 'center', color: UI_COLORS.branding, lineHeight: 40, paddingHorizontal: 16, alignSelf: 'stretch' },
  introText: { fontSize: 18, lineHeight: 28, textAlign: 'center', color: UI_COLORS.text, paddingHorizontal: 10, alignSelf: 'stretch' },
  // BATCH-C REVISION: explicit alignSelf stretch + width 100% so the
  // text bounding box spans the full parent width and the right-align
  // pins to the parent's right edge on iOS (RN's default Text width
  // measurement is content-fit, which makes textAlign right look like
  // "centered" if the parent has any centering above it).
  stepTitle: { fontSize: 14, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl', alignSelf: 'stretch', width: '100%' },
  stepSubtitle: { fontSize: 24, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl', marginBottom: 10, alignSelf: 'stretch', width: '100%' },
  formGroup: { gap: 12, alignSelf: 'stretch' },
  label: { fontSize: 16, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl', alignSelf: 'stretch', width: '100%' },
  input: { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, fontSize: 16, textAlign: 'right', writingDirection: 'rtl', alignSelf: 'stretch' },
  optionList: { gap: 10, alignSelf: 'stretch' },
  // BATCH-G1 FOLLOW-UP: TestFlight build 14 showed Hebrew option labels
  // ("אישה", "מרכז", "חילוני/ת" …) rendering on the LEFT side of each
  // full-width button despite optionText having textAlign: 'right'.
  // Root cause: when a Text component is wrapped inside a TouchableOpacity
  // and carries `writingDirection: 'rtl'`, RN's text engine can treat
  // textAlign 'right' as "trailing edge of writing direction" which under
  // RTL resolves to physical LEFT. The plain labels above (which work
  // correctly) are NOT inside a Touchable, so they're unaffected.
  //
  // Deterministic fix: convert optionButton from a default-column View
  // into a row flex container. Under forceRTL(true), `flexDirection: row`
  // lays children right→left, so `justifyContent: 'flex-start'` packs the
  // single Text child at the main start = physical RIGHT edge. This
  // bypasses the textAlign quirk entirely — position is determined by
  // the flex parent, not by text-internal alignment.
  //
  // The button itself stays full-width (alignSelf: 'stretch') so the
  // entire row remains tappable; only the visible Text shrink-wraps to
  // its content and pins to the right edge with padding 16 honored.
  optionButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  optionText: { fontSize: 15, writingDirection: 'rtl' },
  // BATCH-G1 REVISION: TestFlight build 14 showed the row-reverse pin
  // from Batch C actually flipped chips back to LTR order (first chip
  // on the LEFT instead of right). Under I18nManager.forceRTL(true),
  // `flexDirection: 'row'` already lays children right-to-left (first
  // JSX child on the RIGHT). Pinning row-reverse on top of that double-
  // flips it. Reverted to `row` so chips flow from the right content
  // edge as intended. justifyContent flex-start under RTL packs at the
  // main start = right.
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch', justifyContent: 'flex-start' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  // BATCH-G1 REVISION: same fix as chipGrid — row-reverse was double-
  // flipping the photo grid under forceRTL. With `row`, the first
  // photo sits on the right and the add-photo placeholder follows
  // leftward, matching natural Hebrew reading order.
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignSelf: 'stretch', justifyContent: 'flex-start' },
  photoWrapper: { width: '30%', aspectRatio: 0.8, borderRadius: 10, overflow: 'hidden' },
  gridPhoto: { width: '100%', height: '100%' },
  deletePhotoBadge: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  addPhotoPlaceholder: { width: '30%', aspectRatio: 0.8, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', borderColor: UI_COLORS.border },
  // BATCH-G1 REVISION: same row-reverse → row revert as chipGrid /
  // photoGrid. JSX is [Icon, TitleBlock]; under RTL with `row`, icon
  // sits on the RIGHT (Hebrew leading edge) and the title/desc block
  // flows to its left. alignSelf stretch keeps the card full-width.
  choiceCard: { flexDirection: 'row', padding: 20, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: UI_COLORS.border, gap: 15, marginBottom: 15, alignSelf: 'stretch' },
  choiceIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: UI_COLORS.surface, justifyContent: 'center', alignItems: 'center' },
  choiceTitle: { fontSize: 18, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl', marginBottom: 4, alignSelf: 'stretch' },
  choiceDescription: { fontSize: 14, color: UI_COLORS.textLight, textAlign: 'right', writingDirection: 'rtl', lineHeight: 20, alignSelf: 'stretch' },
  // BATCH-E1: progress bar redesign. Was a 16-segment discrete row
  // (progressContainer + progressSegment) that visually emphasized the
  // remaining empty count. Now a single continuous track with an
  // animated-feeling fill + a calm section label above it. Same
  // brand-mark anchor on the right (Hebrew leading edge).
  progressHeader: { paddingHorizontal: 24, gap: 10, marginTop: 10 },
  // BATCH-G1: JSX is [SectionLabel, BrandMark]; under RTL with
  // `row` + space-between the section label pins to the RIGHT
  // (Hebrew leading edge) and BrandMark to the LEFT. row-reverse
  // here flipped them the wrong way on TestFlight build 14.
  progressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  progressSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
    flex: 1,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressMicrocopy: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  navigation: { marginTop: 30, gap: 12 },
  navButton: { height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  primaryNav: { shadowColor: UI_COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 3 },
  primaryNavText: { color: 'white', fontSize: 18, fontWeight: '800' },
  // BATCH-G1: TestFlight build 14 showed "שמור וסגור" pinned to the
  // LEFT edge of the screen. Under RTL the main axis runs right→left,
  // so justifyContent: 'flex-end' packs at the main END = the LEFT
  // visual edge. Switched to 'flex-start' to pack at the main START
  // = the RIGHT visual edge (Hebrew leading edge).
  editModeHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
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
  // BATCH-D: onboarding intro carousel styles. Self-contained so the
  // intro layout doesn't have to fit the questionnaire's per-step
  // stepContent + formGroup structure. Bright + light, RTL-aware.
  onboardingContainer: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 16,
    alignSelf: 'stretch',
  },
  // BATCH-G1: JSX is [BrandMark, Wordmark "UniMatch"]. Under RTL with
  // `row` the BrandMark sits on the right (Hebrew leading edge) and
  // the wordmark follows to its left — matches the BrandMark+text
  // anchor used by the questionnaire progress header for consistency.
  onboardingBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 18,
  },
  onboardingBrandName: {
    fontSize: 22,
    fontWeight: '900',
    color: UI_COLORS.branding,
    letterSpacing: -0.3,
  },
  onboardingPager: {
    flexGrow: 0,
  },
  onboardingPagerContent: {
    alignItems: 'stretch',
  },
  onboardingCardCell: {
    paddingVertical: 8,
    justifyContent: 'flex-start',
  },
  onboardingCard: {
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    padding: 28,
    alignItems: 'center',
    gap: 14,
    minHeight: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  onboardingIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: UI_COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  onboardingIcon: {
    fontSize: 44,
    lineHeight: 52,
    textAlign: 'center',
  },
  onboardingHighlightPill: {
    // BATCH-D REVISION: horizontal padding nudged 14 -> 16 so the
    // longer highlight strings (e.g., "פחות רעש, יותר עומק") have
    // comfortable breathing room without wrapping on small iPhones.
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#FFF0EA',
    borderWidth: 1,
    borderColor: 'rgba(255, 61, 87, 0.18)',
  },
  onboardingHighlightText: {
    fontSize: 13,
    fontWeight: '800',
    color: UI_COLORS.branding,
    letterSpacing: 0.3,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  onboardingCardTitle: {
    // BATCH-D REVISION: bumped 22 -> 24 for more emotional weight on
    // the hero title. lineHeight scales to 32 to preserve breathing
    // room across the larger size; still fits two lines comfortably
    // on iPhone SE (375pt wide minus card padding).
    // BATCH-E1: weight 900 -> 800. 900 was the heaviest possible;
    // 800 keeps the hero impact and reads as premium rather than
    // shouty.
    fontSize: 24,
    fontWeight: '800',
    color: UI_COLORS.text,
    textAlign: 'center',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
    lineHeight: 32,
    marginTop: 4,
  },
  // BATCH-G1: card title stays centered (hero pattern), but the body
  // copy switches to textAlign: 'right' — longer Hebrew explanations
  // float awkwardly when centered in a card that's already balanced
  // by the centered icon + pill + title. Right-aligned reads as a
  // natural Hebrew paragraph.
  onboardingCardBody: {
    fontSize: 15,
    color: UI_COLORS.textLight,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
    lineHeight: 23,
    paddingHorizontal: 4,
  },
  onboardingDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 18,
  },
  onboardingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: UI_COLORS.border,
  },
  onboardingDotActive: {
    width: 22,
    backgroundColor: UI_COLORS.branding,
  },
  onboardingFooter: {
    alignSelf: 'stretch',
    gap: 10,
  },
  // BATCH-E1: premium polish — height 56 → 52, fontSize 18 → 17,
  // fontWeight 800 → 700, shadow opacity 0.22 → 0.12. The bright red
  // shadow halo at 0.22 was the most attention-grabbing element on
  // the onboarding cards; softening it lets the card content lead.
  // Still well above iOS 44pt min tap target.
  onboardingPrimaryButton: {
    backgroundColor: UI_COLORS.primary,
    height: 52,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: UI_COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  onboardingPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  onboardingPrivacyLine: {
    fontSize: 12,
    color: UI_COLORS.textLight,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
