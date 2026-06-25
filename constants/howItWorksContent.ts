// constants/howItWorksContent.ts
//
// Single source of truth for the onboarding / "איך זה עובד" content.
// Consumed by:
//   * app/welcome.tsx — first-launch onboarding screen
//   * app/how-it-works.tsx — Settings-accessed explainer
//
// Keeping the content in one place prevents copy drift between the two
// surfaces. Both screens render the SAME headline + subtitle + 3 cards.
// Only the welcome screen renders the auth buttons (HOW_IT_WORKS_PRIMARY_CTA
// / HOW_IT_WORKS_SECONDARY_CTA) — how-it-works doesn't have signup/login
// CTAs because logged-in users see it from Settings.
//
// Content reflects the automatic-matching model restored in migration 035 +
// the matching client refresh: matching happens automatically for eligible
// users, recent-activity is a behind-the-scenes ranking preference (never
// surfaced to the UI), and the prior "אני פנוי/ה להכיר" opt-in language
// has been removed.

export type HowItWorksStep = {
  emoji: string;
  number: string;
  title: string;
  body: string;
};

// Hero tagline used as the main headline above the cards.
export const HOW_IT_WORKS_TAGLINE = 'לא עוד אפליקציית החלקות אינסופית';

// Subtitle that explains the product positioning under the headline.
// Must appear verbatim in both welcome AND how-it-works (no shortening,
// no paraphrase). Word change vs PR #68: "זמינות" → "פעילות" so the
// subtitle reflects the activity-based ranking signal that replaced the
// opt-in availability gate.
export const HOW_IT_WORKS_SUBTITLE =
  'UniMatch מחברת בין סטודנטים לפי התאמה אמיתית, פעילות ורצון להכיר — לא לפי עוד גלילה שלא נגמרת.';

// 3-card explainer. Card 2 was rewritten to describe automatic matching
// (no opt-in tap) — the system picks the most-fitting candidate among
// users who pass the user's required settings. No percentages, no score
// chip language.
export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    emoji: '📝',
    number: '1',
    title: 'שאלון התאמה אמיתי',
    body:
      'במקום להסתמך רק על תמונות, עונים פעם אחת על שאלון שעוזר להבין מה באמת חשוב לך: סגנון תקשורת, קצב בקשר, ערכים וציפיות.',
  },
  {
    emoji: '🎯',
    number: '2',
    title: 'התאמה אוטומטית, בלי החלקות',
    body:
      'כשיש משתמשים פעילים שעוברים את הגדרות החובה שלך, UniMatch בוחרת עבורך את ההתאמה המתאימה ביותר מבין האפשרויות — בלי להציג אחוזים ובלי משחקים.',
  },
  {
    emoji: '💬',
    number: '3',
    title: 'התאמה אחת, בזמן הנכון',
    body:
      'ב־UniMatch מקבלים עד 5 התאמות בחודש, אחת בכל פעם. כשנמצאת התאמה, יש לכם 72 שעות להתחיל שיחה הדדית. אם השיחה לא מתחילה בזמן, ההתאמה נסגרת — כדי לשמור על חוויה מכוונת ולא עמוסה.',
  },
];

// Auth CTAs — only used by app/welcome.tsx. Defined here so the wording
// stays in one place even though how-it-works doesn't render them.
export const HOW_IT_WORKS_PRIMARY_CTA = 'להתחיל';
export const HOW_IT_WORKS_SECONDARY_CTA = 'כבר יש לי חשבון';
