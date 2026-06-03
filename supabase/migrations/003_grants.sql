-- Migration 003: Grant permissions to authenticated users

-- 1. questionnaire_answers
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questionnaire_answers TO authenticated;

-- 2. profile_photos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_photos TO authenticated;

-- 3. matches
GRANT SELECT, UPDATE ON public.matches TO authenticated;

-- 4. conversations
GRANT SELECT, INSERT ON public.conversations TO authenticated;

-- 5. messages
GRANT SELECT, INSERT ON public.messages TO authenticated;

-- Ensure RLS is enabled on all tables (should be already, but being safe)
ALTER TABLE public.questionnaire_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Note: Policies from migration 002 already handle row-level access control.
-- These grants allow the 'authenticated' role to interact with the tables 
-- subject to those RLS policies.
