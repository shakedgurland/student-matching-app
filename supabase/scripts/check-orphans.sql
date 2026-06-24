-- supabase/scripts/check-orphans.sql
--
-- READ-ONLY diagnostic queries for the account-deletion / orphaned-user
-- audit. Paste any block (or the whole file) into the Supabase Dashboard
-- SQL Editor. NO DDL, NO DML — every statement is a SELECT.
--
-- Companion to:
--   * Migration 031 (auth.users existence guard inside
--     create_authorized_match) — these queries verify the guard is
--     working in production / staging.
--   * supabase/functions/delete-account/index.ts — these queries verify
--     the cascade chain removed every user-owned row after a delete
--     and that no orphans remain.
--
-- All queries return ZERO rows in a healthy state EXCEPT query #3
-- (conversations with match_id IS NULL is expected post-expiry — those
-- are read-only history). Non-zero rows for the others indicate either
-- the cascade chain was interrupted (manual op error) or the migration
-- 031 guard has been bypassed.
--
-- Storage orphans (objects under profile-photos/{user_id}/* for users
-- that no longer exist) cannot be detected via SQL because Supabase
-- Storage is separate from Postgres. See the trailing "Storage orphan
-- probe" note for the manual procedure.

------------------------------------------------------------------------
-- 1. Orphan profiles — public.profiles rows with no matching auth.users.
--    Cascade from auth.users(id) -> profiles.id is ON DELETE CASCADE
--    (migration 001:14), so this should always be 0 unless an operator
--    bypassed the cascade chain.
------------------------------------------------------------------------
SELECT 'orphan_profiles' AS check_name, p.id, p.full_name, p.created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
 WHERE u.id IS NULL;

------------------------------------------------------------------------
-- 2. Matches whose user_a / user_b profile is gone.
--    matches.user_a_id / user_b_id are ON DELETE CASCADE on profiles
--    (migration 002:28-29), so this should always be 0.
------------------------------------------------------------------------
SELECT 'matches_missing_profile' AS check_name,
       m.id, m.user_a_id, m.user_b_id, m.status, m.created_at
  FROM public.matches m
  LEFT JOIN public.profiles pa ON pa.id = m.user_a_id
  LEFT JOIN public.profiles pb ON pb.id = m.user_b_id
 WHERE pa.id IS NULL OR pb.id IS NULL;

------------------------------------------------------------------------
-- 3. Conversations whose match_id has been SET NULL — match was deleted
--    but the conversation row survives (per migration 002:79 ON DELETE
--    SET NULL on conversations.match_id). Non-zero is EXPECTED post-
--    expiry / unmatch / deletion; these rows are read-only history.
--    Limit applied so the diagnostic doesn't dump the whole archive.
------------------------------------------------------------------------
SELECT 'conversations_match_null' AS check_name,
       c.id, c.user_a_id, c.user_b_id, c.created_at, c.last_message_at
  FROM public.conversations c
 WHERE c.match_id IS NULL
 ORDER BY c.last_message_at DESC NULLS LAST
 LIMIT 50;

------------------------------------------------------------------------
-- 4. Messages whose sender no longer has a profile row.
--    messages.sender_id is ON DELETE CASCADE on profiles (migration
--    002:90), so this should always be 0.
------------------------------------------------------------------------
SELECT 'messages_missing_sender' AS check_name,
       msg.id, msg.sender_id, msg.conversation_id, msg.created_at
  FROM public.messages msg
  LEFT JOIN public.profiles p ON p.id = msg.sender_id
 WHERE p.id IS NULL
 LIMIT 50;

------------------------------------------------------------------------
-- 5. questionnaire_answers for users with no profile row.
--    Cascade on profiles (migration 002:8). Should be 0.
------------------------------------------------------------------------
SELECT 'questionnaire_missing_profile' AS check_name,
       qa.user_id, qa.updated_at
  FROM public.questionnaire_answers qa
  LEFT JOIN public.profiles p ON p.id = qa.user_id
 WHERE p.id IS NULL;

------------------------------------------------------------------------
-- 6. Active or chat_started matches involving a user with no auth.users
--    row. This is THE check that proves the migration 031 guard is
--    working — non-zero rows mean either the guard was bypassed (very
--    unlikely; service_role only) or pre-031 matches survived a delete
--    op that orphaned them. Use the row count as the "are we safe"
--    health metric.
------------------------------------------------------------------------
SELECT 'active_matches_authless_user' AS check_name,
       m.id, m.status, m.user_a_id, m.user_b_id, m.created_at
  FROM public.matches m
 WHERE m.status IN ('active', 'chat_started')
   AND (
     NOT EXISTS (SELECT 1 FROM auth.users WHERE id = m.user_a_id)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = m.user_b_id)
   );

------------------------------------------------------------------------
-- 7. Auxiliary user-keyed tables — any row whose owner is gone.
--    All four reference either profiles (CASCADE) or auth.users
--    (CASCADE); non-zero means cascade was interrupted.
------------------------------------------------------------------------
SELECT 'orphan_profile_ai_traits' AS check_name, t.user_id
  FROM public.profile_ai_traits t
  LEFT JOIN public.profiles p ON p.id = t.user_id
 WHERE p.id IS NULL;

SELECT 'orphan_match_feedback' AS check_name, f.user_id
  FROM public.match_feedback f
  LEFT JOIN public.profiles p ON p.id = f.user_id
 WHERE p.id IS NULL;

SELECT 'orphan_push_tokens' AS check_name, pt.user_id
  FROM public.push_tokens pt
  LEFT JOIN auth.users u ON u.id = pt.user_id
 WHERE u.id IS NULL;

SELECT 'orphan_conversation_reads' AS check_name, cr.user_id
  FROM public.conversation_reads cr
  LEFT JOIN auth.users u ON u.id = cr.user_id
 WHERE u.id IS NULL;

------------------------------------------------------------------------
-- 8. Storage orphan probe (NOTE — manual procedure, not pure SQL).
--
-- Supabase Storage objects are NOT enforced by Postgres foreign keys.
-- A user deletion through Dashboard or the delete-account Edge Function
-- removes auth.users → cascade through profiles → ..., but leaves
-- `profile-photos/{user_id}/*` objects in the bucket UNLESS the deleter
-- explicitly cleans the bucket first. The delete-account Edge Function
-- does this; the Dashboard does not.
--
-- To detect storage orphans:
--   (a) List every top-level folder in the `profile-photos` bucket via
--       the Supabase Storage API (Dashboard → Storage → profile-photos
--       OR a service-role admin.storage.from('profile-photos').list('')
--       call from a one-shot script).
--   (b) For each folder name (which is a user UUID), check:
--         SELECT 1 FROM auth.users WHERE id = '<folder-uuid>';
--       Folders whose UUID returns no row are storage orphans.
--   (c) Delete the orphaned folders via admin.storage.from('profile-
--       photos').remove([...]) under a service-role token. NEVER do
--       this in production without first listing the orphans and
--       reviewing the list with a human.
--
-- A future companion script
-- (supabase/scripts/cleanup-storage-orphans.ts — NOT included in this
-- PR) can automate (a) and (b) in read-only mode, then prompt before
-- (c). Until that script exists, the procedure above is the supported
-- way to detect storage orphans.
------------------------------------------------------------------------
