-- Migration 022: Deny authenticated SELECT on public.profiles.email at the
-- column-privilege level.
--
-- Why
-- ───
-- Migration 020 added an RLS policy that lets an authenticated user SELECT
-- the profile row of any user they share an active match with. RLS hides
-- ROWS, not COLUMNS. As long as the authenticated role had table-level
-- SELECT on public.profiles (granted by Supabase's standard project
-- initialization), any visible row exposed every column — including email.
--
-- Concretely, after a match exists, the matched peer's client could run
--
--   await supabase.from('profiles').select('email').eq('id', PEER_ID).single()
--
-- and receive the peer's student email. No screen actually displayed it,
-- but the API surface allowed retrieval.
--
-- The Postgres rule that drives this migration
-- ────────────────────────────────────────────
-- A role with TABLE-LEVEL SELECT can read every column. Column-level
-- privileges are an addition, not a restriction: a naive
-- "REVOKE SELECT (email) ON public.profiles FROM authenticated" is a
-- no-op while the table-level grant still exists.
--
-- The only correct way to deny a single column is to drop the table-level
-- grant and re-grant SELECT explicitly on every column EXCEPT email.
--
-- Prerequisite (already satisfied by PR #8 / commit fd08974)
-- ─────────────────────────────────────────────────────────
-- Every "select('*')" on public.profiles in app/ and lib/ has been
-- replaced with explicit non-email column lists:
--   * lib/matching.ts
--   * app/(tabs)/index.tsx
--   * app/(tabs)/my-profile.tsx
-- All other profile reads (match-result, chat, questionnaire, _layout)
-- were already explicit and email-free. Applying this migration BEFORE
-- those code edits reached production would have broken every
-- profile-read screen with SQLSTATE 42501; that is no longer a risk.
--
-- Scope (intentionally narrow)
-- ────────────────────────────
--   * Drops the implicit table-level SELECT for the 'authenticated' role
--     on public.profiles.
--   * Re-grants SELECT on every non-email column to 'authenticated'.
--   * Does NOT touch service_role grants (migration 018). The Edge
--     Function continues to read profiles via service_role.
--   * Does NOT touch anon grants. Anon has no documented profile read
--     today; if any default anon grant existed, this migration does not
--     modify it.
--   * Does NOT touch INSERT, UPDATE, or DELETE grants. Signup, the
--     migration-001 handle_new_user() trigger, and the migration-015
--     enforce_student_email_on_profiles trigger all continue to write
--     email as before. Users can also UPDATE their own email if a future
--     screen exposes that (subject to the existing RLS UPDATE policy
--     scoping to auth.uid() = id and the email-format trigger).
--   * Does NOT change RLS policies on public.profiles.
--   * Does NOT affect any other table.
--
-- Forward compatibility
-- ─────────────────────
-- New columns added to public.profiles in future migrations will NOT
-- automatically be readable by authenticated — they must be granted
-- explicitly. This is intentional: it forces new columns to be reviewed
-- for sensitivity before becoming readable by the app.
--
-- Idempotency
-- ───────────
-- REVOKE SELECT is a no-op if the privilege is already absent. GRANT
-- SELECT on the same column list is a no-op if already granted. Safe to
-- re-apply. The migration runs inside the supabase migration transaction,
-- so the brief window between REVOKE and GRANT never observes a partial
-- state from concurrent queries.

------------------------------------------------------------------------
-- 1. Drop table-level SELECT for authenticated.
------------------------------------------------------------------------
REVOKE SELECT ON public.profiles FROM authenticated;

------------------------------------------------------------------------
-- 2. Re-grant SELECT on every non-email column. Listed in CREATE TABLE
--    declaration order across migrations 001, 004, 005, 007, 009 so
--    future readers can audit against the migration history.
--
--    Verified complete by grep across supabase/migrations/*.sql for
--    every ALTER TABLE public.profiles ADD COLUMN. Total columns on
--    public.profiles = 24; columns granted below = 23; column omitted = 1
--    (email).
------------------------------------------------------------------------
GRANT SELECT (
  id,
  username,
  full_name,
  gender,
  birth_year,
  university,
  faculty,
  year_of_study,
  campus,
  bio,
  avatar_url,
  onboarding_completed,
  student_verification_status,
  created_at,
  updated_at,
  height_cm,
  interested_in_genders,
  min_preferred_height_cm,
  height_preference_importance,
  region,
  hobbies,
  onboarding_mode,
  avatar_storage_path
) ON public.profiles TO authenticated;
