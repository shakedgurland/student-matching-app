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
