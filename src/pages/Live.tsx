import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Monitor, Square, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import SubtitleOverlay from "@/components/SubtitleOverlay";

const Live = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mixMic, setMixMic] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [timer, setTimer] = useState(0);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);
  const processingQueueRef = useRef<Blob[]>([]);
  const isProcessingRef = useRef(false);
  const tabStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
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

    return () => {
      subscription.unsubscribe();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [navigate]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const processChunkQueue = async () => {
    if (isProcessingRef.current || processingQueueRef.current.length === 0) return;
    
    isProcessingRef.current = true;
    console.log('[Live] Starting chunk processing, queue size:', processingQueueRef.current.length);
    
    while (processingQueueRef.current.length > 0) {
      const chunk = processingQueueRef.current.shift();
      if (!chunk) continue;

      // Захист від переповнення черги
      if (processingQueueRef.current.length > 20) {
        console.warn('[Live] Queue overflow, dropping old chunks');
        processingQueueRef.current.splice(0, processingQueueRef.current.length - 20);
      }

      try {
        console.log('[Live] Processing chunk, size:', chunk.size);
        const b64 = await blobToBase64(chunk);
        const base64Data = b64.split(',')[1];
        
        const { data, error } = await supabase.functions.invoke('transcribe-chunk', {
          body: { 
            chunkBase64: base64Data, 
            mimeType: 'audio/webm'
          }
        });

        if (!error && data?.text) {
          console.log('[Live] Transcription received:', data.text);
          setTranscript(prev => {
            const newText = prev + (prev ? ' ' : '') + data.text;
            return newText;
          });
          if (!detectedLanguage && data.language) {
            setDetectedLanguage(data.language);
            console.log('[Live] Language detected:', data.language);
          }
        } else if (error) {
          console.error('[Live] Chunk transcription error:', error);
        }
      } catch (err) {
        console.error('[Live] Chunk transcription failed:', err);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Невелика затримка між чанками
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    isProcessingRef.current = false;
    console.log('[Live] Finished processing chunks');
  };

  const startCapture = async () => {
    try {
      const tabStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true, 
        audio: true 
      });
      
      tabStreamRef.current = tabStream;
      
      let micStream: MediaStream | null = null;
      if (mixMic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
          console.warn('Microphone access denied', err);
        }
      }

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();

      const tabAudio = tabStream.getAudioTracks();
      if (tabAudio.length) {
        ctx.createMediaStreamSource(new MediaStream([tabAudio[0]])).connect(dest);
      }

      if (micStream) {
        const micAudio = micStream.getAudioTracks();
        if (micAudio.length) {
          ctx.createMediaStreamSource(new MediaStream([micAudio[0]])).connect(dest);
        }
      }

      // НЕ зупиняємо відеотрек тут!
      
      const mixedStream = dest.stream;
      // Використовуємо найкращий доступний кодек
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      
      const mediaRecorder = new MediaRecorder(mixedStream, { 
        mimeType,
        audioBitsPerSecond: 128000
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      processingQueueRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          console.log('[Live] Data available, chunk size:', e.data.size);
          
          chunksRef.current.push(e.data);
          processingQueueRef.current.push(e.data);
          
          // Запускаємо обробку черги
          if (!isProcessingRef.current) {
            processChunkQueue();
          }
        }
      };

      mediaRecorder.onstop = () => {
        // Тепер зупиняємо всі треки
        if (tabStreamRef.current) {
          tabStreamRef.current.getTracks().forEach(t => {
            try { t.stop(); } catch {}
          });
        }
        if (audioContextRef.current) {
          try { audioContextRef.current.close(); } catch {}
        }
      };

      startTimeRef.current = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        setTimer(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      setTranscript('');
      setDetectedLanguage(null);
      
      // Запускаємо запис з інтервалом 4 секунди (по 2 чанки = 8 сек аудіо)
      mediaRecorder.start(4000);
      setIsRecording(true);
      
      console.log('[Live] Recording started with 4s intervals');

      toast({
        title: "Запис почато",
        description: "Транскрипція буде відображатись у реальному часі",
      });
    } catch (error) {
      console.error('Error starting capture:', error);
      toast({
        title: "Помилка",
        description: "Не вдалося розпочати захоплення екрану",
        variant: "destructive",
      });
    }
  };

  const stopCapture = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    setIsProcessing(true);
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const fullBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      
      // 1. Конвертуємо в base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(fullBlob);
      });

      const audioBase64 = await base64Promise;

      // 2. Завантажуємо через Edge Function
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('upload-audio', {
        body: { audioBase64, extension: 'webm' }
      });

      if (uploadError) throw uploadError;

      // 3. Узагальнення з транскрипції
      let title = 'Жива нотатка';
      let summary = '';
      
      try {
        const { data: sumData, error: sumError } = await supabase.functions.invoke('summarize-from-transcript', {
          body: { 
            transcript, 
            languageHint: detectedLanguage || undefined 
          }
        });

        if (!sumError && sumData) {
          title = sumData.title || title;
          summary = sumData.summary || '';
        }
      } catch (err) {
        console.error('Summarization error:', err);
      }

      // 4. Створюємо нотатку через Edge Function
      const { data: createData, error: createError } = await supabase.functions.invoke('create-note', {
        body: {
          title,
          summary,
          transcript,
          language: detectedLanguage || null,
          audioUrl: uploadData.signedUrl,
          durationSeconds: timer
        }
      });

      if (createError) throw createError;

      toast({
        title: "Готово!",
        description: "Нотатка зі зустрічі створена",
      });

      navigate(`/note?id=${createData.note.id}`);
    } catch (error: any) {
      console.error('Error processing recording:', error);
      
      if (error?.message?.includes('Rate limit')) {
        toast({
          title: "Ліміт перевищено",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Помилка",
          description: "Не вдалося зберегти нотатку",
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
      <SubtitleOverlay transcript={transcript} isRecording={isRecording} />
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4"
          >
            ← Назад до списку
          </Button>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Живий запис зустрічі
          </h1>
          <p className="text-muted-foreground mt-2">
            Записуйте онлайн-зустрічі з живими субтитрами
          </p>
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm">
              💡 <strong>Порада:</strong> У діалозі оберіть вкладку із зустріччю та увімкніть "Share tab audio". Краще використовуйте навушники.
            </p>
          </div>
        </div>

        <Card className="p-8 space-y-6">
          {!isRecording && !isProcessing && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="mixMic" 
                  checked={mixMic}
                  onCheckedChange={(checked) => setMixMic(checked as boolean)}
                />
                <Label htmlFor="mixMic">Додати мікрофон</Label>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            {!isRecording && !isProcessing && (
              <Button
                onClick={startCapture}
                size="lg"
                className="bg-gradient-to-br from-primary to-accent hover:scale-105 transition-transform"
              >
                <Monitor className="mr-2 h-5 w-5" />
                Почати запис
              </Button>
            )}

            {isRecording && (
              <Button
                onClick={stopCapture}
                size="lg"
                variant="destructive"
                className="animate-pulse"
              >
                <Square className="mr-2 h-5 w-5" />
                Зупинити
              </Button>
            )}

            {isProcessing && (
              <div className="flex items-center space-x-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span>Збереження...</span>
              </div>
            )}

            {(isRecording || isProcessing) && (
              <div className="text-2xl font-mono font-bold text-primary">
                {formatTime(timer)}
              </div>
            )}
          </div>

          {transcript && (
            <div className="mt-6 p-6 bg-muted rounded-lg min-h-[200px] max-h-[400px] overflow-y-auto">
              <p className="text-sm text-muted-foreground mb-3">Транскрипція у реальному часі:</p>
              <p className="whitespace-pre-wrap leading-relaxed">
                {transcript}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Live;
