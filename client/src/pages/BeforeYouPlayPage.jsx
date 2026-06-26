import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { cueFallbacks } from '../data/cueFallbacks';

// ── Arousal colour themes ─────────────────────────────────────────────────────
const AROUSAL_COLORS = {
  calm_down: { accent: '#2E7D6B', light: 'rgba(46,125,107,0.12)', label: 'teal' },
  lock_in:   { accent: '#185FA5', light: 'rgba(24,95,165,0.12)',  label: 'blue' },
  fire_up:   { accent: '#D98B2B', light: 'rgba(217,139,43,0.12)', label: 'amber' },
};

// ── Breathing config per arousal ──────────────────────────────────────────────
const BREATH_CONFIG = {
  calm_down: {
    phases: [
      { label: 'in',   dur: 4, scale: 1.45 },
      { label: 'hold', dur: 7, scale: 1.45 },
      { label: 'out',  dur: 8, scale: 1.0  },
    ],
    rounds: 3,
  },
  lock_in: {
    phases: [
      { label: 'in',   dur: 4, scale: 1.45 },
      { label: 'hold', dur: 4, scale: 1.45 },
      { label: 'out',  dur: 4, scale: 1.0  },
      { label: 'hold', dur: 4, scale: 1.0  },
    ],
    rounds: 4,
  },
  fire_up: {
    phases: [
      { label: 'in',  dur: 4, scale: 1.45 },
      { label: 'out', dur: 4, scale: 1.0  },
    ],
    rounds: 4,
  },
};

// ── Sport-specific Step 3 focus options ───────────────────────────────────────
const FOCUS_OPTIONS = {
  cricket:   ['First ball', 'Footwork', 'Calling', 'Reading the ball', 'Body language'],
  football:  ['First touch', 'Positioning', 'Communication', 'Reading play', 'Body language'],
  badminton: ['First rally', 'Footwork', 'Serve return', 'Reading shuttle', 'Body language'],
  tennis:    ['First serve', 'Footwork', 'Return of serve', 'Net play', 'Body language'],
  swimming:  ['Start', 'Stroke rhythm', 'Turns', 'Breathing', 'Finish strong'],
};
const DEFAULT_FOCUS = ['Attack', 'Stay present', 'Trust my body', 'Communicate', 'Read the play'];

// ── Sport-specific Step 4 visualization scripts ───────────────────────────────
const VIZ_SCRIPTS = {
  cricket: [
    "You're walking out. Head up, shoulders back.",
    "Watch the ball from the bowler's hand — all the way in.",
    "First ball: patient, eyes on it. You're ready.",
  ],
  football: [
    "You're lined up. The whistle is about to go.",
    "First ball comes to you — trap it clean, head up, see the options.",
    "You're in it from the first second. Switched on.",
  ],
  badminton: [
    "You're at the service line. Match starts now.",
    "First shuttle — track it early, get your feet moving.",
    "Clean contact. You're playing your game.",
  ],
  tennis: [
    "You're at the baseline. Ball toss coming up.",
    "Eyes on the ball, racket back early, see where it lands.",
    "First point won in your mind already.",
  ],
  swimming: [
    "You're on the block. Call to start.",
    "Drive off hard — feel the water, find your rhythm immediately.",
    "First length: your pace, your race.",
  ],
};
const DEFAULT_VIZ = [
  "You're at the start. The moment is here.",
  "Head clear, body loose, eyes up.",
  "You know what to do. Go do it.",
];

// ── Shared sub-components ─────────────────────────────────────────────────────

