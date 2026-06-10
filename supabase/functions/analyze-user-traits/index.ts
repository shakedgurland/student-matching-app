// supabase/functions/analyze-user-traits/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // 2. Parse Request
    const { user_id } = await req.json()
    if (!user_id) throw new Error('user_id is required')

    console.log(`Analyzing traits for user: ${user_id}`)

    // 3. Fetch Questionnaire Answers
    const { data: answersData, error: fetchError } = await supabaseClient
      .from('questionnaire_answers')
      .select('answers')
      .eq('user_id', user_id)
      .single()

    if (fetchError || !answersData) {
      throw new Error(`Failed to fetch answers: ${fetchError?.message || 'Not found'}`)
    }

    const answers = answersData.answers
    const freeTextFields = {
      about_me: answers.about_me || '',
      relationship_strengths_text: answers.relationship_strengths_text || '',
      relationship_growth_text: answers.relationship_growth_text || '',
    }

    // Check if there's actually something to analyze
    const combinedText = Object.values(freeTextFields).join(' ').trim()
    if (!combinedText) {
      return new Response(JSON.stringify({ message: 'No text to analyze' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
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
- About me: ${freeTextFields.about_me}
- Strengths in relationships: ${freeTextFields.relationship_strengths_text}
- Areas for growth: ${freeTextFields.relationship_growth_text}`

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

    let analyzedTraits
    try {
      analyzedTraits = JSON.parse(content)
      analyzedTraits.analyzed_at = new Date().toISOString()
      analyzedTraits.is_placeholder = false
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
        model_version: 'openai-traits-v1',
      }, { onConflict: 'user_id' })

    if (upsertError) throw upsertError

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Traits extracted successfully',
      traits: analyzedTraits 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Extraction Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
