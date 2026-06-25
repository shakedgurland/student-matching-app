-- Migration 035: Revert availability gate + add behind-the-scenes activity signal.
--
-- This migration rolls UniMatch back to automatic matching for eligible users
-- (the model that pre-dated migration 033/034) while adding a new
-- behind-the-scenes "active in the last 7 days" preference so the Edge
-- Function can rank recently-active candidates ahead of dormant ones.
--
-- Three independent changes, applied as a single migration:
--
--   1. Add public.profiles.last_active_at (TIMESTAMPTZ, nullable).
--      + supporting index for the 7-day filter.
--      + one-time best-effort backfill from auth.users.last_sign_in_at so
--        existing users are not all NULL on day one (NULL means "treat as
--        inactive" → fallback bucket).
--
--   2. Add SECURITY DEFINER RPC public.bump_last_active(). The client calls
--      it on app foreground / cold start. Updates ONLY the caller's own
--      profiles row to now(). Returns a generic status envelope; never
--      includes SQLERRM. EXECUTE granted to authenticated.
--
--   3. CREATE OR REPLACE public.create_authorized_match — same signature as
--      migration 034, but sections l (availability lock + check) and m
--      (atomic DELETE of matching_availability rows) are REMOVED. All other
--      gates (a–k argument validation, profile checks, hard filters,
--      no-rematch, bi-directional cap, bi-directional open-match) are
--      preserved verbatim. The function no longer requires either party to
--      have a live matching_availability row.
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT drop public.matching_availability. The table is left in place
--     as an inert artifact. The new create_authorized_match does not read
--     from it, and no other RPC writes to it after this migration. Dropping
--     it later (with explicit approval) is safe; leaving it is also safe.
--   * Does NOT drop public.set_matching_availability(). The RPC remains
--     callable; calling it just sets a row in matching_availability that
--     nobody reads. Removing it would be a breaking change for any client
--     still on the old build, so we leave it.
--   * Does NOT change matches schema, RLS, grants, or triggers.
--   * Does NOT change profiles RLS or grants.
--   * Does NOT touch the match-create Edge Function (separate deploy step).
--   * Does NOT introduce client UI changes (separate PR).
--
-- Release-coupling note
-- ─────────────────────
-- This migration is backward-compatible with the currently-deployed
-- match-create Edge Function (PR #62 build): the old Edge Function still
-- pre-flights with callerHasLiveAvailability and intersects the candidate
-- pool against matching_availability, which still reads correctly from the
-- (now inert) table. With the new create_authorized_match the availability
-- gate inside the RPC is no longer enforced, but the Edge Function's own
-- pre-flight still blocks users without an availability row — so until the
-- new Edge Function deploys, the user-facing behavior does not change. The
-- new Edge Function deploy (which removes the pre-flight) is the moment
-- automatic matching becomes live to users. This sequencing is intentional
-- and means migration 035 can be applied at any time without risking a
-- broken state for users running Build #27 or earlier.
--
-- Idempotency
-- ───────────
--   * ALTER TABLE … ADD COLUMN IF NOT EXISTS — safe re-run.
--   * CREATE INDEX IF NOT EXISTS — safe re-run.
--   * UPDATE backfill is gated on last_active_at IS NULL, so a second run
--     after users have bumped their own rows will be a no-op for them and
--     only fill any genuinely NULL rows from auth.users.last_sign_in_at.
--   * CREATE OR REPLACE FUNCTION — naturally idempotent.
--   * REVOKE/GRANT — no-ops when already in the expected state.
--
-- Hardening
-- ─────────
--   * search_path = public, pg_temp on both SECURITY DEFINER functions.
--   * Exception handlers return a generic status envelope (no SQLERRM).
--   * bump_last_active uses auth.uid() — the only trusted caller identity.
--     The client cannot pass a target user id. EXECUTE granted to
--     authenticated only; anon and PUBLIC are explicitly revoked.

------------------------------------------------------------------------
-- 1. profiles.last_active_at column + supporting index + backfill.
------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_active_at IS
  'Behind-the-scenes activity timestamp. Updated by public.bump_last_active() '
  'on app foreground/cold start. Never exposed to the client UI. Used by the '
  'match-create Edge Function as a soft ranking preference: candidates with '
  'last_active_at > now() - interval ''7 days'' are preferred over candidates '
  'whose value is older or NULL. NULL means "inactive bucket" (fallback). '
  'Not a hard filter — if no recently-active candidate exists, the highest-'
  'ranked overall candidate is selected.';

-- B-tree on a TIMESTAMPTZ column supports the ">= now() - interval '7 days'"
-- predicate efficiently. The partial index variant (WHERE last_active_at IS
-- NOT NULL) would be smaller but the Edge Function reads the column for
-- every eligible candidate, not just active ones, so a plain index is the
-- right shape here.
CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at
  ON public.profiles (last_active_at);

-- One-time best-effort backfill. Pulls last_sign_in_at from auth.users so
-- existing users are not all NULL on day one. NULL-safe: if a user has
-- never signed in (impossible in practice for onboarded users, but defensive),
-- their profiles.last_active_at stays NULL — the partition logic treats
-- that the same as a very old timestamp (fallback bucket).
--
-- Gated on last_active_at IS NULL so re-running this migration after users
-- have started bumping their own rows is a no-op for active users — only
-- genuinely NULL rows get seeded. auth.users access is permitted to the
-- migration superuser running the SQL editor (this is not inside a
-- SECURITY DEFINER function with restricted privileges).
UPDATE public.profiles p
   SET last_active_at = u.last_sign_in_at
  FROM auth.users u
 WHERE p.id = u.id
   AND p.last_active_at IS NULL
   AND u.last_sign_in_at IS NOT NULL;

------------------------------------------------------------------------
-- 2. public.bump_last_active() — SECURITY DEFINER RPC.
--
--    Called by the client on app foreground / cold start (with in-app
--    throttling to once per ~60s). Updates the caller's own profiles row
--    to now(). Returns a generic status envelope:
--      { status: 'ok' }            — update succeeded
--      { status: 'unauthorized' }  — no JWT / auth.uid() returned NULL
--      { status: 'error' }         — generic; never leaks SQLERRM
--
--    Hardening:
--      * SECURITY DEFINER + search_path = public, pg_temp.
--      * auth.uid() is the only trusted source of the target user id;
--        the function takes NO arguments so the client cannot point the
--        bump at another user.
--      * REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated.
--        anon and PUBLIC cannot call it; only authenticated sessions can.
--      * Exception handler returns generic 'error' (no SQLERRM).
------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bump_last_active()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;

  UPDATE public.profiles
     SET last_active_at = now()
   WHERE id = v_user_id;

  RETURN jsonb_build_object('status', 'ok');

EXCEPTION WHEN OTHERS THEN
  -- Generic envelope. Operational diagnostics live in Supabase server
  -- logs which capture the raw exception text. Mirrors the hardening
  -- pattern from migrations 033 and 034.
  RETURN jsonb_build_object('status', 'error');
END;
$$;

REVOKE ALL ON FUNCTION public.bump_last_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_last_active() FROM anon;
GRANT EXECUTE ON FUNCTION public.bump_last_active() TO authenticated;

COMMENT ON FUNCTION public.bump_last_active() IS
  'Behind-the-scenes activity ping. Updates the calling user''s '
  'profiles.last_active_at to now(). Uses auth.uid() so the caller cannot '
  'target another user. EXECUTE granted to authenticated only. Returns '
  '{status: ok|unauthorized|error}.';

------------------------------------------------------------------------
-- 3. public.create_authorized_match — revert away from the availability gate.
--
--    Same signature as migration 034. Sections l (availability lock +
--    check) and m (atomic DELETE of matching_availability rows) are
--    REMOVED. The two local variables v_caller_avail / v_winner_avail
--    that supported section l are also removed. Everything else is
--    preserved verbatim:
--
--      a. Argument validation (NULL ids / self-match / invalid depth)
--      b. Caller profile: onboarding + required hard-filter inputs
--      c. Winner profile: exists and onboarded
--      d. Hard filter: gender bi-directional
--      e. Hard filter: height must_have, bi-directional
--      f. No-rematch (any direction, any status)
--      g. Caller monthly cap (≤5)
--      h. Winner monthly cap (≤5)
--      i. Caller open match (active OR chat_started)
--      j. Winner open match (active OR chat_started)
--      k. INSERT, with score clamped to [40, 100]
--
--    The exception handler stays generic (no SQLERRM).
--    GRANT EXECUTE to service_role only — unchanged.
--
--    Behavioral effect: the RPC no longer rejects with 'not_available'
--    or 'candidate_unavailable/winner_not_available' for availability
--    reasons. It also no longer mutates matching_availability. The
--    matching_availability table and set_matching_availability() RPC
--    are left in place but become inert from the perspective of match
--    creation.
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
  -- (Sections from migration 034 that enforced an opt-in availability
  --  signal + cleaned it up post-INSERT are removed in migration 035.
  --  The check_active_matches trigger from migration 002 remains the
  --  last line of defense against a race where two INSERTs both reach
  --  the matches table for the same user.)
  --
  --  Verification note: the literal table name for that legacy opt-in
  --  surface is intentionally absent from this function body so the
  --  V7 check in migration 035 reliably returns 0. Outer migration
  --  comments and COMMENT ON FUNCTION metadata are unaffected.
  ----------------------------------------------------------------------

  ----------------------------------------------------------------------
  -- k. Insert. Score clamped to [40, 100] as a safety belt.
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
  -- Generic envelope. Mirrors migration 034 hardening: NO SQLERRM in the
  -- response. Operational diagnostics live in Supabase server logs.
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
  '(active OR chat_started) before INSERT. The availability gate from '
  'migration 034 is REMOVED in migration 035 — automatic matching is '
  'restored and matching_availability rows are no longer required or '
  'mutated.';

------------------------------------------------------------------------
-- 4. Nothing else changes.
--    - public.matching_availability: schema, RLS, grants, data — unchanged.
--      Table becomes inert from the perspective of match creation.
--    - public.set_matching_availability: signature/grants — unchanged.
--      Still callable but no consumer of matching_availability remains
--      after this migration; calling it is harmless.
--    - public.matches: schema, RLS, grants, triggers — unchanged.
--    - public.profiles: only the new last_active_at column + index.
--      RLS, grants, existing columns — unchanged.
--    - pg_cron expiry job (migrations 023/024): unchanged.
------------------------------------------------------------------------
