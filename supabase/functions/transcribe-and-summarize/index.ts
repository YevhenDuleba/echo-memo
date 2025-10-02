import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioPublicUrl } = await req.json();
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!audioPublicUrl) {
      throw new Error("audioPublicUrl is required");
    }

    console.log('Завантаження аудіо з:', audioPublicUrl);
    
    // 1) Завантажити аудіо
    const audioResp = await fetch(audioPublicUrl);
    if (!audioResp.ok) {
      throw new Error(`Failed to fetch audio: ${audioResp.status}`);
    }
    const arrayBuffer = await audioResp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const isWebm = audioPublicUrl.toLowerCase().endsWith(".webm");
    const isMp4 = audioPublicUrl.toLowerCase().endsWith(".mp4") || audioPublicUrl.toLowerCase().endsWith(".m4a");
    const contentType = isWebm ? "audio/webm" : (isMp4 ? "audio/mp4" : "audio/wav");
    const fileName = `note.${isWebm ? "webm" : (isMp4 ? "mp4" : "wav")}`;

    console.log('Транскрипція аудіо...');
    
    // 2) Транскрипція
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: contentType }), fileName);
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
