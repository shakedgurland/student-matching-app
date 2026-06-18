import { supabase } from './supabase';
import { deriveTraits, derivePreferences, type DerivedTraits, type DerivedPreferences } from './matching-traits';

// Returns true when the value is something the user actually picked
// (non-empty string, non-empty array, finite number, boolean). Used to
// prevent two users with default/empty answers from being treated as
// "equal" by the equality scorer, which would otherwise grant free
// compatibility points for fields neither user actually answered.
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

export interface MatchResult {
  matchId: string;
  candidateProfile: any;
  compatibilityScore: number;
  compatibilityReasons: string[];
  depth: 'fast' | 'deep';
}

export async function findAndCreateBestMatch(currentUserId: string): Promise<MatchResult | null | { status: 'incomplete_profile' }> {
  // 1. Fetch current user profile and answers
  const { data: currentProfile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUserId)
    .single();

  if (profileError || !currentProfile) {
    console.error('Matching Error: Could not fetch current profile', profileError);
    return null;
  }

  // Safety: If onboarding not completed, don't match
  if (!currentProfile.onboarding_completed) {
    return { status: 'incomplete_profile' };
  }

  const { data: currentAnswersData, error: answersError } = await supabase
    .from('questionnaire_answers')
    .select('answers')
    .eq('user_id', currentUserId)
    .single();

  if (answersError || !currentAnswersData) {
    console.error('Matching Error: Could not fetch current answers', answersError);
    return null;
  }

  const currentAnswers = currentAnswersData.answers;

  // Validate required hard filter fields exist
  const myGender = currentProfile.gender;
  const myInterestedIn = currentProfile.interested_in_genders || [];

  if (!myGender || !myInterestedIn || myInterestedIn.length === 0) {
    return { status: 'incomplete_profile' };
  }

  // 2. Fetch candidates (onboarded, not self)
  let query = supabase
    .from('profiles')
    .select(`
      *,
      questionnaire_answers!inner(answers)
    `)
    .neq('id', currentUserId)
    .eq('onboarding_completed', true);

  const { data: candidates, error: candidatesError } = await query;

  if (candidatesError || !candidates || candidates.length === 0) {
    console.log('No candidates found matching basic filters.');
    return null;
  }

  // 3. Fetch existing matches to exclude them
  const { data: existingMatches, error: matchesError } = await supabase
    .from('matches')
    .select('user_a_id, user_b_id')
    .or(`user_a_id.eq.${currentUserId},user_b_id.eq.${currentUserId}`);

  const excludeIds = new Set<string>();
  if (existingMatches) {
    existingMatches.forEach(m => {
      excludeIds.add(m.user_a_id === currentUserId ? m.user_b_id : m.user_a_id);
    });
  }

  // 4. Hard Filters & Scoring
  let bestCandidate = null;
  let highestScore = -1;
  let bestReasons: string[] = [];
  let bestDepth: 'fast' | 'deep' = 'fast';

  for (const candidate of candidates) {
    if (excludeIds.has(candidate.id)) continue;

    const candidateAnswers = candidate.questionnaire_answers?.[0]?.answers || candidate.questionnaire_answers?.answers;
    if (!candidateAnswers) continue;

    // Hard Filter: Gender Compatibility (Bidirectional)
    const candidateGender = candidate.gender;
    const candidateInterestedIn = candidate.interested_in_genders || [];

    const iAmInterested = myInterestedIn.includes(candidateGender) || myInterestedIn.includes('any');
    const theyAreInterested = candidateInterestedIn.includes(myGender) || candidateInterestedIn.includes('any');
    if (!iAmInterested || !theyAreInterested) continue;

    // Hard Filter: Height Compatibility (Bidirectional for 'must_have')
    const myHeightPref = currentProfile.height_preference_importance || 'none';
    const myMinHeight = currentProfile.min_preferred_height_cm || 0;
    const myHeight = currentProfile.height_cm || 0;
    
    const candidateHeight = candidate.height_cm || 0;
    const candidateHeightPref = candidate.height_preference_importance || 'none';
    const candidateMinHeight = candidate.min_preferred_height_cm || 0;

    if (myHeightPref === 'must_have' && candidateHeight > 0 && candidateHeight < myMinHeight) continue;
    if (candidateHeightPref === 'must_have' && myHeight > 0 && myHeight < candidateMinHeight) continue;

    // Determine Matching Depth
    const depth: 'fast' | 'deep' = (currentProfile.onboarding_mode === 'deep' && candidate.onboarding_mode === 'deep') ? 'deep' : 'fast';

    // Calculate Score
    const { score, reasons } = calculateCompatibility(currentProfile, currentAnswers, candidate, candidateAnswers, depth);

    if (score > highestScore) {
      highestScore = score;
      bestCandidate = candidate;
      bestReasons = reasons;
      bestDepth = depth;
    }
  }

  if (!bestCandidate) {
    console.log('No suitable match found after scoring.');
    return null;
  }

  // 5. Create Match in database
  const { data: newMatch, error: insertError } = await supabase
    .from('matches')
    .insert({
      user_a_id: currentUserId,
      user_b_id: bestCandidate.id,
      compatibility_score: highestScore,
      compatibility_reasons: bestReasons,
      status: 'active',
      metadata: { depth: bestDepth }
    })
    .select()
    .single();

  if (insertError) {
    console.error('Matching Error: Could not save match', insertError);
    return null;
  }

  return {
    matchId: newMatch.id,
    candidateProfile: bestCandidate,
    compatibilityScore: highestScore,
    compatibilityReasons: bestReasons,
    depth: bestDepth
  };
}

