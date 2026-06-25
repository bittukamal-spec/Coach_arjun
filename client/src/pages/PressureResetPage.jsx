import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, RotateCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import Navbar from '../components/Navbar';
import BreathingCircle from '../components/BreathingCircle';

// ── BoxBreathStep: 4 cycles of box breathing for wizard step 2 ───────────────

const BOX_PHASES = [
  { key: 'breatheIn',  duration: 4, scale: 1.45 },
  { key: 'hold',       duration: 4, scale: 1.45 },
  { key: 'breatheOut', duration: 4, scale: 1.0  },
  { key: 'hold',       duration: 4, scale: 1.0  },
];
const BOX_TOTAL_CYCLES = 4;

function BoxBreathStep({ onComplete, t }) {
  const [phaseIdx,  setPhaseIdx]  = useState(0);
  const [count,     setCount]     = useState(BOX_PHASES[0].duration);
  const [cycleNum,  setCycleNum]  = useState(1);
  const [canSkip,   setCanSkip]   = useState(false);

  const ctxRef = useRef(null);
  function playTone(type) {
    try {
      if (!ctxRef.current || ctxRef.current.state === 'closed') ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = type === 'in' ? 528 : type === 'out' ? 396 : 440;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
      osc.start(); osc.stop(ctx.currentTime + 0.7);
    } catch {}
  }

  useEffect(() => {
    const id = setTimeout(() => {
      if (count > 1) { setCount(c => c - 1); return; }

      const nextIdx  = (phaseIdx + 1) % BOX_PHASES.length;
      const wrapping = nextIdx === 0;

      if (wrapping) {
        const next = cycleNum + 1;
        if (next > BOX_TOTAL_CYCLES) { onComplete(); return; }
        setCycleNum(next);
        if (next === 2) setCanSkip(true);
      }

      setPhaseIdx(nextIdx);
      setCount(BOX_PHASES[nextIdx].duration);
      const k = BOX_PHASES[nextIdx].key;
      playTone(k === 'breatheIn' ? 'in' : k === 'breatheOut' ? 'out' : 'hold');
    }, 1000);
    return () => clearTimeout(id);
  }, [count, phaseIdx, cycleNum]); // eslint-disable-line react-hooks/exhaustive-deps

  const current    = BOX_PHASES[phaseIdx];
  const phaseLabel = t[current.key];

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative flex items-center justify-center">
        <div
          className="absolute rounded-full bg-brand-500/10"
          style={{ width: '220px', height: '220px', transform: `scale(${current.scale * 0.95})`, transition: `transform ${current.duration}s ease-in-out` }}
        />
        <div
          className="w-40 h-40 rounded-full bg-brand-500 flex flex-col items-center justify-center relative z-10"
          style={{ transform: `scale(${current.scale})`, transition: `transform ${current.duration}s ease-in-out`, boxShadow: '0 0 40px rgba(11,110,79,0.4)' }}
        >
          <span className="text-4xl font-bold text-white leading-none">{count}</span>
          <span className="text-xs font-medium text-white mt-1">{phaseLabel}</span>
        </div>
      </div>

      {canSkip && (
        <button
          onClick={onComplete}
          className="self-center px-5 py-2.5 rounded-full bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors active:scale-95 animate-fade-in"
        >
          {t.breathingDone || 'Done'}
        </button>
      )}
    </div>
  );
}

const CUE_SUGGESTIONS = {
  nervous:    'READY',
  anxious:    'CALM',
  distracted: 'HERE',
  blank:      'TRUST',
  excited:    'SHARP',
};

// ── Shared sub-components ────────────────────────────────────────────────────

function ArjunBubble({ children, loading }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="w-7 h-7 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        A
      </div>
      <div className="max-w-[90%] px-3.5 py-2.5 text-sm leading-relaxed bg-dark-800 border border-dark-600 text-ink shadow-sm rounded-2xl rounded-bl-md">
        {loading ? <span className="animate-pulse text-slt">...</span> : children}
      </div>
    </div>
  );
}

