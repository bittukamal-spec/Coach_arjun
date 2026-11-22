import { useEffect, useRef, useState } from 'react';

// Focus round mini-game: tap only the blue balls for 15 seconds.
// Points 0–3 from (hits − wrong taps). Works without animations.
const COLOURS = ['bg-coral', 'bg-sun', 'bg-mint'];
const DURATION = 15;

export function focusGamePoints(hits, wrong) {
  const n = hits - wrong;
  if (n >= 8) return 3;
  if (n >= 5) return 2;
  if (n >= 2) return 1;
  return 0;
}

export default function FocusGame({ t, onDone }) {
  const [phase, setPhase] = useState('ready');
  const [left, setLeft] = useState(DURATION);
  const [balls, setBalls] = useState([]);
  const [hits, setHits] = useState(0);
  const [wrong, setWrong] = useState(0);
  const idRef = useRef(0);
  const scoreRef = useRef({ hits: 0, wrong: 0 });

  useEffect(() => {
    if (phase !== 'play') return undefined;
    const spawn = setInterval(() => {
      const id = ++idRef.current;
      const blue = Math.random() < 0.6;
      const ball = { id, blue, colour: blue ? 'bg-brand-500' : COLOURS[id % COLOURS.length], x: 6 + Math.random() * 74, y: 6 + Math.random() * 74 };
      setBalls(b => [...b.slice(-6), ball]);
      setTimeout(() => setBalls(b => b.filter(x => x.id !== id)), 1400);
    }, 650);
    const tick = setInterval(() => setLeft(s => s - 1), 1000);
    return () => { clearInterval(spawn); clearInterval(tick); };
  }, [phase]);

  useEffect(() => {
    if (phase === 'play' && left <= 0) {
      setPhase('done');
      setBalls([]);
      const { hits: h, wrong: w } = scoreRef.current;
      setTimeout(() => onDone(focusGamePoints(h, w)), 900);
    }
  }, [left, phase, onDone]);

  function tap(ball) {
    setBalls(b => b.filter(x => x.id !== ball.id));
    if (ball.blue) { scoreRef.current.hits += 1; setHits(h => h + 1); }
    else { scoreRef.current.wrong += 1; setWrong(w => w + 1); }
  }

  return (
    <div className="flex flex-1 flex-col" data-testid="focus-game">
      <h1 className="mt-5 text-[24px] font-extrabold">{t.game.title}</h1>
      <p className="mt-1 text-[15px] text-white/80">{t.game.line}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="rounded-full bg-white/10 px-3.5 py-2 text-[15px] font-extrabold" aria-live="polite">{t.game.hits(hits)}</span>
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-sun text-[15px] font-extrabold">{t.game.seconds(Math.max(0, left))}</span>
      </div>
      <div className="relative mt-3 flex-1 min-h-[300px] overflow-hidden rounded-[26px] bg-white/5">
        {phase === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p className="text-[15px] text-white/80">{t.game.ready}</p>
            <button type="button" onClick={() => setPhase('play')} className="min-h-[56px] rounded-[18px] bg-sun px-10 text-[17px] font-extrabold text-inkblock">{t.game.go}</button>
          </div>
        )}
        {phase === 'done' && <p className="absolute inset-0 flex items-center justify-center text-[18px] font-extrabold">{t.game.done}</p>}
        {balls.map(b => (
          <button
            key={b.id}
            type="button"
            aria-label={b.blue ? t.game.blueBall : t.game.ball}
            onClick={() => tap(b)}
            className={`absolute h-14 w-14 rounded-full ${b.colour} shadow-[inset_-6px_-6px_0_rgba(0,0,0,0.18)]`}
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
          />
        ))}
      </div>
      <p className="mt-3 text-center text-[13px] text-white/65">{t.game.why}</p>
    </div>
  );
}
