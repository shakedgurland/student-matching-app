-- Migration 021: Enable Supabase Realtime for chat messages.
--
-- Why
-- ───
-- app/chat.tsx subscribes to postgres_changes (INSERT) on public.messages
-- via supabase.channel(...).on('postgres_changes', ...) so that when the
-- peer sends a message it appears in the open chat without requiring the
-- recipient to close and reopen the screen.
--
-- For that subscription to deliver events, the table must be a member of
-- the supabase_realtime publication. Production verification via
--
--   SELECT 1 FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime'
--      AND schemaname = 'public'
--      AND tablename  = 'messages';
--
-- returned no rows, confirming the table is not currently published.
-- Without this membership, sends and initial-load still work (because the
-- chat screen performs a direct INSERT and a direct SELECT), but peer
-- messages would only appear on next mount.
--
-- Scope (intentionally narrow)
-- ────────────────────────────
--   * Adds public.messages to the supabase_realtime publication.
--   * Does NOT add any other table. conversations and matches do not
--     currently need realtime in the implemented chat flow; revisit only
--     when a screen subscribes to changes on them.
--   * Does NOT change RLS or grants. The existing message-visibility RLS
--     policies from migration 002 still apply to realtime delivery —
--     Supabase Realtime evaluates RLS before broadcasting each event to a
--     subscriber, so the peer sees only events for conversations they
--     participate in.
--
-- Idempotency
-- ───────────
-- If the table is already a member of the publication (e.g., this
-- migration is re-applied or a sibling environment was set up via
-- Studio), Postgres raises duplicate_object (SQLSTATE 42710). The DO
-- block swallows that specific exception so the migration is safe to
-- re-run without manual cleanup.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
