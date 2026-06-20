-- Migration 026: Mutual chat-start lifecycle + lifecycle-aware messages
-- INSERT RLS.
--
-- Why
-- ───
-- Migration 023 created transition_match_to_chat_started() as an
-- AFTER INSERT trigger on public.messages that flipped status from
-- 'active' to 'chat_started' on the FIRST message from ANY participant.
-- That made a one-sided message permanently durable: the cron-driven
-- expire_stale_matches() only touches status='active', so a one-sided
-- chat_started match never expired. Both participants then sat blocked
-- from new matches indefinitely, in violation of the 72h product promise.
--
-- This migration tightens the lifecycle on three independent layers:
--   * Trigger requires COUNT(DISTINCT sender_id) >= 2 AND match still
--     in its 72h window to promote to chat_started.
--   * Messages-INSERT RLS refuses inserts when the match is terminal
--     ('expired' / 'unmatched') OR active-but-past-expires_at — closing
--     the cron-gap race where a stale active match could still receive
--     a second message between deadline and the next cron tick.
--   * Backfill cleans up any historical row that was flipped under the
--     old trigger.
--
-- No status enum change. No schema change. Just trigger body + RLS
-- policy + backfill + a new participant-gated RPC.
--
-- Scope (intentionally narrow but complete)
-- ─────────────────────────────────────────
--   1. Replace transition_match_to_chat_started() to require
--      COUNT(DISTINCT sender_id) >= 2 AND expires_at > now()
--      in the conversation's messages (NEW row is already visible to
--      the count because the trigger fires AFTER INSERT FOR EACH ROW).
--   2. Re-bind the trigger (DROP+CREATE) — idempotent.
--   3. Tighten the messages-INSERT RLS policy: in addition to the
--      participant check, require match.status='chat_started' OR
--      (match.status='active' AND match.expires_at > now()). Blocks
--      sends on terminal matches and on stale-active matches at the
--      database level, regardless of client-side composer state.
--   4. Backfill historical 'chat_started' matches whose conversation has
--      fewer than 2 distinct senders:
--        • expires_at still in the future → revert to 'active' so the
--          cron can re-evaluate at the natural deadline.
--        • expires_at already passed → set directly to 'expired' so the
--          row is honestly terminal immediately.
--      Matches with a genuinely mutual conversation are left alone.
--   5. New SECURITY DEFINER RPC `match_message_state(p_match_id uuid)`
--      that returns booleans + counts the app uses to render the three
--      'active' sub-states (waiting-to-start / waiting-for-reply /
--      they-wrote-back). Participant-gated; exposes NO message content.
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT introduce a new status value. The 4-status enum
--     (active / chat_started / expired / unmatched) is sufficient.
--   * Does NOT modify expire_stale_matches() — its
--     `WHERE status='active' AND expires_at < now()` already correctly
--     expires one-sided matches after the deadline.
--   * Does NOT change pg_cron scheduling.
--   * Does NOT change create_authorized_match RPC blocking logic —
--     it already treats `IN ('active','chat_started')` as blocking,
--     which is correct: one-sided active still blocks new matches.
--   * Does NOT change the messages SELECT policy — reads stay
--     participant-keyed so terminal-match history remains readable.
--   * Does NOT change conversations RLS — participant-keyed reads OK.
--   * Does NOT change peer-profile RLS — read-only history viewing
--     after expired/unmatched is handled app-side via graceful
--     peer-fetch fallback in app/chat.tsx (same PR).
--   * Does NOT delete or modify any message or conversation row.
--   * Does NOT touch migration 022.
--
-- Idempotency
-- ───────────
-- CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- The backfill block re-runs cleanly because the WHERE clause filters
-- to status='chat_started' with <2 senders — once corrected, the rows
-- no longer match.

------------------------------------------------------------------------
-- 1. Replace transition_match_to_chat_started()
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_match_to_chat_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id           uuid;
  v_distinct_senders   integer;
