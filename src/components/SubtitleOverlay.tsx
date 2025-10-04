import { useEffect, useState } from "react";

interface SubtitleOverlayProps {
  transcript: string;
  isRecording: boolean;
}

const SubtitleOverlay = ({ transcript, isRecording }: SubtitleOverlayProps) => {
  const [lastSentences, setLastSentences] = useState<string>("");

  useEffect(() => {
    if (!transcript) {
      setLastSentences("");
      return;
    }

    // Розділяємо на речення (українська/російська/англійська крапки, знаки питання, оклику)
    const sentences = transcript
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Беремо останні 2-3 речення
    const recentSentences = sentences.slice(-3).join('. ');
    setLastSentences(recentSentences + (recentSentences ? '.' : ''));
  }, [transcript]);

  if (!isRecording || !lastSentences) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 max-w-2xl w-full px-4 z-50 pointer-events-none">
      <div className="bg-black/80 backdrop-blur-sm text-white p-4 rounded-lg shadow-2xl border border-white/10">
        <p className="text-sm md:text-base leading-relaxed text-center">
          {lastSentences}
        </p>
      </div>
    </div>
  );
};

export default SubtitleOverlay;
