import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Note {
  id: string;
  title: string;
  summary: string | null;
  transcript: string | null;
  language: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  created_at: string;
}

const NoteDetail = () => {
  const [searchParams] = useSearchParams();
  const noteId = searchParams.get('id');
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [title, setTitle] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (noteId) {
      fetchNote();
    }
  }, [noteId]);

  const fetchNote = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-note', {
        body: { noteId }
      });

      if (error) throw error;

      setNote(data.note);
      setTitle(data.note.title);
    } catch (error) {
      console.error('Error fetching note:', error);
      toast({
        title: "Помилка",
        description: "Не вдалося завантажити нотатку",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTitleUpdate = async () => {
    if (!note || title === note.title) return;

    try {
      const { data, error } = await supabase.functions.invoke('update-note', {
        body: { noteId: note.id, title }
      });

      if (error) throw error;

      setNote({ ...note, title });
      toast({
        title: "Збережено",
        description: "Заголовок оновлено",
      });
    } catch (error) {
      console.error('Error updating title:', error);
      toast({
        title: "Помилка",
        description: "Не вдалося оновити заголовок",
        variant: "destructive",
      });
    }
  };

  const handleRegenerateSummary = async () => {
    if (!note || !note.transcript) return;

    setIsRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('summarize-from-transcript', {
        body: {
          transcript: note.transcript,
          languageHint: note.language || undefined
        }
      });

      if (error) throw error;

      const { error: updateError } = await supabase.functions.invoke('update-note', {
        body: { 
          noteId: note.id,
          summary: data.summary,
          title: data.title 
        }
      });

      if (updateError) throw updateError;

      setNote({ 
        ...note, 
        summary: data.summary,
        title: data.title 
      });
      setTitle(data.title);

      toast({
        title: "Готово!",
        description: "Узагальнення перегенеровано",
      });
    } catch (error) {
      console.error('Error regenerating summary:', error);
      toast({
        title: "Помилка",
        description: "Не вдалося перегенерувати узагальнення",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Нотатку не знайдено</h2>
          <Button onClick={() => navigate('/')}>
            Повернутися до списку
          </Button>
        </div>
      </div>
    );
  }

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
        </div>

        <div className="space-y-6">
          <Card className="p-8">
            <div className="flex items-start gap-4 mb-6">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleUpdate}
                className="text-3xl font-bold border-none focus-visible:ring-0 px-0"
              />
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
              {note.language && (
                <span className="px-3 py-1 bg-muted rounded-full">
                  {note.language.toUpperCase()}
                </span>
              )}
              <span>
                {new Date(note.created_at).toLocaleDateString('uk-UA', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              <span>Тривалість: {formatDuration(note.duration_seconds)}</span>
            </div>

            {note.audio_url && (
              <div className="mb-8 p-6 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-3">Аудіофайл:</p>
                <audio src={note.audio_url} controls className="w-full" />
              </div>
            )}
          </Card>

          {note.summary && (
            <Card className="p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">Узагальнення</h3>
                <Button
                  onClick={handleRegenerateSummary}
                  disabled={isRegenerating}
                  variant="outline"
                  size="sm"
                >
                  {isRegenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Перегенерувати
                </Button>
              </div>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {note.summary}
              </p>
            </Card>
          )}

          {note.transcript && (
            <Card className="p-8">
              <h3 className="text-xl font-semibold mb-4">Повна транскрипція</h3>
              <div className="prose prose-sm max-w-none">
                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {note.transcript}
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default NoteDetail;
