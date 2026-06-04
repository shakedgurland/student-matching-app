-- Migration 005: Add height preference fields

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS min_preferred_height_cm integer CHECK (min_preferred_height_cm >= 120 AND min_preferred_height_cm <= 230),
ADD COLUMN IF NOT EXISTS height_preference_importance text CHECK (height_preference_importance IN ('none', 'nice_to_have', 'must_have'));
