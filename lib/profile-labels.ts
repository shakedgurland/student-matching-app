// lib/profile-labels.ts
//
// BATCH-C: shared Hebrew display labels for profile fields surfaced on
// match-result, match-profile, and my-profile. Hoisted from the local
// copy that lived in app/(tabs)/my-profile.tsx and extended with the
// university / faculty / year_of_study / degree_stage mappings that
// were previously missing — TestFlight build 12 showed raw enum values
// like "huji", "law", "year_3" leaking into user-facing strings.
//
// The canonical source of truth for the option codes themselves is
// app/questionnaire.tsx (UNIVERSITY inline at the form, FIELD_OF_STUDY_
// OPTIONS, STUDY_YEAR_OPTIONS, DEGREE_STAGE_OPTIONS, REGION_OPTIONS).
// Mirroring here is intentional and small; if a new code is added to
// the questionnaire, add it here too. supabase/functions/match-create/
// labels.ts is a separate Edge-Function-side duplicate for the
// icebreaker generator and is INTENTIONALLY kept independent.
//
// Design:
//   * Strings only. No JSX, no styling, no React imports — so this
//     module is cheap to import anywhere (server-side too).
//   * labelFor(field, value) returns the Hebrew label if known, or a
//     safe fallback. Missing field → 'לא צוין'. Missing value → the
//     raw value passed through (so a value the questionnaire shipped
//     but we forgot to map here at least appears, instead of being
//     erased to nothing). This matches existing my-profile.tsx
//     behavior for the "intent_type / preferred_first_date /
//     conflict_style / region" fields it already handled.

export const LABEL_MAPS: Record<string, Record<string, string>> = {
  intent_type: {
    long_term: 'קשר לטווח ארוך',
    short_term: 'קשר קצר',
    casual: 'סטוצים / קשר לא מחייב',
    open_flow: 'ראש פתוח וזורם',
  },
  preferred_first_date: {
    coffee: 'בית קפה',
    restaurant: 'מסעדה',
    bar: 'בר / דרינק',
    picnic: 'פיקניק',
    nature_walk: 'טיול בטבע',
    active: 'פעילות אקטיבית',
    home_evening: 'ערב ביתי',
    connection_matters: 'לא משנה מה עושים, העיקר החיבור',
  },
  conflict_style: {
    talk_immediately: 'רוצה לדבר מיד',
    need_cooldown: 'צריך/ה זמן להירגע',
    avoidant: 'נמנע/ת מעימותים',
    situational: 'תלוי במצב',
  },
  region: {
    north: 'צפון',
    south: 'דרום',
    center: 'מרכז',
    jerusalem: 'ירושלים והסביבה',
    haifa: 'חיפה והקריות',
  },
  // BATCH-C addition. Inline options in questionnaire.tsx renderStep2.
  // 'other' deliberately falls through to the raw-value fallback so the
  // user-provided text from `university_other` could be wired in
  // separately if needed.
  university: {
    huji: 'האוניברסיטה העברית',
    tau: 'אוניברסיטת תל אביב',
    bgu: 'אוניברסיטת בן גוריון',
    haifa: 'אוניברסיטת חיפה',
    technion: 'הטכניון',
    biu: 'אוניברסיטת בר אילן',
    ariel: 'אוניברסיטת אריאל',
    other: 'אחר',
  },
  // BATCH-C addition. Mirrors FIELD_OF_STUDY_OPTIONS in questionnaire.tsx.
  faculty: {
    psychology: 'פסיכולוגיה',
    cs: 'מדעי המחשב',
    law: 'משפטים',
    medicine: 'רפואה',
    business: 'מנהל עסקים',
    engineering: 'הנדסה',
    other: 'אחר',
  },
  // BATCH-C addition. year_of_study is the DB column; it stores the
  // value chosen via STUDY_YEAR_OPTIONS or DEGREE_STAGE_OPTIONS in the
  // questionnaire (both share year_1..year_4 codes, with year_5_plus
  // unique to STUDY_YEAR and masters/other unique to DEGREE_STAGE).
  // Include the union so a value from either source maps cleanly.
  year_of_study: {
    year_1: 'שנה א׳',
    year_2: 'שנה ב׳',
    year_3: 'שנה ג׳',
    year_4: 'שנה ד׳',
    year_5_plus: 'שנה ה׳+',
    masters: 'תואר שני',
    other: 'אחר',
  },
  // PR-UI-POLISH: hobby labels — Hebrew display for profile.hobbies[]
  // codes. Source of truth: HOBBY_OPTIONS_V2 in app/questionnaire.tsx.
  // All 23 codes mirrored verbatim, including 'other' so a free-text-
  // selecting user's chip reads "אחר" instead of the raw enum. The
  // Edge Function maintains an independent HOBBY_LABELS_HE map under
  // supabase/functions/match-create/labels.ts for evidence rendering;
  // that map excludes 'other' deliberately (an "other" hobby never
  // produces a meaningful shared_hobbies evidence entry). The two
  // surfaces must stay in sync with the questionnaire — if a new
  // hobby is added there, mirror it in both this map AND the Edge
  // Function map.
  hobbies: {
    gym: 'חדר כושר',
    running: 'ריצה',
    hiking: 'טיולים',
    camping: 'קמפינג',
    beach: 'ים',
    music: 'מוזיקה',
    concerts: 'הופעות',
    movies: 'סרטים',
    series: 'סדרות',
    reading: 'קריאה',
    gaming: 'גיימינג',
    cooking: 'בישול',
    restaurants: 'מסעדות',
    art: 'אומנות',
    photography: 'צילום',
    dancing: 'ריקוד',
    dogs: 'כלבים',
    cats: 'חתולים',
    tech: 'טכנולוגיה',
    entrepreneurship: 'יזמות',
    tennis: 'טניס',
    jet_ski: 'אופנוע ים',
    other: 'אחר',
  },
};

/**
 * Hebrew display label for a profile enum value.
 *
 * Returns:
 *   - empty / non-string value           → 'לא צוין'
 *   - unknown field                      → 'לא צוין'
 *   - field exists but value unmapped    → the raw value (defensive
 *                                          passthrough so a forgotten
 *                                          enum doesn't render blank)
 *   - field + value mapped               → the Hebrew label
 *
 * The empty-string and non-string handling matches the pre-existing
 * my-profile.tsx behavior to avoid behavior drift for that screen.
 */
export function labelFor(field: keyof typeof LABEL_MAPS, value: unknown): string {
  if (typeof value !== 'string' || !value) return 'לא צוין';
  const map = LABEL_MAPS[field];
  if (!map) return 'לא צוין';
  return map[value] ?? value;
}
