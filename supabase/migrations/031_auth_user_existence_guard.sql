-- Migration 031: Defense-in-depth — create_authorized_match must not
-- match an auth-less user.
--
-- Why
-- ───
-- The deletion-resilience audit (see supabase/scripts/check-orphans.sql)
-- identified a theoretical race window in the matching pipeline:
--
--   1. Match-create's Edge Function fetches the candidate pool from
--      public.profiles where onboarding_completed = true.
--   2. If a candidate's auth.users row is deleted between that fetch and
--      the create_authorized_match RPC call, the RPC's profile lookup
--      may still observe the candidate's profiles row (cascade not yet
--      fired) — and proceed with INSERT.
--   3. Cascade then fires and deletes the just-inserted match.
--
-- The same race applies in the (extremely rare but possible) operator
-- scenario where a profiles row is left orphaned because an op-error
-- bypassed the cascade chain (e.g., manual SQL or partial delete).
--
-- Migration 031 makes create_authorized_match check explicitly that BOTH
-- auth.users[p_user_id] and auth.users[p_winner_id] exist before INSERT.
-- This is pure defense-in-depth — under normal operation the cascade
-- guarantees consistency.
--
-- Scope
-- ─────
--   * CREATE OR REPLACE public.create_authorized_match — same signature,
--     same return shape, full body preserved verbatim from migration 023
--     except for two new guards inserted as section "a2" right after
--     argument validation and before the caller profile fetch.
--   * Does NOT change scoring or evidence (PR #48 logic untouched).
--   * Does NOT change ranking.
--   * Does NOT change RLS, grants, or any table.
--   * Does NOT introduce a new status string — caller-missing maps to
--     'incomplete_profile' (the existing status for a caller that isn't
--     ready) and winner-missing maps to 'candidate_unavailable' with a
--     new reason 'auth_user_missing' so the match-create Edge Function's
--     existing retry loop can simply try the next candidate.
--   * Does NOT change chat send (migration 030 unaffected).
--   * Does NOT change profile email privacy (migration 022 unaffected).
--
-- Idempotency
-- ───────────
-- CREATE OR REPLACE FUNCTION with identical signature. Re-applying this
-- migration is a no-op. The REVOKE/GRANT block re-asserts the existing
-- backend-only privilege model.

CREATE OR REPLACE FUNCTION public.create_authorized_match(
  p_user_id   uuid,
  p_winner_id uuid,
  p_score     integer,
  p_reasons   text[],
  p_depth     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_prof  record;
  v_winner_prof  record;
  v_count_caller integer;
  v_count_winner integer;
  v_active_id    uuid;
  v_new_match_id uuid;
BEGIN
  ----------------------------------------------------------------------
  -- a. Argument validation
  ----------------------------------------------------------------------
  IF p_user_id IS NULL OR p_winner_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'missing ids');
  END IF;
  IF p_user_id = p_winner_id THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'cannot match self');
  END IF;
  IF p_depth NOT IN ('fast', 'deep') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'invalid depth');
  END IF;

  ----------------------------------------------------------------------
  -- a2. auth.users existence guard (PR-AUDIT-DEL — migration 031).
  --     Cascade from auth.users -> public.profiles makes this an
  --     extremely-rare edge case under normal operation. The check
  --     exists to defend against:
  --       * The microsecond race where a candidate is deleted between
  --         Edge Function pool fetch and the RPC INSERT.
  --       * Operator error that leaves a profiles row orphaned of its
  --         auth.users row (manual SQL bypassing the cascade chain).
  --     Caller-missing maps to 'incomplete_profile' (consistent with
  --     existing caller-side branches b). Winner-missing maps to
  --     'candidate_unavailable' with reason 'auth_user_missing'; the
  --     Edge Function retry loop treats that exactly like 'candidate_
  --     capped' / 'candidate_has_active' and tries the next candidate.
  ----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('status', 'incomplete_profile');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_winner_id) THEN
    RETURN jsonb_build_object('status', 'candidate_unavailable',
                              'reason', 'auth_user_missing');
  END IF;

  ----------------------------------------------------------------------
  -- b. Caller profile: onboarding + required hard-filter inputs
  ----------------------------------------------------------------------
  SELECT id, gender, interested_in_genders, onboarding_completed,
         height_cm, height_preference_importance, min_preferred_height_cm
    INTO v_caller_prof
    FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND
     OR NOT COALESCE(v_caller_prof.onboarding_completed, false)
     OR v_caller_prof.gender IS NULL
     OR COALESCE(array_length(v_caller_prof.interested_in_genders, 1), 0) = 0 THEN
    RETURN jsonb_build_object('status', 'incomplete_profile');
  END IF;

  ----------------------------------------------------------------------
  -- c. Winner profile: must exist and be onboarded
  ----------------------------------------------------------------------
  SELECT id, gender, interested_in_genders, onboarding_completed,
         height_cm, height_preference_importance, min_preferred_height_cm
    INTO v_winner_prof
    FROM public.profiles WHERE id = p_winner_id;

  IF NOT FOUND OR NOT COALESCE(v_winner_prof.onboarding_completed, false) THEN
    RETURN jsonb_build_object('status', 'candidate_unavailable',
                              'reason', 'winner_not_eligible');
  END IF;

  ----------------------------------------------------------------------
  -- d. Hard filter: gender bi-directional
  ----------------------------------------------------------------------
  IF NOT (
       v_winner_prof.gender = ANY(v_caller_prof.interested_in_genders)
    OR 'any' = ANY(v_caller_prof.interested_in_genders)
  ) OR NOT (
       v_caller_prof.gender = ANY(v_winner_prof.interested_in_genders)
    OR 'any' = ANY(v_winner_prof.interested_in_genders)
  ) THEN
    RETURN jsonb_build_object('status', 'candidate_unavailable',
                              'reason', 'gender_mismatch');
  END IF;

  ----------------------------------------------------------------------
  -- e. Hard filter: height must_have, bi-directional
  ----------------------------------------------------------------------
  IF v_caller_prof.height_preference_importance = 'must_have'
     AND COALESCE(v_winner_prof.height_cm, 0) > 0
     AND v_winner_prof.height_cm < COALESCE(v_caller_prof.min_preferred_height_cm, 0) THEN
    RETURN jsonb_build_object('status', 'candidate_unavailable',
                              'reason', 'height_mismatch_caller');
  END IF;
  IF v_winner_prof.height_preference_importance = 'must_have'
     AND COALESCE(v_caller_prof.height_cm, 0) > 0
     AND v_caller_prof.height_cm < COALESCE(v_winner_prof.min_preferred_height_cm, 0) THEN
    RETURN jsonb_build_object('status', 'candidate_unavailable',
                              'reason', 'height_mismatch_candidate');
  END IF;

  ----------------------------------------------------------------------
  -- f. No-rematch: caller and winner must share NO past match row,
  --    regardless of status, in either direction.
  ----------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM public.matches
     WHERE (user_a_id = p_user_id AND user_b_id = p_winner_id)
        OR (user_a_id = p_winner_id AND user_b_id = p_user_id)
  ) THEN
    RETURN jsonb_build_object('status', 'candidate_unavailable',
                              'reason', 'already_matched_in_past');
  END IF;

  ----------------------------------------------------------------------
  -- g. Caller monthly cap (≤5 per calendar month, all statuses count)
  ----------------------------------------------------------------------
  SELECT public.count_user_matches_this_month(p_user_id) INTO v_count_caller;
  IF v_count_caller >= 5 THEN
    RETURN jsonb_build_object('status', 'monthly_cap_reached');
  END IF;

  ----------------------------------------------------------------------
  -- h. Winner monthly cap (bi-directional cap enforcement)
  --    Returns candidate_unavailable so the Edge Function can choose to
  --    retry with the next-best candidate. Phase 1 pre-filters
  --    candidates so this branch should be hit only by a rare race.
  ----------------------------------------------------------------------
  SELECT public.count_user_matches_this_month(p_winner_id) INTO v_count_winner;
  IF v_count_winner >= 5 THEN
    RETURN jsonb_build_object('status', 'candidate_unavailable',
                              'reason', 'candidate_capped');
  END IF;

  ----------------------------------------------------------------------
  -- i. Caller open match (active OR chat_started)
  --    A user who has either an unstarted active match OR an ongoing
  --    chat_started match cannot receive a new one. expired and
  --    unmatched do not block.
  ----------------------------------------------------------------------
  SELECT id INTO v_active_id FROM public.matches
   WHERE status IN ('active', 'chat_started')
     AND (user_a_id = p_user_id OR user_b_id = p_user_id)
   LIMIT 1;
  IF v_active_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_has_active',
                              'match_id', v_active_id);
  END IF;

  ----------------------------------------------------------------------
  -- j. Winner open match (bi-directional; active OR chat_started block)
  ----------------------------------------------------------------------
  SELECT id INTO v_active_id FROM public.matches
   WHERE status IN ('active', 'chat_started')
     AND (user_a_id = p_winner_id OR user_b_id = p_winner_id)
   LIMIT 1;
  IF v_active_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'candidate_unavailable',
                              'reason', 'candidate_has_active');
  END IF;

  ----------------------------------------------------------------------
  -- k. Insert. Score clamped to [40, 100] as a safety belt.
  --    The check_active_matches trigger from migration 002 is the
  --    final safety net under race conditions.
  ----------------------------------------------------------------------
  INSERT INTO public.matches (
    user_a_id, user_b_id, compatibility_score, compatibility_reasons,
    status, metadata
  ) VALUES (
    p_user_id, p_winner_id,
    GREATEST(40, LEAST(100, COALESCE(p_score, 40))),
    COALESCE(p_reasons, ARRAY[]::text[]),
    'active',
    jsonb_build_object('depth', p_depth)
  )
  RETURNING id INTO v_new_match_id;

  RETURN jsonb_build_object(
    'status',       'created',
    'match_id',     v_new_match_id,
    'candidate_id', p_winner_id,
    'score',        GREATEST(40, LEAST(100, COALESCE(p_score, 40))),
    'reasons',      COALESCE(p_reasons, ARRAY[]::text[]),
    'depth',        p_depth
  );

EXCEPTION WHEN OTHERS THEN
  -- Most likely path: the check_active_matches trigger raised because
  -- of a race with another concurrent insertion. Surface a clean
  -- status; do not leak SQLSTATE / table names to the client.
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- Re-assert backend-only privilege model (matches migration 023 exactly).
REVOKE ALL ON FUNCTION
  public.create_authorized_match(uuid, uuid, integer, text[], text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.create_authorized_match(uuid, uuid, integer, text[], text)
  TO service_role;

COMMENT ON FUNCTION public.create_authorized_match(uuid, uuid, integer, text[], text) IS
  'Backend-only atomic match creation. Granted to service_role only. Invoked '
  'exclusively by the match-create Edge Function. Re-verifies caller + winner '
  'auth.users existence (migration 031), profile onboarding, gender / '
  'height-must_have hard filters, no-rematch history, both-sides monthly cap, '
  'and both-sides open-match constraints (active OR chat_started) before INSERT.';
