import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, Music } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Note {
  id: string;
  title: string;
  summary: string | null;
  language: string | null;
  created_at: string;
  duration_seconds: number | null;
}

const Index = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    fetchNotes();
  };

  const fetchNotes = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('list-notes');
      if (error) throw error;
      setNotes(data?.notes || []);
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const truncateText = (text: string | null, maxLength: number) => {
    if (!text) return '—';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <Music className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              AudioNotes
            </h1>
          </div>
          <p className="text-muted-foreground">
            Записуйте, транскрибуйте та узагальнюйте аудіонотатки автоматично
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <div className="mb-12">
          <Card 
            className="p-8 hover:shadow-xl transition-all cursor-pointer bg-gradient-to-br from-card to-muted/30 border-primary/20 hover:border-primary/40 max-w-2xl mx-auto"
            onClick={() => navigate('/record')}
          >
            <div className="flex items-start gap-6">
              <div className="p-4 bg-primary/10 rounded-xl">
                <Mic className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-semibold mb-2">Нова аудіонотатка</h3>
                <p className="text-muted-foreground">
                  Запишіть голосову нотатку з автоматичною транскрипцією та узагальненням
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Notes List */}
        <div>
          <h2 className="text-2xl font-bold mb-6">Мої нотатки</h2>
          
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Завантаження...</p>
            </div>
          ) : notes.length === 0 ? (
            <Card className="p-12 text-center">
              <Music className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold mb-2">Поки що немає нотаток</h3>
              <p className="text-muted-foreground mb-6">
                Почніть запис, щоб створити свою першу аудіонотатку
              </p>
              <Button onClick={() => navigate('/record')}>
                <Mic className="mr-2 h-4 w-4" />
                Записати нотатку
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {notes.map((note) => (
                <Card
                  key={note.id}
                  className="p-6 hover:shadow-lg transition-all cursor-pointer hover:border-primary/40"
                  onClick={() => navigate(`/note?id=${note.id}`)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-semibold mb-2 truncate">
                        {note.title}
                      </h3>
                      <p className="text-muted-foreground mb-3 line-clamp-2">
                        {truncateText(note.summary, 200)}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {note.language && (
                          <span className="px-2 py-1 bg-muted rounded text-xs font-medium">
                            {note.language.toUpperCase()}
                          </span>
                        )}
                        <span>
                          {new Date(note.created_at).toLocaleDateString('uk-UA', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        <span>⏱ {formatDuration(note.duration_seconds)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
