-- Migration 016: Backend-authoritative match creation
--
-- Adds two SECURITY DEFINER functions:
--   1. count_user_matches_this_month(p_user_id) — cap-count helper.
--   2. create_authorized_match(...)             — atomic match-insert entry point.
--
-- Security model
-- ──────────────
--   * Both functions are SECURITY DEFINER and run as the owning role
--     (postgres), which is what lets them INSERT into public.matches
--     even though the authenticated role has NO INSERT grant on that
--     table and there is NO INSERT RLS policy.
--   * Both functions are REVOKEd from PUBLIC and GRANTed ONLY to
--     service_role. They are invoked exclusively by the match-create
--     Edge Function (which holds the service role key as a Supabase
--     secret). Authenticated clients calling either function directly
--     will receive "permission denied for function".
--   * The Edge Function is the only trust boundary that derives the
--     calling user identity (via JWT verification). Once derived, it
--     passes the user id as an explicit parameter (p_user_id) — the
--     RPC cannot use auth.uid() here because the service role context
--     has no auth.uid().
--   * Defense-in-depth: every check the Edge Function performs is
--     re-performed inside the RPC, so a buggy or compromised Edge
--     Function still cannot create an invalid match. Specifically the
--     RPC re-verifies onboarding, hard filters (gender + height
--     must_have, bi-directional), no-rematch, and the monthly cap and
--     active-match constraints FOR BOTH user_id and winner_id.
--
-- Schema impact: zero. No new tables, columns, indexes, RLS policies,
-- triggers, or grants on existing tables. The check_active_matches
-- trigger from migration 002 remains the last line of defense against
-- duplicate active matches under race.

------------------------------------------------------------------------
-- 1. count_user_matches_this_month
--    Counts a user's matches in the current calendar month across
--    both user_a_id and user_b_id. SECURITY DEFINER so it does not
--    depend on the calling role's SELECT visibility into other users'
--    match rows.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_user_matches_this_month(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.matches
  WHERE (user_a_id = p_user_id OR user_b_id = p_user_id)
    AND created_at >= date_trunc('month', now());
$$;

REVOKE ALL ON FUNCTION public.count_user_matches_this_month(uuid) FROM PUBLIC;
-- Backend-only. Authenticated clients cannot call this directly.
GRANT EXECUTE ON FUNCTION public.count_user_matches_this_month(uuid) TO service_role;

COMMENT ON FUNCTION public.count_user_matches_this_month(uuid) IS
  'Backend-only cap helper. Counts a user''s matches in the current calendar '
  'month across both user_a_id and user_b_id. Used inside create_authorized_match '
  'and by the match-create Edge Function for candidate filtering. Granted to '
  'service_role only.';

------------------------------------------------------------------------
-- 2. create_authorized_match
--    Backend-only atomic match-insert entry point. Called by the
--    match-create Edge Function with the service role key. Accepts
--    EXPLICIT p_user_id because the service role context has no
--    auth.uid() to derive from.
------------------------------------------------------------------------
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
  --    Returns candidate_unavailable so the Edge Function (Phase 2)
  --    can choose to retry with the next-best candidate. Phase 1
  --    pre-filters candidates so this branch should be hit only by a
  --    rare race.
  ----------------------------------------------------------------------
  SELECT public.count_user_matches_this_month(p_winner_id) INTO v_count_winner;
  IF v_count_winner >= 5 THEN
    RETURN jsonb_build_object('status', 'candidate_unavailable',
                              'reason', 'candidate_capped');
  END IF;

  ----------------------------------------------------------------------
  -- i. Caller active match
  ----------------------------------------------------------------------
  SELECT id INTO v_active_id FROM public.matches
   WHERE status = 'active'
     AND (user_a_id = p_user_id OR user_b_id = p_user_id)
   LIMIT 1;
  IF v_active_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_has_active',
                              'match_id', v_active_id);
  END IF;

  ----------------------------------------------------------------------
  -- j. Winner active match (bi-directional)
  ----------------------------------------------------------------------
  SELECT id INTO v_active_id FROM public.matches
   WHERE status = 'active'
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

REVOKE ALL ON FUNCTION
  public.create_authorized_match(uuid, uuid, integer, text[], text)
  FROM PUBLIC;

-- Backend-only. The match-create Edge Function calls this with the
-- service role key. Authenticated clients invoking this directly will
-- receive "permission denied for function".
GRANT EXECUTE ON FUNCTION
  public.create_authorized_match(uuid, uuid, integer, text[], text)
  TO service_role;

COMMENT ON FUNCTION public.create_authorized_match(uuid, uuid, integer, text[], text) IS
  'Backend-only atomic match creation. Granted to service_role only. Invoked '
  'exclusively by the match-create Edge Function. Re-verifies caller + winner '
  'onboarding, gender / height-must_have hard filters, no-rematch history, '
  'both-sides monthly cap, and both-sides active-match constraints before INSERT.';

------------------------------------------------------------------------
-- 3. No other changes.
--    - public.matches grants: unchanged (SELECT, UPDATE for authenticated).
--    - public.matches RLS policies: unchanged.
--    - check_active_matches trigger: unchanged (kept as last line of defense).
--    - No schema/column/index changes.
--    - No pg_cron usage. Scheduled expiration is Phase 3.
------------------------------------------------------------------------
