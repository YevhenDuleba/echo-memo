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

    const blob = new Blob([bytes], { type: mimeType });

    const form = new FormData();
    form.append("file", blob, `chunk.webm`);
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
