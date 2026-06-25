-- Migration 033: Matching availability foundation
--
-- Introduces the server-only "I'm available to meet someone" gate that
-- will, in a follow-up PR, become a precondition for match creation.
-- This migration is foundation-only: it creates the storage + the
-- caller-side RPC to set/refresh the window. It does NOT yet wire the
-- gate into create_authorized_match (PR #62) and does NOT yet expose
-- any client UI (PR #63).
--
-- Product decision
-- ────────────────
-- A user is "available to be matched" for exactly 3 days after they
-- explicitly opt in via a future "אני פנוי/ה להכיר" button. Opening the
-- app, sending chat messages, or any other passive activity must NOT
-- mark a user available. The 3-day window is set server-side from
-- now() — clients cannot influence the date.
--
-- Design decision: separate table, NOT a column on profiles
-- ─────────────────────────────────────────────────────────
-- Two options were considered:
--
--   A. Add columns to public.profiles
--      Pros: one less table; trivial JOIN-free reads.
--      Cons (load-bearing):
--        * Self UPDATE on profiles is allowed by the migration-001
--          self-update policy. Without column-level UPDATE revocation,
--          a client could
--            UPDATE profiles SET matching_available_until = '2099-…'
--             WHERE id = auth.uid()
--          and set arbitrary dates, bypassing the RPC entirely.
--          Closing that hole requires the migration-022 REVOKE-and-
--          re-GRANT pattern on every editable column EXCEPT availability
--          — a fragile, easy-to-forget recipe that breaks every time
--          someone adds a new editable column.
--        * Peer SELECT visibility from migration 020 grants whole-row
--          access when a match is active. A future SELECT * (or a new
--          peer-facing screen that requests too many columns) would
--          leak availability — the exact privacy concern that motivates
--          this design ("do not show last seen").
--
--   B. Separate table public.matching_availability  ← chosen
--      Pros:
--        * Scoped RLS (user_id = auth.uid() for SELECT) — peer cannot
--          read anyone else's availability at all.
--        * No INSERT/UPDATE/DELETE policy + no client grant → all
--          client writes blocked at the table level, full stop. Only
--          the SECURITY DEFINER RPC (running as the table owner) can
--          write.
--        * Privacy guarantee doesn't depend on which columns a future
--          query happens to SELECT.
--        * Easy to drop later if the feature is removed.
--      Cons: one extra JOIN inside the match-create candidate query
--        (will land in PR #62) and one extra DELETE on match creation
--        (also PR #62). Both are trivial.
--
-- Defense-in-depth summary
-- ────────────────────────
--   1. No client INSERT/UPDATE/DELETE grant on the table.
--   2. No client INSERT/UPDATE/DELETE policy on the table (RLS would
--      block even if a grant existed).
--   3. SECURITY DEFINER RPC computes the 3-day window from server-side
--      now() — caller passes no arguments, so no date can be smuggled.
--   4. RPC short-circuits with 'already_available' if a non-expired
--      window already exists, so repeat taps cannot extend a window
--      indefinitely (user must let it expire or be matched before
--      starting a new 3-day clock).
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT modify create_authorized_match. PR #62 will add an
--     availability check there + atomically clear both participants'
--     availability rows on successful INSERT.  ⚠ MAINTAINERS: that
--     follow-up is required — without it, a matched user would still
--     appear available to other searches until the 3-day window
--     expires. Search for 'matching_availability' in
--     supabase/migrations/ when implementing PR #62.
--   * Does NOT change profiles RLS, grants, or columns.
--   * Does NOT touch the match-create Edge Function.
--   * Does NOT expose any client UI.
--   * Does NOT pre-populate availability for existing users. Default
--     is "row absent" = "not available", which is the desired starting
--     state for everyone.
--
-- Idempotency
-- ───────────
-- CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY
-- IF EXISTS guards re-runs. CREATE OR REPLACE FUNCTION is naturally
-- idempotent. REVOKE/GRANT are no-ops when the privilege state already
-- matches. Safe to re-apply.

------------------------------------------------------------------------
-- 1. Table
------------------------------------------------------------------------
-- One row per user. Row presence + available_until > now() = available.
-- Row absence OR available_until <= now() = not available.
--
-- ON DELETE CASCADE so account deletion via PR #50 (delete-account
-- Edge Function) sweeps the availability row along with the profile.
CREATE TABLE IF NOT EXISTS public.matching_availability (
  user_id         uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  available_until timestamptz NOT NULL,
  set_at          timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Plain (non-partial) index on available_until.
-- Partial WHERE available_until > now() is rejected because now() is
-- not IMMUTABLE; the full-column B-tree is what every candidate-pool
-- query in PR #62 will use anyway (range scan on available_until > $1).
CREATE INDEX IF NOT EXISTS matching_availability_available_until_idx
  ON public.matching_availability (available_until);

------------------------------------------------------------------------
-- 2. RLS
------------------------------------------------------------------------
ALTER TABLE public.matching_availability ENABLE ROW LEVEL SECURITY;

-- Self-read only. Peers cannot read anyone else's availability — that
-- is the "no last-seen" privacy guarantee enforced at the DB level.
DROP POLICY IF EXISTS "Users can select own availability"
  ON public.matching_availability;
CREATE POLICY "Users can select own availability"
  ON public.matching_availability
  FOR SELECT
  USING (user_id = auth.uid());

-- Intentionally NO INSERT/UPDATE/DELETE policy for authenticated.
-- Combined with the missing client GRANTs below, this blocks every
-- direct client write to availability. The only write path is via
-- public.set_matching_availability(), which runs SECURITY DEFINER as
-- the table owner and bypasses RLS.

------------------------------------------------------------------------
-- 3. Grants
------------------------------------------------------------------------
REVOKE ALL ON TABLE public.matching_availability FROM PUBLIC;

-- Authenticated clients can read their own row (via the RLS policy
-- above) and that's it. No INSERT / UPDATE / DELETE grants — direct
-- client writes are blocked at the privilege layer in addition to RLS.
GRANT SELECT ON TABLE public.matching_availability TO authenticated;

-- service_role bypasses RLS via rolbypassrls, but explicit grants
-- ensure the match-create Edge Function and any future ops/admin
-- tooling can read AND clear rows when PR #62 lands.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.matching_availability
  TO service_role;

------------------------------------------------------------------------
-- 4. RPC: set_matching_availability()
------------------------------------------------------------------------
-- Caller-side entry point. The client invokes this via
-- supabase.rpc('set_matching_availability'). Returns a stable jsonb
-- envelope so the client can render the correct UI state without
-- guessing.
--
-- All gates re-checked server-side; client UI checks (PR #63) are
-- presentation-only, not authoritative.
--
-- search_path is pinned to public + pg_temp to prevent
-- search-path-based privilege escalation on a SECURITY DEFINER
-- function (Supabase / Postgres hardening best-practice).
CREATE OR REPLACE FUNCTION public.set_matching_availability()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller        uuid;
  v_onboarded     boolean;
  v_active_id     uuid;
  v_month_count   integer;
  v_existing      timestamptz;
  v_new_until     timestamptz;
BEGIN
  ----------------------------------------------------------------------
  -- a. Identity. auth.uid() resolves via the JWT sent by the
  --    authenticated client. If absent, the caller is anonymous /
  --    impersonating service_role without a session → no-op.
  ----------------------------------------------------------------------
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;

  ----------------------------------------------------------------------
  -- b. Profile must exist and be onboarded. We only read the one
  --    column we need; reading more would couple this RPC to the
  --    profiles schema unnecessarily.
  ----------------------------------------------------------------------
  SELECT onboarding_completed INTO v_onboarded
    FROM public.profiles
   WHERE id = v_caller;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'profile_missing');
  END IF;

  IF NOT COALESCE(v_onboarded, false) THEN
    RETURN jsonb_build_object('status', 'incomplete_profile');
  END IF;

  ----------------------------------------------------------------------
  -- c. Open-match guard. A user with an 'active' or 'chat_started'
  --    match cannot mark themselves available — the existing match
  --    blocks new match creation anyway, and the UI will hide the
  --    button. Defense-in-depth here keeps the gate honest even if
  --    the client misbehaves.
  ----------------------------------------------------------------------
  SELECT id INTO v_active_id
    FROM public.matches
   WHERE status IN ('active', 'chat_started')
     AND (user_a_id = v_caller OR user_b_id = v_caller)
   LIMIT 1;

  IF v_active_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_has_active');
  END IF;

  ----------------------------------------------------------------------
  -- d. Monthly cap. Reuses the existing helper from migration 016 so
  --    the formula stays single-source: 5 matches per calendar month,
  --    all statuses count, bi-directional via user_a_id/user_b_id.
  --    Reused from inside a SECURITY DEFINER function bypasses the
  --    'GRANT EXECUTE … TO service_role only' restriction on that
  --    helper because the owner of THIS function (postgres) can
  --    execute any function regardless of grants.
  ----------------------------------------------------------------------
  v_month_count := public.count_user_matches_this_month(v_caller);
  IF v_month_count >= 5 THEN
    RETURN jsonb_build_object('status', 'monthly_cap_reached');
  END IF;

  ----------------------------------------------------------------------
  -- e. Existing-window short-circuit. If a window is currently live,
  --    return its end timestamp WITHOUT extending it. This is the
  --    explicit "no perpetual extension" rule from the product spec:
  --    a re-tap while available is a no-op except for confirming the
  --    existing date back to the client.
  ----------------------------------------------------------------------
  SELECT available_until INTO v_existing
    FROM public.matching_availability
   WHERE user_id = v_caller;

  IF v_existing IS NOT NULL AND v_existing > now() THEN
    RETURN jsonb_build_object(
      'status',          'already_available',
      'available_until', v_existing
    );
  END IF;

  ----------------------------------------------------------------------
  -- f. Set / refresh. now() is evaluated server-side; the caller
  --    passes no arguments so there is no surface for date injection.
  --    ON CONFLICT handles the "expired row exists" case — we UPDATE
  --    in place rather than DELETE + INSERT so the PK / FK chain
  --    stays stable.
  ----------------------------------------------------------------------
  v_new_until := now() + interval '3 days';

  INSERT INTO public.matching_availability
    (user_id, available_until, set_at, updated_at)
  VALUES
    (v_caller, v_new_until, now(), now())
  ON CONFLICT (user_id) DO UPDATE
     SET available_until = EXCLUDED.available_until,
         set_at          = EXCLUDED.set_at,
         updated_at      = now();

  RETURN jsonb_build_object(
    'status',          'set',
    'available_until', v_new_until
  );

EXCEPTION WHEN OTHERS THEN
  -- Do NOT include SQLERRM here. SQLERRM is the raw Postgres error
  -- text and can leak internal table names, column names, constraint
  -- names, or schema details to the client. Return ONLY the generic
  -- status — if diagnostic detail is needed for ops, log it
  -- server-side via RAISE LOG or pg_notify, never via the user-facing
  -- envelope. (A pre-existing SQLERRM leak in
  -- create_authorized_match exists; that is a separate concern for
  -- its own PR and does not justify repeating the pattern here.)
  RETURN jsonb_build_object('status', 'error');
END;
$$;

REVOKE ALL ON FUNCTION public.set_matching_availability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_matching_availability() TO authenticated;
-- Intentionally NO GRANT to anon — anonymous users cannot mark themselves
-- available; they don't have a profile yet.

COMMENT ON FUNCTION public.set_matching_availability() IS
  'Marks the caller (via auth.uid()) as available to be matched for a '
  '3-day window measured from server-side now(). No arguments — the '
  'date is server-controlled to prevent arbitrary client dates. '
  'Returns jsonb { status, available_until? } where status is one of: '
  'set | already_available | already_has_active | monthly_cap_reached | '
  'incomplete_profile | profile_missing | unauthorized | error. '
  'A subsequent PR (PR #62) must DELETE the availability row inside '
  'create_authorized_match after a successful match INSERT so the '
  'matched user no longer appears in candidate pools.';

------------------------------------------------------------------------
-- 5. Maintainer marker
------------------------------------------------------------------------
COMMENT ON TABLE public.matching_availability IS
  'Per-user matching-availability window. Row present + available_until > now() '
  '= user is available to be matched. Row absent OR available_until <= now() '
  '= not available. Writes only via public.set_matching_availability(). '
  'TODO (PR #62): create_authorized_match must DELETE the row(s) for both '
  'participants after a successful INSERT into public.matches; otherwise a '
  'matched user remains in subsequent candidate pools until the 3-day window '
  'expires naturally. Also: match-create Edge Function (PR #62) must JOIN this '
  'table into its candidate query and pre-flight check the caller against it.';

------------------------------------------------------------------------
-- 6. No other changes.
--    - public.profiles: schema, RLS, grants — unchanged.
--    - public.matches: schema, RLS, grants — unchanged.
--    - public.create_authorized_match: body unchanged (PR #62 owns it).
--    - match-create Edge Function: unchanged (PR #62 owns it).
--    - No pg_cron usage.
--    - No new triggers.
--    - No existing rows touched.
------------------------------------------------------------------------
