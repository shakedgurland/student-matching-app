-- idempotent migration for profiles and student verifications

-- 1. Enum: student_verification_status
DO $$ BEGIN
    CREATE TYPE public.student_verification_status AS ENUM (
        'not_started', 'email_pending', 'verified', 'manual_review', 'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Table: public.profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username text UNIQUE,
    email text,
    full_name text,
    gender text,
    birth_year integer,
    university text,
    faculty text,
    year_of_study text,
    campus text,
    bio text,
    avatar_url text,
    onboarding_completed boolean NOT NULL DEFAULT false,
    student_verification_status public.student_verification_status NOT NULL DEFAULT 'not_started',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Table: public.student_verifications
CREATE TABLE IF NOT EXISTS public.student_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    university_email text,
    status public.student_verification_status NOT NULL DEFAULT 'email_pending',
    verified_at timestamptz,
    rejection_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Function: set_updated_at()
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Triggers: updated_at
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_student_verifications_updated_at ON public.student_verifications;
CREATE TRIGGER set_student_verifications_updated_at
    BEFORE UPDATE ON public.student_verifications
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 6. Function: handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, username)
    VALUES (
        new.id,
        new.email,
        new.raw_user_meta_data ->> 'username'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: on_auth_user_created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 7. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_verifications ENABLE ROW LEVEL SECURITY;

-- 8. Policies: Profiles
DROP POLICY IF EXISTS "Users can select their own profile" ON public.profiles;
CREATE POLICY "Users can select their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- 9. Policies: Student Verifications
DROP POLICY IF EXISTS "Users can select their own verification" ON public.student_verifications;
CREATE POLICY "Users can select their own verification"
    ON public.student_verifications FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own verification request" ON public.student_verifications;
CREATE POLICY "Users can insert their own verification request"
    ON public.student_verifications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 10. Indexes
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);
CREATE INDEX IF NOT EXISTS profiles_university_idx ON public.profiles(university);
CREATE INDEX IF NOT EXISTS profiles_faculty_idx ON public.profiles(faculty);
CREATE INDEX IF NOT EXISTS student_verifications_user_id_idx ON public.student_verifications(user_id);
CREATE INDEX IF NOT EXISTS student_verifications_status_idx ON public.student_verifications(status);
