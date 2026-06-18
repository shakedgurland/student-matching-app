// supabase/functions/match-create/traits.ts
//
// Port of lib/matching-traits.ts for Deno (Supabase Edge Functions).
// Rule-based interpretation layer for V2 questionnaire answers.
//
// This module turns raw closed-choice answers into product-neutral traits
// on a 1–5 scale (1 = low, 3 = neutral, 5 = high). Free-text fields
// (partner_should_know_text, conversation_starter, green_flag, *_other)
// are intentionally NOT interpreted here.
//
// Pure functions only. No I/O, no side effects, no Supabase / DB imports.
//
// Sync source: lib/matching-traits.ts. If you change one, mirror the
// other. A future commit will collapse them into a shared module.

export type TraitName =
  | 'social_confidence'
  | 'social_initiative'
  | 'openness_to_new_people'
  | 'spontaneity_level'
  | 'communication_directness'
  | 'conflict_engagement'
  | 'emotional_pace'
  | 'relationship_intent_seriousness'
  | 'relationship_stability_preference'
  | 'independence_need'
  | 'warmth_affection'
  | 'ambition_career_focus'
  | 'humor_playfulness'
  | 'family_orientation'
  | 'religious_lifestyle_importance';

export type DerivedTraits = Record<TraitName, number | null>;

export interface DerivedPreferences {
  partner_qualities: string[];
  dealbreakers: string[];
  match_preferences: string[];
  religion_importance: string;
  religious_level_importance: string;
  religion_type: string;
  religion: string;
}

// ---------------------------------------------------------------------------
// Internal mapping tables (mirrored from lib/matching-traits.ts).
// ---------------------------------------------------------------------------

const ELEVATOR_TO_CONFIDENCE: Record<string, number> = {
  open_conversation: 5,
  eye_contact_weather: 4,
  fake_phone_reading: 2,
  fake_phone_call: 2,
  panic_exit: 1,
};

const ELEVATOR_TO_INITIATIVE: Record<string, number> = {
  open_conversation: 5,
  eye_contact_weather: 3,
  fake_phone_reading: 2,
  fake_phone_call: 2,
  panic_exit: 1,
};

const ELEVATOR_TO_OPENNESS: Record<string, number> = {
  open_conversation: 5,
  eye_contact_weather: 4,
  fake_phone_reading: 2,
  fake_phone_call: 2,
  panic_exit: 1,
};

const KARAOKE_TO_CONFIDENCE: Record<string, number> = {
  first_on_stage: 5,
  sing_if_convinced: 3,
  shots_first: 2,
  prefer_watching: 2,
};

const FAMILIAR_TO_CONFIDENCE: Record<string, number> = {
  enthusiastic_wave: 5,
  eye_contact_wave: 4,
  wait_for_them: 3,
  phone_ignore: 2,
  detour: 1,
};

const FAMILIAR_TO_INITIATIVE: Record<string, number> = {
  enthusiastic_wave: 5,
  eye_contact_wave: 4,
  wait_for_them: 2,
  phone_ignore: 1,
  detour: 1,
};

const FAMILIAR_TO_OPENNESS: Record<string, number> = {
  enthusiastic_wave: 5,
  eye_contact_wave: 4,
  wait_for_them: 3,
  phone_ignore: 2,
  detour: 1,
};

const FEEL_INTEREST_TO_CONFIDENCE: Record<string, number> = {
  excited: 5,
  evaluating: 3,
  slightly_anxious: 2,
  hide_it: 2,
};

const ATTRACTION_TO_INITIATIVE: Record<string, number> = {
  initiate_conversation: 5,
  subtle_hint: 3,
  wait_for_approach: 2,
  confidence_dependent: 3,
};

const ATTRACTION_TO_OPENNESS: Record<string, number> = {
  initiate_conversation: 5,
  subtle_hint: 4,
  wait_for_approach: 2,
  confidence_dependent: 3,
};

