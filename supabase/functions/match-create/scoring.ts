// supabase/functions/match-create/scoring.ts
//
// Pure scoring helpers used by the match-create Edge Function. No Supabase
// calls, no I/O. The public entry points are `rankCandidates` and
// `pickBestCandidate`. The orchestrator (index.ts) supplies caller +
// candidate profile/answers; this module applies hard filters and
// computes the compatibility score.
//
// Active scoring matrix (after PR-AUDIT-D — V2-aligned)
// ─────────────────────────────────────────────────────
// Hard filters in rankCandidates:
//   • gender (bi-directional)
//   • height must_have (bi-directional; reads
//     profile.height_preference_importance + profile.min_preferred_height_cm)
//
// Soft scoring in calculateCompatibility (fast contributions, every user):
//   • intentCompatibility(intent_type)                ±10/±5/0
//   • paceCompatibility(relationship_pace)            ±10/±5/0
//   • conflict_style match                            +7
//   • hobbies overlap (≤15) + shared_hobbies_priority (≤5) + city (+3)
//   • region (scoreRegionCompatibility)               +0..10
//   • ageScore (preferred_age_min/max bi-directional) +0/+5/+10
//   • preferred_first_date match                      +10
//   • studies: same university +5 (+3 if matchPref); same faculty +5 (+3); same year +3
//   • religion: same type +5; same level +3 (adjacent +1)
//
// Soft scoring (deep only, capped at 50 before final blend):
//   • spontaneity / elevatorScenario / karaokeChance / familiarFace      +2.5 each
//   • perfect_date / similarity_preference                                +5 each
//   • derived-trait closeness across 12 traits                            ≤~12
//   • relationship_top_values overlap                                     ≤6
//   • relationship_strengths overlap                                      ≤4
//   • partner_should_feel overlap                                         ≤3
//   • love_languages array overlap                                        ≤3
//
// Soft penalty (always applied, NOT capped against trait penalty pool):
//   • height 'important' threshold mismatch                               flat −8 total
//     (cap is deliberate — bi-directional mismatch does NOT stack to −16;
//      height is framed as optional/respectful, not central to scoring)
//
// Trait-based penalties (capped at −25 total, separate from height soft):
//   • partner_qualities ↔ candidate traits below threshold
//   • dealbreakers      ↔ candidate traits below threshold
//   • religion_type     ↔ religion_importance
//   • religion_level    ↔ religious_level_importance
//
// Removed in PR-AUDIT-D (V2 questionnaire dropped these inputs):
//   • conversation_style, compromise_area  (legacy commScore branches)
//   • respect_priority, interest_signals   (legacy prefScore branches)
//   • money_style, love_language singular  (legacy deep branches; replaced
//                                           by love_languages array)
//   • about_me / relationship_strengths_text free-text bonus
//
// lib/matching.ts is now a thin Edge Function wrapper — no client scoring.
// This file is the single source of truth.

import {
  deriveTraits,
  derivePreferences,
  type DerivedTraits,
  type DerivedPreferences,
  type TraitName,
} from "./traits.ts";

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function hasMeaningfulAnswer(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return Boolean(value);
}

