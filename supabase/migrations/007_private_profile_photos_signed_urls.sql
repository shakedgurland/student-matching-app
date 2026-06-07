
-- 1. Make profile-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'profile-photos';

-- 2. Add storage_path columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_storage_path text;
ALTER TABLE public.profile_photos ADD COLUMN IF NOT EXISTS storage_path text;

-- 3. Update storage policies to be strict (no broad SELECT)

-- Drop existing policies first
DROP POLICY IF EXISTS "Public Access to Profile Photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile photos" ON storage.objects;

-- Allow authenticated users to view their own profile photos
CREATE POLICY "Users can view their own profile photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'profile-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view photos of their matches
CREATE POLICY "Users can view photos of their matches"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'profile-photos' AND
    EXISTS (
        SELECT 1 FROM public.matches m
        WHERE status IN ('active', 'chat_started')
          AND ((m.user_a_id = auth.uid() AND m.user_b_id::text = (storage.foldername(storage.objects.name))[1])
           OR (m.user_b_id = auth.uid() AND m.user_a_id::text = (storage.foldername(storage.objects.name))[1]))
    )
);

-- Allow authenticated users to upload their own photos to their own folder
CREATE POLICY "Users can upload their own profile photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own photos
CREATE POLICY "Users can update their own profile photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profile-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own photos
CREATE POLICY "Users can delete their own profile photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'profile-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
