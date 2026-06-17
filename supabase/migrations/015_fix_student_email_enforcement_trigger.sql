-- Migration 015: Replace CHECK constraint with a column-scoped trigger.
--
-- Problem: migration 014 added a NOT VALID CHECK constraint to enforce
-- .ac.il at signup. NOT VALID skipped existing rows at creation time, but
-- Postgres still re-evaluates CHECK constraints against the post-update tuple
-- on every UPDATE — even for columns not in the SET list. This blocked
-- legacy users (non-.ac.il email) from saving anything on their profile,
-- including the questionnaire display name and answers.
--
-- Fix: drop the CHECK and replace with a BEFORE INSERT OR UPDATE OF email
-- trigger that fires only when email is actually being written or changed.
-- INSERTs and email-changing UPDATEs are still gated to .ac.il; UPDATEs that
-- don't touch email pass through untouched, so legacy users keep working.

-- 1. Drop the over-broad CHECK constraint from migration 014.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_email_is_student;

-- 2. Trigger function: enforce student-email rule only when email is set or changed.
CREATE OR REPLACE FUNCTION public.enforce_student_email_on_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- For UPDATEs, skip when email is unchanged (covers UPDATE OF email
  -- that no-ops, and the IS NOT DISTINCT FROM handles NULL vs NULL too).
  IF TG_OP = 'UPDATE' AND NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NULL
     OR NEW.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.ac\.il$' THEN
    RAISE EXCEPTION 'profiles.email must be a student email matching .ac.il'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Drop any prior version of the trigger (idempotent).
DROP TRIGGER IF EXISTS trg_enforce_student_email ON public.profiles;

-- 4. Attach the trigger. UPDATE OF email means it only fires when the
--    UPDATE statement lists "email" in its SET clause.
CREATE TRIGGER trg_enforce_student_email
  BEFORE INSERT OR UPDATE OF email ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_student_email_on_profiles();
