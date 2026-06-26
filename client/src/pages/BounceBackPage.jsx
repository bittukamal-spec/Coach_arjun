import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

// Breathing: inhale 3s / exhale 5s — 4 rounds (~32s total)
const BREATH_IN  = 3;
const BREATH_OUT = 5;
const BREATH_ROUNDS = 4;

// English keys sent to API (not translated)
const S1_KEYS = [
  'I made a mistake', 'I played badly', 'We lost',
  'Coach criticised me', 'Parent criticised me', 'I got dropped / benched',
  'Injury scare', 'People will judge me', "I feel I'm wasting time", 'Something else',
];
const S2_KEYS = [
  'The mistake itself', "Coach's reaction", "Parent's reaction",
  'Losing my place', 'What teammates will think', "I'm not good enough",
  "Fear it'll happen again", "I don't know",
];
const S5_KEYS = [
  'Next ball / point / rep', 'Body language', 'Warm-up', 'Talk to coach',
  'Recovery', 'Train harder tomorrow', 'Sleep / food / rest', 'Ask for help',
];

// Colours (all via inline style — not in Tailwind config)
const C = {
  bg:     '#F7F3EA',
  navy:   '#172033',
  amber:  '#D98B2B',
  teal:   '#2E7D6B',
  danger: '#C0392B',
  muted:  '#64748B',
  card:   '#FFFFFF',
  selBg:  '#FEF9F0',
  border: '#E5E0D8',
  blue:   '#185FA5',
  blueFill: '#E8F0FE',
};
const SHADOW = '0 2px 8px rgba(0,0,0,0.08)';

function haptic(ms = 50) { try { navigator.vibrate(ms); } catch {} }

function playTone(freq) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.07, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

// ── Reusable tap card ──────────────────────────────────────────────────────

