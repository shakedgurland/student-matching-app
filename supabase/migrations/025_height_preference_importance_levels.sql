-- Migration 025: Extend height_preference_importance CHECK to 4 levels.
--
-- Why
-- ───
-- Migration 005 created profiles.height_preference_importance with a CHECK
-- restricted to ('none', 'nice_to_have', 'must_have'). The product spec
-- (PR-AUDIT-D) introduces a fourth level — 'important' — between
-- 'nice_to_have' and 'must_have', so users can express a real preference
-- with a threshold without forcing a hard filter.
--
--   none           → no algorithmic effect.
--   nice_to_have   → stored, no current scoring effect, no threshold asked.
--   important      → soft penalty in scoring when candidate < min height;
--                    never blocks the match.
--   must_have      → hard filter in the RPC + scoring; blocks when candidate
--                    < min height (unchanged behavior; still strict equality).
--
-- The match-create RPC (migration 023) already tests `= 'must_have'`, so
-- adding 'important' to the CHECK does NOT change RPC blocking behavior —
-- the soft penalty lives in scoring.ts.
--
-- Apply order
-- ───────────
-- This migration MUST land in production BEFORE the app build that writes
-- 'important' values. Reverse order causes CHECK violation 23514 on every
-- new-user submit that picks 'חשוב לי'.
--
-- Idempotency
-- ───────────
-- Drop-then-add pattern: safe to re-apply. Constraint name follows the
-- Postgres default ("<table>_<column>_check") to avoid accidental
-- duplicates when re-applied against a sibling environment that already
-- has the new shape.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_height_preference_importance_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_height_preference_importance_check
  CHECK (height_preference_importance IN ('none', 'nice_to_have', 'important', 'must_have'));
