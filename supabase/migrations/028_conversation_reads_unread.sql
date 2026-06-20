-- Migration 028: DB-backed conversation read state + unread helpers.
--
-- Why
-- ───
-- Before this migration the only "read state" on disk was the
-- messages.read_at column from migration 002, which no code path ever
-- wrote to. There was no way for a user to see which conversations had
-- new messages waiting after closing the app. Push notifications
-- (PR-PUSH-B/C/D, separate PRs) will eventually deliver new-message
-- pings, but the in-app unread badge must work even when push fails or
-- is denied — that requires a DB-backed per-conversation read marker.
--
-- Design choice: one timestamp per (conversation_id, user_id) rather
-- than per-message read_at writes. A user opening a chat needs one
-- UPSERT instead of N message UPDATEs; counting unread is a single
-- COUNT(*) > last_read_at JOIN. The messages.read_at column is left
-- as-is (still selected by chat.tsx, still never written) — pruning
-- it would be churn for zero behavior change.
--
-- This migration is exclusively unread/read state. No push tokens, no
-- send-push function, no notification config. Those land in PR-PUSH-B+.
--
-- Scope
-- ─────
--   1. New table public.conversation_reads with composite PK
--      (conversation_id, user_id).
--   2. RLS that lets each user manage only their own row, and only
--      when they're a participant of the conversation.
--   3. SECURITY DEFINER RPC mark_conversation_read(uuid) for the
--      idempotent upsert from chat.tsx.
--   4. SECURITY DEFINER RPC unread_summary() returning per-conversation
--      and total counts. Intentionally restricted to matches with
--      status IN ('active','chat_started') — terminal matches are
--      read-only and their lingering unread would be a permanent
--      "go reply" prompt the user cannot act on (see PR description
--      §D for the tradeoff discussion).
--   5. Add public.conversation_reads to supabase_realtime so the
--      tab-bar badge can react to read events from other tabs/devices
--      without polling.
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT install expo-notifications or add app.json config.
--   * Does NOT create push_tokens — that's PR-PUSH-B.
--   * Does NOT add a send-push function — that's PR-PUSH-C.
--   * Does NOT configure a Supabase Database Webhook — PR-PUSH-D.
--   * Does NOT modify messages, conversations, or matches schemas.
--   * Does NOT modify messages.read_at — left dormant for now.
--   * Does NOT touch migration 022.

------------------------------------------------------------------------
-- 1. conversation_reads table
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_reads (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_reads_user
  ON public.conversation_reads(user_id);

ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------
-- 2. RLS: per-user, participant-only.
--
--    SELECT: own rows only.
--    INSERT: own row only AND caller must be a participant in the
--            conversation (defense-in-depth — the RPC also checks).
--    UPDATE: same as INSERT.
--    DELETE: no policy → no client can delete. Cleanup happens via
--            the CASCADE on conversations / auth.users deletes.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users select own conversation_reads" ON public.conversation_reads;
CREATE POLICY "Users select own conversation_reads"
  ON public.conversation_reads FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own conversation_reads" ON public.conversation_reads;
CREATE POLICY "Users insert own conversation_reads"
  ON public.conversation_reads FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_reads.conversation_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users update own conversation_reads" ON public.conversation_reads;
CREATE POLICY "Users update own conversation_reads"
  ON public.conversation_reads FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_reads.conversation_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.conversation_reads TO authenticated;

------------------------------------------------------------------------
-- 3. mark_conversation_read(p_conversation_id uuid)
--
--    Idempotent UPSERT to last_read_at=now(). Returns jsonb:
--      success → { "status": "ok" }
--      caller missing → { "status": "error", "reason": "unauthorized" }
--      conv missing → { "status": "error", "reason": "conversation_not_found" }
--      non-participant → { "status": "error", "reason": "not_participant" }
--
--    SECURITY DEFINER bypasses RLS so callers don't need WITH CHECK
--    eligibility derived per-row; the body re-asserts the participant
--    check explicitly.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_user_a    uuid;
  v_user_b    uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'unauthorized');
  END IF;

  SELECT user_a_id, user_b_id INTO v_user_a, v_user_b
  FROM public.conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'conversation_not_found');
  END IF;

  IF v_caller_id <> v_user_a AND v_caller_id <> v_user_b THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'not_participant');
  END IF;

  INSERT INTO public.conversation_reads (conversation_id, user_id, last_read_at, updated_at)
  VALUES (p_conversation_id, v_caller_id, now(), now())
  ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET last_read_at = now(), updated_at = now();

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

