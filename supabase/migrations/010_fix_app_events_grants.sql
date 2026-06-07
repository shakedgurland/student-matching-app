-- Migration 010: Fix app_events permissions
GRANT INSERT ON public.app_events TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
