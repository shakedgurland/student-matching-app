// supabase/functions/match-create/index.ts
//
// Phase 1B-1 skeleton.
//
// This Edge Function will become the SOLE backend path for creating a
// match. The client (app) invokes it via supabase.functions.invoke with
// the user's JWT attached automatically. The function then:
//   1. Verifies the JWT and derives the trusted callerId.
//   2. Loads candidates via service role (RLS-bypassing, server-side).
//   3. Runs the scoring algorithm.
//   4. Calls the SECURITY DEFINER RPC `create_authorized_match` to
//      perform the atomic insert.
//
// This file currently implements ONLY:
//   - CORS handling for the OPTIONS preflight.
//   - Admin Supabase client construction using the service role key.
//   - JWT extraction from the Authorization header.
//   - JWT verification via admin.auth.getUser(jwt).
//   - Derivation of callerId from the verified user.
//   - A placeholder response of { status: 'not_implemented_yet' }.
//
// Future work (Phase 1B-2 onward):
//   - Pre-flight caller checks (onboarding, cap, active).
//   - Candidate pool build (no-rematch + caller/winner cap + active filters).
//   - Scoring (TypeScript port of lib/matching.ts).
//   - Service-role RPC call to create_authorized_match.
//
// SECURITY NOTES:
//   - The request body is intentionally IGNORED for any user-id or
//     winner-id input. The only trusted user identifier is what
//     admin.auth.getUser(jwt) returns from the verified JWT.
//   - UNIMATCH_SERVICE_ROLE_KEY must be set as a Supabase function
//     secret. It is the same secret already used by analyze-user-traits.
//   - This function must not log the JWT or the service role key.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Admin client (service role). Used for JWT verification here,
    //    and in future phases for candidate reads + RPC invocation.
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('UNIMATCH_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      // Misconfigured deploy. Return a generic error; do NOT echo env
      // names back to the client.
      return jsonResponse({ status: 'error', message: 'server misconfigured' }, 500)
    }
    const admin = createClient(supabaseUrl, serviceRoleKey)

    // 3. JWT extraction. The Authorization header is set automatically
    //    by the supabase-js client when invoking via functions.invoke.
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice('bearer '.length).trim()
      : ''
    if (!jwt) {
      return jsonResponse({ status: 'unauthorized' }, 401)
    }

    // 4. Verify JWT and derive callerId. This is the ONLY trusted
    //    source of user identity in the entire pipeline. The request
    //    body is intentionally ignored.
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) {
      return jsonResponse({ status: 'unauthorized' }, 401)
    }
    const callerId = user.id
    // Reference callerId so the linter does not flag the placeholder.
    // Future phases will use this id for pre-flight checks, candidate
    // exclusion, and the RPC call.
    void callerId

    // 5. Phase 1B-1 placeholder. Real matching logic lands in 1B-2.
    return jsonResponse({ status: 'not_implemented_yet' })
  } catch (e) {
    // Catch-all so the function never panics back to the runtime.
    const message = e instanceof Error ? e.message : 'unknown error'
    return jsonResponse({ status: 'error', message }, 500)
  }
})
