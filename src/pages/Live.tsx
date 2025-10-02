import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Monitor, Square, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Live = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mixMic, setMixMic] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [timer, setTimer] = useState(0);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

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

  const startCapture = async () => {
    try {
      const tabStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true, 
        audio: true 
      });
      
      let micStream: MediaStream | null = null;
      if (mixMic) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      const tracks: MediaStreamTrack[] = [];

      const tabAudio = tabStream.getAudioTracks();
      if (tabAudio.length) {
        ctx.createMediaStreamSource(new MediaStream([tabAudio[0]])).connect(dest);
        tracks.push(tabAudio[0]);
      }

      if (micStream) {
        const micAudio = micStream.getAudioTracks();
        if (micAudio.length) {
          ctx.createMediaStreamSource(new MediaStream([micAudio[0]])).connect(dest);
          tracks.push(micAudio[0]);
        }
      }

      const vid = tabStream.getVideoTracks()[0];
      if (vid) vid.stop();

      const mixedStream = dest.stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(mixedStream, { 
        mimeType,
        audioBitsPerSecond: 128000 
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          
          try {
            const b64 = await blobToBase64(e.data);
            const base64Data = b64.split(',')[1];
            
            const { data, error } = await supabase.functions.invoke('transcribe-chunk', {
              body: { 
                chunkBase64: base64Data, 
                mimeType: e.data.type || 'audio/webm' 
              }
            });

            if (!error && data?.text) {
              setTranscript(prev => prev + (prev ? ' ' : '') + data.text);
              if (!detectedLanguage && data.language) {
                setDetectedLanguage(data.language);
              }
            }
          } catch (err) {
            console.warn('Chunk transcription failed', err);
          }
        }
      };

      mediaRecorder.onstop = () => {
        tracks.forEach(t => t.stop());
        ctx.close();
      };

      startTimeRef.current = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        setTimer(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      setTranscript('');
      setDetectedLanguage(null);
      mediaRecorder.start(5000); // чанк кожні 5 секунд
      setIsRecording(true);

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
      const fullBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      
      // Upload до Supabase Storage
      const filePath = `meetings/${crypto.randomUUID()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(filePath, fullBlob, {
          contentType: 'audio/webm',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('audio')
        .getPublicUrl(filePath);

      // Узагальнення з транскрипції
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

      // Зберегти в базу
      const { data: note, error: insertError } = await supabase
        .from('notes')
        .insert({
          title,
          summary,
          transcript,
          language: detectedLanguage || null,
          audio_url: publicUrl,
          duration_seconds: timer
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast({
        title: "Готово!",
        description: "Нотатка зі зустрічі створена",
      });

      navigate(`/note?id=${note.id}`);
    } catch (error) {
      console.error('Error processing recording:', error);
      toast({
        title: "Помилка",
        description: "Не вдалося зберегти нотатку",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
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
