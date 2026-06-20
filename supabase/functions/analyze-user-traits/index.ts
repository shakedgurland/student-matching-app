// supabase/functions/analyze-user-traits/index.ts
//
// PR-AUDIT-D PR 2: reads the real V2 free-text fields
// (partner_should_know_text, conversation_starter, green_flag), gates on
// a meaningful-text length threshold, and caches by SHA-256 of normalized
// inputs to avoid re-paying OpenAI on no-op resaves.
//
// This is an internal matching signal only. There is no user-facing
// "AI analyzes you" UI claim anywhere in the app. The output is
// consumed by match-create/scoring.ts as a bounded ±8 soft complement.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Combined trimmed length below this threshold = no LLM call. Empirically
// 30 chars covers single-word answers but still demands at least one
// sentence-shaped chunk before spending tokens.
const MIN_MEANINGFUL_TEXT_LEN = 30

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// SHA-256 hex digest using Web Crypto. Deno + browsers both support it.
async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  const arr = Array.from(new Uint8Array(hashBuf))
  return arr.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Canonical input fingerprint. Order MUST stay stable across calls so the
// hash is deterministic. Whitespace collapsed; field name prefixes
// included so re-arranging the same text between fields still busts the
// cache (different semantic content).
function buildInputFingerprint(
  partnerShouldKnow: string,
  conversationStarter: string,
  greenFlag: string,
): string {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  return [
    'psk:' + norm(partnerShouldKnow),
    'cs:'  + norm(conversationStarter),
    'gf:'  + norm(greenFlag),
  ].join('||')
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Initialize Supabase Client with Service Role Key (Server-side only)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('UNIMATCH_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Auth Check: Require valid Supabase JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError || !user) {
      throw new Error(`Unauthorized: ${userError?.message || 'Invalid token'}`)
    }

    const user_id = user.id
    console.log(`Analyzing traits for verified user: ${user_id}`)

    // 3. Fetch Questionnaire Answers
    const { data: answersData, error: fetchError } = await supabaseClient
      .from('questionnaire_answers')
      .select('answers')
      .eq('user_id', user_id)
      .single()

    if (fetchError || !answersData) {
      throw new Error(`Failed to fetch answers: ${fetchError?.message || 'Not found'}`)
    }

    // V2 free-text inputs (PR-AUDIT-D PR 2). The three previous fields
    // (about_me, relationship_strengths_text, relationship_growth_text)
    // are not collected by the V2 questionnaire; reading them here would
    // always bail at the meaningful-text gate.
    const answers = answersData.answers as Record<string, unknown>
    const psk = typeof answers.partner_should_know_text === 'string' ? answers.partner_should_know_text : ''
    const cs  = typeof answers.conversation_starter === 'string' ? answers.conversation_starter : ''
    const gf  = typeof answers.green_flag === 'string' ? answers.green_flag : ''

    // Server-side meaningful-text gate (defense in depth with the client
    // gate in app/questionnaire.tsx). Combined trimmed length must clear
    // the threshold or we no-op cheaply.
    const combinedLen = (psk.trim() + cs.trim() + gf.trim()).length
    if (combinedLen < MIN_MEANINGFUL_TEXT_LEN) {
      return jsonResponse({ status: 'no_text', combinedLen, threshold: MIN_MEANINGFUL_TEXT_LEN })
    }

    // Hash cache. If the existing row's _input_hash matches the current
    // inputs, OpenAI is NOT called and the cached traits are reported.
    // This keeps deep users who resave without touching free text at
    // zero ongoing cost.
    const fingerprint = buildInputFingerprint(psk, cs, gf)
    const currentHash = await sha256Hex(fingerprint)

    const { data: existingRow } = await supabaseClient
      .from('profile_ai_traits')
      .select('traits')
      .eq('user_id', user_id)
      .maybeSingle()
    const existingTraits = (existingRow?.traits ?? null) as Record<string, unknown> | null
    const existingHash = existingTraits && typeof existingTraits._input_hash === 'string'
      ? existingTraits._input_hash as string
      : null
    if (existingHash && existingHash === currentHash) {
      return jsonResponse({ status: 'cached' })
    }

    // 4. AI Analysis with OpenAI
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) {
      throw new Error('OPENAI_API_KEY is not configured')
    }

    const systemPrompt = `You are a psychology expert specializing in relationship compatibility.
Analyze the following student dating profile text (provided in Hebrew) and extract key personality traits.
The output MUST be a valid JSON object strictly following this schema:
{
  "emotional_tone": "warm | reserved | energetic | calm",
  "social_energy": 1,
  "communication_style": "direct | expressive | thoughtful | minimalist",
  "ambition_level": 1,
  "lifestyle_tone": "relaxed | active | intellectual | adventurous",
  "humor_style": "witty | sarcastic | dry | gentle | none",
  "key_values": ["value1", "value2", "value3"]
}

Note: social_energy and ambition_level are numbers from 1 to 5.
Rules:
1. Return ONLY the JSON object.
2. Be objective and avoid overly sensitive or diagnostic language.
3. If the input is too short or unclear, provide neutral/middle-ground values.
4. Keep key_values to 3 items max.`

    const userPrompt = `Student profile text:
- מה חשוב שבן/בת הזוג יידעו עלייך: ${psk}
- פרט קטן שיכול להפוך לשיחה של שעה: ${cs}
- ה-green flag הכי מוזר שלך: ${gf}`

    console.log('Requesting analysis from OpenAI...')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 400,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`)
    }

    const aiData = await response.json()
    const content = aiData.choices[0]?.message?.content
    if (!content) throw new Error('OpenAI returned an empty response')

    let analyzedTraits: Record<string, unknown>
    try {
      analyzedTraits = JSON.parse(content)
      analyzedTraits.analyzed_at = new Date().toISOString()
      analyzedTraits.is_placeholder = false
      // Persist input fingerprint hash so the next call can short-circuit
      // when the user resaves without changing free text.
      analyzedTraits._input_hash = currentHash
    } catch (e) {
      console.error('Failed to parse OpenAI JSON:', content)
      throw new Error('Failed to parse AI traits response')
    }

    // 5. Upsert into public.profile_ai_traits
    const { error: upsertError } = await supabaseClient
      .from('profile_ai_traits')
      .upsert({
        user_id: user_id,
        traits: analyzedTraits,
        model_version: 'openai-traits-v2',
      }, { onConflict: 'user_id' })

    if (upsertError) throw upsertError

    return jsonResponse({
      status: 'analyzed',
      success: true,
      message: 'Traits extracted successfully',
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error('Extraction Error:', message)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
