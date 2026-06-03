-- Migration 002: Schema Expansion for Questionnaire, Photos, Matches, and Messaging
-- This migration depends on public.set_updated_at() from migration 001.

-- 1. Table: questionnaire_answers
-- Stores the smart questionnaire results for each user.
CREATE TABLE IF NOT EXISTS public.questionnaire_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Table: profile_photos
-- Allows users to upload and manage multiple photos.
CREATE TABLE IF NOT EXISTS public.profile_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    url text NOT NULL,
    display_order integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Table: matches
-- Stores the 1-on-1 matches. Users see only one best match at a time.
CREATE TABLE IF NOT EXISTS public.matches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_b_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    compatibility_score integer CHECK (compatibility_score >= 0 AND compatibility_score <= 100),
    compatibility_reasons text[],
    icebreaker_hint text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'chat_started', 'unmatched')),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_must_be_different CHECK (user_a_id <> user_b_id)
);

-- 4. Function & Trigger: Prevent multiple active matches per user
-- This enforces the "One Match at a Time" rule at the database level.
CREATE OR REPLACE FUNCTION public.check_active_matches()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check if the new or updated match is 'active'
    IF NEW.status = 'active' THEN
        -- Check if user_a already has an active match (excluding current row if update)
        IF EXISTS (
            SELECT 1 FROM public.matches 
            WHERE status = 'active' 
            AND (user_a_id = NEW.user_a_id OR user_b_id = NEW.user_a_id)
            AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) THEN
            RAISE EXCEPTION 'User A already has an active match.';
        END IF;

        -- Check if user_b already has an active match
        IF EXISTS (
            SELECT 1 FROM public.matches 
            WHERE status = 'active' 
            AND (user_a_id = NEW.user_b_id OR user_b_id = NEW.user_b_id)
            AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) THEN
            RAISE EXCEPTION 'User B already has an active match.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_active_matches
    BEFORE INSERT OR UPDATE ON public.matches
    FOR EACH ROW EXECUTE FUNCTION public.check_active_matches();

-- 5. Table: conversations
CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid UNIQUE REFERENCES public.matches(id) ON DELETE SET NULL,
    user_a_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_b_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_message_at timestamptz DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Table: messages
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content text NOT NULL,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Enable RLS
ALTER TABLE public.questionnaire_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 8. Policies: questionnaire_answers
DROP POLICY IF EXISTS "Users can manage their own questionnaire answers" ON public.questionnaire_answers;
CREATE POLICY "Users can manage their own questionnaire answers"
    ON public.questionnaire_answers FOR ALL
    USING (auth.uid() = user_id);

-- 9. Policies: profile_photos
DROP POLICY IF EXISTS "Users can manage their own profile photos" ON public.profile_photos;
CREATE POLICY "Users can manage their own profile photos"
    ON public.profile_photos FOR ALL
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view photos of their matches" ON public.profile_photos;
CREATE POLICY "Users can view photos of their matches"
    ON public.profile_photos FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.matches
            WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
            AND (user_a_id = profile_photos.user_id OR user_b_id = profile_photos.user_id)
        )
        OR EXISTS (
            SELECT 1 FROM public.conversations
            WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
            AND (user_a_id = profile_photos.user_id OR user_b_id = profile_photos.user_id)
        )
    );

-- 10. Policies: matches
DROP POLICY IF EXISTS "Users can view their own matches" ON public.matches;
CREATE POLICY "Users can view their own matches"
    ON public.matches FOR SELECT
    USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS "Users can update their own matches" ON public.matches;
CREATE POLICY "Users can update their own matches"
    ON public.matches FOR UPDATE
    USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- 11. Policies: conversations
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.conversations;
CREATE POLICY "Users can view their own conversations"
    ON public.conversations FOR SELECT
    USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS "Users can create conversations for their matches" ON public.conversations;
CREATE POLICY "Users can create conversations for their matches"
    ON public.conversations FOR INSERT
    WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- 12. Policies: messages
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations"
    ON public.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations
            WHERE id = messages.conversation_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
CREATE POLICY "Users can send messages to their conversations"
    ON public.messages FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM public.conversations
            WHERE id = messages.conversation_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
        )
    );

-- 13. Utility Triggers
DROP TRIGGER IF EXISTS set_questionnaire_answers_updated_at ON public.questionnaire_answers;
CREATE TRIGGER set_questionnaire_answers_updated_at
    BEFORE UPDATE ON public.questionnaire_answers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_matches_updated_at ON public.matches;
CREATE TRIGGER set_matches_updated_at
    BEFORE UPDATE ON public.matches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 14. Trigger: Update conversation timestamp on new message
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations
    SET last_message_at = now()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_new_message ON public.messages;
CREATE TRIGGER on_new_message
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();

-- 15. Indexes
CREATE INDEX IF NOT EXISTS idx_questionnaire_user_id ON public.questionnaire_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_photos_user_id ON public.profile_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_a ON public.matches(user_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_b ON public.matches(user_b_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_conversations_user_a ON public.conversations(user_a_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_b ON public.conversations(user_b_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
