import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Rate limiting helper
async function checkRateLimit(supabase: any, userId: string, actionType: string, maxCount: number, windowSeconds: number): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  const { data, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Rate limit check error:', error);
    return true;
  }

  if (!data) {
    await supabase.from('rate_limits').insert({
      user_id: userId,
      action_type: actionType,
      action_count: 1,
      window_start: now
    });
    return true;
  }

  if (new Date(data.window_start) < windowStart) {
    await supabase.from('rate_limits').update({
      action_count: 1,
      window_start: now
    }).eq('id', data.id);
    return true;
  }

  if (data.action_count >= maxCount) {
    return false;
  }

  await supabase.from('rate_limits').update({
    action_count: data.action_count + 1
  }).eq('id', data.id);

  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.58.0");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Rate limiting: макс 200 chunk транскрипцій на годину (більше для Gemini)
    const allowed = await checkRateLimit(supabase, user.id, 'transcribe_chunk', 200, 3600);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded: maximum 200 chunk transcriptions per hour' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const { chunkBase64, mimeType = "audio/webm" } = await req.json();
    
    if (!chunkBase64) {
      throw new Error("chunkBase64 is required");
    }

    console.log('Транскрипція чанку через Gemini...');

    // Використовуємо Gemini 2.5 Flash для транскрипції аудіо
    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Транскрибуй цей аудіо фрагмент. Верни ТІЛЬКИ текст транскрипції, без жодних додаткових коментарів або форматування. Якщо аудіо українською - пиши українською, якщо англійською - англійською.'
              },
              {
                type: 'input_audio',
                input_audio: {
                  data: chunkBase64,
                  format: 'webm'
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Gemini transcription error:', errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'AI rate limit exceeded, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Gemini API error: ${aiResponse.status} ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const transcriptText = aiData.choices?.[0]?.message?.content?.trim() || '';
    
    console.log('Чанк транскрибовано:', transcriptText.substring(0, 50));
    
    // Визначення мови (проста евристика)
    let detectedLanguage = null;
    if (transcriptText) {
      // Українська - якщо є кирилиця
      if (/[а-яА-ЯіІїЇєЄґҐ]/.test(transcriptText)) {
        detectedLanguage = 'uk';
      } else if (/[a-zA-Z]/.test(transcriptText)) {
        detectedLanguage = 'en';
      }
    }
    
    return new Response(
      JSON.stringify({ 
        text: transcriptText, 
        language: detectedLanguage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in transcribe-chunk:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