BEGIN
  SELECT match_id INTO v_match_id
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF v_match_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- NEW row is already visible to this SELECT because the trigger
  -- fires AFTER INSERT FOR EACH ROW. So a single-message conversation
  -- yields v_distinct_senders = 1; the second sender brings it to 2.
  SELECT COUNT(DISTINCT sender_id) INTO v_distinct_senders
  FROM public.messages
  WHERE conversation_id = NEW.conversation_id;

  IF v_distinct_senders >= 2 THEN
    -- Idempotent: AND status='active' guards re-promotion of terminal
    -- rows; AND expires_at > now() prevents promotion of a stale
    -- active match that should have already expired. Without the
    -- expires_at guard, a service-role insert OR a race between the
    -- cron tick and the messages-INSERT RLS check could otherwise
    -- promote a match to chat_started past its 72h window — leaving
    -- it durable forever. With the guard, such a stale match stays
    -- 'active' and is expired by the next cron tick.
    UPDATE public.matches
       SET status = 'chat_started',
           updated_at = now()
     WHERE id = v_match_id
       AND status = 'active'
       AND expires_at > now();
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
-- 2. Lifecycle-aware messages INSERT RLS.
--
--    Before this migration, the messages INSERT policy (from
--    migration 002) checked only that the sender is a participant of
--    the conversation. It did NOT consult match.status or expires_at,
--    which meant clients could INSERT into expired/unmatched matches
--    and — worse — into stale-active matches whose 72h window had
--    passed but whose cron tick hadn't fired yet. The latter race
--    could even let the new mutual-sender trigger see two senders
--    and (without the expires_at guard added above) promote a stale
--    match to chat_started forever.
--
--    The replacement policy requires the same participant check AND
--    one of:
--       match.status = 'chat_started'                       — mutual chat is durable; sends always allowed
--       (match.status = 'active' AND match.expires_at > now())  — live 72h window; one-sided reply allowed
--    Explicitly blocks:
--       match.status IN ('expired', 'unmatched')            — terminal; read-only
--       (match.status = 'active' AND match.expires_at <= now())  — stale; cron will expire on next tick
--
--    Reads (messages SELECT, conversations SELECT, messages SELECT
--    via realtime) are UNCHANGED — history of terminal matches
--    remains readable to participants.
--
--    Implementation choice: direct RLS policy replacement rather than
--    a BEFORE INSERT trigger or a SECURITY DEFINER helper. RLS is the
--    single declarative source of authorization; the resulting error
--    (PostgREST 42501 "new row violates row-level security policy")
--    is what client supabase-js already handles. A trigger would
--    duplicate the logic and add overhead.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
CREATE POLICY "Users can send messages to their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = messages.conversation_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
        AND (
              m.status = 'chat_started'
           OR (m.status = 'active' AND m.expires_at > now())
        )
    )
  );

------------------------------------------------------------------------
-- 3. Backfill one-sided 'chat_started' rows
--    (rows flipped by the old trigger that never had a mutual reply)
------------------------------------------------------------------------
DO $$
DECLARE
  v_reverted integer;
  v_expired  integer;
BEGIN
  -- 2a. Still in the 72h window → revert to 'active'. The cron will
  --     expire them at expires_at if no second sender appears.
  WITH bad AS (
    SELECT m.id
    FROM public.matches m
    JOIN public.conversations c ON c.match_id = m.id
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT sender_id) AS n
      FROM public.messages
      WHERE conversation_id = c.id
    ) s ON true
    WHERE m.status = 'chat_started'
      AND COALESCE(s.n, 0) < 2
      AND m.expires_at > now()
  )
  UPDATE public.matches m
     SET status = 'active', updated_at = now()
    FROM bad
   WHERE m.id = bad.id;
  GET DIAGNOSTICS v_reverted = ROW_COUNT;
  RAISE NOTICE
    'mutual-chat-start backfill: reverted % one-sided chat_started rows back to active', v_reverted;

  -- 2b. Already past expires_at → expire directly. We do this here
  --     (rather than waiting for the cron) so the backfill produces an
  --     honest terminal state immediately.
  WITH bad AS (
    SELECT m.id
    FROM public.matches m
    JOIN public.conversations c ON c.match_id = m.id
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT sender_id) AS n
      FROM public.messages
      WHERE conversation_id = c.id
    ) s ON true
    WHERE m.status = 'chat_started'
      AND COALESCE(s.n, 0) < 2
      AND m.expires_at <= now()
  )
  UPDATE public.matches m
     SET status = 'expired', updated_at = now()
    FROM bad
   WHERE m.id = bad.id;
  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RAISE NOTICE
    'mutual-chat-start backfill: expired % one-sided chat_started rows that were already stale', v_expired;

  -- 2c. Untouched rows: any chat_started with >= 2 distinct senders
  --     remains chat_started. No update. Safe.
