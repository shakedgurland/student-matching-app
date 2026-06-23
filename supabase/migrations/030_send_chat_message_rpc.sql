-- Migration 030: send_chat_message RPC (production-grade chat write path)
--
-- Why
-- ───
-- Real-device TestFlight evidence (build with PR #44 H7) confirmed
-- direct `INSERT INTO public.messages` hits PostgREST 42501 ("new row
-- violates row-level security policy") even when:
--   * supabase.auth.getUser() succeeded with a valid user id
--   * match row is active + expires_at > now()
--   * conversation row exists with the caller as user_a_id or user_b_id
--   * authenticated role has INSERT privilege on public.messages
--   * the lifecycle/participant clauses of the migration-026 INSERT RLS
--     all logically evaluate to TRUE for this caller + this row
--
-- Root cause is at the auth-attachment layer: supabase-js can lose JWT
-- attachment on the INSERT request even when getUser() right before it
-- succeeded (token refresh race, AsyncStorage / session-state drift,
-- iOS background suspension). When the JWT is missing on the INSERT,
-- auth.uid() = NULL on the server, the first clause of the messages
-- INSERT RLS (auth.uid() = sender_id) fails, and PostgREST returns
-- 42501 — opaque, indistinguishable from a real RLS violation.
--
-- Fix
-- ───
-- Move the message-insert behind a SECURITY DEFINER RPC. Inside the
-- function we explicitly read auth.uid() ONCE, raise a structured,
-- per-cause exception if anything is wrong, and only then INSERT.
-- Because the function runs as the function owner, the INSERT bypasses
-- messages RLS (controlled internally by the explicit validation that
-- mirrors — and is a strict superset of — the migration-026 RLS).
--
-- Result for the app: instead of an opaque 42501, the client gets a
-- distinguishable SQLSTATE + message pair per failure mode, which the
-- chat UI maps to specific Hebrew copy + a beta-safe failure code.
--
-- Scope / safety
-- ──────────────
--   * Pure additive: creates ONE function and its grants.
--   * Does NOT modify any existing table, RLS, trigger, or function.
--   * The messages INSERT RLS (migration 026) stays as belt-and-
--     suspenders for any other write path (none currently exists in
--     the app, but the policy keeps direct inserts safe by default).
--   * The transition_match_to_chat_started AFTER INSERT trigger
--     (migration 026:127-131) fires on rows inserted via this RPC
--     exactly as it did on direct inserts.
--   * search_path = public (Supabase-required for SECURITY DEFINER).
--   * GRANT EXECUTE TO authenticated AND anon. Counter-intuitively
--     anon must have EXECUTE so the function body runs at all for an
--     unauthenticated caller — otherwise PostgreSQL raises SQLSTATE
--     42501 (insufficient_privilege) at the EXECUTE permission check
--     BEFORE the function body fires, and the client sees an opaque
--     42501 indistinguishable from a real RLS rejection (which is
--     exactly the original direct-insert problem this RPC exists to
--     fix). With anon EXECUTE, the function enters its body, the
--     first statement checks auth.uid(), and raises a discriminated
--     28000 'unauthenticated' that the client maps to a clear
--     "התחברות נדרשת" alert. The in-function auth.uid() check is
--     the security boundary, not the EXECUTE grant. The function
--     does ZERO data access for unauthenticated callers — it raises
--     before reading conversations / matches / profiles.
--   * sender_id is set inside the function from auth.uid() — caller
--     cannot supply or spoof it.
--   * Does NOT touch migration 022.
--   * Does NOT touch any questionnaire-related logic.
--
-- Idempotency
-- ───────────
-- CREATE OR REPLACE FUNCTION + REVOKE/GRANT — re-runs cleanly.

CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_conversation_id uuid,
  p_content text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid;
  v_content       text;
  v_user_a_id     uuid;
  v_user_b_id     uuid;
  v_match_id      uuid;
  v_match_status  text;
  v_expires_at    timestamptz;
  v_msg           public.messages%ROWTYPE;
BEGIN
  -- 1. Authenticated user check. The whole point of this function is
  --    to make this check unambiguous instead of relying on the REST
  --    request to carry the JWT through to RLS evaluation.
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- 2. Content sanity. Trim whitespace; reject empty content with the
  --    standard "invalid parameter value" SQLSTATE so the client can
  --    distinguish it from anything else.
  v_content := btrim(coalesce(p_content, ''));
  IF length(v_content) = 0 THEN
    RAISE EXCEPTION 'empty_content' USING ERRCODE = '22023';
  END IF;

  -- 3. Resolve conversation + match in a single SELECT. LEFT JOIN on
  --    matches so we can disambiguate "conversation gone" from
  --    "match gone" if it ever happens (conversations.match_id is
  --    ON DELETE SET NULL per migration 002).
  SELECT c.user_a_id, c.user_b_id, c.match_id,
         m.status, m.expires_at
    INTO v_user_a_id, v_user_b_id, v_match_id,
         v_match_status, v_expires_at
    FROM public.conversations c
    LEFT JOIN public.matches m ON m.id = c.match_id
   WHERE c.id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found';
  END IF;

  -- 4. Participant gate. Mirrors the migration-026 RLS clause; here it
  --    runs as a plain procedural check so a failure surfaces as a
  --    discriminated exception, not opaque 42501.
  IF v_user_id <> v_user_a_id AND v_user_id <> v_user_b_id THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  -- 5. Match must exist (conversation might have been orphaned via
  --    the ON DELETE SET NULL on conversations.match_id, though we
  --    don't expect that for live matches).
  IF v_match_status IS NULL THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- 6. Lifecycle gate. Same condition as the migration-026 INSERT RLS:
  --      status = 'chat_started'  OR
  --      (status = 'active' AND expires_at > now())
  IF v_match_status NOT IN ('chat_started', 'active') THEN
    RAISE EXCEPTION 'match_terminal';
  END IF;
  IF v_match_status = 'active' AND v_expires_at <= now() THEN
    RAISE EXCEPTION 'match_expired';
  END IF;

  -- 7. Insert. SECURITY DEFINER lets this bypass the messages RLS.
  --    sender_id is forced to auth.uid() from step 1 — caller cannot
  --    spoof, even if they crafted a custom payload.
  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (p_conversation_id, v_user_id, v_content)
  RETURNING * INTO v_msg;

  -- 8. Maintain conversations.last_message_at so unread tracking +
  --    conversation sorting see the latest activity. This was missing
  --    from the prior direct-insert path; the addition is an invariant
  --    improvement, not a regression.
  UPDATE public.conversations
     SET last_message_at = v_msg.created_at
   WHERE id = p_conversation_id;

  RETURN v_msg;
END;
$$;

-- Grants. Strip the default PUBLIC EXECUTE; then explicitly grant to
-- BOTH anon and authenticated. anon needs EXECUTE so the function
-- body can run for an unauthenticated caller and raise the
-- discriminated 28000 'unauthenticated' (see scope/safety note above).
-- The security boundary is the in-function `IF auth.uid() IS NULL`
-- check, NOT the EXECUTE grant — the function performs zero data
-- access for unauthenticated callers.
REVOKE ALL ON FUNCTION public.send_chat_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text) TO anon;

COMMENT ON FUNCTION public.send_chat_message(uuid, text) IS
  'Production-grade chat message INSERT. Replaces direct client INSERT '
  'into public.messages, which can fail with PostgREST 42501 when the '
  'JWT attaches inconsistently between auth.getUser() and the REST '
  'request. Returns the inserted public.messages row. Raises structured '
  'SQLSTATEs: 28000 unauthenticated, 22023 empty_content, P0001 '
  'conversation_not_found / not_participant / match_not_found / '
  'match_terminal / match_expired (discriminated by exception MESSAGE). '
  'Fires the existing migration-026 transition_match_to_chat_started '
  'AFTER INSERT trigger on the new row exactly as direct inserts did.';