// ----------------------------------------------------------------------
// Scoring Logic Helpers
// ----------------------------------------------------------------------

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

function scoreAgeCompatibility(myAnswers: any, myBirthYear: number | null, candidateAnswers: any, candidateBirthYear: number | null): number {
  const getAge = (birthYear: number | null) => birthYear ? new Date().getFullYear() - birthYear : null;
  
  const myAge = getAge(myBirthYear) || parseInt(myAnswers.age);
  const candidateAge = getAge(candidateBirthYear) || parseInt(candidateAnswers.age);

  if (!myAge || !candidateAge) return 0;

  const checkRange = (age: number, min: string, max: string) => {
    const minVal = parseInt(min) || 18;
    const maxVal = parseInt(max) || 45;
    return age >= minVal && age <= maxVal;
  };

  const candidateInMyRange = checkRange(candidateAge, myAnswers.preferred_age_min, myAnswers.preferred_age_max);
  const iAmInCandidateRange = checkRange(myAge, candidateAnswers.preferred_age_min, candidateAnswers.preferred_age_max);

  if (candidateInMyRange && iAmInCandidateRange) return 10;
  if (candidateInMyRange || iAmInCandidateRange) return 5;
  return 0;
}

// ----------------------------------------------------------------------
// Trait-based preference penalties (rule-based, closed-answer only)
// ----------------------------------------------------------------------
//
// Strategy: for each preference the user declared (partner_qualities,
// dealbreakers, religion_importance, religious_level_importance), check the
// CANDIDATE's derived traits and apply a penalty if there is a real gap.
// Penalties are bidirectional — A's preferences vs B's traits AND
// B's preferences vs A's traits — so the score is symmetric. Total penalty
// is capped at -25 to prevent stacking many weak signals into a rejection.
//
// Free-text fields (partner_should_know_text, conversation_starter,
// green_flag, *_other) are NOT interpreted here. They are deferred to a
// future AI / keyword-mapping commit.
//
// Caveat reasons surfaced in the match UI are derived from the CURRENT
// user's side only ("ייתכן פער ... לעומת מה שחיפשת"), never from the
// candidate's side, to avoid exposing what the other person flagged.

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

// Generic "did I want this quality but the candidate is below the bar?" check.
// trait < 3 → soft mismatch (-5); trait ≤ 2 → strong mismatch (-10).
// Returns null if there is no derived signal for the trait at all.
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
    // 'intelligence', 'honesty', 'physical_attraction', 'similar_values' — no
    // clear derived signal yet; skip per current scope.
    default:
      return null;
  }
}

function penaltyForDealbreaker(dealbreaker: string, candidateTraits: DerivedTraits): Penalty | null {
  // Dealbreakers are stronger signals — only fire on clearly-low values
  // (trait ≤ 2). Most apply -15; "no_independence" stays soft (-8) because
  // low independence_need can mean "togetherness-loving", not necessarily bad.
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
    // 'different_values' — defer (needs proper shared-values overlap helper).
    // 'smoking', 'excessive_jealousy', 'disrespect', 'no_attraction' — no
    // signal from closed answers; defer.
    // 'other' — TODO: handle via AI / keyword interpretation once enabled.
    default:
      return null;
  }
}

// Religion type (jewish/muslim/christian/druze/other/prefer_not_to_say).
// Fires only when both sides declared a concrete religion (no "prefer_not_to_say")
// AND they differ. Severity scales with religion_importance.
// NOT promoted to a hard filter in this commit — conservative.
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

// Religious lifestyle level (secular/traditional/religious_national/religious/haredi).
// Fires when the levels differ by 1+ steps AND the user marked the level
// compatibility important. Conservative: only -8 to -15 even at very_important.
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

