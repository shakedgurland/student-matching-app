
-- 1. Create app_events table
CREATE TABLE IF NOT EXISTS public.app_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    screen text,
    action text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- 2. Add indexes for analytics performance
CREATE INDEX IF NOT EXISTS idx_app_events_user_id ON public.app_events(user_id);
CREATE INDEX IF NOT EXISTS idx_app_events_event_type ON public.app_events(event_type);
CREATE INDEX IF NOT EXISTS idx_app_events_created_at ON public.app_events(created_at);

-- 3. Security
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to log their own events
DROP POLICY IF EXISTS "Users can insert their own events" ON public.app_events;
CREATE POLICY "Users can insert their own events"
ON public.app_events FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Note: No SELECT policy is added to prevent clients from reading logs.
-- Admin views can be created via service_role or restricted admin schemas.
