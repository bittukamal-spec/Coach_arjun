import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import BreathingCircle from '../components/BreathingCircle';

const BOX_PHASES = [
  { key: 'breatheIn',  duration: 4, scale: 1.45 },
  { key: 'hold1',      duration: 4, scale: 1.45 },
  { key: 'breatheOut', duration: 4, scale: 1.0  },
  { key: 'hold2',      duration: 4, scale: 1.0  },
];
const BREATH_CYCLES = 3;

function playTone(freq) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.10, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

export default function BounceBackPage() {
  const navigate = useNavigate();
  const { token, language } = useAuth();
  const t = translations[language]?.bounceBack || translations.en.bounceBack;

  // step: 'step1' | 'step2' | 'step3' | 'step4'
  const [step, setStep] = useState('step1');
  const [includesBreathing, setIncludesBreathing] = useState(false);

  // Step 1
  const [situation, setSituation] = useState(null);
  const [intensity, setIntensity] = useState(null);

  // Step 2 — breathing
  const [breathStatus, setBreathStatus] = useState('idle'); // idle|countdown|running|done
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseCount, setPhaseCount] = useState(BOX_PHASES[0].duration);
  const [cycleCount, setCycleCount] = useState(0);
  const [countdownNum, setCountdownNum] = useState(3);
  const [canSkip, setCanSkip] = useState(false);
  const timerRef = useRef(null);

  // Step 3 — reframe
  const [reframeText, setReframeText] = useState(null);
  const [reframeLoading, setReframeLoading] = useState(false);

  // Step 4
  const [controlInput, setControlInput] = useState('');
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const situations = [
    { key: 'Played really badly',  label: t.sit_played_badly },
    { key: 'Made a big mistake',   label: t.sit_big_mistake  },
    { key: 'We lost',              label: t.sit_we_lost      },
    { key: 'Let the team down',    label: t.sit_let_down     },
    { key: 'Something else',       label: t.sit_other        },
  ];

  async function fetchReframe(sit, intens) {
    setReframeLoading(true);
    try {
      const res = await apiFetch('/api/chat/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wizardType: 'bounce_back', situation: sit, intensity: intens, language }),
      });
      const data = await res.json();
      setReframeText(data.text || null);
    } catch {
      setReframeText(null);
    } finally {
      setReframeLoading(false);
    }
  }

  function handleStep1Next() {
    if (!situation || !intensity) return;
    const willBreathe = intensity >= 4;
    setIncludesBreathing(willBreathe);
    fetchReframe(situation, intensity);
    if (willBreathe) {
      setStep('step2');
      startBreathingCountdown();
    } else {
      setStep('step3');
    }
  }

  // ── Breathing ──────────────────────────────────────────────────────────────

  function startBreathingCountdown() {
    setBreathStatus('countdown');
    setCountdownNum(3);
    let count = 3;
    function tick() {
      count--;
      if (count <= 0) {
        setBreathStatus('running');
        startPhase(0, 0);
      } else {
        setCountdownNum(count);
        timerRef.current = setTimeout(tick, 1000);
      }
    }
    timerRef.current = setTimeout(tick, 1000);
  }

  function startPhase(pIdx, cycles) {
    const phase = BOX_PHASES[pIdx];
    const freqs = [528, 440, 396, 440];
    playTone(freqs[pIdx] || 440);
    setPhaseIdx(pIdx);
    setPhaseCount(phase.duration);
    if (cycles >= 1) setCanSkip(true);
    setCycleCount(cycles);

    let remaining = phase.duration;
    function tick() {
      remaining--;
      setPhaseCount(remaining);
      if (remaining <= 0) {
        const nextPIdx = (pIdx + 1) % BOX_PHASES.length;
        const nextCycles = nextPIdx === 0 ? cycles + 1 : cycles;
        if (nextCycles >= BREATH_CYCLES) {
          setBreathStatus('done');
          return;
        }
        startPhase(nextPIdx, nextCycles);
      } else {
        timerRef.current = setTimeout(tick, 1000);
      }
    }
    timerRef.current = setTimeout(tick, 1000);
  }

  function skipBreathing() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setBreathStatus('done');
  }

  // ── Finish ─────────────────────────────────────────────────────────────────

  function handleFinish() {
    if (!controlInput.trim() || finishing) return;
    setFinishing(true);
    navigate('/train');
  }

  // ── Step indicator ─────────────────────────────────────────────────────────

  const allSteps = ['step1', ...(includesBreathing ? ['step2'] : []), 'step3', 'step4'];
  const currentIdx = allSteps.indexOf(step);

  const currentPhase = BOX_PHASES[phaseIdx];
  const phaseLabels = {
    breatheIn:  t.breathIn,
    hold1:      t.hold,
    breatheOut: t.breathOut,
    hold2:      t.hold,
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pt-5 pb-2">
        <h1 className="text-base font-bold text-dark-900">{t.pageTitle}</h1>
        <button onClick={() => navigate('/train')} className="text-dark-400 p-1 -mr-1">
          <X size={20} />
        </button>
      </div>

      {/* Step dots */}
      <div className="flex justify-center gap-2 pb-4">
        {allSteps.map((s, i) => (
          <div
            key={s}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentIdx ? 'bg-brand-500' : i < currentIdx ? 'bg-brand-200' : 'bg-dark-200'
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 overflow-y-auto pb-32">

        {/* ── STEP 1 ─────────────────────────────────────────────────────── */}
        {step === 'step1' && (
          <div className="flex flex-col gap-5">
            <div className="bg-blue-50 border-l-4 border-brand-500 rounded-r-2xl px-4 py-3">
              <p className="text-sm text-dark-800">{t.arjunStep1}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide mb-2.5">
                {t.situationLabel}
              </p>
              <div className="flex flex-wrap gap-2">
                {situations.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSituation(key)}
                    className={`px-3.5 py-2 rounded-xl text-sm border transition-colors ${
                      situation === key
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'bg-white text-dark-700 border-dark-300 hover:border-brand-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {situation && (
              <div>
                <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide mb-2.5">
                  {t.intensityLabel}
                </p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setIntensity(n)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                        intensity === n
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'bg-white text-dark-700 border-dark-300 hover:border-brand-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between mt-1.5 px-0.5">
                  <span className="text-xs text-dark-400">{t.intensityLow}</span>
                  <span className="text-xs text-dark-400">{t.intensityHigh}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2 — Breathing ─────────────────────────────────────────── */}
        {step === 'step2' && (
          <div className="flex flex-col items-center gap-5">
            <div className="bg-blue-50 border-l-4 border-brand-500 rounded-r-2xl px-4 py-3 w-full">
              <p className="text-sm text-dark-800">{t.arjunStep2}</p>
            </div>
            <p className="text-xs text-dark-400 uppercase tracking-wide">{t.breathingSubtitle}</p>

            {breathStatus !== 'done' ? (
              <>
                <BreathingCircle
                  phase={breathStatus === 'running' ? currentPhase : null}
                  count={phaseCount}
                  status={breathStatus}
                  countdownNum={countdownNum}
                  phaseLabel={breathStatus === 'running' ? phaseLabels[currentPhase.key] : null}
                />
                {breathStatus === 'running' && canSkip && (
                  <button onClick={skipBreathing} className="text-sm text-dark-400 underline mt-2">
                    {t.skipBtn}
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10">
                <p className="text-base font-semibold text-dark-800">{t.breathDone}</p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3 — Arjun reframe ─────────────────────────────────────── */}
        {step === 'step3' && (
          <div className="flex flex-col gap-4">
            {reframeLoading ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-dark-500">{t.arjunLoading}</p>
              </div>
            ) : (
              <div className="bg-blue-50 border-l-4 border-brand-500 rounded-r-2xl px-4 py-3">
                <p className="text-sm text-dark-800">
                  {reframeText || "That was a tough one. You showed up, and that already matters. Now look forward — focus on what you can control."}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4 — Control shift ─────────────────────────────────────── */}
        {step === 'step4' && (
          <div className="flex flex-col gap-4">
            <div className="bg-blue-50 border-l-4 border-brand-500 rounded-r-2xl px-4 py-3">
              <p className="text-sm text-dark-800">{t.arjunStep4}</p>
            </div>
            <textarea
              value={controlInput}
              onChange={(e) => setControlInput(e.target.value)}
              placeholder={t.controlPlaceholder}
              rows={3}
              className="w-full border border-dark-200 rounded-xl px-3.5 py-2.5 text-sm text-dark-900 placeholder-dark-400 focus:outline-none focus:border-brand-500 resize-none"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Bottom button */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-8 pt-3 bg-white border-t border-dark-100">
        {step === 'step1' && (
          <button
            onClick={handleStep1Next}
            disabled={!situation || !intensity}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm bg-brand-500 text-white disabled:opacity-40 transition-opacity active:scale-[0.98]"
          >
            {t.nextBtn}
          </button>
        )}

        {step === 'step2' && breathStatus === 'done' && (
          <button
            onClick={() => setStep('step3')}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm bg-brand-500 text-white active:scale-[0.98]"
          >
            {t.nextBtn}
          </button>
        )}

        {step === 'step3' && !reframeLoading && (
          <button
            onClick={() => setStep('step4')}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm bg-brand-500 text-white active:scale-[0.98]"
          >
            {t.nextBtn}
          </button>
        )}

        {step === 'step4' && (
          <button
            onClick={handleFinish}
            disabled={!controlInput.trim() || finishing}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm bg-brand-500 text-white disabled:opacity-40 transition-opacity active:scale-[0.98]"
          >
            {finishing ? '…' : t.finishBtn}
          </button>
        )}
      </div>
    </div>
  );
}
