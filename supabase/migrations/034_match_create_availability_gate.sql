-- Migration 034: Wire matching-availability gate into match creation.
--
-- Builds directly on migration 033 (which added public.matching_availability
-- + public.set_matching_availability()). This migration teaches
-- public.create_authorized_match (last rewritten in migration 023) to:
--
--   1. Refuse to create a match unless BOTH caller and winner have a live
--      matching_availability row (available_until > now()).
--   2. Atomically DELETE both availability rows in the same transaction as
--      the INSERT into public.matches, so a matched user no longer appears
--      in any subsequent candidate pool until they re-opt in.
--
-- ⚠ RELEASE-COUPLING WARNING ⚠
-- ─────────────────────────────
-- This migration + the matching match-create Edge Function update must NOT
-- be released without PR #63 (client UI for "אני פנוי/ה להכיר"). Once the
-- gate is live, NO match can be created until users have a UI path to set
-- their availability — the candidate pool collapses to the empty set
-- (because no one has a matching_availability row yet) and the caller-side
-- check returns 'not_available' on every attempt. Ship 034 + the Edge
-- Function update together with the client UI, never alone.
--
-- Race-safety strategy
-- ────────────────────
-- The gate uses SELECT … FOR UPDATE on both availability rows BEFORE the
-- INSERT. Locks are acquired in deterministic sorted order
-- (LEAST(p_user_id, p_winner_id) first, then GREATEST(…)) to prevent
-- deadlocks when two concurrent RPCs race for the same pair of users
-- with the roles swapped (T1: A→B caller-winner; T2: B→A caller-winner).
-- Without sorted ordering, T1 would lock A then wait on B while T2
-- locks B then waits on A — classic deadlock. With sorted ordering, both
-- transactions lock LEAST(A,B) first; the second one waits cleanly.
--
-- If either lock-and-check fails (row missing or expired), the RPC
-- returns the appropriate status WITHOUT consuming the other user's
-- availability. The transaction rolls back when the function returns
-- from an exception or completes any non-INSERT branch, so locks are
-- released and rows survive untouched.
--
-- The existing check_active_matches trigger from migration 002 stays as
-- the last line of defense against the (now even rarer) race where two
-- INSERTs both reach the matches table for the same user.
--
-- Pre-existing SQLERRM leak fix
-- ─────────────────────────────
-- Migration 023's exception handler returned
--   jsonb_build_object('status', 'error', 'message', SQLERRM)
-- which leaks raw Postgres error text (table/column/constraint names) to
-- the client. Since we are CREATE OR REPLACE'ing the function anyway,
-- this migration also drops the SQLERRM from the exception envelope.
-- Argument-validation error messages ('missing ids', 'cannot match self',
-- 'invalid depth') are hardcoded strings, not internal SQL detail — they
-- stay. Mirrors the same hardening applied to set_matching_availability
-- in migration 033.
--
-- search_path hardening
-- ─────────────────────
-- Migration 023 set search_path = public. This migration extends it to
-- public, pg_temp to match the SECURITY DEFINER hardening pattern used by
-- public.set_matching_availability (migration 033). pg_temp at the end
-- prevents a malicious search-path-prefixed object from shadowing system
-- catalogs during function execution. Standard Supabase/Postgres
-- recommendation for all SECURITY DEFINER functions.
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT change the signature of create_authorized_match.
--   * Does NOT change any of the 11 existing gates (a-k); only adds a new
--     availability gate between j (winner open-match) and k (INSERT).
--   * Does NOT change matches RLS, grants, or columns.
--   * Does NOT change matching_availability schema, RLS, or grants
--     (migration 033 owns those; migration 034 only writes to that table).
--   * Does NOT modify set_matching_availability or any other function.
--   * Does NOT touch the match-create Edge Function (separate file).
--   * Does NOT introduce client UI (PR #63).
--
-- Idempotency
-- ───────────
-- CREATE OR REPLACE FUNCTION is naturally idempotent. REVOKE/GRANT match
-- the exact pattern from migration 023 and are no-ops when already in the
-- expected state. Safe to re-apply.

------------------------------------------------------------------------
-- 1. Re-create create_authorized_match.
--    Full function body preserved from migration 023 EXCEPT:
--      * search_path now includes pg_temp (hardening)
--      * NEW: section l — availability lock + check (caller + winner)
--      * NEW: section m — atomic DELETE of both availability rows after
--        the INSERT, inside the same transaction
--      * EXCEPTION handler returns generic status (no SQLERRM)
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_prof  record;
  v_winner_prof  record;
  v_count_caller integer;
  v_count_winner integer;
  v_active_id    uuid;
  v_new_match_id uuid;
  -- PR #62 additions:
  v_caller_avail timestamptz;
  v_winner_avail timestamptz;
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
  ----------------------------------------------------------------------
  SELECT public.count_user_matches_this_month(p_winner_id) INTO v_count_winner;
  IF v_count_winner >= 5 THEN
    RETURN jsonb_build_object('status', 'candidate_unavailable',
                              'reason', 'candidate_capped');
  END IF;

  ----------------------------------------------------------------------
  -- i. Caller open match (active OR chat_started)
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
  -- l. PR #62 — Availability gate.
  --
  --     Lock both availability rows in deterministic sorted order to
  --     prevent deadlocks when two concurrent RPCs race for the same
  --     pair (T1: A→B; T2: B→A). Locking LEAST first then GREATEST
  --     ensures both transactions wait on the same row first.
  --
  --     FOR UPDATE on a missing row is a no-op (no row to lock); the
  --     subsequent IS NULL / <= now() checks handle the "row absent OR
  --     expired" cases without needing a row to exist for the lock.
  --
  --     The two PERFORM statements are intentionally separate (not a
  --     single WHERE user_id IN(…)) so the lock-acquisition order is
  --     unambiguous to Postgres regardless of execution-plan choices.
  --
  --     Caller availability is checked first (with its own SELECT so we
  --     return the correct caller-side status). If caller has no live
  --     availability row, return 'not_available' — this is a HARD STOP
  --     for the caller; the Edge Function retry loop will not retry
  --     because retry can't help (the caller hasn't opted in).
  --
  --     Winner availability is then checked. If winner has no live row,
  --     return 'candidate_unavailable' with reason 'winner_not_available'
  --     so the Edge Function's existing retry loop transparently moves
  --     to the next candidate (treating winner-side availability the
  --     same as winner-side capped / active-match).
  ----------------------------------------------------------------------
  PERFORM 1 FROM public.matching_availability
   WHERE user_id = LEAST(p_user_id, p_winner_id)
   FOR UPDATE;
  PERFORM 1 FROM public.matching_availability
   WHERE user_id = GREATEST(p_user_id, p_winner_id)
   FOR UPDATE;

  SELECT available_until INTO v_caller_avail
    FROM public.matching_availability
   WHERE user_id = p_user_id;
  IF v_caller_avail IS NULL OR v_caller_avail <= now() THEN
    RETURN jsonb_build_object('status', 'not_available');
  END IF;

  SELECT available_until INTO v_winner_avail
    FROM public.matching_availability
   WHERE user_id = p_winner_id;
  IF v_winner_avail IS NULL OR v_winner_avail <= now() THEN
    RETURN jsonb_build_object('status', 'candidate_unavailable',
                              'reason', 'winner_not_available');
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

  ----------------------------------------------------------------------
  -- m. PR #62 — Atomic availability clearing.
  --
  --     Same transaction as the INSERT above. Removes both participants'
  --     matching_availability rows so neither appears as a candidate in
  --     subsequent searches until they explicitly opt in again via
  --     public.set_matching_availability(). If anything between the
  --     FOR UPDATE in section l and this DELETE rolls back, the locks
  --     release and the rows survive untouched.
  --
  --     DELETE (rather than UPDATE available_until = now()) keeps the
  --     "row absent = not available" invariant from migration 033
  --     simple — there is no "expired row present" sentinel state. The
  --     ON CONFLICT path in set_matching_availability handles row
  --     re-creation cleanly on the next opt-in.
  ----------------------------------------------------------------------
  DELETE FROM public.matching_availability
   WHERE user_id IN (p_user_id, p_winner_id);

  RETURN jsonb_build_object(
    'status',       'created',
    'match_id',     v_new_match_id,
    'candidate_id', p_winner_id,
    'score',        GREATEST(40, LEAST(100, COALESCE(p_score, 40))),
    'reasons',      COALESCE(p_reasons, ARRAY[]::text[]),
    'depth',        p_depth
  );

