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

    // Rate limiting: макс 20 транскрипцій на добу
    const allowed = await checkRateLimit(supabase, user.id, 'transcribe', 20, 86400);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded: maximum 20 transcriptions per day' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { signedUrl } = await req.json();
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!signedUrl) {
      throw new Error("signedUrl is required");
    }

    console.log('Завантаження аудіо з signed URL');
    
    // 1) Завантажити аудіо
    const audioResp = await fetch(signedUrl);
    if (!audioResp.ok) {
      throw new Error(`Failed to fetch audio: ${audioResp.status}`);
    }
    const arrayBuffer = await audioResp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Визначаємо тип з Content-Type заголовка
    const contentTypeHeader = audioResp.headers.get('content-type') || 'audio/webm';
    const fileName = `note.${contentTypeHeader.split('/')[1].split(';')[0]}`;

    console.log('Транскрипція аудіо...');
    
    // 2) Транскрипція
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: contentTypeHeader }), fileName);
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");

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

    const trJson = await trRes.json();
    const transcript = trJson.text || "";
    const language = trJson.language || "auto";
    const durationSeconds = trJson.duration || null;

    console.log('Транскрипція завершена. Мова:', language);
    console.log('Створення узагальнення...');

    // 3) Узагальнення
    const prompt = `
Вихідна транскрипція (${language}):
"""${transcript}"""

Завдання:
1) Придумай короткий доречний заголовок мовою транскрипції.
2) Зроби стислий виклад (5–7 речень), зберігаючи зміст.
3) Пиши тією ж мовою.
JSON:
{"title": "...", "summary": "..."}
`;

    const sumRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${OPENAI_API_KEY}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { 
            role: "system", 
            content: "You are a helpful assistant that writes concise summaries in the same language as the input." 
          },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!sumRes.ok) {
      const errorText = await sumRes.text();
      console.error('Summarization error:', errorText);
      throw new Error(`Summarization failed: ${sumRes.status} ${errorText}`);
    }

    const sumJson = await sumRes.json();
    let title = "Аудіонотатка";
    let summary = "";
    
    try {
      const obj = JSON.parse(sumJson.choices[0]?.message?.content ?? "{}");
      title = obj.title ?? title;
      summary = obj.summary ?? "";
    } catch {
      summary = sumJson.choices[0]?.message?.content ?? "";
    }

    console.log('Узагальнення створено:', title);

    return new Response(
      JSON.stringify({ 
        transcript, 
        language, 
        durationSeconds, 
        title, 
        summary 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in transcribe-and-summarize:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
