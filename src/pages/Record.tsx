import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, Square, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Record = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }
      setUser(session.user);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/auth');
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        await processAudio(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      toast({
        title: "Запис почато",
        description: "Говоріть у мікрофон...",
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Помилка",
        description: "Не вдалося отримати доступ до мікрофона",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      // 1. Конвертуємо blob в base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(blob);
      });

      const audioBase64 = await base64Promise;

      // 2. Завантажуємо аудіо через Edge Function
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('upload-audio', {
        body: { audioBase64, extension: 'webm' }
      });

      if (uploadError) throw uploadError;

      const { signedUrl } = uploadData;

      // 3. Транскрибуємо та узагальнюємо
      const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke('transcribe-and-summarize', {
        body: { signedUrl }
      });

      if (transcribeError) throw transcribeError;

      // 4. Створюємо нотатку через Edge Function
      const { data: createData, error: createError } = await supabase.functions.invoke('create-note', {
        body: {
          title: transcribeData.title || 'Аудіонотатка',
          summary: transcribeData.summary || '',
          transcript: transcribeData.transcript || '',
          language: transcribeData.language || null,
          audioUrl: signedUrl,
          durationSeconds: transcribeData.durationSeconds || null
        }
      });

      if (createError) throw createError;

      toast({
        title: "Готово!",
        description: "Нотатка створена успішно",
      });

      navigate(`/note?id=${createData.note.id}`);
    } catch (error: any) {
      console.error('Error processing audio:', error);
      
      if (error?.message?.includes('Rate limit')) {
        toast({
          title: "Ліміт перевищено",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Помилка",
          description: "Не вдалося обробити аудіо",
          variant: "destructive",
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4"
          >
            ← Назад до списку
          </Button>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Записати нотатку
          </h1>
          <p className="text-muted-foreground mt-2">
            Запишіть голосову нотатку для автоматичної транскрипції
          </p>
        </div>

        <Card className="p-8 space-y-6">
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            {!isRecording && !isProcessing && (
              <Button
                onClick={startRecording}
                size="lg"
                className="h-32 w-32 rounded-full bg-gradient-to-br from-primary to-accent hover:scale-110 transition-transform shadow-lg"
              >
                <Mic className="h-16 w-16" />
              </Button>
            )}

            {isRecording && (
              <Button
                onClick={stopRecording}
                size="lg"
                variant="destructive"
                className="h-32 w-32 rounded-full hover:scale-110 transition-transform shadow-lg animate-pulse"
              >
                <Square className="h-16 w-16" />
              </Button>
            )}

            {isProcessing && (
              <div className="flex flex-col items-center space-y-4">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <p className="text-lg text-muted-foreground">
                  Обробка аудіо...
                </p>
              </div>
            )}

            <p className="text-center text-muted-foreground">
              {isRecording && "Натисніть квадрат, щоб зупинити запис"}
              {!isRecording && !isProcessing && "Натисніть мікрофон, щоб почати запис"}
              {isProcessing && "Транскрибуємо та створюємо узагальнення..."}
            </p>
          </div>

          {audioUrl && !isProcessing && (
            <div className="pt-6 border-t">
              <p className="text-sm text-muted-foreground mb-2">Попередній перегляд:</p>
              <audio src={audioUrl} controls className="w-full" />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Record;
