import { supabase } from './supabase';

export interface MatchResult {
  matchId: string;
  candidateProfile: any;
  compatibilityScore: number;
  compatibilityReasons: string[];
}

export async function findAndCreateBestMatch(currentUserId: string): Promise<MatchResult | null> {
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
  const myGender = currentProfile.gender || currentAnswers.gender;
  const myInterestedIn = currentProfile.interested_in_genders || currentAnswers.interestedInGenders || [];

  if (!myGender || !myInterestedIn || myInterestedIn.length === 0) {
    console.error('Matching Error: Missing mandatory gender or interest fields for current user');
    return null;
  }

  // 2. Fetch candidates (onboarded, not self)
  // We use contains for interested_in_genders so candidate is interested in current user's gender
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

  for (const candidate of candidates) {
    if (excludeIds.has(candidate.id)) continue;

    const candidateAnswers = candidate.questionnaire_answers?.[0]?.answers || candidate.questionnaire_answers?.answers;
    if (!candidateAnswers) continue;

    const candidateGender = candidate.gender || candidateAnswers.gender;
    const candidateInterestedIn = candidate.interested_in_genders || candidateAnswers.interestedInGenders || [];

    // Hard Filter: Gender Compatibility (Bidirectional)
    if (!myInterestedIn.includes(candidateGender) && !myInterestedIn.includes('any')) continue;
    if (!candidateInterestedIn.includes(myGender) && !candidateInterestedIn.includes('any')) continue;

    // Hard Filter: Height Compatibility (Bidirectional for 'must_have')
    const myHeightPref = currentProfile.height_preference_importance || currentAnswers.heightPreferenceImportance || 'none';
    const myMinHeight = currentProfile.min_preferred_height_cm || parseInt(currentAnswers.minPreferredHeightCm) || 0;
    
    const candidateHeight = candidate.height_cm || parseInt(candidateAnswers.heightCm) || 0;
    const candidateHeightPref = candidate.height_preference_importance || candidateAnswers.heightPreferenceImportance || 'none';
    const candidateMinHeight = candidate.min_preferred_height_cm || parseInt(candidateAnswers.minPreferredHeightCm) || 0;

    // Disqualify if I have a must_have and candidate is too short
    if (myHeightPref === 'must_have' && candidateHeight > 0 && candidateHeight < myMinHeight) {
      continue;
    }

    // Disqualify if candidate has a must_have and I am too short
    if (candidateHeightPref === 'must_have' && currentProfile.height_cm > 0 && currentProfile.height_cm < candidateMinHeight) {
      continue;
    }

    // Calculate Score
    const { score, reasons } = calculateCompatibility(currentProfile, currentAnswers, candidate, candidateAnswers);

    if (score > highestScore) {
      highestScore = score;
      bestCandidate = candidate;
      bestReasons = reasons;
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
      user_a_id: currentUserId, // We don't need to sort IDs due to migration 002 update
      user_b_id: bestCandidate.id,
      compatibility_score: highestScore,
      compatibility_reasons: bestReasons,
      status: 'active'
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
    compatibilityReasons: bestReasons
  };
}

// ----------------------------------------------------------------------
// Scoring Logic
// ----------------------------------------------------------------------

function calculateCompatibility(myProfile: any, myAnswers: any, candidateProfile: any, candidateAnswers: any) {
  let score = 0;
  const reasons: string[] = [];

  // Helper for array overlap
  const getOverlap = (arr1: string[], arr2: string[]) => {
    if (!arr1 || !arr2 || !Array.isArray(arr1) || !Array.isArray(arr2)) return 0;
    return arr1.filter(item => arr2.includes(item)).length;
  };

  // 1. Connection Intent & Depth (20 points max)
  let intentScore = 0;
  if (myAnswers.connectionDepth === candidateAnswers.connectionDepth) {
    intentScore += 10;
    reasons.push('שניכם מחפשים סוג חיבור דומה');
  }
  const intentOverlap = getOverlap(myAnswers.intent, candidateAnswers.intent);
  if (intentOverlap > 0) {
    intentScore += Math.min(10, intentOverlap * 4);
    if (intentOverlap >= 2) reasons.push('מטרות משותפות ב-UniMatch');
  }
  score += intentScore;

  // 2. Values & Priorities (20 points max)
  const valuesOverlap = getOverlap(myAnswers.importantInPartner, candidateAnswers.importantInPartner);
  if (valuesOverlap > 0) {
    score += Math.min(20, valuesOverlap * 5);
    if (valuesOverlap >= 2) reasons.push('חולקים ערכים דומים בקשר');
  }

  // 3. Communication Style & Care Language (15 points max)
  let commScore = 0;
  if (myAnswers.communicationStyle === candidateAnswers.communicationStyle) {
    commScore += 8;
    reasons.push('סגנון תקשורת תואם');
  }
  const careOverlap = getOverlap(myAnswers.careLanguage, candidateAnswers.careLanguage);
  if (careOverlap > 0) {
    commScore += Math.min(7, careOverlap * 3);
  }
  score += commScore;

  // 4. Social Energy (15 points max)
  let socialScore = 0;
  if (myAnswers.spontaneity === candidateAnswers.spontaneity) socialScore += 5;
  if (myAnswers.elevatorScenario === candidateAnswers.elevatorScenario) socialScore += 5;
  if (myAnswers.karaokeChance === candidateAnswers.karaokeChance) socialScore += 5;
  
  if (socialScore >= 10) {
    reasons.push('רמת אנרגיה חברתית דומה');
  }
  score += socialScore;

  // 5. Campus / Academic Background (10 points max)
  let academicScore = 0;
  if (myProfile.university === candidateProfile.university && myProfile.university) {
    academicScore += 4;
    reasons.push(`לומדים באותה אוניברסיטה`);
  }
  if (myProfile.campus === candidateProfile.campus && myProfile.campus) {
    academicScore += 3;
  }
  // If user strongly prefers same faculty (4 or 5)
  if (myAnswers.sameFacultyImportance >= 4 && myProfile.faculty === candidateProfile.faculty) {
    academicScore += 3;
    reasons.push('לומדים באותה פקולטה כפי שהעדפת');
  }
  score += academicScore;

  // 6. Meeting Preferences (10 points max)
  let comfortScore = 0;
  if (myAnswers.meetingStyle === candidateAnswers.meetingStyle) {
    comfortScore += 5;
    reasons.push('מעדיפים אותו סגנון מפגש ראשון');
  }
  const comfortOverlap = getOverlap(myAnswers.comfortNeeds, candidateAnswers.comfortNeeds);
  if (comfortOverlap > 0) {
    comfortScore += Math.min(5, comfortOverlap * 2);
  }
  score += comfortScore;

  // 6.5 Height Preference Bonus (up to 5 points)
  const myHeightPref = myProfile.height_preference_importance || myAnswers.heightPreferenceImportance || 'none';
  const myMinHeight = myProfile.min_preferred_height_cm || parseInt(myAnswers.minPreferredHeightCm) || 0;
  const candidateHeight = candidateProfile.height_cm || parseInt(candidateAnswers.heightCm) || 0;

  if (myHeightPref === 'nice_to_have' && candidateHeight > 0 && candidateHeight >= myMinHeight) {
    score += 5;
    reasons.push('עונה על העדפת הגובה שלך');
  }

  // 7. Dealbreakers Penalty
  // Basic implementation: if candidate's comfort needs conflict with dealbreakers
  const dealbreakerOverlap = getOverlap(myAnswers.dealbreakers, candidateAnswers.comfortNeeds);
  if (dealbreakerOverlap > 0) {
    score -= (dealbreakerOverlap * 10);
  }

  // Cap Score
  score = Math.max(0, Math.min(100, score));

  // Base random minimum score for UI polish if they passed hard filters but answered very differently
  if (score < 40) score = 40 + Math.floor(Math.random() * 20);

  // Fallback reason if none triggered
  if (reasons.length === 0) {
    reasons.push('התאמה כללית טובה');
  }

  // Deduplicate and slice reasons
  const uniqueReasons = Array.from(new Set(reasons)).slice(0, 3);

  return { score: Math.round(score), reasons: uniqueReasons };
}
