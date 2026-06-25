// constants/howItWorksContent.ts
//
// Single source of truth for the 3-card "איך זה עובד" explainer.
// Consumed by:
//   * app/welcome.tsx — first-launch onboarding pager
//   * app/how-it-works.tsx — Settings-accessed explainer
//
// Keeping the content in one place prevents copy drift between the two
// surfaces. If you want to update the message, update it here.
//
// Content reflects the "אני פנוי/ה להכיר" availability-based matching
// model that became live with PR #61-#63 and was crash-hardened in
// PR #65 (Build #25).

export type HowItWorksStep = {
  emoji: string;
  number: string;
  title: string;
  body: string;
};

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    emoji: '📝',
    number: '1',
    title: 'שאלון התאמה אמיתי',
    body:
      'במקום החלקות אינסופיות, עונים פעם אחת על שאלון שעוזר להבין מה באמת חשוב לך: סגנון תקשורת, קצב בקשר, ערכים וציפיות.',
  },
  {
    emoji: '🎯',
    number: '2',
    title: 'מסמנים כשפנויים להכיר',
    body:
      "כשאת/ה באמת פנוי/ה להכיר, לוחצים על 'אני פנוי/ה להכיר'. הסימון תקף ל־3 ימים, ובזמן הזה נחפש התאמה אחת איכותית.",
  },
  {
    emoji: '💬',
    number: '3',
    title: 'התאמה אחת, בזמן הנכון',
    body:
      'ב־UniMatch מקבלים עד 5 התאמות בחודש, אחת בכל פעם. כשנמצאת התאמה, יש לכם 72 שעות להתחיל שיחה הדדית. אם השיחה לא מתחילה בזמן, ההתאמה נסגרת — כדי לשמור על חוויה מכוונת ולא עמוסה.',
  },
];

// Optional hero tagline. Used by welcome.tsx as the badge above the pager.
// Kept here so the wording stays consistent with the cards' tone.
export const HOW_IT_WORKS_TAGLINE = 'לא עוד אפליקציית החלקות אינסופית';
