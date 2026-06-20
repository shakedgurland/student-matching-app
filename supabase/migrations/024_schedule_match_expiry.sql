-- Migration 024: Schedule the match-expiry cron job.
--
-- Why
-- ───
-- Migration 023 created public.expire_stale_matches() and tried to register
-- it on a 5-minute pg_cron schedule, guarded by an `IF EXISTS pg_extension`
-- check. At apply time, pg_cron was NOT yet enabled on the project, so the
-- guarded block cleanly no-op'd: the function exists but no schedule was
-- registered.
--
-- pg_cron has since been enabled in Studio (verified: pg_cron 1.6.4 is
-- installed). Postgres migrations are append-only — there is no mechanism
-- that retroactively re-runs the skipped block from migration 023. So this
-- new migration registers the schedule.
--
-- Scope (intentionally narrow)
-- ────────────────────────────
--   * Schedules `expire-stale-matches` running every 5 minutes.
--   * Idempotent: unschedule-then-schedule, so re-applying replaces a
--     stale entry rather than creating duplicates.
--   * Guarded with the same `IF EXISTS pg_extension` pattern as migration
--     023 — safe to re-apply even if pg_cron is later disabled or applied
--     to a sibling environment without pg_cron.
--   * Notifies operators via RAISE NOTICE when pg_cron is absent so the
--     no-op state is auditable in the migration logs.
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT `CREATE EXTENSION pg_cron`. Extension enablement is a
--     Supabase-managed Studio action (Database → Extensions → toggle).
--     Keeping it out of the migration avoids role-permission fragility
--     across environments (postgres role may not be allowed to install
--     extensions on every project).
--   * Does NOT modify public.expire_stale_matches, the chat_started
--     trigger, the RPC, RLS policies, or any matches/conversations data.
--   * Does NOT touch migration 022 (which remains untracked in the
--     working tree and unrelated to this concern).
--   * Does NOT touch any application code or Edge Functions.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule any existing job with this name first. Wrapped in its
    -- own EXISTS check to keep the unschedule call free of "job not
    -- found" errors on first apply.
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-matches') THEN
      PERFORM cron.unschedule('expire-stale-matches');
    END IF;

    PERFORM cron.schedule(
      'expire-stale-matches',
      '*/5 * * * *',
      $cron_body$SELECT public.expire_stale_matches()$cron_body$
    );

    RAISE NOTICE
      'Scheduled cron job "expire-stale-matches" every 5 minutes calling public.expire_stale_matches().';
  ELSE
    RAISE NOTICE
      'pg_cron extension is NOT installed on this project. No cron job '
      'was scheduled. Enable pg_cron via Supabase Studio → Database → '
      'Extensions, then re-apply this migration to register the schedule.';
  END IF;
END $$;