function TapCard({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? C.selBg : C.card,
        borderLeft: `4px solid ${selected ? C.amber : 'transparent'}`,
        boxShadow: SHADOW,
        minHeight: 56,
        textAlign: 'left',
      }}
      className="w-full rounded-2xl px-4 py-3.5 transition-transform duration-[120ms] active:scale-[0.97]"
    >
      <span style={{ color: selected ? C.amber : C.navy, fontSize: 17, fontWeight: 500 }}>
        {label}
      </span>
    </button>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function BounceBackPage() {
  const navigate   = useNavigate();
  const { token, language } = useAuth();
  const t = translations[language]?.bounceBack || translations.en.bounceBack;

  // Screen state machine
  const [screen, setScreen] = useState('step1');

  // Collected data
  const [situation,    setSituation]    = useState('');
  const [stuckOn,      setStuckOn]      = useState('');
  const [intensity,    setIntensity]    = useState(null);
  const [controlChoice, setControlChoice] = useState('');
  const [controlText,  setControlText]  = useState('');

  // Breathing
  const [breathStarted, setBreathStarted] = useState(false);
  const [breathPhase,  setBreathPhase]  = useState('idle'); // idle|in|out
  const [breathCount,  setBreathCount]  = useState(BREATH_IN);
  const [breathRound,  setBreathRound]  = useState(1);
  const [breathDone,   setBreathDone]   = useState(false);
  const timerRef = useRef(null);

  // Done screen
  const [arjunText,   setArjunText]   = useState(null);
  const [arjunLoading, setArjunLoading] = useState(false);
  const [xpEarned,    setXpEarned]    = useState(null);

  // ── Cleanup on unmount ─────────────────────────────────────────────────

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // ── Breathing engine (only runs on step4) ──────────────────────────────

  useEffect(() => {
    if (screen !== 'step4' || !breathStarted) return;
    let cancelled = false;
    setBreathDone(false);
    setBreathPhase('idle');

    function startPhase(phase, round) {
      if (cancelled) return;
      const dur = phase === 'in' ? BREATH_IN : BREATH_OUT;
      haptic();
      playTone(phase === 'in' ? 440 : 330);
      setBreathPhase(phase);
      setBreathCount(dur);
      setBreathRound(round);

      let remaining = dur;
      function tick() {
        if (cancelled) return;
        remaining--;
        if (remaining <= 0) {
          if (phase === 'in') {
            startPhase('out', round);
          } else {
            const next = round + 1;
            if (next > BREATH_ROUNDS) {
              setBreathDone(true);
            } else {
              startPhase('in', next);
            }
          }
        } else {
          setBreathCount(remaining);
          timerRef.current = setTimeout(tick, 1000);
        }
      }
      timerRef.current = setTimeout(tick, 1000);
    }

    // Brief pause so circle renders at idle (scale 1.0) before animating
    const initId = setTimeout(() => startPhase('in', 1), 400);
    return () => {
      cancelled = true;
      clearTimeout(initId);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [screen, breathStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-advance from breathing done ───────────────────────────────────

  useEffect(() => {
    if (!breathDone) return;
    const id = setTimeout(() => setScreen('step5'), 1500);
    return () => clearTimeout(id);
  }, [breathDone]);

  // ── API call (triggered at step 5 selection) ───────────────────────────

  async function fetchArjun(choice) {
    setControlChoice(choice);
    setArjunLoading(true);
    setScreen('done');
    try {
      const res = await apiFetch('/api/chat/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          wizardType: 'bounce_back',
          situation,
          stuckOn,
          intensity,
          intensityLabel: t.intLabels[intensity - 1],
          controlChoice: choice,
          language,
        }),
      });
      const data = await res.json();
      setArjunText(data.text || t.doneFallback);
      if (data.xpEarned) setXpEarned(data.xpEarned);
    } catch {
      setArjunText(t.doneFallback);
    } finally {
      setArjunLoading(false);
    }
  }

  function handleTextSubmit(e) {
    e.preventDefault();
    if (!controlText.trim()) return;
    fetchArjun(controlText.trim());
  }

  function restart() {
    setSituation(''); setStuckOn(''); setIntensity(null);
    setControlChoice(''); setControlText('');
    setArjunText(null); setXpEarned(null);
    setBreathStarted(false); setBreathPhase('idle'); setBreathDone(false);
    setScreen('step1');
  }

  // ── Step number for progress display ──────────────────────────────────

  const stepNums = { step1: 1, step2: 2, step3: 3, step4: 4, step5: 5 };
  const stepNum  = stepNums[screen] ?? null;

  // ── Breathing circle scale ─────────────────────────────────────────────

  const bScale = breathPhase === 'in' ? 1.35 : 1.0;
  const bDur   = breathPhase === 'in' ? BREATH_IN : BREATH_OUT;
  const bBorder = breathPhase === 'in' ? C.amber : C.blue;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg }}>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-safe pt-5 pb-3 shrink-0">
        <span style={{ color: C.muted, fontSize: 14 }}>
          {stepNum ? `Step ${stepNum} ${t.stepOf} 5` : ''}
        </span>
        <button
          onClick={() => navigate('/train')}
          style={{ color: C.muted, fontSize: 14 }}
          className="py-1 px-2"
        >
          {t.exitLabel}
        </button>
      </div>

      {/* ── Scrollable content ──────────────────────────────────────── */}
      <div className="flex-1 px-5 overflow-y-auto pb-10">

        {/* ═══════════ STEP 1 — What hit you? ═══════════════════════ */}
        {screen === 'step1' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="mb-1">
              <h1 style={{ color: C.navy, fontSize: 24, fontWeight: 600, lineHeight: 1.3 }} className="mb-1">
                {t.step1Title}
              </h1>
              <p style={{ color: C.muted, fontSize: 15 }}>{t.step1Sub}</p>
            </div>
            {S1_KEYS.map((key, i) => (
              <TapCard
                key={key}
                label={t.s1[i]}
                selected={situation === key}
                onClick={() => {
                  setSituation(key);
                  haptic();
                  setTimeout(() => setScreen('step2'), 150);
                }}
              />
            ))}
          </div>
        )}

        {/* ═══════════ STEP 2 — Mind stuck on ═══════════════════════ */}
        {screen === 'step2' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="mb-1">
              <h1 style={{ color: C.navy, fontSize: 24, fontWeight: 600, lineHeight: 1.3 }} className="mb-1">
                {t.step2Title}
              </h1>
              <p style={{ color: C.muted, fontSize: 15 }}>{t.step2Sub}</p>
            </div>
            {S2_KEYS.map((key, i) => (
              <TapCard
                key={key}
                label={t.s2[i]}
                selected={stuckOn === key}
                onClick={() => {
                  setStuckOn(key);
                  haptic();
                  setTimeout(() => setScreen('step3'), 150);
                }}
              />
            ))}
          </div>
        )}

        {/* ═══════════ STEP 3 — Intensity ════════════════════════════ */}
        {screen === 'step3' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="mb-1">
              <h1 style={{ color: C.navy, fontSize: 24, fontWeight: 600, lineHeight: 1.3 }} className="mb-1">
                {t.step3Title}
              </h1>
              <p style={{ color: C.muted, fontSize: 15 }}>{t.step3Sub}</p>
            </div>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setIntensity(n);
                  haptic();
                  setTimeout(() => setScreen(n === 5 ? 'safety' : 'step4'), 150);
                }}
                style={{
                  background: intensity === n ? C.amber : C.card,
                  color: intensity === n ? '#FFFFFF' : C.navy,
                  boxShadow: SHADOW,
                  minHeight: 56,
                  borderLeft: `4px solid ${n === 5 ? C.danger : intensity === n ? C.amber : 'transparent'}`,
                  textAlign: 'left',
                }}
                className="w-full rounded-2xl px-4 py-3.5 transition-all duration-[120ms] active:scale-[0.97]"
              >
                <span style={{ fontSize: 17, fontWeight: 700 }}>{n}</span>
                <span style={{ fontSize: 17, fontWeight: 400, marginLeft: 12 }}>{t.intLabels[n - 1]}</span>
              </button>
            ))}
          </div>
        )}

        {/* ═══════════ SAFETY SCREEN ══════════════════════════════════ */}
        {screen === 'safety' && (
          <div className="flex flex-col gap-5 animate-fade-in">
            <div className="flex flex-col items-center gap-4 py-8">
              <Heart size={36} color={C.teal} />
              <h1 style={{ color: C.navy, fontSize: 22, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>
                {t.safetyTitle}
              </h1>
              <p style={{ color: C.muted, fontSize: 16, textAlign: 'center', lineHeight: 1.6, maxWidth: 300 }}>
                {t.safetySub}
              </p>
            </div>
            <button
              onClick={() => setScreen('step4')}
              style={{ background: C.teal, minHeight: 56 }}
              className="w-full rounded-2xl py-4 text-white font-semibold text-[17px] active:scale-[0.97] transition-transform duration-[120ms]"
            >
              {t.safetyOk}
            </button>
            <button
              onClick={() => setScreen('help')}
              style={{ color: C.danger, minHeight: 56, fontSize: 17, fontWeight: 600 }}
              className="w-full py-4 text-center active:scale-[0.97] transition-transform duration-[120ms]"
            >
              {t.safetyNeed}
            </button>
          </div>
        )}

        {/* ═══════════ HELP SCREEN ════════════════════════════════════ */}
        {screen === 'help' && (
          <div className="flex flex-col gap-5 animate-fade-in">
            <div
              className="rounded-2xl p-5"
              style={{ background: C.card, boxShadow: SHADOW, borderLeft: `4px solid ${C.teal}` }}
            >
              <h2 style={{ color: C.navy, fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
                {t.helpTitle}
              </h2>
              <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>
                {t.helpBody}
              </p>
              <p style={{ color: C.navy, fontSize: 16, fontWeight: 500, marginBottom: 6 }}>
                {t.helpIcall}
              </p>
              <p style={{ color: C.danger, fontSize: 16, fontWeight: 600 }}>
                {t.helpEmergency}
              </p>
            </div>
            <button
              onClick={() => setScreen('safety')}
              style={{ color: C.muted, fontSize: 15 }}
              className="text-center py-3"
            >
              {t.helpBack}
            </button>
          </div>
        )}

        {/* ═══════════ STEP 4 — Breathing ════════════════════════════ */}
        {screen === 'step4' && !breathStarted && (
          <div className="flex flex-col gap-5 animate-fade-in">
            {/* Arjun coaching line */}
            <p style={{ color: C.navy, fontSize: 17, fontWeight: 500, lineHeight: 1.6 }}>
              {t.step4Line}
            </p>

            {/* Cue card */}
            <div
              className="rounded-2xl p-5 flex flex-col gap-3"
              style={{ background: C.card, boxShadow: SHADOW }}
            >
              <p style={{ color: C.muted, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t.step4Sub}
              </p>
              {(t.step4Cues || []).map((cue, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.teal, flexShrink: 0 }} />
                  <p style={{ color: C.navy, fontSize: 16 }}>{cue}</p>
                </div>
              ))}
            </div>

            {/* Start button */}
            <button
              onClick={() => setBreathStarted(true)}
              style={{ background: C.amber, minHeight: 56, marginTop: 8 }}
              className="w-full rounded-2xl py-4 text-white font-semibold text-[17px] active:scale-[0.97] transition-transform duration-[120ms]"
            >
              {t.step4StartBtn}
            </button>
          </div>
        )}

        {screen === 'step4' && breathStarted && (
          <div className="flex flex-col items-center gap-5 animate-fade-in">
            {!breathDone ? (
              <>
                {/* Breathing circle */}
                <div style={{ width: 160, height: 160, position: 'relative', margin: '24px 0' }}>
                  <div
                    style={{
                      width: 140, height: 140,
                      borderRadius: '50%',
                      background: C.blueFill,
                      border: `2px solid ${bBorder}`,
                      transform: `scale(${bScale})`,
                      transition: `transform ${bDur}s ease-in-out, border-color 0.4s ease`,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      position: 'absolute', top: 10, left: 10,
                    }}
                    className="motion-reduce:transition-none"
                  >
                    <span style={{ fontSize: 36, fontWeight: 700, color: C.navy, lineHeight: 1 }}>
                      {breathPhase === 'idle' ? '' : breathCount}
                    </span>
                    <span style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                      {breathPhase === 'in' ? t.breathIn : breathPhase === 'out' ? t.breathOut : ''}
                    </span>
                  </div>
                </div>

                {breathPhase !== 'idle' && (
                  <p style={{ color: C.muted, fontSize: 14 }}>
                    {t.breathRound} {breathRound} {t.breathOf} {BREATH_ROUNDS}
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-12 animate-fade-in">
                <p style={{ color: C.teal, fontSize: 17, fontWeight: 500, textAlign: 'center', lineHeight: 1.6 }}>
                  {t.breathDoneMsg}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ STEP 5 — One controllable ═════════════════════ */}
        {screen === 'step5' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="mb-1">
              <h1 style={{ color: C.navy, fontSize: 24, fontWeight: 600, lineHeight: 1.3 }} className="mb-1">
                {t.step5Title}
              </h1>
              <p style={{ color: C.muted, fontSize: 15 }}>{t.step5Sub}</p>
            </div>
            {S5_KEYS.map((key, i) => (
              <TapCard
                key={key}
                label={t.s5[i]}
                selected={controlChoice === key}
                onClick={() => fetchArjun(key)}
              />
            ))}
            {/* Optional text input */}
            <form onSubmit={handleTextSubmit} className="mt-1 flex flex-col gap-3">
              <input
                type="text"
                value={controlText}
                onChange={(e) => setControlText(e.target.value)}
                placeholder={t.step5Placeholder}
                style={{
                  background: C.card, color: C.navy, fontSize: 16,
                  border: `1px solid ${C.border}`, borderRadius: 16,
                  padding: '14px 16px', outline: 'none', width: '100%',
                }}
              />
              {controlText.trim() && (
                <button
                  type="submit"
                  style={{ background: C.amber, minHeight: 56 }}
                  className="w-full rounded-2xl py-3.5 text-white font-semibold text-[17px] active:scale-[0.97] transition-transform duration-[120ms]"
                >
                  {t.step5Next}
                </button>
              )}
            </form>
          </div>
        )}

        {/* ═══════════ DONE — Arjun's response ═══════════════════════ */}
        {screen === 'done' && (
          <div className="flex flex-col gap-5 animate-fade-in">
            {arjunLoading ? (
              <div className="flex flex-col items-center gap-5 py-16">
                <Shield size={32} color={C.blue} />
                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{ background: C.blue, width: 8, height: 8, borderRadius: '50%', animationDelay: `${i * 0.2}s` }}
                      className="animate-bounce"
                    />
                  ))}
                </div>
                <p style={{ color: C.muted, fontSize: 15 }}>{t.doneLoading}</p>
              </div>
            ) : (
              <>
                {/* Arjun response card */}
                <div
                  className="rounded-2xl p-5"
                  style={{ background: C.card, boxShadow: SHADOW, borderLeft: `4px solid ${C.teal}` }}
                >
                  <p style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>{t.doneArjunLabel}</p>
                  <p style={{ color: C.navy, fontSize: 17, lineHeight: 1.65 }}>
                    {arjunText || t.doneFallback}
                  </p>
                </div>

                {/* XP badge */}
                {xpEarned && (
                  <div className="flex justify-center">
                    <span
                      style={{
                        background: C.selBg, color: C.amber,
                        border: `1px solid ${C.amber}`,
                        fontSize: 14, fontWeight: 600,
                        borderRadius: 999, padding: '6px 16px',
                      }}
                    >
                      {t.doneXp}
                    </span>
                  </div>
                )}

                {/* CTAs */}
                <div className="flex flex-col gap-3 mt-1">
                  <button
                    onClick={() => navigate('/train')}
                    style={{ background: C.amber, minHeight: 56 }}
                    className="w-full rounded-2xl py-4 text-white font-semibold text-[17px] active:scale-[0.97] transition-transform duration-[120ms]"
                  >
                    {t.doneBack}
                  </button>
                  <button
                    onClick={restart}
                    style={{ color: C.muted, fontSize: 15, minHeight: 44 }}
                    className="w-full text-center py-2"
                  >
                    {t.doneRestart}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
