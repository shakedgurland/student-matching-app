-- Migration 004: Add matching fields to profiles

-- We are adding height_cm and interested_in_genders to the profiles table
-- so that they can be used efficiently in database queries for hard filtering.
-- gender is already present in the profiles table from migration 001.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS height_cm integer CHECK (height_cm > 0 AND height_cm < 300),
ADD COLUMN IF NOT EXISTS interested_in_genders text[];

-- Create an index to help with filtering by interested genders
CREATE INDEX IF NOT EXISTS profiles_interested_in_genders_idx ON public.profiles USING GIN (interested_in_genders);