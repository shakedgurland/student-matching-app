// supabase/functions/match-create/scoring.ts
//
// Port of lib/matching.ts scoring helpers for Deno (Supabase Edge Functions).
//
// Scope: PURE FUNCTIONS only. No Supabase calls, no I/O. The function
// exposes a single orchestrator `pickBestCandidate(callerProfile,
// callerAnswers, candidates)` that:
//   1. Applies hard filters (gender bi-directional, height must_have).
//   2. Computes the compatibility score for each passing candidate.
//   3. Returns the highest-scored candidate, or null if none qualify.
//
// What is intentionally NOT ported here:
//   • findAndCreateBestMatch — orchestration (auth, DB reads, RPC call)
//     belongs to index.ts.
//   • The dev-only ScoreBreakdown emission gated by __DEV__ in matching.ts
//     — debug-only; we don't return it from the Edge Function.
//
// Sync source: lib/matching.ts. If the client-side scoring changes,
// mirror the change here.

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
// Main scorer (port of calculateCompatibility, breakdown emission removed)
// ---------------------------------------------------------------------------

function calculateCompatibility(
  myProfile: Record<string, unknown>,
  myAnswers: Record<string, unknown>,
  candidateProfile: Record<string, unknown>,
  candidateAnswers: Record<string, unknown>,
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

  // 2. Communication & Style (20 pts)
  let commScore = 0;
  if (bothMeaningfulAndEqual(myAnswers.conflict_style, candidateAnswers.conflict_style)) commScore += 7;
  if (bothMeaningfulAndEqual(myAnswers.conversation_style, candidateAnswers.conversation_style)) commScore += 7;
  if (bothMeaningfulAndEqual(myAnswers.compromise_area, candidateAnswers.compromise_area)) commScore += 6;
  if (commScore >= 13) reasons.push('סגנון התקשורת והשיחה שלכם דומה');
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

  // 5. Preferences (20 pts)
  let prefScore = 0;
  if (bothMeaningfulAndEqual(myAnswers.preferred_first_date, candidateAnswers.preferred_first_date)) prefScore += 10;
  if (bothMeaningfulAndEqual(myAnswers.respect_priority, candidateAnswers.respect_priority)) prefScore += 5;
  if (bothMeaningfulAndEqual(myAnswers.interest_signals, candidateAnswers.interest_signals)) prefScore += 5;
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
    if (bothMeaningfulAndEqual(myAnswers.money_style, candidateAnswers.money_style)) legacyDeepSum += 5;
    if (bothMeaningfulAndEqual(myAnswers.love_language, candidateAnswers.love_language)) legacyDeepSum += 5;
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

    let freeTextBonus = 0;
    if (hasMeaningfulAnswer(myAnswers.about_me) && hasMeaningfulAnswer(candidateAnswers.about_me)) freeTextBonus += 1;
    if (hasMeaningfulAnswer(myAnswers.relationship_strengths_text) && hasMeaningfulAnswer(candidateAnswers.relationship_strengths_text)) freeTextBonus += 1;

    const totalDeepBeforeCap =
      legacyDeepSum + traitClosenessScore + topValuesScore +
      strengthsScore + shouldFeelScore + loveLangScore + freeTextBonus;

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
      c.profile,
      c.answers,
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
  const ranked = rankCandidates(callerProfile, callerAnswers, candidates);
  return ranked.length > 0 ? ranked[0] : null;
}
