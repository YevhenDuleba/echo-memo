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

    const { audioBase64, extension } = await req.json();
    
    if (!audioBase64 || !extension) {
      throw new Error("audioBase64 and extension are required");
    }

    // Валідація MIME типу
    const validExtensions = ['webm', 'wav', 'mp3', 'mp4', 'm4a'];
    if (!validExtensions.includes(extension.toLowerCase())) {
      throw new Error(`Invalid extension. Allowed: ${validExtensions.join(', ')}`);
    }

    // Декодуємо base64
    const audioData = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
    
    // Перевіряємо розмір (макс 50MB)
    if (audioData.length > 50 * 1024 * 1024) {
      throw new Error("File size exceeds 50MB limit");
    }

    const fileName = `${crypto.randomUUID()}.${extension}`;
    const filePath = `${user.id}/${fileName}`;

    console.log(`Uploading audio file: ${filePath}, size: ${audioData.length} bytes`);

    // Завантажуємо у Storage
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(filePath, audioData, {
        contentType: `audio/${extension}`,
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Створюємо signed URL (24 години)
    const ttlSeconds = parseInt(Deno.env.get('SIGNED_URL_TTL_SECONDS') || '86400');
    const { data: signedData, error: signedError } = await supabase.storage
      .from('audio')
      .createSignedUrl(filePath, ttlSeconds);

    if (signedError) throw signedError;

    console.log(`Audio uploaded successfully: ${filePath}`);

    return new Response(
      JSON.stringify({ 
        filePath, 
        signedUrl: signedData.signedUrl 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in upload-audio:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