END $$;

------------------------------------------------------------------------
-- 4. match_message_state(p_match_id uuid)
--    Participant-gated lookup the app uses to render the three 'active'
--    sub-states without needing to SELECT raw messages on every render.
--
--    Returns jsonb with:
--      i_have_sent          : boolean — caller has at least one message
--      peer_has_sent        : boolean — peer  has at least one message
--      distinct_sender_count: integer — 0, 1, or 2
--      is_mutual_started    : boolean — distinct_sender_count >= 2
--
--    On unauthorized / not-participant / match-not-found, returns
--    { error: <reason> } so the app can branch on the discriminator
--    without leaking why.
--
--    SECURITY DEFINER + participant check is preferred over a plain
--    SELECT because:
--      • only booleans + a count leak — no message content;
--      • works regardless of match.status (caller can still query
--        terminal matches' state for history view);
--      • single round-trip instead of multiple SELECTs.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_message_state(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id        uuid;
  v_user_a           uuid;
  v_user_b           uuid;
  v_peer_id          uuid;
  v_conversation_id  uuid;
  v_distinct         integer := 0;
  v_caller_sent      boolean := false;
  v_peer_sent        boolean := false;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT user_a_id, user_b_id INTO v_user_a, v_user_b
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'match_not_found');
  END IF;

  IF v_caller_id <> v_user_a AND v_caller_id <> v_user_b THEN
    RETURN jsonb_build_object('error', 'not_participant');
  END IF;

  v_peer_id := CASE WHEN v_caller_id = v_user_a THEN v_user_b ELSE v_user_a END;

  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE match_id = p_match_id;

  IF NOT FOUND THEN
    -- No conversation row yet → nobody has sent anything.
    RETURN jsonb_build_object(
      'i_have_sent',           false,
      'peer_has_sent',         false,
      'distinct_sender_count', 0,
      'is_mutual_started',     false
    );
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.messages
     WHERE conversation_id = v_conversation_id AND sender_id = v_caller_id
  ) INTO v_caller_sent;

  SELECT EXISTS(
    SELECT 1 FROM public.messages
     WHERE conversation_id = v_conversation_id AND sender_id = v_peer_id
  ) INTO v_peer_sent;

  SELECT COUNT(DISTINCT sender_id) INTO v_distinct
  FROM public.messages
  WHERE conversation_id = v_conversation_id;

  RETURN jsonb_build_object(
    'i_have_sent',           v_caller_sent,
    'peer_has_sent',         v_peer_sent,
    'distinct_sender_count', v_distinct,
    'is_mutual_started',     v_distinct >= 2
  );
END;
$$;

REVOKE ALL ON FUNCTION public.match_message_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_message_state(uuid) TO authenticated;

COMMENT ON FUNCTION public.match_message_state(uuid) IS
  'Participant-gated RPC. Returns jsonb with i_have_sent, peer_has_sent, '
  'distinct_sender_count, is_mutual_started — no message content. Used by '
  'app/match-result.tsx to render the three active sub-states without '
  'pulling raw messages over the wire. Returns {error:<reason>} on '
  'unauthorized / not_participant / match_not_found.';
