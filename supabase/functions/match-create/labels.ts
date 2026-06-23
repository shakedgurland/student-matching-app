// supabase/functions/match-create/labels.ts
//
// Hebrew labels for canonical V2 option codes. Used by icebreaker.ts to
// render readable templates. The codes themselves are the source of truth
// in app/questionnaire.tsx; if the option set changes there, mirror here.
// No shared package exists between Edge Function and app — duplication is
// intentional and small.
//
// Only codes that pair cleanly with the icebreaker templates appear here.
// 'other' / open-text alternatives are deliberately absent so the
// generator falls through to the next priority tier rather than rendering
// "{label} = אחר".

export const HOBBY_LABELS_HE: Record<string, string> = {
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
};

// preferred_first_date codes. 'connection_matters' is intentionally
// excluded — it means "doesn't matter what we do", which doesn't slot
// into the "שניכם רוצים X בדייט הראשון" template.
export const DATE_LABELS_HE: Record<string, string> = {
  coffee: 'בית קפה',
  restaurant: 'מסעדה',
  bar: 'בר',
  picnic: 'פיקניק',
  nature_walk: 'טיול בטבע',
  active: 'פעילות אקטיבית',
  home_evening: 'ערב ביתי',
};

// relationship_top_values codes. 'attraction' and 'other' intentionally
// excluded — 'attraction' edges body-adjacent territory (privacy rule);
// 'other' has no canonical label.
export const VALUE_LABELS_HE: Record<string, string> = {
  trust: 'אמון',
  communication: 'תקשורת',
  humor: 'הומור',
  stability: 'יציבות',
  friendship: 'חברות',
  independence: 'עצמאות',
  ambition: 'שאפתנות',
  family: 'משפחתיות',
};

export const INTENT_LABELS_HE: Record<string, string> = {
  long_term: 'קשר לטווח ארוך',
  short_term: 'קשר קצר',
  casual: 'משהו קליל',
  open_flow: 'משהו זורם',
};

// V2 relationship_pace codes (questionnaire.tsx RELATIONSHIP_PACE_OPTIONS_V2).
// The PACE_ORDER constant in scoring.ts is the canonical ordered list. Only
// the four V2 codes are mapped; legacy 'fast' / 'slow' / 'text_first' /
// 'face_to_face' from the V1 PACE_OPTIONS are intentionally absent — they
// are never produced by the V2 questionnaire flow and would never reach
// scoring with a meaningful equality.
export const PACE_LABELS_HE: Record<string, string> = {
  very_slow: 'קצב איטי מאוד',
  gradual: 'להכיר בהדרגה',
  medium: 'קצב בינוני',
  fast_with_connection: 'כשיש חיבור — לזרום מהר',
};

// region codes mirrored from lib/profile-labels.ts (the canonical client
// label map for region). Used to render "שניכם באזור X" when scoring's
// regionScore branch fires on an exact-region match.
export const REGION_LABELS_HE: Record<string, string> = {
  north: 'צפון',
  south: 'דרום',
  center: 'מרכז',
  jerusalem: 'ירושלים והסביבה',
  haifa: 'חיפה והקריות',
};

// university codes mirrored from lib/profile-labels.ts. 'other' is
// intentionally absent — its rendering would be "אחר", which is misleading
// as a reason; evidence is skipped in that case (per the "skip rather than
// render raw code" rule).
export const UNIVERSITY_LABELS_HE: Record<string, string> = {
  huji: 'האוניברסיטה העברית',
  tau: 'אוניברסיטת תל אביב',
  bgu: 'אוניברסיטת בן גוריון',
  haifa: 'אוניברסיטת חיפה',
  technion: 'הטכניון',
  biu: 'אוניברסיטת בר אילן',
  ariel: 'אוניברסיטת אריאל',
};

// faculty codes mirrored from lib/profile-labels.ts. 'other' is omitted
// for the same reason as university.
export const FACULTY_LABELS_HE: Record<string, string> = {
  psychology: 'פסיכולוגיה',
  cs: 'מדעי המחשב',
  law: 'משפטים',
  medicine: 'רפואה',
  business: 'מנהל עסקים',
  engineering: 'הנדסה',
};

// year_of_study codes mirrored from lib/profile-labels.ts. 'other' omitted.
// 'masters' / 'year_5_plus' rendered without the "שנה" prefix because the
// reason template prepends "שניכם ב" — the label must read naturally after it.
export const YEAR_OF_STUDY_LABELS_HE: Record<string, string> = {
  year_1: 'שנה א׳',
  year_2: 'שנה ב׳',
  year_3: 'שנה ג׳',
  year_4: 'שנה ד׳',
  year_5_plus: 'שנה ה׳ ומעלה',
  masters: 'תואר שני',
};

// conflict_style codes mirrored from lib/profile-labels.ts. Stored as the
// `label` field in evidence for analytics + future UI, BUT the user-facing
// reason string is intentionally rendered as a generic
// "שניכם בסגנון פתרון קונפליקטים דומה" — exposing "נמנע/ת מעימותים" or
// similar in the rendered bullet would be sensitive on a date-discovery
// surface. The discriminated kind 'shared_conflict_style' carries the
// evidence intent; the label is preserved without being surfaced today.
export const CONFLICT_STYLE_LABELS_HE: Record<string, string> = {
  talk_immediately: 'רוצה לדבר מיד',
  need_cooldown: 'צריך/ה זמן להירגע',
  avoidant: 'נמנע/ת מעימותים',
  situational: 'תלוי במצב',
};

// religion_type codes mirrored from questionnaire.tsx RELIGION_TYPE_OPTIONS.
// 'other' and 'prefer_not_to_say' intentionally absent:
//   * 'other' has no canonical label safe to surface
//   * 'prefer_not_to_say' is already excluded by scoring before reasons fire
// The label form is the gendered singular from the questionnaire ("יהודי/ה"),
// preserved here for analytics; the user-facing reason template renders a
// generic "יש לכם רקע דתי משותף" rather than embedding the singular form
// into a "שניכם ..." sentence which would read awkwardly.
export const RELIGION_TYPE_LABELS_HE: Record<string, string> = {
  jewish: 'יהודי/ה',
  muslim: 'מוסלמי/ת',
  christian: 'נוצרי/ה',
  druze: 'דרוזי/ת',
};
