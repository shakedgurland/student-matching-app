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
// Content reflects the "אני פנוי/ה להכיר" availability-based matching
// model (PR #61-#63 backend + PR #65 crash hardening + PR #67 home-tab
// CTA clarity).

export type HowItWorksStep = {
  emoji: string;
  number: string;
  title: string;
  body: string;
};

// Hero tagline used as the main headline above the cards.
export const HOW_IT_WORKS_TAGLINE = 'לא עוד אפליקציית החלקות אינסופית';

// Subtitle that explains the product positioning under the headline.
// Long version per spec — must appear verbatim in both welcome AND
// how-it-works (no shortening, no paraphrase).
export const HOW_IT_WORKS_SUBTITLE =
  'UniMatch מחברת בין סטודנטים לפי התאמה אמיתית, זמינות ורצון להכיר — לא לפי עוד גלילה שלא נגמרת.';

// 3-card explainer. Card 2 explicitly covers BOTH outcomes (instant
// match possible when a peer is also available, AND signal stays
// up to 3 days otherwise) so the wording doesn't overpromise either
// instant matching or a guaranteed 3-day wait.
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
    title: 'מסמנים כשפנויים להכיר',
    body:
      "כשאת/ה באמת פנוי/ה להכיר, לוחצים על 'אני פנוי/ה להכיר'. אם קיימת התאמה מתאימה, היא יכולה להיפתח גם תוך כמה רגעים. אם לא, הסימון נשאר פעיל עד 3 ימים.",
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