function PillRow({ options, selected, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`rounded-full px-4 py-2 text-sm border transition-all active:scale-95 ${
            selected === key
              ? 'border-brand-500 bg-brand-500/10 text-brand-400'
              : 'border-dark-600 bg-dark-800 text-ink hover:border-brand-500/50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PressureResetPage() {
  const { language, token } = useAuth();
  const t  = translations[language];
  const tw = t.wizard;
  const tr = t.pressureReset;
  const navigate = useNavigate();

  // Wizard state
  const [wizardType,        setWizardType]        = useState(null); // null | 'pressure_reset' | 'setback_reset'
  const [step,              setStep]              = useState(1);
  const [pressFeelingKey,   setPressFeelingKey]   = useState(null);
  const [situationKey,      setSituationKey]      = useState(null);
  const [setbackFeelingKey, setSetbackFeelingKey] = useState(null);
  const [cueWordInput,      setCueWordInput]      = useState('');
  const [reframeText,       setReframeText]       = useState('');
  const [reframeLoading,    setReframeLoading]    = useState(false);

  const totalSteps = wizardType === 'pressure_reset' ? 5 : 4;

  function startWizard(type) {
    setWizardType(type);
    setStep(1);
    setPressFeelingKey(null);
    setSituationKey(null);
    setSetbackFeelingKey(null);
    setCueWordInput('');
    setReframeText('');
    setReframeLoading(false);
  }

  function exitWizard() {
    setWizardType(null);
    setStep(1);
    setPressFeelingKey(null);
    setSituationKey(null);
    setSetbackFeelingKey(null);
    setCueWordInput('');
    setReframeText('');
    setReframeLoading(false);
  }

  function next() {
    setStep(s => s + 1);
  }

  // ── API call ───────────────────────────────────────────────────────────────

  const callWizardApi = useCallback(async (payload) => {
    setReframeLoading(true);
    setReframeText('');
    try {
      const resp = await apiFetch('/api/chat/wizard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...payload, language }),
      });
      const data = await resp.json();
      setReframeText(data.text || tw.fallback);
      if (data.cueWord) setCueWordInput(prev => prev || data.cueWord);
    } catch {
      setReframeText(tw.fallback);
    } finally {
      setReframeLoading(false);
    }
  }, [token, language, tw.fallback]);

  useEffect(() => {
    if (wizardType === 'pressure_reset' && step === 3 && pressFeelingKey) {
      callWizardApi({ wizardType: 'pressure_reset', feeling: pressFeelingKey });
    } else if (wizardType === 'setback_reset' && step === 3 && situationKey && setbackFeelingKey) {
      callWizardApi({ wizardType: 'setback_reset', situation: situationKey, feeling: setbackFeelingKey });
    }
  }, [wizardType, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Option arrays ──────────────────────────────────────────────────────────

  const pressureFeelings = Object.entries(tw.feelings).map(([key, label]) => ({ key, label }));
  const situations       = Object.entries(tw.situations).map(([key, label]) => ({ key, label }));
  const setbackFeelings  = Object.entries(tw.setbackFeelings).map(([key, label]) => ({ key, label }));

  // ── Wizard step content ───────────────────────────────────────────────────

  function renderWizardContent() {
    if (wizardType === 'pressure_reset') {
      switch (step) {
        case 1:
          return (
            <div className="flex flex-col gap-6">
              <ArjunBubble>{tw.feelingQuestion}</ArjunBubble>
              <PillRow
                options={pressureFeelings}
                selected={pressFeelingKey}
                onSelect={key => { setPressFeelingKey(key); setTimeout(next, 200); }}
              />
            </div>
          );

        case 2:
          return (
            <div className="flex flex-col gap-6">
              <ArjunBubble>{tw.breathingIntro}</ArjunBubble>
              <BoxBreathStep onComplete={next} t={tw} />
            </div>
          );

        case 3:
          return (
            <div className="flex flex-col gap-6">
              <ArjunBubble loading={reframeLoading}>
                {!reframeLoading && reframeText}
              </ArjunBubble>
              {!reframeLoading && reframeText && (
                <button
                  onClick={next}
                  className="self-start px-5 py-2.5 rounded-full bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors active:scale-95"
                >
                  {tw.next}
                </button>
              )}
            </div>
          );

        case 4: {
          const displayWord = cueWordInput || CUE_SUGGESTIONS[pressFeelingKey] || 'FOCUS';
          return (
            <div className="flex flex-col gap-6">
              <ArjunBubble>{tw.cueArjunLine}</ArjunBubble>
              <div className="flex flex-col items-center gap-5 py-6">
                <span className="text-5xl font-extrabold tracking-widest text-brand-400 text-center">
                  {displayWord}
                </span>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-slt">{tw.cueOwnLabel}</p>
                  <input
                    value={cueWordInput}
                    onChange={e => setCueWordInput(e.target.value.toUpperCase().slice(0, 12))}
                    placeholder={tw.cueInputPlaceholder}
                    maxLength={12}
                    className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-2 text-sm text-ink text-center w-40 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
              <button
                onClick={next}
                className="self-start px-5 py-2.5 rounded-full bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors active:scale-95"
              >
                {tw.next}
              </button>
            </div>
          );
        }

        case 5:
          return (
            <div className="flex flex-col gap-8">
              <ArjunBubble>{tw.sendOff}</ArjunBubble>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full py-3.5 rounded-2xl bg-brand-500 text-white font-semibold text-base hover:bg-brand-600 transition-colors active:scale-[0.98]"
                >
                  {tw.letsGo}
                </button>
                <button
                  onClick={() => navigate('/coaching', { state: { sessionType: 'match_prep' } })}
                  className="w-full py-2 text-sm text-slt hover:text-brand-400 transition-colors"
                >
                  {tw.talkMore}
                </button>
              </div>
            </div>
          );

        default:
          return null;
      }
    }

    if (wizardType === 'setback_reset') {
      switch (step) {
        case 1:
          return (
            <div className="flex flex-col gap-6">
              <ArjunBubble>{tw.situationQuestion}</ArjunBubble>
              <PillRow
                options={situations}
                selected={situationKey}
                onSelect={key => { setSituationKey(key); setTimeout(next, 200); }}
              />
            </div>
          );

        case 2:
          return (
            <div className="flex flex-col gap-6">
              <ArjunBubble>{tw.setbackFeelingQuestion}</ArjunBubble>
              <PillRow
                options={setbackFeelings}
                selected={setbackFeelingKey}
                onSelect={key => { setSetbackFeelingKey(key); setTimeout(next, 200); }}
              />
            </div>
          );

        case 3:
          return (
            <div className="flex flex-col gap-6">
              <ArjunBubble loading={reframeLoading}>
                {!reframeLoading && reframeText}
              </ArjunBubble>
              {!reframeLoading && reframeText && (
                <button
                  onClick={next}
                  className="self-start px-5 py-2.5 rounded-full bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors active:scale-95"
                >
                  {tw.next}
                </button>
              )}
            </div>
          );

        case 4:
          return (
            <div className="flex flex-col gap-8">
              <ArjunBubble>{tw.compassionMessage}</ArjunBubble>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full py-3.5 rounded-2xl bg-brand-500 text-white font-semibold text-base hover:bg-brand-600 transition-colors active:scale-[0.98]"
                >
                  {tw.readyToMoveOn}
                </button>
                <button
                  onClick={() => navigate('/coaching', { state: { sessionType: 'post_match' } })}
                  className="w-full py-2 text-sm text-slt hover:text-brand-400 transition-colors"
                >
                  {tw.talkMore}
                </button>
              </div>
            </div>
          );

        default:
          return null;
      }
    }

    return null;
  }

  // ── Landing page ──────────────────────────────────────────────────────────

  if (!wizardType) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <main className="max-w-lg mx-auto pt-20 pb-24 px-4 animate-fade-in">
          <h1 className="text-xl font-bold text-ink mb-1">{tr.pageTitle}</h1>
          <p className="text-sm text-slt mb-6">{tr.pageSubtitle}</p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => startWizard('pressure_reset')}
              className="flex items-center gap-4 bg-dark-800 border border-dark-600 hover:border-brand-500/50 hover:bg-dark-700 active:scale-[0.98] rounded-2xl p-5 text-left transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
                <Target size={22} className="text-brand-400" />
              </div>
              <div>
                <p className="font-semibold text-ink text-base leading-tight">{tr.preMatchLabel}</p>
                <p className="text-sm text-slt mt-1">{tr.preMatchSubtitle}</p>
              </div>
            </button>

            <button
              onClick={() => startWizard('setback_reset')}
              className="flex items-center gap-4 bg-dark-800 border border-dark-600 hover:border-fire-500/50 hover:bg-dark-700 active:scale-[0.98] rounded-2xl p-5 text-left transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-fire-500/15 flex items-center justify-center shrink-0">
                <RotateCcw size={22} className="text-fire-400" />
              </div>
              <div>
                <p className="font-semibold text-ink text-base leading-tight">{tr.setbackLabel}</p>
                <p className="text-sm text-slt mt-1">{tr.setbackSubtitle}</p>
              </div>
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Full-screen wizard overlay (covers BottomNav) ─────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-dark-900 flex flex-col animate-fade-in">
      {/* Header: exit × and progress counter */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-dark-700">
        <button
          onClick={exitWizard}
          aria-label="Exit wizard"
          className="w-9 h-9 flex items-center justify-center text-slt hover:text-ink text-2xl rounded-xl hover:bg-dark-800 transition-colors"
        >
          ×
        </button>
        <span className="text-xs text-slt font-medium tabular-nums">{step} / {totalSteps}</span>
      </div>

      {/* Scrollable step content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6">
          {renderWizardContent()}
        </div>
      </div>
    </div>
  );
}