function bothMeaningfulAndEqual(a: unknown, b: unknown): boolean {
  return hasMeaningfulAnswer(a) && hasMeaningfulAnswer(b) && a === b;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// ---------------------------------------------------------------------------
// V2 positive-scoring helpers (rule-based; closed answers only)
// ---------------------------------------------------------------------------

function intentCompatibility(a: unknown, b: unknown): number {
  if (typeof a !== 'string' || !a || typeof b !== 'string' || !b) return 0;
  if (a === b) return 10;
  const ADJACENT = new Set<string>([
    'long_term:open_flow', 'open_flow:long_term',
    'open_flow:short_term', 'short_term:open_flow',
    'short_term:casual', 'casual:short_term',
  ]);
  return ADJACENT.has(`${a}:${b}`) ? 5 : 0;
}

const PACE_ORDER = ['very_slow', 'gradual', 'medium', 'fast_with_connection'];
function paceCompatibility(a: unknown, b: unknown): number {
  if (typeof a !== 'string' || !a || typeof b !== 'string' || !b) return 0;
  if (a === b) return 10;
  const i = PACE_ORDER.indexOf(a);
  const j = PACE_ORDER.indexOf(b);
  if (i < 0 || j < 0) return 0;
  return Math.abs(i - j) === 1 ? 5 : 0;
}

function traitCloseness(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0;
  const diff = Math.abs(a - b);
  return Math.max(0, 1 - diff / 4);
}

function countOverlap(a: unknown, b: unknown): number {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  let n = 0;
  for (const x of a) if (b.includes(x)) n++;
  return n;
}

function normalizeCity(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Bi-directional soft penalty for the 'important' height preference tier.
// 'must_have' is hard-filtered upstream in rankCandidates, so this function
// only fires when a user picked 'important' AND supplied a min threshold
// AND the candidate's height is below it.
//
// Capped at -8 TOTAL — height is deliberately framed as optional and
// respectful in the product, so a mutual important-mismatch still costs at
// most -8, not -16. Either side triggering fires the same flat penalty;
// both sides triggering does not double it. The cap is intentional, not an
// accident of the math.
//
// No compatibility_reasons entry is added here under any branch — we never
// surface a height-related shame line in the user-facing reasons.
function heightSoftPenalty(
  myProfile: Record<string, unknown>,
  candidateProfile: Record<string, unknown>,
): number {
  const myPref = asString(myProfile.height_preference_importance);
  const myMin = typeof myProfile.min_preferred_height_cm === 'number'
    ? myProfile.min_preferred_height_cm
    : 0;
  const candHeight = typeof candidateProfile.height_cm === 'number'
    ? candidateProfile.height_cm
    : 0;
  const myTriggers =
    myPref === 'important' && myMin > 0 && candHeight > 0 && candHeight < myMin;

  const candPref = asString(candidateProfile.height_preference_importance);
  const candMin = typeof candidateProfile.min_preferred_height_cm === 'number'
    ? candidateProfile.min_preferred_height_cm
    : 0;
  const myHeight = typeof myProfile.height_cm === 'number'
    ? myProfile.height_cm
    : 0;
  const candTriggers =
    candPref === 'important' && candMin > 0 && myHeight > 0 && myHeight < candMin;

  return (myTriggers || candTriggers) ? -8 : 0;
}

function scoreRegionCompatibility(regionA: string, regionB: string): number {
  if (!regionA || !regionB) return 0;
  if (regionA === regionB) return 10;
  const pairs: Record<string, number> = {
    'center+jerusalem': 7,
    'jerusalem+center': 7,
    'center+haifa': 5,
    'haifa+center': 5,
    'north+haifa': 7,
    'haifa+north': 7,
    'south+jerusalem': 4,
    'jerusalem+south': 4,
    'center+north': 3,
    'north+center': 3,
    'center+south': 3,
    'south+center': 3,
  };
  return pairs[`${regionA}+${regionB}`] || 0;
}

function scoreAgeCompatibility(
  myAnswers: Record<string, unknown>,
  myBirthYear: number | null,
  candidateAnswers: Record<string, unknown>,
  candidateBirthYear: number | null,
): number {
  const getAge = (birthYear: number | null) =>
    birthYear ? new Date().getFullYear() - birthYear : null;

  const myAge = getAge(myBirthYear) || parseInt(asString(myAnswers.age));
  const candidateAge = getAge(candidateBirthYear) || parseInt(asString(candidateAnswers.age));

  if (!myAge || !candidateAge) return 0;

  const checkRange = (age: number, min: string, max: string) => {
    const minVal = parseInt(min) || 18;
    const maxVal = parseInt(max) || 45;
    return age >= minVal && age <= maxVal;
  };

  const candidateInMyRange = checkRange(
    candidateAge,
    asString(myAnswers.preferred_age_min),
    asString(myAnswers.preferred_age_max),
  );
  const iAmInCandidateRange = checkRange(
    myAge,
    asString(candidateAnswers.preferred_age_min),
    asString(candidateAnswers.preferred_age_max),
  );

  if (candidateInMyRange && iAmInCandidateRange) return 10;
  if (candidateInMyRange || iAmInCandidateRange) return 5;
  return 0;
}

// ---------------------------------------------------------------------------
// Trait-based preference penalties
// ---------------------------------------------------------------------------

type PenaltySeverity = 'soft' | 'strong';

interface Penalty {
  points: number; // negative
  severity: PenaltySeverity;
  caveat: string;
}

function minTraitScore(...vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return Math.min(...nums);
}

function thresholdPenalty(
  trait: number | null,
  caveat: string,
  softPoints: number = -5,
  strongPoints: number = -10,
): Penalty | null {
  if (trait === null) return null;
  if (trait <= 2) return { points: strongPoints, severity: 'strong', caveat };
  if (trait < 3) return { points: softPoints, severity: 'soft', caveat };
  return null;
}

function penaltyForPartnerQuality(quality: string, candidateTraits: DerivedTraits): Penalty | null {
  switch (quality) {
    case 'self_confidence':
      return thresholdPenalty(candidateTraits.social_confidence, 'ייתכן פער בביטחון החברתי לעומת מה שחיפשת');
    case 'good_communication':
      return thresholdPenalty(
        minTraitScore(candidateTraits.communication_directness, candidateTraits.conflict_engagement),
        'ייתכן פער בסגנון התקשורת לעומת מה שחיפשת',
      );
    case 'ambition':
      return thresholdPenalty(candidateTraits.ambition_career_focus, 'ייתכן פער בשאפתנות לעומת מה שחיפשת');
    case 'spontaneity':
      return thresholdPenalty(candidateTraits.spontaneity_level, 'ייתכן פער ברמת הספונטניות לעומת מה שחיפשת');
    case 'family':
      return thresholdPenalty(candidateTraits.family_orientation, 'ייתכן פער במשפחתיות לעומת מה שחיפשת');
    case 'emotional_maturity':
      return thresholdPenalty(candidateTraits.conflict_engagement, 'ייתכן פער בבגרות רגשית לעומת מה שחיפשת');
    case 'humor':
      return thresholdPenalty(candidateTraits.humor_playfulness, 'ייתכן פער בסגנון ההומור לעומת מה שחיפשת');
    case 'stability':
      return thresholdPenalty(candidateTraits.relationship_stability_preference, 'ייתכן פער בהעדפת היציבות לעומת מה שחיפשת');
    case 'open_minded':
      return thresholdPenalty(candidateTraits.openness_to_new_people, 'ייתכן פער בפתיחות לאנשים חדשים לעומת מה שחיפשת');
    case 'sensitivity':
      return thresholdPenalty(candidateTraits.warmth_affection, 'ייתכן פער בחום וברגישות לעומת מה שחיפשת');
    default:
      return null;
  }
}

function penaltyForDealbreaker(dealbreaker: string, candidateTraits: DerivedTraits): Penalty | null {
  switch (dealbreaker) {
    case 'poor_communication': {
      const t = minTraitScore(candidateTraits.communication_directness, candidateTraits.conflict_engagement);
      if (t === null || t > 2) return null;
      return { points: -15, severity: 'strong', caveat: 'ייתכן פער בסגנון התקשורת לעומת מה שחשוב לך' };
    }
    case 'no_ambition': {
      const t = candidateTraits.ambition_career_focus;
      if (t === null || t > 2) return null;
      return { points: -15, severity: 'strong', caveat: 'ייתכן פער בשאפתנות לעומת מה שחשוב לך' };
    }
    case 'no_independence': {
      const t = candidateTraits.independence_need;
      if (t === null || t > 2) return null;
      return { points: -8, severity: 'soft', caveat: 'ייתכן פער בעצמאות לעומת מה שחשוב לך' };
    }
    default:
      return null;
  }
}

function penaltyForReligionType(myPrefs: DerivedPreferences, candidatePrefs: DerivedPreferences): Penalty | null {
  const myType = myPrefs.religion_type;
  const candType = candidatePrefs.religion_type;
  if (!myType || !candType) return null;
  if (myType === 'prefer_not_to_say' || candType === 'prefer_not_to_say') return null;
  if (myType === candType) return null;
  switch (myPrefs.religion_importance) {
    case 'very_important':
      return { points: -15, severity: 'strong', caveat: 'ייתכן פער בדת לעומת מה שחשוב לך' };
    case 'somewhat_important':
      return { points: -10, severity: 'strong', caveat: 'ייתכן פער בדת לעומת מה שחשוב לך' };
    case 'nice_to_have':
      return { points: -5, severity: 'soft', caveat: 'ייתכן פער בדת לעומת מה שחשוב לך' };
    default:
      return null;
  }
}

function penaltyForReligiousLevel(myPrefs: DerivedPreferences, candidatePrefs: DerivedPreferences): Penalty | null {
  const myLevel = myPrefs.religion;
  const candLevel = candidatePrefs.religion;
  if (!myLevel || !candLevel) return null;
  const LEVEL_ORDER = ['secular', 'traditional', 'religious_national', 'religious', 'haredi'];
  const myIdx = LEVEL_ORDER.indexOf(myLevel);
  const candIdx = LEVEL_ORDER.indexOf(candLevel);
  if (myIdx < 0 || candIdx < 0) return null;
  const distance = Math.abs(myIdx - candIdx);
  if (distance === 0) return null;
  switch (myPrefs.religious_level_importance) {
    case 'very_important':
      if (distance >= 2) return { points: -15, severity: 'strong', caveat: 'ייתכן פער ברמת הדתיות לעומת מה שחשוב לך' };
      return { points: -8, severity: 'soft', caveat: 'ייתכן פער ברמת הדתיות לעומת מה שחשוב לך' };
    case 'similar_important':
      if (distance >= 2) return { points: -10, severity: 'strong', caveat: 'ייתכן פער ברמת הדתיות לעומת מה שחשוב לך' };
      return null;
    case 'similar_preferred':
      if (distance >= 2) return { points: -5, severity: 'soft', caveat: 'ייתכן פער ברמת הדתיות לעומת מה שחשוב לך' };
      return null;
    default:
      return null;
  }
}

function collectPenalties(
  prefs: DerivedPreferences,
  candidatePrefs: DerivedPreferences,
  candidateTraits: DerivedTraits,
): Penalty[] {
  const out: Penalty[] = [];
  for (const quality of prefs.partner_qualities) {
    const p = penaltyForPartnerQuality(quality, candidateTraits);
    if (p) out.push(p);
  }
  for (const dealbreaker of prefs.dealbreakers) {
    const p = penaltyForDealbreaker(dealbreaker, candidateTraits);
    if (p) out.push(p);
  }
  const rType = penaltyForReligionType(prefs, candidatePrefs);
  if (rType) out.push(rType);
  const rLevel = penaltyForReligiousLevel(prefs, candidatePrefs);
  if (rLevel) out.push(rLevel);
  return out;
}

function calculatePenalties(
  myAnswers: Record<string, unknown>,
  candidateAnswers: Record<string, unknown>,
): { penalty: number; caveatReason: string | null } {
  const myTraits = deriveTraits(myAnswers);
  const candidateTraits = deriveTraits(candidateAnswers);
  const myPrefs = derivePreferences(myAnswers);
  const candidatePrefs = derivePreferences(candidateAnswers);

  const fromMyPrefs = collectPenalties(myPrefs, candidatePrefs, candidateTraits);
  const fromCandidatePrefs = collectPenalties(candidatePrefs, myPrefs, myTraits);

  let caveatReason: string | null = null;
  const strongestMine = fromMyPrefs
    .filter(p => p.severity === 'strong')
    .sort((a, b) => a.points - b.points)[0];
  if (strongestMine) caveatReason = strongestMine.caveat;

  const total = [...fromMyPrefs, ...fromCandidatePrefs].reduce((sum, p) => sum + p.points, 0);
  const penalty = Math.max(-25, total);

  return { penalty, caveatReason };
}

// ---------------------------------------------------------------------------
// AI-traits soft contribution (PR-AUDIT-D PR 2)
//
// Consumes the LLM-derived blob written by analyze-user-traits into
// public.profile_ai_traits.traits:
//   { emotional_tone, social_energy, communication_style, ambition_level,
//     lifestyle_tone, humor_style, key_values[] }
//
// Contribution is intentionally bounded:
//   • Capped at ±8 total (cannot dominate region/intent/values/hard filters)
//   • Returns 0 silently when either side has no AI traits row
//     (fast users + deep users with insufficient free text both fall here)
//   • Reason "וייב דומה גם בהומור וערכים" pushed only when ≥2 dimensions
//     strongly agreed AND the capped score is ≥+4
// ---------------------------------------------------------------------------

const EMOTIONAL_TONE_MATRIX: Record<string, Record<string, number>> = {
  warm:      { warm: 2, energetic: 1, calm: 1, reserved: -2 },
  energetic: { warm: 1, energetic: 2, calm: 0, reserved: -2 },
  calm:      { warm: 1, energetic: 0, calm: 2, reserved: 1 },
  reserved:  { warm: -2, energetic: -2, calm: 1, reserved: 1 },
};

const HUMOR_STYLE_MATRIX: Record<string, Record<string, number>> = {
  witty:     { witty: 2, dry: 1, gentle: 1, sarcastic: 0, none: -1 },
  dry:       { witty: 1, dry: 2, gentle: 0, sarcastic: 1, none: -1 },
  gentle:    { witty: 1, dry: 0, gentle: 2, sarcastic: -2, none: 0 },
  sarcastic: { witty: 0, dry: 1, gentle: -2, sarcastic: 2, none: -1 },
  none:      { witty: -1, dry: -1, gentle: 0, sarcastic: -1, none: 1 },
};

const COMM_STYLE_MATRIX: Record<string, Record<string, number>> = {
  direct:     { direct: 2, expressive: 1, thoughtful: 0, minimalist: -2 },
  expressive: { direct: 1, expressive: 2, thoughtful: 1, minimalist: -1 },
  thoughtful: { direct: 0, expressive: 1, thoughtful: 2, minimalist: 1 },
  minimalist: { direct: -2, expressive: -1, thoughtful: 1, minimalist: 2 },
};

function aiTraitContribution(
  myAi: Record<string, unknown> | null,
  candAi: Record<string, unknown> | null,
): { score: number; strong: boolean } {
  if (!myAi || !candAi) return { score: 0, strong: false };

  let total = 0;
  let agreements = 0;

  const myET = asString(myAi.emotional_tone);
  const candET = asString(candAi.emotional_tone);
  if (myET && candET && EMOTIONAL_TONE_MATRIX[myET]?.[candET] !== undefined) {
    const v = EMOTIONAL_TONE_MATRIX[myET][candET];
    total += v;
    if (v >= 2) agreements++;
  }

  const myH = asString(myAi.humor_style);
  const candH = asString(candAi.humor_style);
  if (myH && candH && HUMOR_STYLE_MATRIX[myH]?.[candH] !== undefined) {
    const v = HUMOR_STYLE_MATRIX[myH][candH];
    total += v;
    if (v >= 2) agreements++;
  }

  const myC = asString(myAi.communication_style);
  const candC = asString(candAi.communication_style);
  if (myC && candC && COMM_STYLE_MATRIX[myC]?.[candC] !== undefined) {
    const v = COMM_STYLE_MATRIX[myC][candC];
    total += v;
    if (v >= 2) agreements++;
  }

  // key_values: case-insensitive token overlap, capped at +3.
  const myKV = asStringArray(myAi.key_values).map(s => s.toLowerCase().trim()).filter(Boolean);
  const candKVSet = new Set(asStringArray(candAi.key_values).map(s => s.toLowerCase().trim()).filter(Boolean));
  if (myKV.length > 0 && candKVSet.size > 0) {
    let overlap = 0;
    for (const v of myKV) if (candKVSet.has(v)) overlap++;
    if (overlap > 0) {
      const v = Math.min(3, overlap);
      total += v;
      if (overlap >= 2) agreements++;
    }
  }

  const capped = Math.max(-8, Math.min(8, total));
  const strong = agreements >= 2 && capped >= 4;
  return { score: capped, strong };
}

// ---------------------------------------------------------------------------
// Main scorer (port of calculateCompatibility, breakdown emission removed)
// ---------------------------------------------------------------------------

function calculateCompatibility(
  myProfile: Record<string, unknown>,
  myAnswers: Record<string, unknown>,
  myAi: Record<string, unknown> | null,
  candidateProfile: Record<string, unknown>,
  candidateAnswers: Record<string, unknown>,
  candidateAi: Record<string, unknown> | null,
  depth: 'fast' | 'deep',
): { score: number; reasons: string[] } {
  let fastScore = 0;
  let deepScore = 0;
  const reasons: string[] = [];

  // 1. Intent & Pace (20 pts)
  const intentScore = intentCompatibility(myAnswers.intent_type, candidateAnswers.intent_type);
  const paceScore = paceCompatibility(myAnswers.relationship_pace, candidateAnswers.relationship_pace);
  const intentPaceScore = intentScore + paceScore;
  if (intentPaceScore >= 10) reasons.push('יש לכם כוונות וקצב היכרות דומים');
  fastScore += intentPaceScore;

  // 2. Communication & Style (7 pts — conflict_style is the only V2-collected
  //    input. conversation_style and compromise_area were dropped from V2.)
  let commScore = 0;
  if (bothMeaningfulAndEqual(myAnswers.conflict_style, candidateAnswers.conflict_style)) commScore += 7;
  if (commScore >= 7) reasons.push('סגנון התקשורת והשיחה שלכם דומה');
  fastScore += commScore;

  // 3. Interests & Region/City
  const myHobbies = (myProfile.hobbies || myAnswers.hobbies) as unknown;
  const candHobbies = (candidateProfile.hobbies || candidateAnswers.hobbies) as unknown;
  const hobbyOverlap = countOverlap(myHobbies, candHobbies);
  const interestScore = Math.min(15, hobbyOverlap * 3);
  const regionScore = scoreRegionCompatibility(
    asString(myProfile.region),
    asString(candidateProfile.region),
  );

  const priorityMatches =
    countOverlap(myAnswers.shared_hobbies_priority, candHobbies) +
    countOverlap(candidateAnswers.shared_hobbies_priority, myHobbies);
  const sharedPriorityScore = Math.min(5, priorityMatches);

  const myCity = normalizeCity(myProfile.campus);
  const candCity = normalizeCity(candidateProfile.campus);
  const cityScore = myCity && myCity === candCity ? 3 : 0;

  if (hobbyOverlap >= 2 || sharedPriorityScore >= 3) reasons.push('יש חפיפה בתחומי העניין');
  if (regionScore >= 7 || cityScore >= 3) reasons.push('יש לכם קרבה גיאוגרפית נוחה');
  fastScore += (interestScore + regionScore + sharedPriorityScore + cityScore);

  // 4. Age Range Compatibility (10 pts)
  const ageScore = scoreAgeCompatibility(
    myAnswers,
    (myProfile.birth_year as number | null) ?? null,
    candidateAnswers,
    (candidateProfile.birth_year as number | null) ?? null,
  );
  if (ageScore >= 10) reasons.push('שניכם בטווח הגילאים המועדף');
  fastScore += ageScore;

  // 5. Preferences (10 pts — preferred_first_date is the only V2-collected
  //    input. respect_priority and interest_signals were dropped from V2.)
  let prefScore = 0;
  if (bothMeaningfulAndEqual(myAnswers.preferred_first_date, candidateAnswers.preferred_first_date)) prefScore += 10;
  if (prefScore >= 10) reasons.push('יש לכם העדפות דומות לחיבור ראשוני');
  fastScore += prefScore;

  // 6. Studies (max ~16 pts)
  let studyScore = 0;
  const myMatchPrefs = asStringArray(myAnswers.match_preferences);
  const candMatchPrefs = asStringArray(candidateAnswers.match_preferences);
  const myUni = asString(myProfile.university);
  const candUni = asString(candidateProfile.university);
  if (myUni && myUni === candUni) {
    studyScore += 5;
    if (myMatchPrefs.includes('same_university') || candMatchPrefs.includes('same_university')) {
      studyScore += 3;
    }
  }
  const myFac = asString(myProfile.faculty);
  const candFac = asString(candidateProfile.faculty);
  if (myFac && myFac === candFac) {
    studyScore += 5;
    if (myMatchPrefs.includes('same_faculty') || candMatchPrefs.includes('same_faculty')) {
      studyScore += 3;
    }
  }
  if (myProfile.year_of_study && myProfile.year_of_study === candidateProfile.year_of_study) {
    studyScore += 3;
  }
  if (studyScore >= 5) reasons.push('יש התאמה ברקע הלימודי');
  fastScore += studyScore;

  // 6b. Religion (max 8 pts)
  let religionScore = 0;
  const myType = asString(myAnswers.religion_type);
  const candType = asString(candidateAnswers.religion_type);
  if (
    myType && candType &&
    myType !== 'prefer_not_to_say' && candType !== 'prefer_not_to_say' &&
    myType === candType
  ) {
    religionScore += 5;
  }
  const myLevel = asString(myAnswers.religion);
  const candLevel = asString(candidateAnswers.religion);
  if (myLevel && candLevel) {
    if (myLevel === candLevel) {
      religionScore += 3;
    } else {
      const LEVEL_ORDER = ['secular', 'traditional', 'religious_national', 'religious', 'haredi'];
      const i = LEVEL_ORDER.indexOf(myLevel);
      const j = LEVEL_ORDER.indexOf(candLevel);
      if (i >= 0 && j >= 0 && Math.abs(i - j) === 1) religionScore += 1;
    }
  }
  if (religionScore >= 5) reasons.push('יש התאמה באורח החיים הדתי');
  fastScore += religionScore;

  // 7. Deep Factors (max 50 pts, capped)
  if (depth === 'deep') {
    let legacyDeepSum = 0;
    if (bothMeaningfulAndEqual(myAnswers.spontaneity, candidateAnswers.spontaneity)) legacyDeepSum += 2.5;
    if (bothMeaningfulAndEqual(myAnswers.elevatorScenario, candidateAnswers.elevatorScenario)) legacyDeepSum += 2.5;
    if (bothMeaningfulAndEqual(myAnswers.karaokeChance, candidateAnswers.karaokeChance)) legacyDeepSum += 2.5;
    if (bothMeaningfulAndEqual(myAnswers.familiarFace, candidateAnswers.familiarFace)) legacyDeepSum += 2.5;
    // money_style and the singular love_language were dropped from V2; the
    // love_languages array overlap is scored below as loveLangScore.
    if (bothMeaningfulAndEqual(myAnswers.perfect_date, candidateAnswers.perfect_date)) legacyDeepSum += 5;
    if (bothMeaningfulAndEqual(myAnswers.similarity_preference, candidateAnswers.similarity_preference)) legacyDeepSum += 5;

    const myTraits = deriveTraits(myAnswers);
    const candidateTraits = deriveTraits(candidateAnswers);
    const TRAITS_TO_SCORE: TraitName[] = [
      'social_confidence', 'social_initiative', 'openness_to_new_people',
      'spontaneity_level', 'communication_directness', 'conflict_engagement',
      'emotional_pace', 'relationship_stability_preference', 'independence_need',
      'warmth_affection', 'humor_playfulness', 'family_orientation',
    ];
    let traitClosenessSum = 0;
    for (const t of TRAITS_TO_SCORE) {
      traitClosenessSum += traitCloseness(myTraits[t], candidateTraits[t]);
    }
    const traitClosenessScore = Math.round(traitClosenessSum * 10) / 10;

    const topValuesOverlap = countOverlap(myAnswers.relationship_top_values, candidateAnswers.relationship_top_values);
    const topValuesScore = Math.min(6, topValuesOverlap * 2);
    if (topValuesScore >= 4) reasons.push('יש ביניכם התאמה בערכים זוגיים');

    const strengthsScore = Math.min(4, countOverlap(myAnswers.relationship_strengths, candidateAnswers.relationship_strengths));
    const shouldFeelScore = Math.min(3, countOverlap(myAnswers.partner_should_feel, candidateAnswers.partner_should_feel));
    const loveLangScore = Math.min(3, countOverlap(myAnswers.love_languages, candidateAnswers.love_languages));

    const myCommMin = minTraitScore(myTraits.communication_directness, myTraits.conflict_engagement);
    const candCommMin = minTraitScore(candidateTraits.communication_directness, candidateTraits.conflict_engagement);
    if (myCommMin !== null && candCommMin !== null && Math.abs(myCommMin - candCommMin) <= 1) {
      reasons.push('סגנון התקשורת שלכם יכול להשתלב טוב');
    }

    const sponClose = traitCloseness(myTraits.spontaneity_level, candidateTraits.spontaneity_level);
    const socClose = traitCloseness(myTraits.social_confidence, candidateTraits.social_confidence);
    if (sponClose >= 0.75 && socClose >= 0.75) {
      reasons.push('יש לכם וייב דומה בספונטניות ובחברתיות');
    }

    // about_me and relationship_strengths_text are not collected in V2 —
    // both bonuses were always 0 in the new flow. PR 2 will introduce
    // analyze-user-traits consumption of the real V2 free-text fields
    // (partner_should_know_text, conversation_starter, green_flag).

    const totalDeepBeforeCap =
      legacyDeepSum + traitClosenessScore + topValuesScore +
      strengthsScore + shouldFeelScore + loveLangScore;

    if (totalDeepBeforeCap >= 25) reasons.push('יש גם התאמה בשאלות העומק');
    deepScore = Math.min(50, totalDeepBeforeCap);
  }

  // Final score
  let finalScore = 0;
  if (depth === 'deep') {
    finalScore = (fastScore * 0.6) + deepScore;
  } else {
    finalScore = fastScore;
  }

  // 8. Height soft preference ('important' tier only). Flat -8 if either
  //    side's threshold is missed; -8 still if both sides' thresholds are
  //    missed (cap is deliberate, not additive). must_have is hard-
  //    filtered in rankCandidates, so candidates that reach here either
  //    passed the threshold or both sides lack must_have. Kept separate
  //    from the trait-penalty -25 pool.
  finalScore = finalScore + heightSoftPenalty(myProfile, candidateProfile);

  // 9. AI traits soft complement (capped ±8). Silent zero when either
  //    side lacks a profile_ai_traits row — fast users and deep users
  //    with insufficient free text both land here without breakage. A
  //    user-facing reason is pushed only when the agreement is strong
  //    (≥2 dimensions strongly aligned AND capped score ≥+4).
  const aiContribution = aiTraitContribution(myAi, candidateAi);
  finalScore = finalScore + aiContribution.score;
  if (aiContribution.strong) reasons.push('וייב דומה גם בהומור וערכים');

  // Trait-based penalties (rule-based, closed-answer only)
  const { penalty, caveatReason } = calculatePenalties(myAnswers, candidateAnswers);
  finalScore = finalScore + penalty;

  // Final cleanup
  finalScore = Math.round(Math.max(40, Math.min(100, finalScore)));

  if (reasons.length === 0) {
    reasons.push('התאמה כללית טובה');
  }

  // Deduplicate; reserve room for a caveat if one fired.
  const positiveReasons = Array.from(new Set(reasons)).slice(0, caveatReason ? 2 : 3);
  if (caveatReason) positiveReasons.push(caveatReason);

  return { score: finalScore, reasons: positiveReasons };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CandidateInput {
  id: string;
  profile: Record<string, unknown>;
  answers: Record<string, unknown>;
  // Optional LLM-derived traits (public.profile_ai_traits.traits).
  // Null/undefined when the user is a fast onboarding user or a deep
  // user with insufficient free text. aiTraitContribution returns 0
  // silently in that case.
  aiTraits?: Record<string, unknown> | null;
}

export interface ScoredCandidate {
  candidateId: string;
  score: number;
  reasons: string[];
  depth: 'fast' | 'deep';
}

/**
 * Apply hard filters, score every passing candidate, and return the
 * sorted list (highest score first). Pure: no I/O, no Supabase, no
 * logging.
 *
 * Tie-breaking: `Array.prototype.sort` is stable in V8 / Deno, so
 * candidates with identical scores keep their input order — matching
 * the prior "first encountered wins" behavior of pickBestCandidate.
 *
 * The caller is responsible for any further filtering (no-rematch,
 * monthly cap, active match) — those require DB context and belong in
 * the Edge Function orchestrator.
 */
export function rankCandidates(
  callerProfile: Record<string, unknown>,
  callerAnswers: Record<string, unknown>,
  callerAiTraits: Record<string, unknown> | null,
  candidates: CandidateInput[],
): ScoredCandidate[] {
  const myGender = asString(callerProfile.gender);
  const myInterestedIn = asStringArray(callerProfile.interested_in_genders);
  const myHeightPref = asString(callerProfile.height_preference_importance) || 'none';
  const myMinHeight = typeof callerProfile.min_preferred_height_cm === 'number'
    ? callerProfile.min_preferred_height_cm
    : 0;
  const myHeight = typeof callerProfile.height_cm === 'number' ? callerProfile.height_cm : 0;
  const myMode = asString(callerProfile.onboarding_mode);

  const scored: ScoredCandidate[] = [];

  for (const c of candidates) {
    const candGender = asString(c.profile.gender);
    const candInterestedIn = asStringArray(c.profile.interested_in_genders);

    // Hard filter: gender bi-directional
    const iAmInterested = myInterestedIn.includes(candGender) || myInterestedIn.includes('any');
    const theyAreInterested = candInterestedIn.includes(myGender) || candInterestedIn.includes('any');
    if (!iAmInterested || !theyAreInterested) continue;

    // Hard filter: height must_have bi-directional
    const candHeight = typeof c.profile.height_cm === 'number' ? c.profile.height_cm : 0;
    const candHeightPref = asString(c.profile.height_preference_importance) || 'none';
    const candMinHeight = typeof c.profile.min_preferred_height_cm === 'number'
      ? c.profile.min_preferred_height_cm
      : 0;
    if (myHeightPref === 'must_have' && candHeight > 0 && candHeight < myMinHeight) continue;
    if (candHeightPref === 'must_have' && myHeight > 0 && myHeight < candMinHeight) continue;

    const candMode = asString(c.profile.onboarding_mode);
    const depth: 'fast' | 'deep' = (myMode === 'deep' && candMode === 'deep') ? 'deep' : 'fast';

    const { score, reasons } = calculateCompatibility(
      callerProfile,
      callerAnswers,
      callerAiTraits,
      c.profile,
      c.answers,
      c.aiTraits ?? null,
      depth,
    );

    scored.push({ candidateId: c.id, score, reasons, depth });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Convenience wrapper preserved for callers that only need the top
 * winner. Delegates to rankCandidates so the scoring/hard-filter
 * behavior stays bit-identical between the two entry points.
 */
export function pickBestCandidate(
  callerProfile: Record<string, unknown>,
  callerAnswers: Record<string, unknown>,
  candidates: CandidateInput[],
): ScoredCandidate | null {
  // Backwards-compat wrapper: no AI traits. Use rankCandidates directly
  // from index.ts when AI traits are available.
  const ranked = rankCandidates(callerProfile, callerAnswers, null, candidates);
  return ranked.length > 0 ? ranked[0] : null;
}
