import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { noteId } = await req.json();

    if (!noteId) {
      throw new Error("noteId is required");
    }

    console.log(`Getting note ${noteId} for user ${user.id}`);

    const { data: note, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;

    // Створюємо signed URL для аудіо
    if (note.audio_url) {
      const urlParts = note.audio_url.split('/audio/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1].split('?')[0];
        const ttlSeconds = parseInt(Deno.env.get('SIGNED_URL_TTL_SECONDS') || '86400');
        const { data: signedData } = await supabase.storage
          .from('audio')
          .createSignedUrl(filePath, ttlSeconds);
        
        if (signedData) {
          note.audio_url = signedData.signedUrl;
        }
      }
    }

    return new Response(
      JSON.stringify({ note }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in get-note:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
