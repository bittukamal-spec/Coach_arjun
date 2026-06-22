import { useState, useEffect } from 'react';

const PHASES = [
  { labelKey: 'breatheIn',  duration: 4, scale: 1.0   },
  { labelKey: 'hold',       duration: 4, scale: 1.0   },
  { labelKey: 'breatheOut', duration: 4, scale: 0.55  },
  { labelKey: 'hold',       duration: 4, scale: 0.55  },
];

const CYCLE_DURATION = PHASES.reduce((s, p) => s + p.duration, 0); // 16s
const AUTO_COMPLETE  = 60; // seconds until auto-advance

// Derive which phase we are in from elapsed seconds
function getPhase(elapsed) {
  const pos = elapsed % CYCLE_DURATION;
  let start = 0;
  for (let i = 0; i < PHASES.length; i++) {
    if (pos < start + PHASES[i].duration) {
      return { phase: PHASES[i], countdown: PHASES[i].duration - (pos - start), idx: i };
    }
    start += PHASES[i].duration;
  }
  return { phase: PHASES[0], countdown: PHASES[0].duration, idx: 0 };
}

export default function BoxBreather({ onComplete, t }) {
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) return;
    if (elapsed >= AUTO_COMPLETE) {
      setDone(true);
      onComplete();
      return;
    }
    const timer = setTimeout(() => setElapsed(e => e + 1), 1000);
    return () => clearTimeout(timer);
  }, [elapsed, done, onComplete]);

  const { phase, countdown } = getPhase(elapsed);
  const canDone = elapsed >= CYCLE_DURATION; // show Done after first full cycle
  const scale   = phase.scale;

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Animated circle */}
      <div className="relative flex items-center justify-center w-44 h-44">
        {/* Outer ring */}
        <div
          className="absolute inset-0 rounded-full border-2 border-brand-500/30 transition-transform ease-linear"
          style={{
            transform: `scale(${scale})`,
            transitionDuration: `${phase.duration * 1000}ms`,
          }}
        />
        {/* Inner filled circle */}
        <div
          className="rounded-full bg-brand-500/20 border border-brand-500/50 flex items-center justify-center transition-transform ease-linear"
          style={{
            width: '7rem',
            height: '7rem',
            transform: `scale(${scale})`,
            transitionDuration: `${phase.duration * 1000}ms`,
          }}
        >
          <span className="text-3xl font-bold text-brand-400">{countdown}</span>
        </div>
      </div>

      {/* Phase label */}
      <p className="text-base font-medium text-ink">{t[phase.labelKey]}</p>

      {/* Progress: elapsed / AUTO_COMPLETE */}
      <p className="text-xs text-slt">{elapsed}s / {AUTO_COMPLETE}s</p>

      {/* Done button — appears after first cycle */}
      {canDone && (
        <button
          onClick={() => { setDone(true); onComplete(); }}
          className="mt-1 px-6 py-2 rounded-full border border-brand-500 text-brand-400 text-sm hover:bg-brand-500/10 transition-colors"
        >
          {t.breathingDone}
        </button>
      )}
    </div>
  );
}