// Collect every penalty implied by `prefs` against `candidateTraits` and
// `candidatePrefs`. Returns one Penalty per fired rule; caller sums + caps.
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
  myAnswers: any,
  candidateAnswers: any,
): { penalty: number; caveatReason: string | null } {
  const myTraits = deriveTraits(myAnswers);
  const candidateTraits = deriveTraits(candidateAnswers);
  const myPrefs = derivePreferences(myAnswers);
  const candidatePrefs = derivePreferences(candidateAnswers);

  const fromMyPrefs = collectPenalties(myPrefs, candidatePrefs, candidateTraits);
  const fromCandidatePrefs = collectPenalties(candidatePrefs, myPrefs, myTraits);

  // Caveat shown to the current user comes from MY side only (it should
  // read as "you wanted X, may be a gap" — not as "they wanted X, may be
  // a gap", which would expose the other person's preferences).
  let caveatReason: string | null = null;
  const strongestMine = fromMyPrefs
    .filter(p => p.severity === 'strong')
    .sort((a, b) => a.points - b.points)[0];
  if (strongestMine) caveatReason = strongestMine.caveat;

  const total = [...fromMyPrefs, ...fromCandidatePrefs].reduce((sum, p) => sum + p.points, 0);
  const penalty = Math.max(-25, total);

  return { penalty, caveatReason };
}

