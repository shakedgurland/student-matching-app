-- Migration 020: Allow authenticated users to SELECT the profile row of
-- another user with whom they share an ACTIVE match.
--
-- Why
-- ───
-- After migrations 018 (service_role grants) and 019 (matches.metadata
-- column) unblocked match creation, lib/matching.ts's post-INSERT call
--
--   supabase.from('profiles').select('*').eq('id', candidate_id).single()
--
-- returns 0 rows for the matched candidate. The only SELECT policy on
-- public.profiles is "Users can select their own profile" from migration
-- 001 (USING auth.uid() = id). An authenticated caller can therefore read
-- only their own profile row. The matched candidate's row is hidden by
-- RLS, .single() raises PGRST116, lib/matching.ts returns
-- { status: 'error' }, and the auto-trigger UI suppresses the alert.
-- Production verified via authenticated-impersonated SELECT in Studio:
-- the read returns 0 rows for the candidate even though public.matches
-- has an active row joining the two users.
--
-- This migration adds a SECOND SELECT policy on profiles. RLS evaluates
-- multiple policies of the same command as OR'd, so the existing
-- self-read policy is preserved.
--
-- Scope (intentionally narrow)
-- ────────────────────────────
--   * SELECT only. No INSERT/UPDATE/DELETE access added.
--   * Visibility granted ONLY when status = 'active' on the shared match.
--     Expired / chat_started / unmatched statuses do NOT grant visibility.
--   * Bidirectional: covers (m.user_a_id = me AND m.user_b_id = target)
--     OR the mirror.
--   * Whole-row visibility. Column-level scoping (e.g., hiding email) is
--     out of scope for this PR; it will be handled separately if needed.
--   * The 'authenticated' role's existing grants on public.matches (SELECT,
--     UPDATE — per migration 003) are sufficient for the EXISTS subquery
--     to execute under RLS.
--   * service_role bypasses RLS via rolbypassrls, so this policy does not
--     affect the Edge Function's service-role reads.
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT modify the existing self-read / self-update / self-insert
--     policies from migration 001.
--   * Does NOT change grants on profiles or any other table.
--   * Does NOT change RLS on questionnaire_answers, matches, or any other
--     table.
--   * Does NOT widen visibility to 'chat_started' or other statuses (a
--     possible follow-up once the real chat screen is wired up).
--   * Does NOT REVOKE column-level access (a possible follow-up for
--     profiles.email after a codebase audit of every read site).
--   * Does NOT touch any Edge Function or RPC body.
--
-- Idempotency
-- ───────────
-- DROP POLICY IF EXISTS guards re-runs. CREATE POLICY then runs
-- unconditionally. Safe to re-apply.

DROP POLICY IF EXISTS "Users can select profiles of active match peers"
  ON public.profiles;

CREATE POLICY "Users can select profiles of active match peers"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.status = 'active'
      AND (
            (m.user_a_id = auth.uid() AND m.user_b_id = profiles.id)
         OR (m.user_b_id = auth.uid() AND m.user_a_id = profiles.id)
      )
  )
);
