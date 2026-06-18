import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';

// ── Technique definitions ─────────────────────────────────────────────────────

const TECHNIQUES = [
  {
    key: 'box',
    icon: '⬜',
    phases: [
      { key: 'breatheIn',  duration: 4, scale: 1.45 },
      { key: 'hold',       duration: 4, scale: 1.45 },
      { key: 'breatheOut', duration: 4, scale: 1.0  },
      { key: 'hold',       duration: 4, scale: 1.0  },
    ],
    totalCycles: 5,
  },
  {
    key: '478',
    icon: '🌊',
    phases: [
      { key: 'breatheIn',  duration: 4, scale: 1.45 },
      { key: 'hold',       duration: 7, scale: 1.45 },
      { key: 'breatheOut', duration: 8, scale: 1.0  },
    ],
    totalCycles: 4,
  },
  {
    key: 'performance',
    icon: '⚡',
    phases: [
      { key: 'breatheIn',  duration: 4, scale: 1.45 },
      { key: 'hold',       duration: 1, scale: 1.45 },
      { key: 'breatheOut', duration: 4, scale: 1.0  },
      { key: 'hold',       duration: 2, scale: 1.0  },
    ],
    totalCycles: 6,
  },
];

// ── Audio helper (Web Audio API oscillator — no files needed) ─────────────────

function useTonePlayer() {
  const ctxRef = useRef(null);

  function play(type) { // 'in' | 'out' | 'hold'
    try {
      if (!ctxRef.current || ctxRef.current.state === 'closed') {
        ctxRef.current = new AudioContext();
      }
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = type === 'in' ? 528 : type === 'out' ? 396 : 440;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
      osc.start();
      osc.stop(ctx.currentTime + 0.7);
    } catch { /* browser may block AudioContext before user gesture */ }
  }

  return play;
}

function phaseToTone(phaseKey) {
  if (phaseKey === 'breatheIn')  return 'in';
  if (phaseKey === 'breatheOut') return 'out';
  return 'hold';
}

// ── Picker card ───────────────────────────────────────────────────────────────

