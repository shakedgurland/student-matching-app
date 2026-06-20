-- Migration 023: Real match lifecycle — transitions, expiry, blocking.
--
-- Why
-- ───
-- Production audit found that every match was born status='active' and
-- never transitioned. expires_at was decorative. chat_started status was
-- defined in the enum (migration 002) and referenced in the storage RLS
-- (migration 007) but never written by any code path. As a result, every
-- user who got a match was locked into it forever, and the 72h product
-- promise was unenforced. This migration wires the lifecycle end to end:
--
--   active → chat_started   when the first message lands in the match's
--                           conversation (DB trigger on public.messages)
--   active → expired        when expires_at < now() (pg_cron job + a
--                           client passive expiry to be added by PR-LIFE-2
--                           for snappy UX inside the cron's tick window)
--   chat_started never expires automatically.
--   expired / unmatched are terminal.
--
-- Matching-pipeline blocking now treats BOTH 'active' AND 'chat_started'
-- as blocking. expired and unmatched do not block.
--
-- Product rule honored
-- ────────────────────
-- The first 72 hours of every new match cannot be cancelled or skipped
-- by the user. This migration adds no user-facing cancel path; the only
-- way out of 'active' is the natural timer-driven expiry or the message-
-- driven chat_started transition.
--
-- Scope (intentionally narrow but complete)
-- ─────────────────────────────────────────
--   1. New SECURITY DEFINER function: transition_match_to_chat_started()
--   2. AFTER INSERT trigger on public.messages calling the above
--   3. New SECURITY DEFINER function: expire_stale_matches()
--   4. pg_cron job (guarded — graceful no-op if extension is unavailable)
--   5. Widened public.profiles peer-visibility RLS to include chat_started
--   6. Re-created create_authorized_match RPC with status IN
--      ('active','chat_started') in both caller and winner blocking
--      checks. Full body preserved verbatim from migration 016 except
--      for the two blocking-check WHERE clauses.
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT add any "next match" / "end match" UI hook. Those are
--     app-side; deferred to a later post-build PR if needed.
--   * Does NOT change the monthly cap (5 per calendar month, all statuses).
--   * Does NOT change storage RLS — migration 007 already allows
--     ('active','chat_started') for peer photos.
--   * Does NOT widen profile/photo visibility to expired/unmatched.
--   * Does NOT touch messages or conversations RLS — they correctly use
--     participant checks (not match.status), so chat history remains
--     readable to participants after expiry/unmatch.
--   * Does NOT delete or modify any existing match/message/conversation row.
--
-- Idempotency
-- ───────────
-- All CREATE OR REPLACE / DROP IF EXISTS / EXISTS-guarded pattern. Safe
-- to re-apply.

------------------------------------------------------------------------
-- 1. transition_match_to_chat_started()
--    Fires AFTER INSERT on public.messages. Looks up the match_id from
--    the message's conversation and flips that match from 'active' to
--    'chat_started'. The WHERE id=v_match_id AND status='active' clause
--    makes the function a no-op for subsequent messages or for any other
--    status, so it is naturally idempotent.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_match_to_chat_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id uuid;
BEGIN
  SELECT match_id INTO v_match_id
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF v_match_id IS NOT NULL THEN
    UPDATE public.matches
       SET status = 'chat_started',
           updated_at = now()
     WHERE id = v_match_id
       AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_transition_match_to_chat_started ON public.messages;
CREATE TRIGGER trigger_transition_match_to_chat_started
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.transition_match_to_chat_started();

------------------------------------------------------------------------
-- 2. expire_stale_matches()
--    Flips status from 'active' to 'expired' for every match whose
--    expires_at has passed. Returns the number of rows updated so
--    operators can confirm cron job activity. Does NOT touch
--    chat_started, expired, or unmatched rows — the WHERE clause is
--    strict on status='active'.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_matches()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.matches
     SET status = 'expired',
         updated_at = now()
   WHERE status = 'active'
     AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_matches() FROM PUBLIC;
-- service_role only. This is a global-scope mutation (it can affect any
-- user's stale active match), so per least-privilege we do NOT grant it
-- to authenticated. Even though the function only touches rows that
-- would expire anyway, exposing a global lifecycle mutation to every
-- authenticated user is a broader attack surface than necessary
-- (DoS/thrash, audit-trail confusion).
--
-- Client-side passive expiry (PR-LIFE-2) does NOT call this function.
-- It performs a scoped UPDATE on the user's own current match via
-- supabase-js, e.g.:
--     supabase.from('matches').update({ status: 'expired' })
--       .eq('id', myMatchId)
--       .eq('status', 'active')
--       .lt('expires_at', new Date().toISOString());
-- This is safe because: (1) migration 002 RLS UPDATE policy on
-- public.matches restricts to auth.uid() ∈ (user_a_id, user_b_id);
-- (2) migration 003 grants UPDATE on public.matches to authenticated;
-- (3) the .eq('status','active') + .lt('expires_at',now()) filters
-- prevent touching non-stale or terminal rows. No SECURITY DEFINER
-- wrapper is needed.
GRANT EXECUTE ON FUNCTION public.expire_stale_matches() TO service_role;

COMMENT ON FUNCTION public.expire_stale_matches() IS
  'Global match lifecycle expiry. Flips public.matches.status from '
  'active to expired for all rows whose expires_at is in the past. '
  'Idempotent. Scheduled by pg_cron every 5 minutes when the extension '
  'is available; also callable on-demand by service_role for ops. NOT '
  'granted to authenticated — users only ever expire their own match '
  'via a scoped direct UPDATE protected by the RLS policy from '
  'migration 002.';

------------------------------------------------------------------------
-- 3. pg_cron scheduling (guarded)
--    The DO block only references cron.* objects when pg_extension shows
--    pg_cron is installed. If the extension is not installed (typical
--    when a Supabase project has not enabled it via the dashboard), this
--    block is a no-op and the migration succeeds without scheduling.
--    Operators should enable pg_cron via Studio → Database → Extensions
--    and then re-run the schedule manually OR re-apply this migration.
--
--    The unschedule-then-schedule pattern makes re-applying safe: a
--    stale schedule from a previous apply gets replaced cleanly.
------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-matches') THEN
      PERFORM cron.unschedule('expire-stale-matches');
    END IF;
    PERFORM cron.schedule(
      'expire-stale-matches',
      '*/5 * * * *',
      $cron_body$SELECT public.expire_stale_matches()$cron_body$
    );
  END IF;
END $$;

------------------------------------------------------------------------
-- 4. Widen profiles peer-visibility RLS to chat_started.
--    Migration 020 created a policy allowing peer profile SELECT only
--    when match status='active'. Once a match transitions to
--    chat_started (via the trigger in section 1), peer profile reads
--    from match-result and chat would fail (visible bug: "לא ניתן לטעון
--    את פרטי ההתאמה" or fallback initials replacing the real name).
--
--    Widen to also include 'chat_started'. Do NOT widen to 'expired' or
--    'unmatched' — after a match ends, the peer's profile should no
--    longer be visible. Chat messages remain readable because the
--    messages/conversations RLS uses participant checks (not match.status).
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can select profiles of active match peers"
  ON public.profiles;

CREATE POLICY "Users can select profiles of active match peers"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.status IN ('active', 'chat_started')
      AND (
            (m.user_a_id = auth.uid() AND m.user_b_id = profiles.id)
         OR (m.user_b_id = auth.uid() AND m.user_a_id = profiles.id)
      )
  )
);

------------------------------------------------------------------------
-- 5. Re-create create_authorized_match.
--    Full function body preserved verbatim from migration 016 EXCEPT
--    for the two blocking-check WHERE clauses (steps i and j), which
--    change from
--        status = 'active'
--    to
--        status IN ('active', 'chat_started')
--    so that a user who has started chatting cannot receive a second
--    match. expired and unmatched still do not block.
--
--    Everything else — argument validation, profile checks, gender +
--    height hard filters, no-rematch rule, monthly cap on both sides,
--    score clamping, EXCEPTION handler, return shape — is identical to
--    migration 016. Grant/revoke pattern is preserved.
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
  'both-sides monthly cap, and both-sides open-match constraints '
  '(active OR chat_started) before INSERT.';
