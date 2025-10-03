import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

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
    return true; // Дозволяємо у випадку помилки
  }

  if (!data) {
    // Перший запит - створюємо запис
    await supabase.from('rate_limits').insert({
      user_id: userId,
      action_type: actionType,
      action_count: 1,
      window_start: now
    });
    return true;
  }

  // Перевіряємо, чи минуло вікно
  if (new Date(data.window_start) < windowStart) {
    // Скидаємо лічильник
    await supabase.from('rate_limits').update({
      action_count: 1,
      window_start: now
    }).eq('id', data.id);
    return true;
  }

  // Перевіряємо ліміт
  if (data.action_count >= maxCount) {
    return false;
  }

  // Інкрементуємо лічильник
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Rate limiting: макс 20 нотаток на добу
    const allowed = await checkRateLimit(supabase, user.id, 'create_note', 20, 86400);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded: maximum 20 notes per day' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { title, summary, transcript, language, audioUrl, durationSeconds } = await req.json();

    if (!title) {
      throw new Error("title is required");
    }

    console.log(`Creating note for user ${user.id}: ${title}`);

    const { data: note, error: insertError } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        title,
        summary: summary || '',
        transcript: transcript || '',
        language: language || null,
        audio_url: audioUrl || null,
        duration_seconds: durationSeconds || null
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`Note created successfully: ${note.id}`);

    return new Response(
      JSON.stringify({ note }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in create-note:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
