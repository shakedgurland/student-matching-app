-- Migration: 011_profile_ai_traits.sql
-- Description: Creates a separate table for structured AI analysis of free-text questionnaire answers.

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.profile_ai_traits (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    traits JSONB NOT NULL DEFAULT '{}'::jsonb,
    model_version TEXT,
    source_hash TEXT, -- To track if text has changed since last analysis
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE public.profile_ai_traits ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies

-- Users can read their own traits (for profile transparency or future "AI Insights" feature)
CREATE POLICY "Users can view own traits" 
ON public.profile_ai_traits 
FOR SELECT 
USING (auth.uid() = user_id);

-- No public/authenticated read of other users' internal AI traits via client
-- (Matching logic will use service role or security definer function)

-- No direct client insert/update/delete (Must be done via Edge Function/Service Role)

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS profile_ai_traits_user_id_idx ON public.profile_ai_traits(user_id);
CREATE INDEX IF NOT EXISTS profile_ai_traits_model_version_idx ON public.profile_ai_traits(model_version);
CREATE INDEX IF NOT EXISTS profile_ai_traits_updated_at_idx ON public.profile_ai_traits(updated_at);

-- 5. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_ai_traits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ai_traits_updated_at
BEFORE UPDATE ON public.profile_ai_traits
FOR EACH ROW
EXECUTE FUNCTION update_ai_traits_updated_at();

-- 6. Grants
GRANT ALL ON TABLE public.profile_ai_traits TO postgres;
GRANT ALL ON TABLE public.profile_ai_traits TO service_role;
GRANT SELECT ON TABLE public.profile_ai_traits TO authenticated;