const SPONTANEITY_TO_LEVEL: Record<string, number> = {
  pack_now: 5,
  check_then_flow: 4,
  need_planning_time: 2,
  no_go: 1,
};

const SPONTANEOUS_PLAN_TO_LEVEL: Record<string, number> = {
  in_immediately: 5,
  usually_flow: 4,
  mood_dependent: 3,
  too_tired: 2,
  need_advance_notice: 1,
};

const CONFLICT_TO_DIRECTNESS: Record<string, number> = {
  talk_immediately: 5,
  need_cooldown: 3,
  situational: 3,
  avoidant: 1,
};

const CONFLICT_TO_ENGAGEMENT: Record<string, number> = {
  talk_immediately: 5,
  need_cooldown: 4,
  situational: 3,
  avoidant: 1,
};

const PROBLEM_TO_DIRECTNESS: Record<string, number> = {
  solve_immediately: 5,
  hear_other_side: 4,
  understand_feelings_first: 3,
  let_time_help: 2,
};

const PROBLEM_TO_ENGAGEMENT: Record<string, number> = {
  solve_immediately: 5,
  hear_other_side: 5,
  understand_feelings_first: 4,
  let_time_help: 2,
};

const PACE_TO_EMOTIONAL_PACE: Record<string, number> = {
  very_slow: 1,
  gradual: 2,
  medium: 3,
  fast_with_connection: 5,
};

const INTENT_TYPE_TO_SERIOUSNESS: Record<string, number> = {
  long_term: 5,
  open_flow: 3,
  short_term: 2,
  casual: 1,
};

const CHEMISTRY_LONGTERM_MODIFIER: Record<string, number> = {
  long_term_fit: 1,
  both_equal: 0,
  instant_chemistry: -1,
};

const CHEMISTRY_TO_STABILITY: Record<string, number> = {
  long_term_fit: 5,
  both_equal: 3,
  instant_chemistry: 2,
};

const STABILITY_ADVENTURE_MODIFIER: Record<string, number> = {
  stability_security: 1,
  mix: 0,
  excitement_adventure: -1,
};

const STABILITY_TO_PREFERENCE: Record<string, number> = {
  stability_security: 5,
  mix: 3,
  excitement_adventure: 1,
};

const PERSONAL_SPACE_TO_INDEPENDENCE: Record<string, number> = {
  need_lots_of_space: 5,
  need_balance: 3,
  lots_of_togetherness: 1,
};

const RELIGION_IMPORTANCE_TO_LEVEL: Record<string, number> = {
  not_important: 1,
  nice_to_have: 2,
  somewhat_important: 3,
  very_important: 5,
};

