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

    // 4. TODO: AI Analysis
    /*
      PROMPT STRATEGY:
      System Message: You are a psychology expert. Analyze the following student dating profile text 
      and output a JSON object representing their traits.
      
      Input: ${JSON.stringify(freeTextFields)}
      
      Expected Schema:
      {
        "emotional_tone": "warm | reserved | energetic",
        "social_energy": 1-5,
        "communication_style": "direct | expressive | thoughtful",
        "ambition_level": 1-5,
        "lifestyle_tone": "relaxed | active | intellectual",
        "humor_style": "witty | sarcastic | dry | none"
      }
    */

    // Placeholder Traits (Simulated AI Response)
    const analyzedTraits = {
      emotional_tone: "warm",
      social_energy: 3,
      communication_style: "thoughtful",
      ambition_level: 4,
      lifestyle_tone: "intellectual",
      humor_style: "witty",
      analyzed_at: new Date().toISOString(),
      is_placeholder: true
    }

    // 5. Upsert into public.profile_ai_traits
    const { error: upsertError } = await supabaseClient
      .from('profile_ai_traits')
      .upsert({
        user_id: user_id,
        traits: analyzedTraits,
        model_version: 'placeholder-v1',
        // source_hash: generateHash(combinedText) // Future: only re-run if text changes
      }, { onConflict: 'user_id' })

    if (upsertError) throw upsertError

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Traits extracted (placeholder mode)',
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