function calculateCompatibility(myProfile: any, myAnswers: any, candidateProfile: any, candidateAnswers: any, depth: 'fast' | 'deep') {
  let fastScore = 0;
  let deepScore = 0;
  const reasons: string[] = [];

  // Helper for array overlap
  const getOverlap = (arr1: any, arr2: any) => {
    if (!arr1 || !arr2 || !Array.isArray(arr1) || !Array.isArray(arr2)) return 0;
    return arr1.filter(item => arr2.includes(item)).length;
  };

  // 1. Intent & Pace (20 pts)
  let intentPaceScore = 0;
  if (bothMeaningfulAndEqual(myAnswers.intent_type, candidateAnswers.intent_type)) intentPaceScore += 10;
  if (bothMeaningfulAndEqual(myAnswers.relationship_pace, candidateAnswers.relationship_pace)) intentPaceScore += 10;
  if (intentPaceScore >= 10) reasons.push('יש לכם קצב היכרות וכוונות דומות');
  fastScore += intentPaceScore;

  // 2. Communication & Style (20 pts)
  // Note: conversation_style and compromise_area are no longer collected by the
  // V2 questionnaire (both stay as '' in formData). The guards below ensure
  // those equality checks no longer grant free points to V2-vs-V2 pairings.
  // conflict_style is V2-deep only — guard prevents fast-vs-fast inflation.
  let commScore = 0;
  if (bothMeaningfulAndEqual(myAnswers.conflict_style, candidateAnswers.conflict_style)) commScore += 7;
  if (bothMeaningfulAndEqual(myAnswers.conversation_style, candidateAnswers.conversation_style)) commScore += 7;
  if (bothMeaningfulAndEqual(myAnswers.compromise_area, candidateAnswers.compromise_area)) commScore += 6;
  if (commScore >= 13) reasons.push('סגנון התקשורת והשיחה שלכם דומה');
  fastScore += commScore;

  // 3. Interests & Region (15 + 10 = 25 pts)
  const hobbyOverlap = getOverlap(myProfile.hobbies || myAnswers.hobbies, candidateProfile.hobbies || candidateAnswers.hobbies);
  const interestScore = Math.min(15, hobbyOverlap * 3);
  const regionScore = scoreRegionCompatibility(myProfile.region, candidateProfile.region);
  
  if (hobbyOverlap >= 2) reasons.push('יש חפיפה בתחומי העניין');
  if (regionScore >= 7) reasons.push('יש לכם קרבה גיאוגרפית נוחה');
  fastScore += (interestScore + regionScore);

  // 4. Age Range Compatibility (10 pts)
  const ageScore = scoreAgeCompatibility(myAnswers, myProfile.birth_year, candidateAnswers, candidateProfile.birth_year);
  if (ageScore >= 10) reasons.push('שניכם בטווח הגילאים המועדף');
  fastScore += ageScore;

  // 5. Preferences (10 + 10 = 20 pts)
  // Note: respect_priority and interest_signals are no longer collected by the
  // V2 questionnaire. The guards ensure those equality checks no longer grant
  // free +5 points to V2-vs-V2 pairings.
  let prefScore = 0;
  if (bothMeaningfulAndEqual(myAnswers.preferred_first_date, candidateAnswers.preferred_first_date)) prefScore += 10;
  if (bothMeaningfulAndEqual(myAnswers.respect_priority, candidateAnswers.respect_priority)) prefScore += 5;
  if (bothMeaningfulAndEqual(myAnswers.interest_signals, candidateAnswers.interest_signals)) prefScore += 5;
  if (prefScore >= 10) reasons.push('יש לכם העדפות דומות לחיבור ראשוני');
  fastScore += prefScore;

  // 6. Degree Stage Small Bonus (5 pts)
  if (myProfile.year_of_study === candidateProfile.year_of_study && myProfile.year_of_study) {
    fastScore += 5;
  }

  // 7. Deep Factors (if applicable - 40 pts max)
  if (depth === 'deep') {
    // Social (10 pts)
    if (bothMeaningfulAndEqual(myAnswers.spontaneity, candidateAnswers.spontaneity)) deepScore += 2.5;
    if (bothMeaningfulAndEqual(myAnswers.elevatorScenario, candidateAnswers.elevatorScenario)) deepScore += 2.5;
    if (bothMeaningfulAndEqual(myAnswers.karaokeChance, candidateAnswers.karaokeChance)) deepScore += 2.5;
    if (bothMeaningfulAndEqual(myAnswers.familiarFace, candidateAnswers.familiarFace)) deepScore += 2.5;

    // Values (10 pts)
    // Note: money_style is no longer collected by V2. love_language stays '' for
    // V2 users (replaced by the love_languages array); the guard keeps both
    // checks from inflating V2-vs-V2 pairings.
    if (bothMeaningfulAndEqual(myAnswers.money_style, candidateAnswers.money_style)) deepScore += 5;
    if (bothMeaningfulAndEqual(myAnswers.love_language, candidateAnswers.love_language)) deepScore += 5;

    // Dating & Similar (10 pts)
    if (bothMeaningfulAndEqual(myAnswers.perfect_date, candidateAnswers.perfect_date)) deepScore += 5;
    if (bothMeaningfulAndEqual(myAnswers.similarity_preference, candidateAnswers.similarity_preference)) deepScore += 5;

    // Religion (5 pts)
    if (bothMeaningfulAndEqual(myAnswers.religion, candidateAnswers.religion)) deepScore += 5;
    // Tradition scoring removed: V2 no longer collects tradition_self_rating /
    // tradition_partner_importance, and the legacy formData defaulted both to 3.
    // A presence guard alone can't help because both users will have value 3
    // by default, so the old `|| 3` formula always returned diff = 0 and
    // granted everyone +5. Re-enable with proper guards if/when these fields
    // are reintroduced to the questionnaire.

    // Tiny completeness bonus (max 2 points, capped within 40 deep total).
    // These free-text fields are also not collected by V2, so the guards will
    // typically evaluate false for new users — that is the intended behaviour.
    if (hasMeaningfulAnswer(myAnswers.about_me) && hasMeaningfulAnswer(candidateAnswers.about_me)) {
      deepScore = Math.min(40, deepScore + 1);
    }
    if (hasMeaningfulAnswer(myAnswers.relationship_strengths_text) && hasMeaningfulAnswer(candidateAnswers.relationship_strengths_text)) {
      deepScore = Math.min(40, deepScore + 1);
    }

    if (deepScore >= 25) {
        reasons.push('יש גם התאמה בשאלות העומק');
        reasons.push('יש התאמה טובה בערכים ובגבולות');
    }
  }

  // Calculate Final Score
  let finalScore = 0;
  if (depth === 'deep') {
    // 60% Fast, 40% Deep
    finalScore = (fastScore * 0.6) + deepScore;
  } else {
    finalScore = fastScore;
  }

  // Apply trait-based penalties (rule-based, closed-answer only).
  // Bidirectional: my preferences vs candidate traits, and candidate
  // preferences vs my traits. Total cap at -25 lives inside calculatePenalties.
  // Free-text fields (partner_should_know_text, conversation_starter,
  // green_flag, *_other) are intentionally not interpreted in this commit.
  const { penalty, caveatReason } = calculatePenalties(myAnswers, candidateAnswers);
  finalScore += penalty;

  // Final Cleanup
  finalScore = Math.round(Math.max(40, Math.min(100, finalScore)));

  // Fallback reason if none triggered
  if (reasons.length === 0) {
    reasons.push('התאמה כללית טובה');
  }

  // Deduplicate positive reasons; reserve room for a caveat if one fired.
  // Caveat (gentle Hebrew phrasing) reflects only MY-side preferences and
  // never exposes raw trait names.
  const positiveReasons = Array.from(new Set(reasons)).slice(0, caveatReason ? 2 : 3);
  if (caveatReason) positiveReasons.push(caveatReason);

  return { score: finalScore, reasons: positiveReasons };
}
