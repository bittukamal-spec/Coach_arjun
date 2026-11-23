import { useEffect, useState } from 'react';
import Teer from '../visuals/Teer';

// Empty Coach chat (founder, Nov 2026): instead of a bare "What's on your
// mind?", show what athletes can talk about — one example at a time that
// changes every few seconds, plus three to tap. Tapping puts the words in
// the message box (the athlete can edit before sending).
export default function ChatEmptyPrompts({ t, onPick }) {
  const examples = t.emptyExamples || [];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (examples.length < 2) return undefined;
    const id = setInterval(() => setI(n => (n + 1) % examples.length), 3500);
    return () => clearInterval(id);
  }, [examples.length]);
  if (!examples.length) return <p className="text-sm text-muted text-center">{t.emptyPrompt}</p>;
  const three = [0, 1, 2].map(k => examples[(i + 1 + k * 3) % examples.length]);
  return (
    <div className="flex w-full max-w-sm flex-col items-center text-center" data-testid="chat-empty">
      <Teer pose="think" height={110} />
      <p className="mt-3 text-[18px] font-extrabold text-ink">{t.emptyTitle2}</p>
      <p className="mt-1 text-[14px] text-slt">{t.emptyLine2}</p>
      <p className="mt-4 min-h-[44px] text-[15px] font-semibold text-ink" aria-live="polite" data-testid="chat-example">
        {t.tryLabel} “{examples[i]}”
      </p>
      <div className="mt-3 flex w-full flex-col gap-2">
        {three.map(ex => (
          <button key={ex} type="button" onClick={() => onPick(ex)}
            className="min-h-[48px] rounded-[16px] bg-dark-400 px-4 text-left text-[14px] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
