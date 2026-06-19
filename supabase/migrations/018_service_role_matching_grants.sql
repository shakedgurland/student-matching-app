-- Migration 018: Grant service_role the privileges required by the backend-
-- authoritative matching pipeline.
--
-- Why
-- ───
-- Production diagnostics on the match-create Edge Function surfaced
-- PostgREST error 42501 (insufficient_privilege) when SELECTing from
-- public.profiles using the service_role key. Root cause: this project's
-- default privileges in the public schema do not auto-grant service_role on
-- tables created by our own migrations. Verified via information_schema:
-- service_role has SELECT on questionnaire_answers (incidentally) but not on
-- profiles or matches. The Edge Function's profile fetch therefore returns
-- 42501 → Branch A → status 'incomplete_profile', preventing every match.
--
-- This migration grants service_role the privileges it needs on the tables
-- the backend-authoritative pipeline touches, and forward-fixes the default-
-- privileges hole so future tables created in the public schema inherit the
-- same grants automatically.
--
-- Scope (intentionally narrow)
-- ────────────────────────────
--   * Grants service_role CRUD on the six tables the pipeline reads/writes.
--   * Grants service_role USAGE/SELECT on sequences in the public schema
--     (needed if any of those tables ever switch to default-nextval columns).
--   * Sets ALTER DEFAULT PRIVILEGES so future tables created in public
--     automatically grant service_role the same CRUD set + sequence access.
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT change RLS policies. service_role bypasses RLS via its
--     rolbypassrls attribute; the policies stay as defined in migration
--     002/003 for the authenticated role.
--   * Does NOT change grants for 'authenticated' or 'anon'. Their grants
--     stay exactly as established in migrations 003 and 010.
--   * Does NOT add the matches.metadata column. The RPC at migration 016
--     writes to a 'metadata' column that may not exist in production; that
--     is a separate, predicted-next blocker and gets its own migration.
--   * Does NOT touch any Edge Function code, RPC body, or RLS policy.
--
-- Idempotency
-- ───────────
-- GRANT is a no-op when the privilege is already held. ALTER DEFAULT
-- PRIVILEGES with the same target is a no-op too. Safe to re-run.

------------------------------------------------------------------------
-- 1. Table grants — backend-authoritative pipeline read/write surface.
------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questionnaire_answers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_photos        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_events            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_verifications TO service_role;

------------------------------------------------------------------------
-- 2. Sequence access. None of the above tables use default-nextval
--    sequences today (they use uuid PKs), but granting now removes a
--    silent failure mode if any future column adopts a sequence default.
------------------------------------------------------------------------
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

------------------------------------------------------------------------
-- 3. Forward-fix: any future table/sequence created in the public
--    schema will automatically grant service_role the same CRUD/sequence
--    access. Prevents the same class of bug from biting the next table
--    we add.
------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
