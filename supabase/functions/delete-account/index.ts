// supabase/functions/delete-account/index.ts
//
// Backend-authoritative account deletion. The only entry point for a user
// to remove their own UniMatch account.
//
// Flow
// ────
//   1. CORS preflight.
//   2. Method gate — POST only (rejects GET/PUT/DELETE/PATCH with 405).
//   3. Build admin client (service role).
//   4. Verify JWT and derive userId. Request body is intentionally ignored
//      so a caller cannot ask to delete a different user. The only trusted
//      identifier is admin.auth.getUser(jwt).id.
//   5. Delete every object under `profile-photos/{userId}/` (paginated so
//      a user with many photos doesn't exceed the storage list cap).
//   6. ONLY if storage deletion fully succeeded: call
//      admin.auth.admin.deleteUser(userId). The auth.users row removal
//      triggers Postgres CASCADE down through profiles → questionnaire_
//      answers, matches, conversations, messages, profile_ai_traits,
//      profile_photos, push_tokens, conversation_reads, match_feedback,
//      student_verifications. No manual SQL DELETE is needed — the FK
//      chain (verified in the audit; see supabase/scripts/check-orphans.sql)
//      covers every user-owned table.
//   7. Return { status: 'deleted' }.
//
// SECURITY
// ────────
//   * The only trusted user identifier is admin.auth.getUser(jwt).id.
//   * Request body is never read. A caller cannot delete another user.
//   * No JWT, Authorization header, service role key, email, or raw
//     storage path is logged. Logs include only the event name, the
//     first 8 chars of the user id, deleted-object counts, and (on
//     failure) a stable error code + safe message.
//   * Storage deletion runs BEFORE auth deletion. If storage fails, the
//     auth user is preserved so the operator can retry — preventing the
//     "user is gone but bucket is full" orphan state the audit flagged.
//   * If auth deletion fails after storage succeeded, the bucket is
//     already empty for that user — re-invoking the function (with the
//     same JWT, which is still valid because the user still exists) will
//     simply skip the storage step (empty list) and retry auth delete.
//   * No-photos users complete in two round-trips (list + auth delete)
//     and never call storage.remove.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PROFILE_PHOTOS_BUCKET = 'profile-photos'

// Page size for storage.list. Supabase's default list limit is 100 — we
// raise it explicitly so a power user with up to 1000 photos completes in
// one page. The pagination loop below handles anything beyond that.
const STORAGE_LIST_PAGE_SIZE = 1000

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Delete every object under `profile-photos/{userId}/`. Iterates with
// paginated list calls until the folder is empty. Returns the total count
// of deleted objects so the caller can log it. Throws on any list or
// remove error — the caller wraps this so a storage failure prevents the
// auth deletion (intentional ordering — see file header).
//
// Note: storage.list returns only the immediate folder level. UniMatch
// stores avatars flat under {userId}/{filename}; if a future feature
// introduces nested directories, this loop will need recursive traversal.
async function deleteStorageFolder(
  admin: SupabaseClient,
  bucket: string,
  folder: string,
): Promise<number> {
  let deletedTotal = 0
  // The list endpoint returns rows starting from `offset`. Each iteration
  // either deletes a full page and advances, or sees a short page and
  // exits. A folder that becomes empty between iterations also exits
  // (files.length === 0).
  // Safety cap on iterations to guarantee termination even under a
  // pathological list/remove disagreement.
  const MAX_ITERATIONS = 20
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { data: files, error: listErr } = await admin.storage
      .from(bucket)
      .list(folder, { limit: STORAGE_LIST_PAGE_SIZE, offset: 0 })
    if (listErr) {
      throw listErr
    }
    if (!files || files.length === 0) {
      break
    }
    const paths = files.map((f) => `${folder}/${f.name}`)
    const { error: removeErr } = await admin.storage.from(bucket).remove(paths)
    if (removeErr) {
      throw removeErr
    }
    deletedTotal += files.length
    if (files.length < STORAGE_LIST_PAGE_SIZE) {
      // Short page → bucket is now empty for this folder. Done.
      break
    }
  }
  return deletedTotal
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 1. Method gate. Reject anything that isn't POST early so the function
  //    cannot be triggered via a stray GET (e.g., a copy-pasted URL in a
  //    browser address bar). 405 with an Allow header is the standard
  //    HTTP response.
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ status: 'method_not_allowed' }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Allow': 'POST, OPTIONS',
      },
    })
  }

  try {
    // 2. Admin client (service role).
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('UNIMATCH_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ status: 'error', message: 'server misconfigured' }, 500)
    }
    const admin = createClient(supabaseUrl, serviceRoleKey)

    // 3. JWT extraction + verification. The only trusted source of caller
    //    identity. Request body is intentionally ignored — no user_id is
    //    accepted from the client. Calls with a stale JWT (auth user
    //    already deleted) fail here with a clean 401.
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice('bearer '.length).trim()
      : ''
    if (!jwt) return jsonResponse({ status: 'unauthorized' }, 401)
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return jsonResponse({ status: 'unauthorized' }, 401)
    const userId = user.id

    // 4. Storage cleanup BEFORE auth deletion. If this fails the auth
    //    user is preserved so the operator (or a retry) can re-attempt
    //    without leaving the bucket holding stale photos.
    let deletedStorageCount = 0
    try {
      deletedStorageCount = await deleteStorageFolder(admin, PROFILE_PHOTOS_BUCKET, userId)
    } catch (e) {
      // Surface a generic status to the client; full diagnostic to logs.
      const code = typeof (e as { statusCode?: unknown }).statusCode === 'string'
        ? (e as { statusCode: string }).statusCode
        : (typeof (e as { code?: unknown }).code === 'string'
          ? (e as { code: string }).code
          : null)
      console.log(JSON.stringify({
        event: 'delete_account_storage_failed',
        userIdPrefix: userId.slice(0, 8),
        code,
        message: e instanceof Error ? e.message : 'unknown',
      }))
      return jsonResponse({ status: 'error', message: 'storage cleanup failed' }, 500)
    }

    // 5. Auth user deletion. CASCADE chain handles every user-owned
    //    Postgres table (verified by the audit + supabase/scripts/
    //    check-orphans.sql). No manual SQL DELETE is required.
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
    if (deleteErr) {
      const code = typeof (deleteErr as { code?: unknown }).code === 'string'
        ? (deleteErr as { code: string }).code
        : null
      console.log(JSON.stringify({
        event: 'delete_account_auth_failed',
        userIdPrefix: userId.slice(0, 8),
        deletedStorageCount,
        code,
        message: deleteErr.message ?? 'unknown',
      }))
      return jsonResponse({ status: 'error', message: 'account deletion failed' }, 500)
    }

    console.log(JSON.stringify({
      event: 'delete_account_succeeded',
      userIdPrefix: userId.slice(0, 8),
      deletedStorageCount,
    }))
    return jsonResponse({ status: 'deleted' })
  } catch (e) {
    // Unexpected paths. Surface a generic message; do not leak the raw
    // error to the client. The detail is in the function logs (without
    // user-identifying content).
    console.log(JSON.stringify({
      event: 'delete_account_exception',
      message: e instanceof Error ? e.message : 'unknown',
    }))
    return jsonResponse({ status: 'error', message: 'internal error' }, 500)
  }
})
