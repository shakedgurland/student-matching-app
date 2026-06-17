-- Migration 014: Enforce student/academic email at signup.
-- Rule: new profile rows must have a real email of the form *@*.ac.il
-- (case-insensitive). NULL is NOT allowed for new rows.
-- NOT VALID means the constraint applies to new INSERTs and UPDATEs but
-- existing rows are NOT scanned, so legacy users with non-.ac.il or NULL
-- emails are not blocked and login continues to work for them.
-- The handle_new_user() trigger from migration 001 runs INSERT INTO
-- public.profiles inside the auth.users-after-insert trigger, so a failing
-- CHECK rolls the entire auth.users insert back — non-.ac.il signups
-- cannot create an account.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_email_is_student;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_email_is_student
  CHECK (
    email IS NOT NULL
    AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.ac\.il$'
  )
  NOT VALID;
