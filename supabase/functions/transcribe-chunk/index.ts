import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Rate limiting: макс 120 chunk транскрипцій на годину
    const allowed = await checkRateLimit(supabase, user.id, 'transcribe_chunk', 120, 3600);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded: maximum 120 chunk transcriptions per hour' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const { chunkBase64, mimeType = "audio/webm" } = await req.json();
    
    if (!chunkBase64) {
      throw new Error("chunkBase64 is required");
    }

    console.log('Транскрипція чанку...');

    // Декодування base64
    const binaryString = atob(chunkBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: 'audio/webm' });

    const form = new FormData();
    form.append("file", blob, `audio_${Date.now()}.webm`);
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("language", "uk"); // Підказка для української мови

    const trRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form
    });

    if (!trRes.ok) {
      const errorText = await trRes.text();
      console.error('Transcription error:', errorText);
      throw new Error(`Transcription failed: ${trRes.status} ${errorText}`);
    }

    const data = await trRes.json();
    console.log('Чанк транскрибовано:', data.text?.substring(0, 50));
    
    return new Response(
      JSON.stringify({ 
        text: data.text || "", 
        language: data.language || null 
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
