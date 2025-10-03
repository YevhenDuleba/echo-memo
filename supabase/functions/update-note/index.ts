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

    const { noteId, title, summary } = await req.json();

    if (!noteId) {
      throw new Error("noteId is required");
    }

    console.log(`Updating note ${noteId} for user ${user.id}`);

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (summary !== undefined) updates.summary = summary;

    if (Object.keys(updates).length === 0) {
      throw new Error("No fields to update");
    }

    const { data: note, error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', noteId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    console.log(`Note updated successfully: ${note.id}`);

    return new Response(
      JSON.stringify({ note }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in update-note:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
