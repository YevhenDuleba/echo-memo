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

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const { transcript, languageHint } = await req.json();
    
    if (!transcript) {
      throw new Error("transcript is required");
    }

    console.log('Створення узагальнення з транскрипції...');

    const prompt = `
Вихідна транскрипція (${languageHint || "auto"}):
"""${transcript}"""

Завдання:
1) Створи короткий, але інформативний заголовок (5-10 слів) мовою транскрипції, який точно відображає головну тему.
2) Створи детальне узагальнення (10-15 речень) з:
   - Основними темами обговорення
   - Ключовими рішеннями або висновками
   - Важливими деталями та контекстом
   - Структурованим викладом з абзацами
3) Використовуй ту саму мову, що й у транскрипції.
4) Збережи важливу інформацію, імена, дати, числа.
5) Роби узагальнення зрозумілим та корисним для читача.

Поверни тільки JSON у форматі:
{"title": "...", "summary": "..."}
`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${OPENAI_API_KEY}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1000,
        messages: [
          { 
            role: "system", 
            content: "You are an expert at creating detailed, comprehensive summaries. You write in the same language as the input and preserve all important information including names, dates, decisions, and context. Your summaries are well-structured and thorough." 
          },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Summarization error:', errorText);
      throw new Error(`Summarization failed: ${res.status} ${errorText}`);
    }

    const j = await res.json();
    let title = "Жива нотатка";
    let summary = "";
    
    try {
      const obj = JSON.parse(j.choices[0]?.message?.content ?? "{}");
      title = obj.title || title;
      summary = obj.summary || "";
    } catch {
      summary = j.choices[0]?.message?.content ?? "";
    }

    console.log('Узагальнення створено:', title);

    return new Response(
      JSON.stringify({ title, summary }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in summarize-from-transcript:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
