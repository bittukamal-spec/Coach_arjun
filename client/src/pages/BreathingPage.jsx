import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import BreathingCircle from '../components/BreathingCircle';

// ── Technique definitions ─────────────────────────────────────────────────────

const TECHNIQUES = {
  nerves: {
    phases: [
      { key: 'breatheIn',  duration: 4, scale: 1.45 },
      { key: 'hold',       duration: 4, scale: 1.45 },
      { key: 'breatheOut', duration: 4, scale: 1.0  },
      { key: 'hold',       duration: 4, scale: 1.0  },
    ],
    totalCycles: 5,
  },
  reset: {
    phases: [
      { key: 'breatheIn',  duration: 2, scale: 1.35 },
      { key: 'breatheOut', duration: 4, scale: 1.0  },
    ],
    totalCycles: 6,
  },
  winddown: {
    phases: [
      { key: 'breatheIn',  duration: 4, scale: 1.45 },
      { key: 'hold',       duration: 7, scale: 1.45 },
      { key: 'breatheOut', duration: 8, scale: 1.0  },
    ],
    totalCycles: 4,
  },
};

// ── Audio helper ──────────────────────────────────────────────────────────────

function useTonePlayer() {
  const ctxRef = useRef(null);
  return function play(type) {
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
    } catch {}
  };
}

function phaseToTone(key) {
  if (key === 'breatheIn')  return 'in';
  if (key === 'breatheOut') return 'out';
  return 'hold';
}

// ── Main component ────────────────────────────────────────────────────────────

