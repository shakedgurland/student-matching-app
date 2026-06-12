-- Migration 013: Match Feedback Loop
-- This migration adds the match_feedback table to collect private user feedback on matches.

-- 1. Table: match_feedback
CREATE TABLE IF NOT EXISTS public.match_feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    feedback_stage text NOT NULL CHECK (feedback_stage IN ('after_match', 'after_chat', 'no_date', 'after_date', 'ended')),
    rating integer CHECK (rating >= 1 AND rating <= 5),
    outcome_status text CHECK (outcome_status IS NULL OR outcome_status IN ('still_chatting', 'date_planned', 'date_happened', 'continued', 'ended', 'no_progress', 'not_interested', 'other_connection', 'busy', 'other')),
    positive_reasons text[] NOT NULL DEFAULT '{}',
    negative_reasons text[] NOT NULL DEFAULT '{}',
    free_text text,
    is_private_to_system boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS match_feedback_match_id_idx ON public.match_feedback(match_id);
CREATE INDEX IF NOT EXISTS match_feedback_user_id_idx ON public.match_feedback(user_id);
CREATE INDEX IF NOT EXISTS match_feedback_stage_idx ON public.match_feedback(feedback_stage);
CREATE INDEX IF NOT EXISTS match_feedback_created_at_idx ON public.match_feedback(created_at);

-- 3. Trigger: updated_at
DROP TRIGGER IF EXISTS set_match_feedback_updated_at ON public.match_feedback;
CREATE TRIGGER set_match_feedback_updated_at
    BEFORE UPDATE ON public.match_feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 4. Security: Enable RLS
ALTER TABLE public.match_feedback ENABLE ROW LEVEL SECURITY;

-- 5. Policies: match_feedback

-- Users can only insert feedback if they are part of the match
DROP POLICY IF EXISTS "Users can insert their own feedback for their matches" ON public.match_feedback;
CREATE POLICY "Users can insert their own feedback for their matches"
ON public.match_feedback FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
        SELECT 1 FROM public.matches
        WHERE id = match_id
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
);

-- Users can only select their own feedback
DROP POLICY IF EXISTS "Users can select their own feedback" ON public.match_feedback;
CREATE POLICY "Users can select their own feedback"
ON public.match_feedback FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can only update their own feedback
DROP POLICY IF EXISTS "Users can update their own feedback" ON public.match_feedback;
CREATE POLICY "Users can update their own feedback"
ON public.match_feedback FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
