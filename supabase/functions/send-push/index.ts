// supabase/functions/send-push/index.ts
//
// PR-PUSH-C: Edge Function that delivers an Expo push notification to
// the recipient of a chat message. Stateless aside from reads from
// push_tokens (migration 029) and revocation writes for dead tokens.
//
// IMPORTANT: This function is created here but NOT yet auto-triggered.
// PR-PUSH-D will configure a Supabase Database Webhook on
// `INSERT INTO public.messages` to invoke this function. Until then,
// this function is callable manually via curl for testing.
//
// Two input shapes are accepted:
//
//   (A) Database Webhook payload (Supabase standard):
//       {
//         "type": "INSERT" | "UPDATE" | "DELETE",
//         "table": "messages",
//         "schema": "public",
//         "record": {
//           "id": "...", "conversation_id": "...", "sender_id": "...",
//           "content": "...", "created_at": "..."
//         },
//         "old_record": null
//       }
//       This is the wire format Supabase Database Webhooks send.
//
//   (B) Manual test:
//       { "message_id": "<uuid>" }
//       The function fetches the message by id and proceeds. Useful for
//       curl-testing in PR-PUSH-C before the webhook is configured.
//
// Both paths converge on the same logic: resolve the conversation,
// determine the peer (NOT the sender), fetch active push_tokens, send
// via Expo Push API, mark dead tokens revoked.
//
// Security
// ────────
//   • Service-role-only DB access. The function uses
//     UNIMATCH_SERVICE_ROLE_KEY (the project's verified convention,
//     same as match-create + analyze-user-traits) and bypasses RLS to
//     read push_tokens.expo_token (RLS would otherwise hide them).
//   • Fail-closed webhook secret: SEND_PUSH_WEBHOOK_SECRET MUST be
//     set in the function's runtime env, AND every request MUST send a
//     matching `x-webhook-secret` header. Missing env → 500
//     `server_misconfigured` BEFORE any DB read or Expo call. Missing /
//     mismatched header → 401 `unauthorized`. No permissive mode for
//     manual test payloads — operators who need to test must set the
//     env var and pass the header. PR-PUSH-D configures the Database
//     Webhook to send the same header.
//   • Participant check: even with a webhook payload, the function
//     re-validates that `record.sender_id` is actually one of the
//     conversation's participants. Prevents spoofed webhook payloads
//     from triggering pushes to arbitrary users.
//   • Privacy in body: notification body never echoes message content,
//     sender name, or any sensitive fields. Generic copy only.
//   • Privacy in logs: full Expo tokens are never logged. Recipient
//     user_id is prefix-redacted (first 8 chars). The secret itself is
//     never logged, even on mismatch.
//
// Delivery semantics
// ──────────────────
//   An Expo ticket with status='ok' means Expo ACCEPTED the message
//   into its queue. It does NOT confirm the device received or
//   displayed the notification — that requires polling Expo's receipt
//   API after a short delay. A future PR can add receipt polling +
//   late revocation if production observability needs it; PR-PUSH-C
//   ships only the synchronous send path.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

// Generic Hebrew copy. Never echoes message content. Never reveals
// sender identity. This is the safest possible notification body.
const NOTIFICATION_TITLE = 'הודעה חדשה ב-UniMatch'
const NOTIFICATION_BODY = 'מישהו כתב לך. אולי שווה להציץ 🙂'

interface MessageRow {
  id: string
  conversation_id: string
  sender_id: string
  created_at: string
}

interface ConversationRow {
  id: string
  user_a_id: string
  user_b_id: string
  match_id: string | null
}

interface PushTokenRow {
  id: string
  expo_token: string
}

interface ExpoTicket {
  status?: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  // Console-driven structured logs. Never includes expo_token strings
  // or message content — callers must pre-redact.
  console.log(JSON.stringify({ event, ...fields }))
}

function redactUserId(id: string): string {
  return id.slice(0, 8)
}