const RELIGIOUS_LEVEL_IMPORTANCE_TO_LEVEL: Record<string, number> = {
  not_important: 1,
  similar_preferred: 2,
  similar_important: 4,
  very_important: 5,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function lookup(map: Record<string, number>, key: unknown): number | undefined {
  if (typeof key !== 'string' || key.length === 0) return undefined;
  return map[key];
}

function average(values: Array<number | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return clamp1to5(sum / nums.length);
}

function clamp1to5(n: number): number {
  if (Number.isNaN(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n * 10) / 10));
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

// ---------------------------------------------------------------------------
// Per-trait derive functions
// ---------------------------------------------------------------------------

function deriveSocialConfidence(a: Record<string, unknown>): number | null {
  return average([
    lookup(ELEVATOR_TO_CONFIDENCE, a.elevatorScenario),
    lookup(KARAOKE_TO_CONFIDENCE, a.karaokeChance),
    lookup(FAMILIAR_TO_CONFIDENCE, a.familiarFace),
    lookup(FEEL_INTEREST_TO_CONFIDENCE, a.feel_interest_response),
  ]);
}

function deriveSocialInitiative(a: Record<string, unknown>): number | null {
  return average([
    lookup(ATTRACTION_TO_INITIATIVE, a.attraction_initiative_style),
    lookup(ELEVATOR_TO_INITIATIVE, a.elevatorScenario),
    lookup(FAMILIAR_TO_INITIATIVE, a.familiarFace),
  ]);
}

function deriveOpennessToNewPeople(a: Record<string, unknown>): number | null {
  return average([
    lookup(ELEVATOR_TO_OPENNESS, a.elevatorScenario),
    lookup(FAMILIAR_TO_OPENNESS, a.familiarFace),
    lookup(ATTRACTION_TO_OPENNESS, a.attraction_initiative_style),
  ]);
}

function deriveSpontaneityLevel(a: Record<string, unknown>): number | null {
  const everyday = lookup(SPONTANEOUS_PLAN_TO_LEVEL, a.spontaneous_plan_response);
  const extreme = lookup(SPONTANEITY_TO_LEVEL, a.spontaneity);
  if (everyday === undefined && extreme === undefined) return null;
  if (everyday === undefined) return clamp1to5(extreme as number);
  if (extreme === undefined) return clamp1to5(everyday);
  return clamp1to5(everyday * 0.6 + extreme * 0.4);
}

function deriveCommunicationDirectness(a: Record<string, unknown>): number | null {
  return average([
    lookup(CONFLICT_TO_DIRECTNESS, a.conflict_style),
    lookup(PROBLEM_TO_DIRECTNESS, a.problem_response_style),
  ]);
}

function deriveConflictEngagement(a: Record<string, unknown>): number | null {
  return average([
    lookup(CONFLICT_TO_ENGAGEMENT, a.conflict_style),
    lookup(PROBLEM_TO_ENGAGEMENT, a.problem_response_style),
  ]);
}

function deriveEmotionalPace(a: Record<string, unknown>): number | null {
  const v = lookup(PACE_TO_EMOTIONAL_PACE, a.relationship_pace);
  return v === undefined ? null : clamp1to5(v);
}

function deriveRelationshipIntentSeriousness(a: Record<string, unknown>): number | null {
  const base = lookup(INTENT_TYPE_TO_SERIOUSNESS, a.intent_type);
  if (base === undefined) return null;
  let score = base;
  const chem = lookup(CHEMISTRY_LONGTERM_MODIFIER, a.chemistry_vs_longterm);
  const stab = lookup(STABILITY_ADVENTURE_MODIFIER, a.stability_vs_adventure);
  if (chem !== undefined) score += chem;
  if (stab !== undefined) score += stab;
  return clamp1to5(score);
}

function deriveRelationshipStabilityPreference(a: Record<string, unknown>): number | null {
  const primary = average([
    lookup(STABILITY_TO_PREFERENCE, a.stability_vs_adventure),
    lookup(CHEMISTRY_TO_STABILITY, a.chemistry_vs_longterm),
  ]);
  if (primary === null) return null;
  const topVals = asStringArray(a.relationship_top_values);
  let score = primary;
  if (topVals.includes('stability')) score += 1;
  return clamp1to5(score);
}

function deriveIndependenceNeed(a: Record<string, unknown>): number | null {
  const primary = lookup(PERSONAL_SPACE_TO_INDEPENDENCE, a.personal_space_style);
  if (primary === undefined) return null;
  let score = primary;
  const topVals = asStringArray(a.relationship_top_values);
  const feelArr = asStringArray(a.partner_should_feel);
  if (topVals.includes('independence')) score += 1;
  if (feelArr.includes('free_to_be_themselves')) score += 1;
  return clamp1to5(score);
}

function deriveWarmthAffection(a: Record<string, unknown>): number | null {
  const llArr = Array.isArray(a.love_languages)
    ? asStringArray(a.love_languages)
    : (typeof a.love_language === 'string' && a.love_language ? [a.love_language] : []);
  const feelArr = asStringArray(a.partner_should_feel);
  const togetherness = a.personal_space_style === 'lots_of_togetherness';

  if (llArr.length === 0 && feelArr.length === 0 && !togetherness) return null;

  let primary: number;
  if (llArr.length === 0) primary = 3;
  else if (llArr.length === 1) primary = 3;
  else if (llArr.length === 2) primary = 4;
  else primary = 5;

  let score = primary;
  let feelBoost = 0;
  if (feelArr.includes('loved')) feelBoost += 1;
  if (feelArr.includes('valued')) feelBoost += 1;
  if (feelArr.includes('safe')) feelBoost += 1;
  score += Math.min(2, feelBoost);
  if (togetherness) score += 1;
  return clamp1to5(score);
}

function deriveAmbitionCareerFocus(a: Record<string, unknown>): number | null {
  const topVals = asStringArray(a.relationship_top_values);
  const partnerQuals = asStringArray(a.partner_qualities);
  if (topVals.length === 0 && partnerQuals.length === 0) return null;
  let score = 3;
  if (topVals.includes('ambition')) score += 2;
  if (partnerQuals.includes('ambition')) score += 1;
  return clamp1to5(score);
}

function deriveHumorPlayfulness(a: Record<string, unknown>): number | null {
  const topVals = asStringArray(a.relationship_top_values);
  const strengths = asStringArray(a.relationship_strengths);
  const partnerQuals = asStringArray(a.partner_qualities);
  if (topVals.length === 0 && strengths.length === 0 && partnerQuals.length === 0) return null;
  let score = 3;
  if (topVals.includes('humor')) score += 2;
  if (strengths.includes('humor')) score += 2;
  if (partnerQuals.includes('humor')) score += 1;
  return clamp1to5(score);
}

function deriveFamilyOrientation(a: Record<string, unknown>): number | null {
  const topVals = asStringArray(a.relationship_top_values);
  const partnerQuals = asStringArray(a.partner_qualities);
  const religion = asString(a.religion);
  const religiousLifestyleHint =
    religion === 'religious' || religion === 'religious_national' || religion === 'haredi';

  if (topVals.length === 0 && partnerQuals.length === 0 && !religiousLifestyleHint) return null;
  let score = 3;
  if (topVals.includes('family')) score += 2;
  if (partnerQuals.includes('family')) score += 1;
  if (religiousLifestyleHint) score += 1;
  return clamp1to5(score);
}

function deriveReligiousLifestyleImportance(a: Record<string, unknown>): number | null {
  return average([
    lookup(RELIGION_IMPORTANCE_TO_LEVEL, a.religion_importance),
    lookup(RELIGIOUS_LEVEL_IMPORTANCE_TO_LEVEL, a.religious_level_importance),
  ]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function deriveTraits(
  answers: Record<string, unknown> | null | undefined,
): DerivedTraits {
  const a = answers || {};
  return {
    social_confidence: deriveSocialConfidence(a),
    social_initiative: deriveSocialInitiative(a),
    openness_to_new_people: deriveOpennessToNewPeople(a),
    spontaneity_level: deriveSpontaneityLevel(a),
    communication_directness: deriveCommunicationDirectness(a),
    conflict_engagement: deriveConflictEngagement(a),
    emotional_pace: deriveEmotionalPace(a),
    relationship_intent_seriousness: deriveRelationshipIntentSeriousness(a),
    relationship_stability_preference: deriveRelationshipStabilityPreference(a),
    independence_need: deriveIndependenceNeed(a),
    warmth_affection: deriveWarmthAffection(a),
    ambition_career_focus: deriveAmbitionCareerFocus(a),
    humor_playfulness: deriveHumorPlayfulness(a),
    family_orientation: deriveFamilyOrientation(a),
    religious_lifestyle_importance: deriveReligiousLifestyleImportance(a),
  };
}

export function derivePreferences(
  answers: Record<string, unknown> | null | undefined,
): DerivedPreferences {
  const a = answers || {};
  return {
    partner_qualities: asStringArray(a.partner_qualities),
    dealbreakers: asStringArray(a.dealbreakers),
    match_preferences: asStringArray(a.match_preferences),
    religion_importance: asString(a.religion_importance),
    religious_level_importance: asString(a.religious_level_importance),
    religion_type: asString(a.religion_type),
    religion: asString(a.religion),
  };
}
