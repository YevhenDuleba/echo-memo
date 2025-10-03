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

    console.log(`Listing notes for user ${user.id}`);

    const { data: notes, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Для кожної нотатки з audio_url створюємо signed URL
    const ttlSeconds = parseInt(Deno.env.get('SIGNED_URL_TTL_SECONDS') || '86400');
    const notesWithSignedUrls = await Promise.all(
      (notes || []).map(async (note) => {
        if (note.audio_url) {
          // Витягуємо filePath зі старого URL
          const urlParts = note.audio_url.split('/audio/');
          if (urlParts.length > 1) {
            const filePath = urlParts[1].split('?')[0];
            const { data: signedData } = await supabase.storage
              .from('audio')
              .createSignedUrl(filePath, ttlSeconds);
            
            if (signedData) {
              return { ...note, audio_url: signedData.signedUrl };
            }
          }
        }
        return note;
      })
    );

    return new Response(
      JSON.stringify({ notes: notesWithSignedUrls }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in list-notes:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
