-- Migration 009: Support Short vs Deep Onboarding

-- 1. Add new columns to public.profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS region text,
ADD COLUMN IF NOT EXISTS hobbies text[],
ADD COLUMN IF NOT EXISTS onboarding_mode text DEFAULT 'fast'
CHECK (onboarding_mode IN ('fast', 'deep'));

-- 2. Backfill existing completed profiles to deep mode,
-- because old users completed the previous full questionnaire.
UPDATE public.profiles
SET onboarding_mode = 'deep'
WHERE onboarding_completed = true
  AND (onboarding_mode IS NULL OR onboarding_mode = 'fast');

-- 3. Helpful indexes for matching and analytics
CREATE INDEX IF NOT EXISTS idx_profiles_region
ON public.profiles(region);

CREATE INDEX IF NOT EXISTS idx_profiles_hobbies
ON public.profiles USING GIN(hobbies);

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_mode
ON public.profiles(onboarding_mode);