function ArjunBubble({ children }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="w-7 h-7 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        A
      </div>
      <div className="max-w-[90%] px-3.5 py-2.5 text-sm leading-relaxed bg-dark-800 border border-dark-600 text-ink shadow-sm rounded-2xl rounded-bl-md">
        {children}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BeforeYouPlayPage() {
  const { language, token, user } = useAuth();
  const tb = translations[language].byp;
  const hi = language === 'hi';
  const navigate = useNavigate();

  const sport = user?.sport || 'default';

  // ── Screen state machine ──────────────────────────────────────────────────
  const [screen, setScreen] = useState('entry');

  // Step 1
  const [arousal, setArousal] = useState(null);

  // Step 2 breathing
  const [breathStarted,  setBreathStarted]  = useState(false);
  const [breathPhase,    setBreathPhase]    = useState('idle');
  const [breathScale,    setBreathScale]    = useState(1.0);
  const [breathPhaseDur, setBreathPhaseDur] = useState(1);
  const [breathCount,    setBreathCount]    = useState(0);
  const [breathRound,    setBreathRound]    = useState(1);
  const [breathDone,     setBreathDone]     = useState(false);
  const timerRef = useRef(null);
  const ctxRef   = useRef(null);

  // Step 3
  const [firstFocus, setFirstFocus] = useState(null);

  // Step 5
  const [cueOptions,   setCueOptions]   = useState([]);
  const [cueWord,      setCueWord]      = useState('');
  const [cueInput,     setCueInput]     = useState('');
  const [arjunLoading, setArjunLoading] = useState(false);

  // Done
  const [xpEarned, setXpEarned] = useState(null);

  // ── Audio + haptic ────────────────────────────────────────────────────────
  function playTone(freq) {
    try {
      if (!ctxRef.current || ctxRef.current.state === 'closed') ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {}
  }

  function haptic() {
    try { if (navigator.vibrate) navigator.vibrate(40); } catch {}
  }

  // ── Breathing engine ──────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'step2' || !breathStarted || !arousal) return;
    let cancelled = false;
    setBreathDone(false);
    setBreathPhase('idle');
    setBreathScale(1.0);

    const { phases, rounds } = BREATH_CONFIG[arousal];

    function startPhase(phaseIdx, round) {
      if (cancelled) return;
      const phase = phases[phaseIdx];
      haptic();
      const freq = phase.label === 'in' ? 528 : phase.label === 'out' ? 396 : 440;
      playTone(freq);
      setBreathPhase(phase.label);
      setBreathScale(phase.scale);
      setBreathPhaseDur(phase.dur);
      setBreathCount(phase.dur);
      setBreathRound(round);

      let remaining = phase.dur;
      function tick() {
        if (cancelled) return;
        remaining--;
        if (remaining <= 0) {
          const nextIdx = phaseIdx + 1;
          if (nextIdx >= phases.length) {
            const nextRound = round + 1;
            if (nextRound > rounds) {
              setBreathDone(true);
            } else {
              startPhase(0, nextRound);
            }
          } else {
            startPhase(nextIdx, round);
          }
        } else {
          setBreathCount(remaining);
          timerRef.current = setTimeout(tick, 1000);
        }
      }
      timerRef.current = setTimeout(tick, 1000);
    }

    const initId = setTimeout(() => startPhase(0, 1), 400);
    return () => {
      cancelled = true;
      clearTimeout(initId);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [screen, breathStarted, arousal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance from breathing to step3
  useEffect(() => {
    if (!breathDone) return;
    const id = setTimeout(() => setScreen('step3'), 1200);
    return () => clearTimeout(id);
  }, [breathDone]);

  // ── Step 5 — fetch AI cue word options ───────────────────────────────────
  useEffect(() => {
    if (screen !== 'step5' || !arousal) return;
    // Show fallbacks immediately so screen is never blank
    const fb = (cueFallbacks[sport] || cueFallbacks.default)[arousal] || cueFallbacks.default.lock_in;
    setCueOptions(fb);
    setArjunLoading(true);
    apiFetch('/api/chat/wizard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wizardType: 'cue_word', arousal, firstFocus, language }),
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.words) && data.words.length) setCueOptions(data.words);
      })
      .catch(() => {})
      .finally(() => setArjunLoading(false));
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lock it in → save + done ─────────────────────────────────────────────
  async function lockItIn() {
    const word = cueInput.trim() || cueWord;
    if (!word) return;
    setXpEarned(15);
    setScreen('done');
    try {
      await apiFetch('/api/user/cue-word', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cueWord: word, cueArousalState: arousal, cueLanguage: language }),
      });
    } catch {}
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const colors = arousal ? AROUSAL_COLORS[arousal] : AROUSAL_COLORS.calm_down;
  const totalRounds = arousal ? BREATH_CONFIG[arousal].rounds : 4;

  const phaseLabel =
    breathPhase === 'in'   ? (hi ? 'सांस लो'    : 'Breathe in')  :
    breathPhase === 'out'  ? (hi ? 'सांस छोड़ो' : 'Breathe out') :
    breathPhase === 'hold' ? (hi ? 'रोको'       : 'Hold')         : '';

  const step2ArjunLine =
    arousal === 'calm_down' ? tb.step2CalmArjun :
    arousal === 'lock_in'   ? tb.step2LockArjun :
    tb.step2FireArjun;

  const focusOptions = FOCUS_OPTIONS[sport] || DEFAULT_FOCUS;
  const vizLines = VIZ_SCRIPTS[sport] || DEFAULT_VIZ;

  const stepNums = { entry: 0, step1: 1, step2: 2, step3: 3, step4: 4, step5: 5, done: 5 };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-dark-900 flex flex-col animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-dark-700">
        <button
          onClick={() => navigate('/reset')}
          aria-label="Exit"
          className="w-9 h-9 flex items-center justify-center text-slt hover:text-ink text-2xl rounded-xl hover:bg-dark-800 transition-colors"
        >
          ×
        </button>
        {screen !== 'entry' && screen !== 'done' ? (
          <span className="text-xs text-slt font-medium tabular-nums">
            {stepNums[screen]} / 5
          </span>
        ) : <span />}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6">

          {/* ── ENTRY ─────────────────────────────────────────────────── */}
          {screen === 'entry' && (
            <div className="flex flex-col gap-8">
              <ArjunBubble>{tb.entryArjun}</ArjunBubble>
              <button
                onClick={() => setScreen('step1')}
                className="self-start px-6 py-3 rounded-2xl text-white font-semibold text-base active:scale-95 transition-transform"
                style={{ background: AROUSAL_COLORS.calm_down.accent }}
              >
                {tb.startBtn}
              </button>
            </div>
          )}

          {/* ── STEP 1 — Arousal calibration ─────────────────────────── */}
          {screen === 'step1' && (
            <div className="flex flex-col gap-6">
              <ArjunBubble>{tb.step1Arjun}</ArjunBubble>
              <div className="flex flex-col gap-3">
                {[
                  { key: 'calm_down', label: tb.calm,   sub: tb.calmSub   },
                  { key: 'lock_in',   label: tb.lockIn,  sub: tb.lockInSub  },
                  { key: 'fire_up',   label: tb.fireUp,  sub: tb.fireUpSub  },
                ].map(({ key, label, sub }) => {
                  const c = AROUSAL_COLORS[key];
                  return (
                    <button
                      key={key}
                      onClick={() => { setArousal(key); setTimeout(() => setScreen('step2'), 200); }}
                      className="flex items-center gap-4 rounded-2xl p-5 text-left active:scale-[0.98] transition-transform border"
                      style={{ background: 'var(--color-dark-800)', borderColor: 'var(--color-dark-600)' }}
                    >
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl"
                        style={{ background: c.light }}
                      >
                        {key === 'calm_down' ? '🌊' : key === 'lock_in' ? '🎯' : '⚡'}
                      </div>
                      <div>
                        <p className="font-bold text-ink text-base" style={{ color: c.accent }}>{label}</p>
                        <p className="text-sm text-slt mt-0.5">{sub}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STEP 2 — Breathing ───────────────────────────────────── */}
          {screen === 'step2' && (
            <div className="flex flex-col gap-6">
              <ArjunBubble>{step2ArjunLine}</ArjunBubble>

              {/* Intro — shown before breathStarted */}
              {!breathStarted && (
                <div className="flex flex-col gap-4">
                  <div
                    className="rounded-2xl p-4 border"
                    style={{ background: colors.light, borderColor: colors.accent + '40' }}
                  >
                    <ul className="flex flex-col gap-2">
                      {tb.step2Cues.map((cue, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-ink">
                          <span style={{ color: colors.accent }}>·</span> {cue}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-slt mt-3">
                      {arousal === 'calm_down'
                        ? (hi ? '4 सेकंड अंदर · 7 रोको · 8 बाहर — 3 राउंड' : '4 in · 7 hold · 8 out — 3 rounds')
                        : arousal === 'lock_in'
                        ? (hi ? '4-4-4-4 box — 4 राउंड' : '4-4-4-4 box — 4 rounds')
                        : (hi ? '4 अंदर · 4 बाहर — 4 राउंड' : '4 in · 4 out — 4 rounds')}
                    </p>
                  </div>
                  <button
                    onClick={() => setBreathStarted(true)}
                    className="self-start px-6 py-3 rounded-2xl text-white font-semibold active:scale-95 transition-transform"
                    style={{ background: colors.accent }}
                  >
                    {tb.step2StartBtn}
                  </button>
                </div>
              )}

              {/* Breathing circle */}
              {breathStarted && (
                <div className="flex flex-col items-center gap-6 py-4">
                  <div className="relative flex items-center justify-center">
                    {/* Outer ring */}
                    <div
                      className="absolute rounded-full"
                      style={{
                        width: '220px', height: '220px',
                        background: colors.light,
                        transform: `scale(${breathScale * 0.92})`,
                        transition: `transform ${breathPhaseDur}s ease-in-out`,
                      }}
                    />
                    {/* Inner circle */}
                    <div
                      className="w-40 h-40 rounded-full flex flex-col items-center justify-center relative z-10"
                      style={{
                        background: colors.accent,
                        transform: `scale(${breathScale})`,
                        transition: `transform ${breathPhaseDur}s ease-in-out`,
                        boxShadow: `0 0 40px ${colors.accent}60`,
                      }}
                    >
                      {breathDone ? (
                        <span className="text-3xl">✓</span>
                      ) : (
                        <>
                          <span className="text-4xl font-bold text-white leading-none">{breathCount}</span>
                          <span className="text-xs font-medium text-white mt-1">{phaseLabel}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Round counter */}
                  {!breathDone && (
                    <p className="text-xs text-slt">
                      {hi ? `राउंड ${breathRound} / ${totalRounds}` : `Round ${breathRound} / ${totalRounds}`}
                    </p>
                  )}

                  {breathDone && (
                    <p className="text-sm text-slt text-center animate-fade-in">{tb.step2DoneMsg}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3 — First focus ─────────────────────────────────── */}
          {screen === 'step3' && (
            <div className="flex flex-col gap-6">
              <ArjunBubble>{tb.step3Arjun}</ArjunBubble>
              <div className="flex flex-col gap-2.5">
                {focusOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setFirstFocus(opt); setTimeout(() => setScreen('step4'), 200); }}
                    className="flex items-center justify-between rounded-2xl px-5 py-4 text-left text-sm font-medium text-ink active:scale-[0.98] transition-all border"
                    style={{
                      background: firstFocus === opt ? colors.light : 'var(--color-dark-800)',
                      borderColor: firstFocus === opt ? colors.accent : 'var(--color-dark-600)',
                      borderLeftWidth: firstFocus === opt ? '4px' : '1px',
                    }}
                  >
                    {opt}
                    {firstFocus === opt && <span style={{ color: colors.accent }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 4 — Visualization ───────────────────────────────── */}
          {screen === 'step4' && (
            <div className="flex flex-col gap-6">
              <ArjunBubble>{tb.step4Arjun}</ArjunBubble>
              <div
                className="rounded-2xl p-5 border"
                style={{ background: colors.light, borderColor: colors.accent + '40' }}
              >
                <div className="flex flex-col gap-3">
                  {vizLines.map((line, i) => (
                    <p key={i} className="text-sm text-ink leading-relaxed">{line}</p>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setScreen('step5')}
                className="self-start px-6 py-3 rounded-2xl text-white font-semibold active:scale-95 transition-transform"
                style={{ background: colors.accent }}
              >
                {tb.step4Confirm}
              </button>
            </div>
          )}

          {/* ── STEP 5 — Cue word ────────────────────────────────────── */}
          {screen === 'step5' && (
            <div className="flex flex-col gap-6">
              <ArjunBubble>{tb.step5Arjun}</ArjunBubble>
              <p className="text-xs text-slt">{tb.step5Sub}</p>

              {/* Word chips */}
              <div className="flex flex-wrap gap-2">
                {cueOptions.map(word => (
                  <button
                    key={word}
                    onClick={() => { setCueWord(word); setCueInput(''); }}
                    className="px-4 py-2.5 rounded-full text-sm font-bold tracking-widest border transition-all active:scale-95"
                    style={{
                      background: cueWord === word ? colors.light : 'var(--color-dark-800)',
                      borderColor: cueWord === word ? colors.accent : 'var(--color-dark-600)',
                      color:       cueWord === word ? colors.accent : 'var(--color-ink)',
                    }}
                  >
                    {word}
                  </button>
                ))}
                {arjunLoading && (
                  <span className="text-xs text-slt self-center animate-pulse">{tb.step5Loading}</span>
                )}
              </div>

              {/* Custom input */}
              <div className="flex flex-col gap-1.5">
                <input
                  value={cueInput}
                  onChange={e => { setCueInput(e.target.value.toUpperCase().slice(0, 12)); setCueWord(''); }}
                  placeholder={tb.step5Placeholder}
                  maxLength={12}
                  className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-ink text-center font-bold tracking-widest w-full focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Selected word preview */}
              {(cueWord || cueInput.trim()) && (
                <div className="text-center py-2">
                  <span
                    className="text-4xl font-extrabold tracking-widest"
                    style={{ color: colors.accent }}
                  >
                    {cueInput.trim() || cueWord}
                  </span>
                </div>
              )}

              <button
                onClick={lockItIn}
                disabled={!cueWord && !cueInput.trim()}
                className="w-full py-3.5 rounded-2xl text-white font-semibold text-base active:scale-[0.98] transition-all disabled:opacity-40"
                style={{ background: colors.accent }}
              >
                {tb.lockInBtn}
              </button>
            </div>
          )}

          {/* ── DONE ─────────────────────────────────────────────────── */}
          {screen === 'done' && (
            <div className="flex flex-col gap-8 animate-fade-in">
              {/* Cue word hero */}
              <div className="flex flex-col items-center gap-2 py-4">
                <p className="text-xs text-slt uppercase tracking-widest">
                  {hi ? 'आज का शब्द' : "Today's word"}
                </p>
                <span
                  className="text-5xl font-extrabold tracking-widest text-center"
                  style={{ color: colors.accent }}
                >
                  {cueInput.trim() || cueWord}
                </span>
                {xpEarned && (
                  <span className="mt-1 text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-3 py-1 rounded-full">
                    {tb.doneXp}
                  </span>
                )}
              </div>

              {/* Arjun message */}
              <ArjunBubble>{tb.doneArjun}</ArjunBubble>

              {/* CTAs */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full py-3.5 rounded-2xl text-white font-semibold text-base active:scale-[0.98] transition-transform"
                  style={{ background: colors.accent }}
                >
                  {tb.letsGo}
                </button>
                <button
                  onClick={() => navigate('/coaching', { state: { sessionType: 'match_prep' } })}
                  className="w-full py-2 text-sm text-slt hover:text-ink transition-colors"
                >
                  {tb.talkArjun}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
