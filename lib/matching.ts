import { supabase } from './supabase';

export interface Profile {
  id: string;
  username: string;
  gender: string;
  age: number;
  height: number;
  city: string;
  religiosity: string;
  intent: string;
  field_of_study: string;
  degree_type: string;
  study_year: string;
  interested_in: string;
  min_age: number;
  max_age: number;
  match_preferences: string[];
  hobbies: string[];
  shared_hobbies: string[];
  ideal_date: string;
  pace: string;
  availability: number;
  // Deep Q fields
  conflict_style?: string;
  problem_solving?: string;
  initiative_style?: string;
  attraction_reaction?: string;
  rel_values?: string[];
  love_languages?: string[];
  attraction_preference?: string;
  red_flags?: string[];
  strengths?: string[];
  personal_facts?: string[];
  partner_traits?: string[];
  space_preference?: string;
  chemistry_vs_longterm?: string;
  stability_vs_excitement?: string;
  partner_feelings?: string[];
}

/**
 * Scoring weights (total 100)
 */
const WEIGHTS = {
  INTENT: 25,
  RELIGIOSITY: 20,
  LOCATION: 10,
  DEEP_Q: 30,
  HOBBIES: 10,
  ACADEMIC: 5,
};

export async function findPotentialMatches(userId: string) {
  // 1. Get current user profile
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (userError || !user) throw new Error('Could not fetch user profile');

  // 2. Get already matched candidate IDs to exclude
  const { data: matchedData } = await supabase
    .from('user_matches')
    .select('candidate_id')
    .eq('user_id', userId);

  const matchedIds = matchedData?.map(m => m.candidate_id) || [];

  // 3. Query potential candidates with hard filters
  let query = supabase
    .from('profiles')
    .select('*')
    .neq('id', userId)
    .not('id', 'in', `(${[userId, ...matchedIds].join(',')})`)
    .gte('age', user.min_age || 18)
    .lte('age', user.max_age || 99);

  // Apply gender filter
  if (user.interested_in === 'גברים') {
    query = query.eq('gender', 'גבר');
  } else if (user.interested_in === 'נשים') {
    query = query.eq('gender', 'אישה');
  }

  const { data: candidates, error: candidatesError } = await query;

  if (candidatesError) throw candidatesError;

  // 4. Calculate scores for all candidates
  const scoredMatches = candidates.map(candidate => ({
    profile: candidate,
    score: calculateCompatibility(user, candidate),
  }));

  // 5. Sort by score descending
  return scoredMatches.sort((a, b) => b.score - a.score);
}

function calculateCompatibility(u: any, c: any): number {
  let score = 0;

  // --- Relationship Intent (25%) ---
  if (u.intent === c.intent) {
    score += WEIGHTS.INTENT;
  } else if (
    (u.intent === 'קשר לטווח ארוך' && c.intent === 'קשר קצר') ||
    (u.intent === 'קשר קצר' && u.intent === 'קשר לטווח ארוך')
  ) {
    score += 5; // Low compatibility
  } else {
    score += 15; // "Open minded" etc.
  }

  // --- Religiosity (20%) ---
  if (u.religiosity === c.religiosity) {
    score += WEIGHTS.RELIGIOSITY;
  } else {
    // Add logic for partial matches (e.g. Masorti and Dati)
    const religiousGap = Math.abs(getReligiosityLevel(u.religiosity) - getReligiosityLevel(c.religiosity));
    if (religiousGap === 1) score += 10;
  }

  // --- Location (10%) ---
  if (u.city === c.city) {
    score += WEIGHTS.LOCATION;
  } else if (u.match_preferences?.includes('מאותו אזור בארץ')) {
    // If it's a priority but cities differ, give 0 for this weight
  } else {
    score += 5; // Different cities but not a dealbreaker
  }

  // --- Academic (5%) ---
  if (u.field_of_study === c.field_of_study) score += 2.5;
  // Note: Institution check would usually happen by comparing the email domain
  score += 2.5; // placeholder for same institution

  // --- Hobbies (10%) ---
  const sharedHobbies = u.hobbies?.filter((h: string) => c.hobbies?.includes(h)) || [];
  if (sharedHobbies.length > 0) {
    score += Math.min(WEIGHTS.HOBBIES, sharedHobbies.length * 3);
  }

  // --- Deep Questionnaire (30%) ---
  let deepScore = 0;
  const deepQuestions = [
    u.conflict_style === c.conflict_style,
    u.problem_solving === c.problem_solving,
    u.initiative_style === c.initiative_style,
    u.space_preference === c.space_preference,
    u.chemistry_vs_longterm === c.chemistry_vs_longterm,
    u.stability_vs_excitement === c.stability_vs_excitement,
  ];

  const matchedDeep = deepQuestions.filter(q => q === true).length;
  deepScore += (matchedDeep / deepQuestions.length) * 15;

  // Shared values/traits overlap
  const sharedValues = u.rel_values?.filter((v: string) => c.rel_values?.includes(v)) || [];
  deepScore += Math.min(7.5, sharedValues.length * 2.5);

  const sharedPartnerTraits = u.partner_traits?.filter((t: string) => c.partner_traits?.includes(t)) || [];
  deepScore += Math.min(7.5, sharedPartnerTraits.length * 2.5);

  score += deepScore;

  return Math.round(score);
}

function getReligiosityLevel(level: string): number {
  const levels: Record<string, number> = {
    'חילוני/ת': 1,
    'מסורתי/ת': 2,
    'דתי/ה לאומי/ת': 3,
    'דתי/ה': 4,
    'חרדי/ת': 5,
  };
  return levels[level] || 0;
}

export async function recordMatch(userId: string, candidateId: string, score: number, status: 'shown' | 'active' | 'rejected') {
  return supabase.from('user_matches').upsert({
    user_id: userId,
    candidate_id: candidateId,
    score,
    status,
    updated_at: new Date(),
  });
}
