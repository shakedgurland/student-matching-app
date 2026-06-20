-- Migration 027: Manual end-match + tightened matches UPDATE RLS.
--
-- Why
-- ───
-- Product rule for manual end-match (PR-END-MATCH):
--   • A match becomes durable only after BOTH participants send at least
--     one message within the 72h window (migration 026).
--   • Once durable (status='chat_started'), it never auto-expires.
--   • Either participant can manually end it, but ONLY AFTER the original
--     72h window has fully elapsed (now() >= expires_at).
--   • Ending sets status='unmatched'. Messages are preserved. The chat
--     becomes read-only (enforced by the messages-INSERT RLS from
--     migration 026, which already blocks sends to non-active /
--     non-chat_started matches). Both users become eligible for a new
--     match (create_authorized_match treats 'unmatched' as non-blocking).
--
-- The new SECURITY DEFINER RPC `end_match(uuid)` enforces every gate.
-- However, the existing matches UPDATE RLS policy (migration 002) lets
-- any participant UPDATE any column on their own match — including
-- status. Without tightening it, a malicious client could simply call
-- `UPDATE matches SET status='unmatched' WHERE id=X` and bypass every
-- gate the RPC enforces. This migration replaces the loose policy with
-- one that allows only the passive-expiry transition the app already
-- performs (active → expired when expires_at < now()). All other
-- transitions must go through SECURITY DEFINER functions which bypass
-- RLS:
--   • active → chat_started   → transition_match_to_chat_started trigger
--   • active → expired        → expire_stale_matches cron (also passive)
--   • chat_started → unmatched → end_match RPC (this migration)
--
-- Scope (intentionally narrow but complete)
-- ─────────────────────────────────────────
--   1. New SECURITY DEFINER function end_match(p_match_id uuid) that
--      verifies caller is participant, status='chat_started', and
--      expires_at <= now() before flipping to 'unmatched'. Returns a
--      jsonb discriminator the app branches on.
--   2. REVOKE all on the new function FROM PUBLIC; GRANT EXECUTE to
--      authenticated.
--   3. Replace the matches UPDATE policy from migration 002 with a
--      narrower one that only permits the passive-expiry transition
--      (status='active' AND expires_at < now() → status='expired').
--      The new policy preserves app/(tabs)/index.tsx#fetchCurrentMatch's
--      scoped passive expiry exactly and locks down every other
--      client-driven status change.
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT introduce a new status value.
--   * Does NOT change the messages INSERT RLS (already terminal-aware
--     after migration 026 — 'unmatched' is already blocked from sends).
--   * Does NOT change the messages / conversations SELECT policies —
--     history of unmatched matches remains readable.
--   * Does NOT change the trigger from migration 026.
--   * Does NOT change expire_stale_matches() or the cron schedule.
--   * Does NOT change create_authorized_match — its blocking logic
--     `status IN ('active','chat_started')` already correctly treats
--     'unmatched' as non-blocking.
--   * Does NOT delete or modify any message / conversation row.
--   * Does NOT touch migration 022.
--
-- Idempotency
-- ───────────
-- CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS + CREATE POLICY.
-- Safe to re-apply.

------------------------------------------------------------------------
-- 1. end_match(p_match_id uuid) RPC
--
--    Returns jsonb. The 'status' discriminator is one of:
--      'ended'                — success; match flipped to 'unmatched'
--      'error' with reason:
--        'unauthorized'         — no auth.uid()
--        'match_not_found'      — match_id does not exist
--        'not_participant'      — caller is not user_a or user_b
--        'not_chat_started'     — status is not 'chat_started'
--                                 (active / expired / unmatched)
--        'not_allowed_yet'      — expires_at > now()
--    No message body details are leaked.
--
--    Defensive UPDATE WHERE clause re-asserts the same invariants the
--    PL/pgSQL block just checked, so a SELECT-then-UPDATE race against
--    another concurrent state change cannot revive a stale terminal
--    row or expire-then-unmatch in the wrong order.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_user_a      uuid;
  v_user_b      uuid;
  v_status      text;
  v_expires_at  timestamptz;
  v_updated     integer;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'unauthorized');
  END IF;

  SELECT user_a_id, user_b_id, status, expires_at
    INTO v_user_a, v_user_b, v_status, v_expires_at
    FROM public.matches
   WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'match_not_found');
  END IF;

  IF v_caller_id <> v_user_a AND v_caller_id <> v_user_b THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'not_participant');
  END IF;

  IF v_status <> 'chat_started' THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'not_chat_started',
      'current_status', v_status
    );
  END IF;

  IF v_expires_at > now() THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'not_allowed_yet',
      'expires_at', v_expires_at
    );
  END IF;

  UPDATE public.matches
     SET status = 'unmatched',
         updated_at = now()
   WHERE id = p_match_id
     AND status = 'chat_started'
     AND expires_at <= now();
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- A concurrent UPDATE (e.g., a sibling end_match call from the
    -- peer) changed status between our SELECT and our UPDATE. Surface
    -- the no-op so the client can refetch.
    RETURN jsonb_build_object('status', 'error', 'reason', 'race_no_op');
  END IF;

  RETURN jsonb_build_object('status', 'ended', 'match_id', p_match_id);
END;
$$;

REVOKE ALL ON FUNCTION public.end_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_match(uuid) TO authenticated;

COMMENT ON FUNCTION public.end_match(uuid) IS
  'Manual end-match RPC. Participant-gated. Flips status from '
  '''chat_started'' to ''unmatched'' only when now() >= expires_at. '
  'Returns jsonb with status=''ended'' on success or status=''error'' '
  'with a reason discriminator on every refusal. Preserves all '
  'messages and the conversation. Granted EXECUTE to authenticated '
  'only — clients invoking it bypass the tightened matches UPDATE '
  'RLS via SECURITY DEFINER.';

------------------------------------------------------------------------
-- 2. Tighten matches UPDATE RLS.
--
--    Migration 002 created a permissive policy that allowed any
--    participant to UPDATE any column on their own match row.
--    Combined with the new end_match RPC, that policy is now a
--    bypass risk: a client could `UPDATE matches SET status='unmatched'
--    WHERE id=X` and skip every check end_match enforces.
--
--    The replacement allows ONLY the client-side passive-expiry
--    pattern that app/(tabs)/index.tsx#fetchCurrentMatch performs:
--    flip status from 'active' to 'expired' on a row that has
--    actually exceeded expires_at. Every other status mutation MUST
--    go through a SECURITY DEFINER function (which bypasses RLS):
--      active → chat_started   → transition_match_to_chat_started trigger
--      active → expired (bulk) → expire_stale_matches cron
--      chat_started → unmatched → end_match RPC
--      INSERT of new match     → create_authorized_match RPC
--
--    The new policy uses USING + WITH CHECK in tandem:
--      USING       → the EXISTING row must be participant-owned AND
--                    currently 'active' AND past expires_at.
--      WITH CHECK  → the NEW row's status must be 'expired'.
--    Combined: only the active→expired passive transition is allowed
--    from authenticated clients. Service role (and SECURITY DEFINER
--    bodies, which run as the function owner) bypass RLS entirely.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own matches" ON public.matches;

CREATE POLICY "Users can passively expire their own stale active match"
  ON public.matches FOR UPDATE
  USING (
        (auth.uid() = user_a_id OR auth.uid() = user_b_id)
    AND status = 'active'
    AND expires_at < now()
  )
  WITH CHECK (
        (auth.uid() = user_a_id OR auth.uid() = user_b_id)
    AND status = 'expired'
  );
