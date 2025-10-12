import { useEffect, useState } from "react";

interface SubtitleOverlayProps {
  transcript: string;
  isRecording: boolean;
}

const SubtitleOverlay = ({ transcript, isRecording }: SubtitleOverlayProps) => {
  const [lastSentences, setLastSentences] = useState<string>("");

  useEffect(() => {
    if (!transcript || !transcript.trim()) {
      setLastSentences("");
      return;
    }

    // Розділяємо на речення (різні мови)
    const sentences = transcript
      .split(/[.!?。！？]+/)
      .map(s => s.trim())
      .filter(s => s.length > 5); // Фільтруємо дуже короткі фрагменти

    if (sentences.length === 0) {
      // Якщо немає повних речень, показуємо останні слова
      const words = transcript.trim().split(/\s+/);
      const lastWords = words.slice(-15).join(' ');
      setLastSentences(lastWords);
      return;
    }

    // Беремо останні 2-3 речення
    const recentCount = Math.min(3, sentences.length);
    const recentSentences = sentences.slice(-recentCount).join('. ');
    setLastSentences(recentSentences + (recentSentences && !recentSentences.match(/[.!?]$/) ? '.' : ''));
  }, [transcript]);

  if (!isRecording || !lastSentences) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 max-w-3xl w-full px-4 z-50 pointer-events-none">
      <div className="bg-black/90 backdrop-blur-md text-white p-5 rounded-xl shadow-2xl border border-white/20 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <p className="text-sm md:text-lg leading-relaxed text-center font-medium">
          {lastSentences}
        </p>
      </div>
    </div>
  );
};

export default SubtitleOverlay;
