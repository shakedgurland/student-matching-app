// constants/howItWorksContent.ts
//
// Single source of truth for the onboarding / "איך זה עובד" content.
// Consumed by:
//   * app/welcome.tsx — first-launch onboarding screen
//   * app/how-it-works.tsx — Settings-accessed explainer
//
// Both screens render the SAME headline + subtitle + 3 cards. Only
// welcome renders the auth buttons (HOW_IT_WORKS_PRIMARY_CTA /
// HOW_IT_WORKS_SECONDARY_CTA); how-it-works is reached from Settings
// for already-logged-in users.
//
// Copy reflects the current 3-tab product (Match / Chat / Profile)
// and the automatic-matching model. No score percentages, no opt-in
// "אני פנוי/ה להכיר" surface, no "last seen" surface, no
// implementation-internal language.

// Names below are SF Symbols mapped in components/ui/icon-symbol.tsx.
// Adding a new value here requires extending that mapping.
type IconName =
  | 'person.text.rectangle.fill'
  | 'sparkles'
  | 'bubble.left.fill';

export type HowItWorksStep = {
  /** SF Symbol name rendered in a soft tinted circle on the card. */
  iconName: IconName;
  /** Step number shown as eyebrow ("שלב 1" / "שלב 2" / "שלב 3"). */
  number: string;
  /** Hebrew title, right-aligned RTL. */
  title: string;
  /** Hebrew body, right-aligned RTL. */
  body: string;
  /**
   * Per-card warm accent background for the icon circle. Three tasteful
   * summery tints (soft peach, light coral, warm cream) sourced locally
   * so the screens get a happy-bright per-step distinction without
   * inventing app-wide color tokens. Scoped to onboarding/how-it-works.
   */
  accentSurface: string;
};

// Hero tagline used as the small pill above the subtitle. Kept terse;
// the subtitle below carries the substance.
export const HOW_IT_WORKS_TAGLINE = 'לא עוד אפליקציית החלקות אינסופית';

// Main subtitle — current product framing. Hard requirement: identical
// verbatim in both welcome AND how-it-works.
export const HOW_IT_WORKS_SUBTITLE =
  'UniMatch מחברת בין סטודנטים לפי שאלון התאמה, הגדרות חובה ורצון אמיתי להכיר — בלי החלקות אינסופיות.';

// 3-card explainer. Icons mirror the 3 bottom tabs the user lives in:
//   1. questionnaire icon ↔ profile-setup phase
//   2. sparkles ↔ Match tab
//   3. chat bubble ↔ Chat tab
// Per-card accent surfaces give a gentle peach → coral → cream gradient
// across the pager — premium and warm without competing with brand.
export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    iconName: 'person.text.rectangle.fill',
    number: '1',
    title: 'שאלון שמכיר אותך באמת',
    body:
      'עונים פעם אחת על שאלון התאמה שמבין מה חשוב לך בקשר: סגנון תקשורת, קצב, כוונות, ערכים והגדרות חובה. זה הבסיס להתאמה מדויקת יותר.',
    accentSurface: '#FFF0EA',
  },
  {
    iconName: 'sparkles',
    number: '2',
    title: 'התאמה אחת בכל פעם',
    body:
      'UniMatch מתאימה לך מועמד או מועמדת שמתאימים לך באמת. מציגה התאמה אחת איכותית. עד 5 התאמות בחודש — כדי לשמור על חוויה מדויקת בלי עומס.',
    accentSurface: '#FFE9EB',
  },
  {
    iconName: 'bubble.left.fill',
    number: '3',
    title: 'צ׳אט שנפתח כשיש התאמה',
    body:
      'כשיש התאמה פעילה, הצ׳אט מחכה בטאב שלו. יש לכם 72 שעות להתחיל שיחה; אם זה לא קורה, ההתאמה נסגרת והמערכת חוזרת לחפש את ההתאמה הבאה.',
    accentSurface: '#FFF5E0',
  },
];

// Auth CTAs — only used by app/welcome.tsx. Defined here so the wording
// stays in one place even though how-it-works doesn't render them.
export const HOW_IT_WORKS_PRIMARY_CTA = 'להתחיל';
export const HOW_IT_WORKS_SECONDARY_CTA = 'כבר יש לי חשבון';
