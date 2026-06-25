-- Migration 036: Add SECURITY DEFINER RPC public.send_match_feedback.
--
-- Fixes the client-direct-REST-INSERT JWT-drop bug that produces an
-- opaque PostgREST 42501 from the match_feedback INSERT RLS policy
-- (migration 013). Mirrors the proven pattern of migration 030
-- (send_chat_message_rpc) which solved the identical class of failure
-- on the messages table — see app/chat.tsx BATCH-H8 notes for the
-- real-device evidence behind that earlier fix.
--
-- Diagnostic context (PR #70 follow-up audit):
--   * Schema for match_feedback is pristine (matches migration 013
--     verbatim — F1/F2/F5 read-only checks confirmed).
--   * RLS is enabled (F3) with exactly the original 3 policies (F4).
--   * No send_match_feedback RPC exists yet (F6 returned 0 rows).
--   * Total match_feedback rows in production is 0 (F7) — confirming
--     the feedback insert has never succeeded end-to-end.
--   * Client values pass every CHECK constraint; only failure surface
--     left is the RLS predicate evaluating auth.uid() as different
--     from user_id at the REST layer (JWT-drop), which is what this
--     SECURITY DEFINER RPC bypasses.
--
-- What this migration does
-- ────────────────────────
--   1. Adds public.send_match_feedback(...) — SECURITY DEFINER RPC.
--      Reads auth.uid() server-side once (single source of truth,
--      immune to client-side JWT drop) and INSERTs into
--      public.match_feedback under definer privileges (bypasses the
--      RLS WITH CHECK that fails when the JWT drops).
--   2. Re-validates every invariant the RLS INSERT policy enforces,
--      so the new bypass surface is no weaker than the policy:
--        * auth.uid() must be non-null               → 'unauthenticated'
--        * p_match_id must be non-null               → 'invalid_args'
--        * feedback_stage must be in the allowed set → 'invalid_stage'
--        * rating, if set, must be 1..5              → 'invalid_rating'
--        * outcome_status, if set, must be in set    → 'invalid_outcome'
--        * match must exist                           → 'match_not_found'
--        * caller must be a participant of the match → 'not_participant'
--      positive_reasons / negative_reasons pass through unchanged (the
--      table column is plain text[] with no enum CHECK — same permissive
--      shape the client already relies on).
--   3. is_private_to_system is always set to true (matches the client
--      default; no parameter exposed — clients have never sent
--      anything else).
--   4. Server-side diagnostic logging in the exception handler via
--      RAISE LOG. The log line includes SQLSTATE / SQLERRM / p_match_id
--      / resolved user id and lands in Supabase Postgres logs (Dashboard
--      → Logs → Postgres) — visible only to project owners, never to
--      the client. The client response stays a generic
--      { status: 'error' } envelope with no SQLERRM leak (matches the
--      hardening from migrations 033 / 034 / 035).
--   5. EXECUTE granted to authenticated only. anon and PUBLIC are
--      explicitly revoked.
--
-- What this migration does NOT do
-- ───────────────────────────────
--   * Does NOT alter public.match_feedback schema (no new columns,
--     no UNIQUE constraint on (match_id, user_id, feedback_stage),
--     no constraint changes).
--   * Does NOT change the existing RLS policies. The direct-INSERT
--     surface stays intact for backward compatibility; the RPC just
--     provides a JWT-drop-immune alternative that re-validates every
--     invariant the policy enforces.
--   * Does NOT change any other table, function, trigger, or migration.
--   * Does NOT change any client copy or UI logic. The client wrapper
--     (lib/feedback.ts) will be updated in a separate commit.
--   * Does NOT introduce or change any score / activity surface.
--
-- Idempotency
-- ───────────
--   CREATE OR REPLACE FUNCTION + REVOKE / GRANT — naturally idempotent.
--   Safe to re-apply.

CREATE OR REPLACE FUNCTION public.send_match_feedback(
  p_match_id         uuid,
  p_feedback_stage   text,
  p_rating           integer,
  p_outcome_status   text,
  p_positive_reasons text[],
  p_negative_reasons text[],
  p_free_text        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_match   record;
  v_new_id  uuid;
BEGIN
  ----------------------------------------------------------------------
  -- a. Authenticated caller required. The only trusted source of
  --    identity is auth.uid() — the client cannot pass a user id.
  ----------------------------------------------------------------------
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthenticated');
  END IF;

  ----------------------------------------------------------------------
  -- b. Argument validation. Mirrors the table's CHECK constraints so
  --    the RPC returns a discriminated status instead of letting the
  --    INSERT raise a generic 23514 / 23502 the client can't act on.
  ----------------------------------------------------------------------
  IF p_match_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_args', 'reason', 'missing_match_id');
  END IF;

  IF p_feedback_stage IS NULL
     OR p_feedback_stage NOT IN ('after_match', 'after_chat', 'no_date', 'after_date', 'ended') THEN
    RETURN jsonb_build_object('status', 'invalid_stage');
  END IF;

  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RETURN jsonb_build_object('status', 'invalid_rating');
  END IF;

  IF p_outcome_status IS NOT NULL
     AND p_outcome_status NOT IN (
       'still_chatting', 'date_planned', 'date_happened', 'continued',
       'ended', 'no_progress', 'not_interested', 'other_connection',
       'busy', 'other'
     ) THEN
    RETURN jsonb_build_object('status', 'invalid_outcome');
  END IF;

  ----------------------------------------------------------------------
  -- c. Participant guard: caller must be user_a_id or user_b_id of
  --    the target match. Same predicate as migration 013's INSERT RLS
  --    policy, evaluated here under SECURITY DEFINER so it ignores
  --    migration 023's matches-SELECT narrowing (which hides terminal
  --    matches from the caller and would otherwise short-circuit the
  --    EXISTS sub-query inside the RLS policy).
  ----------------------------------------------------------------------
  SELECT id, user_a_id, user_b_id
    INTO v_match
    FROM public.matches
   WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'match_not_found');
  END IF;

  IF v_user_id <> v_match.user_a_id AND v_user_id <> v_match.user_b_id THEN
    RETURN jsonb_build_object('status', 'not_participant');
  END IF;

  ----------------------------------------------------------------------
  -- d. INSERT under definer privileges. user_id is derived from
  --    auth.uid() — the caller cannot inject another user's id.
  --    is_private_to_system is always true (matches the client default;
  --    no parameter exposed).
  ----------------------------------------------------------------------
  INSERT INTO public.match_feedback (
    match_id,
    user_id,
    feedback_stage,
    rating,
    outcome_status,
    positive_reasons,
    negative_reasons,
    free_text,
    is_private_to_system
  ) VALUES (
    p_match_id,
    v_user_id,
    p_feedback_stage,
    p_rating,
    p_outcome_status,
    COALESCE(p_positive_reasons, '{}'::text[]),
    COALESCE(p_negative_reasons, '{}'::text[]),
    p_free_text,
    true
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('status', 'ok', 'id', v_new_id);

EXCEPTION WHEN OTHERS THEN
  ----------------------------------------------------------------------
  -- e. Server-side diagnostic + generic client envelope.
  --
  --    RAISE LOG writes to the Supabase Postgres log stream (Dashboard
  --    → Logs → Postgres) which is visible to project owners only.
  --    The client response stays a generic { status: 'error' } with
  --    no SQLSTATE, SQLERRM, table/column hint, or RLS detail leaked.
  --    Mirrors the no-SQLERRM hardening pattern of migrations
  --    033 / 034 / 035 while keeping the diagnostic data we need to
  --    debug future failures.
  --
  --    p_match_id and v_user_id (resolved auth.uid()) are non-sensitive
  --    UUIDs; SQLSTATE/SQLERRM may contain Postgres detail but stay
  --    server-side. p_free_text / reason chips / ratings are NOT
  --    logged here — only structural diagnostic.
  ----------------------------------------------------------------------
  RAISE LOG 'send_match_feedback failed: sqlstate=% sqlerrm=% match_id=% user_id=%',
    SQLSTATE, SQLERRM, p_match_id, v_user_id;
  RETURN jsonb_build_object('status', 'error');
END;
$$;

REVOKE ALL ON FUNCTION
  public.send_match_feedback(uuid, text, integer, text, text[], text[], text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.send_match_feedback(uuid, text, integer, text, text[], text[], text)
  FROM anon;
GRANT EXECUTE ON FUNCTION
  public.send_match_feedback(uuid, text, integer, text, text[], text[], text)
  TO authenticated;

COMMENT ON FUNCTION public.send_match_feedback(uuid, text, integer, text, text[], text[], text) IS
  'Client-callable RPC that inserts a match_feedback row using auth.uid() '
  'as the trusted caller id. SECURITY DEFINER bypasses the JWT-drop '
  'failure mode that hits the direct REST INSERT (same class as the '
  'send_chat_message fix from migration 030). Re-validates every '
  'invariant the RLS INSERT policy enforces. Server-side RAISE LOG on '
  'exception; client response is always generic. EXECUTE granted to '
  'authenticated only; anon and PUBLIC are revoked. Returns '
  '{status: ok|unauthenticated|invalid_args|invalid_stage|invalid_rating|'
  'invalid_outcome|match_not_found|not_participant|error}.';
