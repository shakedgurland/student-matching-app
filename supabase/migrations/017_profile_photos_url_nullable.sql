-- Migration 017: Make profile_photos.url nullable
--
-- Background
-- ──────────
-- The `url` column was introduced in migration 002 as `text NOT NULL` when the
-- profile-photos storage bucket was PUBLIC and a single fixed public URL was
-- stored per row.
--
-- Migration 007 made the bucket PRIVATE and added the `storage_path text`
-- column. From that point on, the application stores only the storage key
-- (e.g. `<user_id>/<timestamp>.jpg`) and derives a short-lived signed URL on
-- read via `supabase.storage.from('profile-photos').createSignedUrl(...)`.
-- The `url` column became vestigial — no code path WRITES it anymore, and
-- the only consumers (the carousel in my-profile and the avatar derivation
-- in matching) read `storage_path` and overwrite the in-memory `url` field
-- with a fresh signed URL.
--
-- Migration 007 did NOT relax the NOT NULL constraint on `url`. As a result,
-- every modern INSERT into `profile_photos` (from my-profile.tsx,
-- questionnaire.tsx initial submit, and questionnaire.tsx edit-mode
-- reconciliation) hits 23502:
--   "null value in column "url" of relation "profile_photos" violates
--    not-null constraint"
--
-- Fix
-- ───
-- Drop the NOT NULL constraint so the column can be omitted entirely on new
-- inserts. The column itself is intentionally KEPT in place for safety —
-- archived rows may still hold legacy public URL strings, and removing the
-- column would be destructive. A future cleanup migration may DROP COLUMN
-- once we've confirmed nothing depends on the historical values.
--
-- Reversibility
-- ─────────────
-- ALTER TABLE public.profile_photos ALTER COLUMN url SET NOT NULL;
-- (only valid if no rows have NULL url at the time of revert)

ALTER TABLE public.profile_photos ALTER COLUMN url DROP NOT NULL;

COMMENT ON COLUMN public.profile_photos.url IS
  'Vestigial. Was the public URL in the original public-bucket design '
  '(migration 002). After migration 007 the bucket became private and '
  '`storage_path` is the authoritative field. Application code generates '
  'signed URLs on read and ignores this column. Nullable as of migration 017.';