// Extract conversation_id + sender_id + message_id from either accepted
// payload shape. Returns null on malformed input.
async function resolveMessageHandle(
  admin: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<MessageRow | null> {
  // (A) Webhook payload.
  if (
    payload.type === 'INSERT'
    && payload.table === 'messages'
    && payload.record
    && typeof payload.record === 'object'
  ) {
    const rec = payload.record as Record<string, unknown>
    if (
      typeof rec.id === 'string'
      && typeof rec.conversation_id === 'string'
      && typeof rec.sender_id === 'string'
    ) {
      return {
        id: rec.id,
        conversation_id: rec.conversation_id,
        sender_id: rec.sender_id,
        created_at: typeof rec.created_at === 'string' ? rec.created_at : '',
      }
    }
    return null
  }

  // (B) Manual test payload — { message_id: "..." }.
  if (typeof payload.message_id === 'string') {
    const { data, error } = await admin
      .from('messages')
      .select('id, conversation_id, sender_id, created_at')
      .eq('id', payload.message_id)
      .maybeSingle()
    if (error || !data) return null
    return data as MessageRow
  }

  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Admin client.
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('UNIMATCH_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      logEvent('send_push_invalid_payload', { reason: 'server_misconfigured' })
      return jsonResponse({ status: 'error', reason: 'server_misconfigured' }, 500)
    }
    const admin = createClient(supabaseUrl, serviceRoleKey)

    // 2. Webhook secret — FAIL CLOSED. Both the env var and the
    //    request header are mandatory. Manual test payloads must also
    //    present the header; there is no permissive mode for ops or
    //    development. PR-PUSH-D configures the Database Webhook to send
    //    the same `x-webhook-secret` header value as is set in the env.
    //    The secret value itself is never logged on either branch.
    const expectedSecret = Deno.env.get('SEND_PUSH_WEBHOOK_SECRET') ?? ''
    if (!expectedSecret) {
      logEvent('send_push_invalid_payload', { reason: 'secret_unset' })
      return jsonResponse({ status: 'error', reason: 'server_misconfigured' }, 500)
    }
    const providedSecret = req.headers.get('x-webhook-secret') ?? ''
    if (providedSecret !== expectedSecret) {
      logEvent('send_push_invalid_payload', { reason: 'bad_secret' })
      return jsonResponse({ status: 'error', reason: 'unauthorized' }, 401)
    }

    // 3. Parse body.
    let payload: Record<string, unknown>
    try {
      payload = (await req.json()) as Record<string, unknown>
    } catch {
      logEvent('send_push_invalid_payload', { reason: 'malformed_json' })
      return jsonResponse({ status: 'error', reason: 'invalid_payload' }, 400)
    }

    // 4. Resolve message handle (conversation_id + sender_id).
    const message = await resolveMessageHandle(admin, payload)
    if (!message) {
      logEvent('send_push_invalid_payload', { reason: 'no_message_resolved' })
      return jsonResponse({ status: 'error', reason: 'invalid_payload' }, 400)
    }

    // 5. Resolve conversation + match.
    const { data: convData, error: convErr } = await admin
      .from('conversations')
      .select('id, user_a_id, user_b_id, match_id')
      .eq('id', message.conversation_id)
      .maybeSingle()
    if (convErr || !convData) {
      logEvent('send_push_invalid_payload', {
        reason: 'conversation_not_found',
        convIdPrefix: message.conversation_id.slice(0, 8),
      })
      return jsonResponse({ status: 'error', reason: 'conversation_not_found' }, 404)
    }
    const conversation = convData as ConversationRow

    // 6. Sender-participant check. Spoofed webhook protection.
    if (
      message.sender_id !== conversation.user_a_id
      && message.sender_id !== conversation.user_b_id
    ) {
      logEvent('send_push_invalid_payload', {
        reason: 'sender_not_participant',
        senderPrefix: redactUserId(message.sender_id),
        convIdPrefix: conversation.id.slice(0, 8),
      })
      return jsonResponse({ status: 'error', reason: 'sender_not_participant' }, 403)
    }

    // 7. Recipient is the OTHER participant. Never the sender.
    const recipientId = message.sender_id === conversation.user_a_id
      ? conversation.user_b_id
      : conversation.user_a_id
    const recipientPrefix = redactUserId(recipientId)

    // 8. Fetch active tokens for recipient.
    const { data: tokens, error: tokensErr } = await admin
      .from('push_tokens')
      .select('id, expo_token')
      .eq('user_id', recipientId)
      .is('revoked_at', null)
    if (tokensErr) {
      logEvent('send_push_invalid_payload', {
        reason: 'tokens_query_failed',
        recipientPrefix,
        code: tokensErr.code ?? null,
      })
      return jsonResponse({ status: 'error', reason: 'tokens_query_failed' }, 500)
    }
    const tokenRows = (tokens ?? []) as PushTokenRow[]

    if (tokenRows.length === 0) {
      logEvent('send_push_no_tokens', { recipientPrefix })
      return jsonResponse({
        status: 'ok',
        recipient_id_prefix: recipientPrefix,
        tokens_attempted: 0,
        tickets_ok: 0,
        tickets_error: 0,
        revoked_tokens: 0,
      })
    }

    // 9. Build the Expo batches. Expo's push send API caps each request
    //    at 100 messages, so we chunk. Typical recipient (1-3 devices)
    //    fits in a single chunk; the loop is defensive for the day a
    //    power user accumulates many devices. Each chunk is sent
    //    independently; a chunk's HTTP failure does not abort other
    //    chunks (a localized network blip should not silence the
    //    user's other devices). Project-level credential errors
    //    typically repeat across chunks; that's surfaced via per-chunk
    //    logs rather than auto-revoking individual user tokens.
    const CHUNK_SIZE = 100
    const chunks: PushTokenRow[][] = []
    for (let i = 0; i < tokenRows.length; i += CHUNK_SIZE) {
      chunks.push(tokenRows.slice(i, i + CHUNK_SIZE))
    }

    // 10. Common Expo headers. Optional EXPO_ACCESS_TOKEN bumps rate
    //     limits and unlocks the receipts API; not required for the
    //     synchronous send.
    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN') ?? ''
    const expoHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    }
    if (expoAccessToken) {
      expoHeaders['Authorization'] = `Bearer ${expoAccessToken}`
    }

    let ticketsOk = 0
    let ticketsError = 0
    const tokensToRevoke: string[] = []

    for (const chunk of chunks) {
      const messages = chunk.map((t) => ({
        to: t.expo_token,
        title: NOTIFICATION_TITLE,
        body: NOTIFICATION_BODY,
        sound: 'default',
        data: {
          type: 'chat_message',
          conversation_id: conversation.id,
          match_id: conversation.match_id,
        },
      }))

      let expoData: { data?: ExpoTicket[]; errors?: unknown[] } | null = null
      try {
        const expoResp = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: expoHeaders,
          body: JSON.stringify(messages),
        })
        if (!expoResp.ok) {
          const text = await expoResp.text().catch(() => '')
          // Project-level / rate-limit / network error for this chunk.
          // Count all tokens in the chunk as send errors but do NOT
          // revoke them — the failure isn't attributable to any
          // specific device.
          ticketsError += chunk.length
          logEvent('send_push_partial_failure', {
            reason: 'expo_http_error',
            recipientPrefix,
            status: expoResp.status,
            chunkSize: chunk.length,
            // text MAY echo a token; truncate hard to avoid leakage.
            textPrefix: text.slice(0, 120),
          })
          continue
        }
        expoData = (await expoResp.json()) as { data?: ExpoTicket[]; errors?: unknown[] }
      } catch (e) {
        ticketsError += chunk.length
        logEvent('send_push_partial_failure', {
          reason: 'expo_fetch_exception',
          recipientPrefix,
          chunkSize: chunk.length,
          message: e instanceof Error ? e.message : 'unknown',
        })
        continue
      }

      // Pair tickets back to tokens (Expo preserves order within each
      // request). Revoke ONLY for DeviceNotRegistered — the one error
      // code that genuinely identifies a token as dead from APNs/FCM's
      // perspective. We deliberately do NOT revoke for:
      //   • InvalidCredentials → project-level credentials issue
      //     (APNs key wrong, FCM project misconfigured). Affects every
      //     token under that platform; revoking would mass-delete
      //     healthy tokens.
      //   • MismatchSenderId  → project-level FCM sender mismatch.
      //   • MessageTooBig / MessageRateExceeded → request-shape /
      //     rate-limit issues, not a token problem.
      //   • Anything else not explicitly listed.
      // All non-revoking errors still count as ticketsError so ops can
      // see send health in the response + logs.
      const tickets = expoData?.data ?? []
      for (let i = 0; i < chunk.length; i++) {
        const ticket = tickets[i]
        if (!ticket) {
          // Expo returned fewer tickets than tokens in this chunk.
          // Transient; don't revoke.
          ticketsError++
          continue
        }
        if (ticket.status === 'ok') {
          ticketsOk++
        } else {
          ticketsError++
          const errorCode = ticket.details?.error
          if (errorCode === 'DeviceNotRegistered') {
            tokensToRevoke.push(chunk[i].id)
          }
        }
      }
    }


    if (tokensToRevoke.length > 0) {
      const { error: revokeErr } = await admin
        .from('push_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .in('id', tokensToRevoke)
      if (revokeErr) {
        logEvent('send_push_partial_failure', {
          reason: 'revoke_failed',
          recipientPrefix,
          count: tokensToRevoke.length,
          code: revokeErr.code ?? null,
        })
        // Continue — the send already happened; revocation failure is
        // log-worthy but not user-facing.
      } else {
        for (const _ of tokensToRevoke) {
          logEvent('send_push_revoked_token', { recipientPrefix })
        }
      }
    }

    if (ticketsError === 0) {
      logEvent('send_push_success', {
        recipientPrefix,
        tokensAttempted: tokenRows.length,
      })
    } else {
      logEvent('send_push_partial_failure', {
        reason: 'tickets_error',
        recipientPrefix,
        tokensAttempted: tokenRows.length,
        ticketsOk,
        ticketsError,
      })
    }

    return jsonResponse({
      status: 'ok',
      recipient_id_prefix: recipientPrefix,
      tokens_attempted: tokenRows.length,
      tickets_ok: ticketsOk,
      tickets_error: ticketsError,
      revoked_tokens: tokensToRevoke.length,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    logEvent('send_push_invalid_payload', { reason: 'unhandled_exception', message })
    return jsonResponse({ status: 'error', reason: 'unhandled_exception' }, 500)
  }
})