EXCEPTION WHEN OTHERS THEN
  -- PR #62 hardening: do NOT include SQLERRM. It can leak internal
  -- table/column/constraint names to the client. The status
  -- discriminant is sufficient for the Edge Function's retry logic
  -- (which stops on 'error' rather than retrying); for operational
  -- diagnostics, server-side logs / Supabase logs capture the raw
  -- error text. Mirrors the hardening applied to
  -- set_matching_availability in migration 033.
  --
  -- Most likely cause that lands here: the check_active_matches
  -- trigger from migration 002 raising due to a race with another
  -- concurrent INSERT. The FOR UPDATE locks in section l reduce
  -- but do not eliminate that race (the locks serialize availability
  -- checks but not matches-table writes).
  RETURN jsonb_build_object('status', 'error');
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
  'both-sides monthly cap, both-sides open-match constraints '
  '(active OR chat_started), AND both-sides matching availability '
  '(matching_availability.available_until > now()) before INSERT. '
  'Atomically DELETEs both availability rows on success. Returns '
  '''not_available'' if caller has no live availability, '
  '''candidate_unavailable'' with reason ''winner_not_available'' if winner '
  'does not — the latter is consumed by the Edge Function retry loop.';

------------------------------------------------------------------------
-- 2. No other changes.
--    - public.matching_availability: schema, RLS, grants — unchanged.
--    - public.set_matching_availability: unchanged.
--    - public.matches: schema, RLS, grants, triggers — unchanged.
--    - public.profiles: schema, RLS, grants — unchanged.
--    - pg_cron expiry job (migrations 023/024): unchanged.
--    - No new tables, columns, indexes, RLS policies, or grants.
------------------------------------------------------------------------
