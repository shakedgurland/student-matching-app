-- Migration 029: push_tokens table + register_push_token RPC.
--
-- Why
-- ───
-- PR-PUSH-B introduces real Expo push token registration. We need a
-- DB-backed store so:
--   • the send-push Edge Function (PR-PUSH-C) can look up the recipient's
--     active tokens at notification time.
--   • a user with multiple devices can receive a push on each.
--   • dead tokens can be marked inactive (revoked_at) without losing
--     historical record.
--
-- This migration is exclusively storage + a server-validated upsert RPC.
-- It does NOT:
--   • install expo-notifications (that's a JS/native concern handled in
--     this same PR via `npx expo install` + the app.json plugin).
--   • create the send-push Edge Function (PR-PUSH-C).
--   • wire a Database Webhook (PR-PUSH-D).
--   • send any notification.
--
-- Scope
-- ─────
--   1. public.push_tokens table:
--      - Composite uniqueness on (user_id, expo_token) so re-registering
--        the same token from the same device is a clean UPSERT.
--      - revoked_at nullable timestamptz — set by receipt cleanup in a
--        future PR (or by the user explicitly opting out).
--      - platform CHECK restricts to 'ios' / 'android'.
--   2. RLS: per-user read/write of own tokens only. Service role used by
--      the future send-push Edge Function bypasses RLS as expected.
--   3. SECURITY DEFINER RPC register_push_token(text, text, text) that
--      validates Expo token shape + platform, UPSERTs the row, and
--      clears revoked_at on re-registration (the same physical device
--      coming back online with the same token).
--
-- Idempotency: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS +
-- CREATE POLICY + CREATE OR REPLACE FUNCTION. Safe to re-apply.
--
-- What this migration deliberately does NOT do
-- ────────────────────────────────────────────
--   * Does NOT add a receipt-polling cron — deferred. Dead-token cleanup
--     can be done manually until PR-PUSH-C's send-push function sees
--     DeviceNotRegistered receipts and flips revoked_at.
--   * Does NOT touch migration 022.

------------------------------------------------------------------------
-- 1. public.push_tokens table
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_token   text NOT NULL,
  platform     text NOT NULL CHECK (platform IN ('ios', 'android')),
  device_label text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  UNIQUE (user_id, expo_token)
);

-- Active-tokens lookup by user_id is the hot path for send-push.
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_active
  ON public.push_tokens(user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------
-- 2. RLS: per-user, own tokens only.
--
--    SELECT/INSERT/UPDATE/DELETE: only own rows. service_role (used by
--    the future send-push Edge Function) bypasses RLS — no special
--    policy needed for it.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users select own push_tokens" ON public.push_tokens;
CREATE POLICY "Users select own push_tokens"
  ON public.push_tokens FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own push_tokens" ON public.push_tokens;
CREATE POLICY "Users insert own push_tokens"
  ON public.push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own push_tokens" ON public.push_tokens;
CREATE POLICY "Users update own push_tokens"
  ON public.push_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own push_tokens" ON public.push_tokens;
CREATE POLICY "Users delete own push_tokens"
  ON public.push_tokens FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;

------------------------------------------------------------------------
-- 3. register_push_token(p_expo_token, p_platform, p_device_label)
--
--    SECURITY DEFINER UPSERT keyed on (user_id, expo_token). Centralises
--    token-shape validation so a malformed token never lands in the
--    table even if a future client forgets to sanitise.
--
--    Returns jsonb:
--      success → { "status": "ok" }
--      caller missing → { "status": "error", "reason": "unauthorized" }
--      invalid token format → { "status": "error", "reason": "invalid_token" }
--      invalid platform → { "status": "error", "reason": "invalid_platform" }
--
--    On UPSERT we also clear revoked_at (a previously-dead token coming
--    back online from a fresh install of the app) and bump updated_at.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_expo_token   text,
  p_platform     text,
  p_device_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'unauthorized');
  END IF;

  -- Expo push tokens are wrapped as either ExponentPushToken[...] or
  -- ExpoPushToken[...]. Reject anything else early so the table never
  -- accumulates garbage strings that send-push would then waste a
  -- round-trip on.
  IF p_expo_token IS NULL
     OR (p_expo_token NOT LIKE 'ExponentPushToken[%]'
         AND p_expo_token NOT LIKE 'ExpoPushToken[%]')
  THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_token');
  END IF;

  IF p_platform NOT IN ('ios', 'android') THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_platform');
  END IF;

  INSERT INTO public.push_tokens (user_id, expo_token, platform, device_label, updated_at, revoked_at)
  VALUES (v_caller_id, p_expo_token, p_platform, p_device_label, now(), NULL)
  ON CONFLICT (user_id, expo_token)
    DO UPDATE SET
      platform     = EXCLUDED.platform,
      device_label = COALESCE(EXCLUDED.device_label, public.push_tokens.device_label),
      updated_at   = now(),
      revoked_at   = NULL;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.register_push_token(text, text, text) IS
  'Idempotent UPSERT of an Expo push token for the caller. Validates '
  'token shape (ExponentPushToken[...] or ExpoPushToken[...]) and '
  'platform (ios/android). Clears revoked_at on re-registration so a '
  'reinstalled app re-activates its previous token row. Returns '
  '{status:''ok''} on success or {status:''error'', reason:<...>} on '
  'refusal. Token never leaves the database via this RPC.';