function TechCard({ tech, t, onSelect }) {
  const tb = translations;
  return (
    <button
      onClick={() => onSelect(tech.key)}
      className="card card-glow text-left w-full border border-dark-600 hover:border-brand-600/60 active:scale-95 transition-all"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-3xl">{tech.icon}</span>
        <span className="text-xs text-slate-500 bg-dark-700 border border-dark-600 px-2 py-0.5 rounded-full">
          {t.duration[tech.key]}
        </span>
      </div>
      <p className="font-bold text-white mb-0.5">{t[`tech${tech.key === '478' ? '478' : tech.key === 'performance' ? 'Perf' : 'Box'}`]}</p>
      <p className="text-xs text-slate-400 leading-relaxed">{t[`tech${tech.key === '478' ? '478' : tech.key === 'performance' ? 'Perf' : 'Box'}Desc`]}</p>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function BreathingPage() {
  const { language } = useAuth();
  const t = translations[language].breathing;

  const [techKey,    setTechKey]    = useState(null);
  const [status,     setStatus]     = useState('idle'); // idle | running | done
  const [phaseIdx,   setPhaseIdx]   = useState(0);
  const [cycleNum,   setCycleNum]   = useState(1);
  const [count,      setCount]      = useState(0);
  const [soundOn,    setSoundOn]    = useState(true);

  const playTone = useTonePlayer();
  const soundOnRef = useRef(soundOn);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const tech         = TECHNIQUES.find(t => t.key === techKey);
  const currentPhase = tech ? tech.phases[phaseIdx] : null;

  // ── Timer (recursive setTimeout — no stale closures) ──────────────────────

  useEffect(() => {
    if (status !== 'running' || !tech) return;

    const timeout = setTimeout(() => {
      if (count > 1) {
        setCount(c => c - 1);
        return;
      }

      // Advance phase
      const nextPhaseIdx = (phaseIdx + 1) % tech.phases.length;
      const wrapping     = nextPhaseIdx === 0;

      if (wrapping && cycleNum >= tech.totalCycles) {
        setStatus('done');
        return;
      }

      if (wrapping) setCycleNum(c => c + 1);
      setPhaseIdx(nextPhaseIdx);
      const nextPhase = tech.phases[nextPhaseIdx];
      setCount(nextPhase.duration);
      if (soundOnRef.current) playTone(phaseToTone(nextPhase.key));

    }, 1000);

    return () => clearTimeout(timeout);
  }, [status, count, phaseIdx, cycleNum, tech]); // eslint-disable-line react-hooks/exhaustive-deps

  function startSession() {
    if (!tech) return;
    setPhaseIdx(0);
    setCycleNum(1);
    setCount(tech.phases[0].duration);
    setStatus('running');
    if (soundOn) playTone(phaseToTone(tech.phases[0].key));
  }

  function reset() {
    setStatus('idle');
    setPhaseIdx(0);
    setCycleNum(1);
    setCount(0);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const circleScale = status === 'running' ? currentPhase.scale : 1.0;
  const transitionDuration = status === 'running' ? currentPhase.duration : 0.6;
  const phaseLabel = status === 'running' ? t[currentPhase.key] : '';

  // ── Render: technique picker ───────────────────────────────────────────────

  if (!techKey) {
    return (
      <div className="min-h-screen bg-dark-900 pb-20">
        <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <Link to="/dashboard" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
              {t.backDash}
            </Link>
            <p className="font-semibold text-slate-100">{t.title}</p>
            <div className="w-20" />
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-8 animate-fade-in">
          <p className="text-slate-400 text-sm text-center mb-8">{t.subtitle}</p>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.pickTech}</p>
          <div className="flex flex-col gap-4">
            {TECHNIQUES.map(tech => (
              <TechCard key={tech.key} tech={tech} t={t} onSelect={k => { setTechKey(k); reset(); }} />
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── Render: done screen ────────────────────────────────────────────────────

  if (status === 'done') {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 pb-20 animate-fade-in">
        <div className="text-6xl mb-6">🌿</div>
        <h2 className="text-2xl font-bold text-white mb-2">{t.doneTitle}</h2>
        <p className="text-slate-400 text-center mb-10 max-w-xs">{t.doneSub}</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => { setTechKey(null); reset(); }}
            className="btn-primary justify-center"
          >
            {t.again}
          </button>
          <Link to="/dashboard" className="btn-secondary justify-center">{t.backDash}</Link>
        </div>
      </div>
    );
  }

  // ── Render: session screen ─────────────────────────────────────────────────

  const techName = t[`tech${techKey === '478' ? '478' : techKey === 'performance' ? 'Perf' : 'Box'}`];

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col pb-20">
      {/* Header */}
      <header className="shrink-0 bg-dark-900 border-b border-dark-600 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button
            onClick={() => { setTechKey(null); reset(); }}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            {t.changeTech}
          </button>
          <p className="font-semibold text-slate-100 text-sm">{techName}</p>
          <button
            onClick={() => setSoundOn(s => !s)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {soundOn ? '🔊' : '🔇'} {soundOn ? t.soundOn : t.soundOff}
          </button>
        </div>
      </header>

      {/* Main — centred */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4">

        {/* Animated breathing circle */}
        <div className="relative flex items-center justify-center">
          {/* Outer glow ring */}
          <div
            className="absolute rounded-full bg-brand-500/10"
            style={{
              width: '280px', height: '280px',
              transform: `scale(${circleScale * 0.95})`,
              transition: `transform ${transitionDuration}s ease-in-out`,
            }}
          />
          {/* Main circle */}
          <div
            className="w-52 h-52 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex flex-col items-center justify-center relative z-10"
            style={{
              transform: `scale(${circleScale})`,
              transition: `transform ${transitionDuration}s ease-in-out`,
              boxShadow: `0 0 ${status === 'running' ? 50 : 20}px rgba(139,92,246,${status === 'running' ? 0.45 : 0.2})`,
            }}
          >
            {status === 'running' ? (
              <>
                <span className="text-5xl font-bold text-white leading-none">{count}</span>
                <span className="text-sm font-medium text-brand-200 mt-1">{phaseLabel}</span>
              </>
            ) : (
              <span className="text-4xl font-bold text-brand-200 opacity-60">A</span>
            )}
          </div>
        </div>

        {/* Round counter */}
        {status === 'running' && (
          <p className="text-slate-400 text-sm animate-fade-in">
            {t.roundOf(cycleNum, tech.totalCycles)}
          </p>
        )}

        {/* Phase dots */}
        {status === 'running' && (
          <div className="flex gap-2">
            {tech.phases.map((p, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === phaseIdx ? 'bg-brand-400 scale-125' : 'bg-dark-600'
                }`}
              />
            ))}
          </div>
        )}

        {/* Start button */}
        {status === 'idle' && (
          <div className="text-center animate-fade-in">
            <p className="text-slate-400 text-sm mb-6">{t.duration[techKey]}</p>
            <button
              onClick={startSession}
              className="btn-primary px-12 py-4 text-base"
            >
              {t.start}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default BreathingPage;