COMMENT ON FUNCTION public.mark_conversation_read(uuid) IS
  'Idempotent UPSERT to conversation_reads.last_read_at=now() for the '
  'caller. Participant-gated. Returns jsonb {status:''ok''} on success '
  'or {status:''error'', reason:<discriminator>} on refusal. No message '
  'content read or written.';

------------------------------------------------------------------------
-- 4. unread_summary()
--
--    Returns jsonb:
--      success → {
--                  "total_unread": int,
--                  "conversations": [{ "conversation_id", "match_id",
--                                       "unread_count" }, ...]
--                }
--      caller missing → { "status": "error", "reason": "unauthorized" }
--
--    Counts only:
--      • messages where sender_id <> caller (own messages don't count)
--      • messages with created_at > COALESCE(cr.last_read_at, epoch)
--      • conversations whose match is in ('active','chat_started')
--        (terminal matches are excluded — see PR description §D)
--
--    Empty result is the well-formed
--      { "total_unread": 0, "conversations": [] }
--    so the client never has to special-case null.
--
--    No message content leaked — only ids and counts.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unread_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_result    jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'unauthorized');
  END IF;

  WITH per_conv AS (
    SELECT
      c.id           AS conversation_id,
      m.id           AS match_id,
      COUNT(msg.id)  AS unread_count
    FROM public.conversations c
    JOIN public.matches m ON m.id = c.match_id
    LEFT JOIN public.conversation_reads cr
      ON cr.conversation_id = c.id
     AND cr.user_id         = v_caller_id
    LEFT JOIN public.messages msg
      ON msg.conversation_id = c.id
     AND msg.sender_id      <> v_caller_id
     AND msg.created_at      > COALESCE(cr.last_read_at, 'epoch'::timestamptz)
    WHERE (c.user_a_id = v_caller_id OR c.user_b_id = v_caller_id)
      AND m.status IN ('active', 'chat_started')
    GROUP BY c.id, m.id
    HAVING COUNT(msg.id) > 0
  )
  SELECT jsonb_build_object(
    'total_unread', COALESCE(SUM(unread_count)::int, 0),
    'conversations', COALESCE(
      jsonb_agg(jsonb_build_object(
        'conversation_id', conversation_id,
        'match_id',        match_id,
        'unread_count',    unread_count::int
      )),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM per_conv;

  RETURN COALESCE(
    v_result,
    jsonb_build_object('total_unread', 0, 'conversations', '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unread_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unread_summary() TO authenticated;

COMMENT ON FUNCTION public.unread_summary() IS
  'Per-caller unread aggregate. Returns jsonb with total_unread (int) '
  'and conversations[] (each {conversation_id, match_id, unread_count}). '
  'Only counts peer-sent messages newer than the caller''s last_read_at, '
  'and only includes matches with status in (''active'',''chat_started''). '
  'No message content exposed.';

------------------------------------------------------------------------
-- 5. Realtime publication for conversation_reads
--
--    Lets the tab-bar badge react to read events from other tabs/
--    devices (e.g., the user opens the chat on their phone, the badge
--    on their laptop's web session clears immediately). Without this,
--    the badge would only refresh on message arrivals.
--
--    Guarded with EXCEPTION duplicate_object so re-applying the
--    migration is safe.
------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_reads;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