function BreathingPage() {
  const { language, token } = useAuth();
  const t  = translations[language].breathing;
  const navigate = useNavigate();

  const [screen,       setScreen]       = useState('pick');      // 'pick' | 'breathing' | 'done'
  const [intent,       setIntent]       = useState(null);        // 'nerves' | 'reset' | 'winddown'
  const [status,       setStatus]       = useState('countdown'); // 'countdown' | 'running'
  const [countdownNum, setCountdownNum] = useState(3);
  const [phaseIdx,     setPhaseIdx]     = useState(0);
  const [cycleNum,     setCycleNum]     = useState(1);
  const [count,        setCount]        = useState(0);
  const [soundOn,      setSoundOn]      = useState(true);

  const soundOnRef   = useRef(soundOn);
  const xpAwardedRef = useRef(false);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const playTone = useTonePlayer();
  const tech         = intent ? TECHNIQUES[intent] : null;
  const currentPhase = tech && status === 'running' ? tech.phases[phaseIdx] : null;

  // ── Countdown (3-2-1) ──────────────────────────────────────────────────────

  useEffect(() => {
    if (screen !== 'breathing' || status !== 'countdown' || !tech) return;

    const id = setTimeout(() => {
      if (countdownNum > 1) {
        setCountdownNum(n => n - 1);
      } else {
        setStatus('running');
        const first = tech.phases[0];
        setCount(first.duration);
        if (soundOnRef.current) playTone(phaseToTone(first.key));
      }
    }, 1000);

    return () => clearTimeout(id);
  }, [screen, status, countdownNum, tech]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Breathing timer ────────────────────────────────────────────────────────

  useEffect(() => {
    if (screen !== 'breathing' || status !== 'running' || !tech) return;

    const id = setTimeout(() => {
      if (count > 1) { setCount(c => c - 1); return; }

      const nextIdx   = (phaseIdx + 1) % tech.phases.length;
      const wrapping  = nextIdx === 0;

      if (wrapping && cycleNum >= tech.totalCycles) {
        setScreen('done');
        awardXp();
        return;
      }

      if (wrapping) setCycleNum(c => c + 1);
      setPhaseIdx(nextIdx);
      const next = tech.phases[nextIdx];
      setCount(next.duration);
      if (soundOnRef.current) playTone(phaseToTone(next.key));
    }, 1000);

    return () => clearTimeout(id);
  }, [screen, status, count, phaseIdx, cycleNum, tech]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ────────────────────────────────────────────────────────────────

  function startSession(key) {
    setIntent(key);
    setScreen('breathing');
    setStatus('countdown');
    setCountdownNum(3);
    setPhaseIdx(0);
    setCycleNum(1);
    setCount(0);
    xpAwardedRef.current = false;
  }

  function goAgain() {
    setScreen('pick');
    setStatus('countdown');
    setCountdownNum(3);
    setPhaseIdx(0);
    setCycleNum(1);
    setCount(0);
  }

  async function awardXp() {
    if (xpAwardedRef.current) return;
    xpAwardedRef.current = true;
    try {
      await apiFetch('/api/games/xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameType: 'breathing', score: 1 }),
      });
      try { navigator.vibrate(100); } catch {}
    } catch {}
  }

  // ── Intent picker ──────────────────────────────────────────────────────────

  if (screen === 'pick') {
    const INTENTS = [
      { key: 'nerves',   label: t.intentNerves,   sub: t.intentNervesSub },
      { key: 'reset',    label: t.intentReset,    sub: t.intentResetSub },
      { key: 'winddown', label: t.intentWinddown, sub: t.intentWinddownSub },
    ];

    return (
      <div className="min-h-screen bg-dark-900 pb-20">
        <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <Link to="/train" className="text-sm text-slt hover:text-ink transition-colors">
              {t.backTrain}
            </Link>
            <p className="font-semibold text-ink">{t.title}</p>
            <div className="w-20" />
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-8 animate-fade-in">
          <p className="text-sm text-slt text-center mb-8">{t.intentTitle}</p>
          <div className="flex flex-col gap-3">
            {INTENTS.map(({ key, label, sub }) => (
              <button
                key={key}
                onClick={() => startSession(key)}
                className={`flex items-center justify-between bg-dark-800 border rounded-2xl p-5 text-left transition-all active:scale-[0.98] hover:border-dark-400 ${
                  intent === key
                    ? 'border-brand-500/60 bg-brand-500/5'
                    : 'border-dark-600'
                }`}
              >
                <div>
                  <p className="font-semibold text-ink text-base leading-tight">{label}</p>
                  <p className="text-xs text-slt mt-1">{sub}</p>
                </div>
                {intent === key && (
                  <div className="w-2 h-2 rounded-full bg-brand-500 shrink-0 ml-4" />
                )}
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── Done screen ────────────────────────────────────────────────────────────

  if (screen === 'done' && intent) {
    const coachLines = {
      nerves:   t.doneCoachNerves,
      reset:    t.doneCoachReset,
      winddown: t.doneCoachWinddown,
    };

    return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 pb-20 animate-fade-in">
        <div className="text-6xl mb-6">🌿</div>
        <h2 className="text-2xl font-bold text-ink mb-6">{t.doneTitle}</h2>

        <div className="max-w-xs w-full bg-dark-800 border border-brand-500/30 rounded-2xl p-4 mb-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
              A
            </div>
            <p className="text-xs font-semibold text-brand-400">Arjun</p>
          </div>
          <p className="text-sm text-ink leading-relaxed">{coachLines[intent]}</p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={goAgain} className="btn-primary justify-center">
            {t.goAgain}
          </button>
          <Link to="/train" className="btn-secondary justify-center">{t.backTrain}</Link>
        </div>
      </div>
    );
  }

  // ── Breathing session ──────────────────────────────────────────────────────

  const techLabels = {
    nerves:   t.techNerves,
    reset:    t.techReset,
    winddown: t.techWinddown,
  };
  const techniqueLabel = intent ? techLabels[intent] : '';
  const phaseLabel = status === 'running' && currentPhase ? t[currentPhase.key] : '';

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col pb-20">
      <header className="shrink-0 bg-dark-900 border-b border-dark-600 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button
            onClick={goAgain}
            className="text-sm text-slt hover:text-ink transition-colors"
          >
            ← {t.backTrain}
          </button>
          <p className="font-semibold text-ink text-sm">{techniqueLabel}</p>
          <button
            onClick={() => setSoundOn(s => !s)}
            className="text-xs text-slt hover:text-ink transition-colors"
          >
            {soundOn ? '🔊' : '🔇'} {soundOn ? t.soundOn : t.soundOff}
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4">

        {status === 'countdown' && (
          <p className="text-sm text-slt font-medium animate-fade-in">{t.countdown}</p>
        )}

        <BreathingCircle
          phase={currentPhase}
          count={count}
          status={status}
          countdownNum={countdownNum}
          phaseLabel={phaseLabel}
        />

        {status === 'running' && tech && (
          <p className="text-slt text-sm animate-fade-in">
            {t.roundOf(cycleNum, tech.totalCycles)}
          </p>
        )}

        {status === 'running' && tech && (
          <div className="flex gap-2">
            {tech.phases.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === phaseIdx ? 'bg-brand-400 scale-125' : 'bg-dark-600'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BreathingPage;
