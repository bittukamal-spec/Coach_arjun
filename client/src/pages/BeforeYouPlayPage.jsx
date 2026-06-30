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

// ── Burst game constants ──────────────────────────────────────────────────────
const BURST_TOTAL = 20;

// ── Pure util: pick a random burst circle position ───────────────────────────
function getNextBurstPos(rect, prevPos) {
  const margin = 50;
  const minDist = 80;
  for (let i = 0; i < 20; i++) {
    const x = margin + Math.random() * (rect.width  - margin * 2);
    const y = margin + Math.random() * (rect.height - margin * 2);
    if (!prevPos) return { x, y };
    const dx = x - prevPos.x;
    const dy = y - prevPos.y;
    if (Math.sqrt(dx * dx + dy * dy) >= minDist) return { x, y };
  }
  return { x: rect.width / 2, y: rect.height / 2 };
}

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

  // Step 2 game lifecycle: null | 'playing' | 'arjun'
  const [gamePhase, setGamePhase] = useState(null);

  // Game A — Steady (calm_down) ─────────────────────────────────────────────
  const [steadyActive,   setSteadyActive]   = useState(false);
  const [steadyCount,    setSteadyCount]    = useState(10);
  const [steadyFlash,    setSteadyFlash]    = useState(false);
  const [steadyAgain,    setSteadyAgain]    = useState(false);
  const [steadyComplete, setSteadyComplete] = useState(false);
  const steadyStartPosRef   = useRef(null);
  const steadyTimerRef      = useRef(null);
  const steadyRemainingRef  = useRef(10);
  const steadyActiveRef     = useRef(false);
  const steadyCompleteRef   = useRef(false);

  // Game B — Burst (fire_up) ────────────────────────────────────────────────
  const [burstScore,    setBurstScore]    = useState(0);
  const [burstPos,      setBurstPos]      = useState({ x: 0, y: 0 });
  const [burstComplete, setBurstComplete] = useState(false);
  const burstPrevPosRef = useRef(null);
  const burstAreaRef    = useRef(null);

  // Game C — Track (lock_in) ────────────────────────────────────────────────
  const [trackOnTarget,  setTrackOnTarget]  = useState(false);
  const [trackProgress,  setTrackProgress]  = useState(0);
  const [trackComplete,  setTrackComplete]  = useState(false);
  const [reducedMotion]  = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const trackContainerRef = useRef(null);
  const trackCircleRef    = useRef(null);
  const trackRafRef       = useRef(null);
  const trackStartTimeRef = useRef(null);
  const trackFingerPosRef = useRef(null);
  const trackOnTargetRef  = useRef(false);

  // Step 3
  const [firstFocus, setFirstFocus] = useState(null);

  // Step 5
  const [cueOptions,   setCueOptions]   = useState([]);
  const [cueWord,      setCueWord]      = useState('');
  const [cueInput,     setCueInput]     = useState('');
  const [arjunLoading, setArjunLoading] = useState(false);

  // Done
  const [xpEarned, setXpEarned] = useState(null);

  // ── Haptic ────────────────────────────────────────────────────────────────
  function haptic(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern || 40); } catch {}
  }

  // ── gamePhase 'arjun' → advance to step3 after 2s ────────────────────────
  useEffect(() => {
    if (gamePhase !== 'arjun') return;
    const id = setTimeout(() => setScreen('step3'), 2000);
    return () => clearTimeout(id);
  }, [gamePhase]);

  // ── Reset all game state when step2 is entered ───────────────────────────
  useEffect(() => {
    if (screen !== 'step2') return;
    setGamePhase('playing');
    // Steady
    setSteadyActive(false);
    setSteadyCount(10);
    setSteadyAgain(false);
    setSteadyFlash(false);
    setSteadyComplete(false);
    steadyRemainingRef.current  = 10;
    steadyActiveRef.current     = false;
    steadyCompleteRef.current   = false;
    clearTimeout(steadyTimerRef.current);
    // Burst
    setBurstScore(0);
    setBurstComplete(false);
    setBurstPos({ x: 0, y: 0 });
    burstPrevPosRef.current = null;
    // Track
    setTrackOnTarget(false);
    setTrackProgress(0);
    setTrackComplete(false);
    trackStartTimeRef.current = null;
    trackFingerPosRef.current = null;
    trackOnTargetRef.current  = false;
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Burst: place initial circle after layout ──────────────────────────────
  useEffect(() => {
    if (screen !== 'step2' || arousal !== 'fire_up') return;
    const id = setTimeout(() => {
      if (!burstAreaRef.current) return;
      const rect = burstAreaRef.current.getBoundingClientRect();
      if (rect.width === 0) return;
      const pos = getNextBurstPos(rect, null);
      setBurstPos(pos);
      burstPrevPosRef.current = pos;
    }, 50);
    return () => clearTimeout(id);
  }, [screen, arousal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Track: non-passive touchmove (needed for e.preventDefault) ───────────
  useEffect(() => {
    if (screen !== 'step2' || arousal !== 'lock_in') return;
    const el = trackContainerRef.current;
    if (!el) return;
    function onMove(e) {
      e.preventDefault();
      if (e.touches.length > 0)
        trackFingerPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, [screen, arousal]);

  // ── Track: requestAnimationFrame Lissajous loop ───────────────────────────
  useEffect(() => {
    if (screen !== 'step2' || arousal !== 'lock_in' || gamePhase !== 'playing') return;
    let active = true;
    const BASE_PERIOD = 8; // seconds per x-axis cycle

    function loop(ts) {
      if (!active) return;
      if (!trackStartTimeRef.current) trackStartTimeRef.current = ts;
      const elapsed = ts - trackStartTimeRef.current;
      const t = elapsed / 1000;

      const container = trackContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const w = rect.width  || 280;
        const h = rect.height || 280;
        const cx = w / 2, cy = h / 2;
        const ampX = w * 0.35;
        const ampY = h * 0.30;

        let x, y;
        if (reducedMotion) {
          x = cx + ampX * Math.sin((2 * Math.PI * t) / BASE_PERIOD);
          y = cy;
        } else {
          x = cx + ampX * Math.sin((2 * Math.PI * t) / BASE_PERIOD);
          y = cy + ampY * Math.sin((2 * Math.PI * 1.3 * t) / BASE_PERIOD + Math.PI / 2);
        }

        // Move circle via DOM — bypasses React for position updates
        if (trackCircleRef.current) {
          trackCircleRef.current.style.left = `${x - 24}px`;
          trackCircleRef.current.style.top  = `${y - 24}px`;
        }

        // On-target detection
        const fp = trackFingerPosRef.current;
        if (fp) {
          const dx = fp.x - (rect.left + x);
          const dy = fp.y - (rect.top  + y);
          const onTarget = Math.sqrt(dx * dx + dy * dy) < 36;
          if (onTarget !== trackOnTargetRef.current) {
            trackOnTargetRef.current = onTarget;
            setTrackOnTarget(onTarget);
          }
        } else if (trackOnTargetRef.current) {
          trackOnTargetRef.current = false;
          setTrackOnTarget(false);
        }
      }

      const progress = Math.min(elapsed / 20000, 1);
      setTrackProgress(progress);

      if (progress >= 1) {
        setTrackComplete(true);
        setGamePhase('arjun');
        haptic([50, 50, 100]);
        return;
      }
      trackRafRef.current = requestAnimationFrame(loop);
    }

    trackRafRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      if (trackRafRef.current) cancelAnimationFrame(trackRafRef.current);
      trackStartTimeRef.current = null;
    };
  }, [screen, arousal, gamePhase, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Steady: global listeners while finger is down ─────────────────────────
  useEffect(() => {
    if (!steadyActive || steadyComplete) return;

    function handleMove(e) {
      if (!steadyActiveRef.current || steadyCompleteRef.current) return;
      e.preventDefault();
      const pt = e.touches ? e.touches[0] : e;
      const dx = pt.clientX - steadyStartPosRef.current.x;
      const dy = pt.clientY - steadyStartPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 8) {
        clearTimeout(steadyTimerRef.current);
        steadyRemainingRef.current = 10;
        setSteadyCount(10);
        setSteadyAgain(true);
        setSteadyFlash(true);
        setTimeout(() => setSteadyFlash(false), 200);
        steadyStartPosRef.current = { x: pt.clientX, y: pt.clientY };
        startSteadyCountdown();
      }
    }

    function handleEnd() {
      if (steadyCompleteRef.current) return;
      steadyActiveRef.current = false;
      setSteadyActive(false);
      clearTimeout(steadyTimerRef.current);
      steadyRemainingRef.current = 10;
      setSteadyCount(10);
    }

    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchend',  handleEnd);
    window.addEventListener('mouseup',   handleEnd);
    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchend',  handleEnd);
      window.removeEventListener('mouseup',   handleEnd);
    };
  }, [steadyActive, steadyComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Steady helpers ────────────────────────────────────────────────────────
  function startSteadyCountdown() {
    clearTimeout(steadyTimerRef.current);
    function tick() {
      if (!steadyActiveRef.current || steadyCompleteRef.current) return;
      steadyRemainingRef.current--;
      if (steadyRemainingRef.current <= 0) {
        steadyCompleteRef.current = true;
        setSteadyComplete(true);
        haptic([100, 50, 100]);
        setGamePhase('arjun');
      } else {
        setSteadyCount(steadyRemainingRef.current);
        steadyTimerRef.current = setTimeout(tick, 1000);
      }
    }
    steadyTimerRef.current = setTimeout(tick, 1000);
  }

  function onSteadyPress(e) {
    if (steadyCompleteRef.current) return;
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    steadyStartPosRef.current  = { x: pt.clientX, y: pt.clientY };
    steadyActiveRef.current    = true;
    setSteadyActive(true);
    setSteadyAgain(false);
    steadyRemainingRef.current = 10;
    setSteadyCount(10);
    startSteadyCountdown();
  }

  // ── Burst helper ──────────────────────────────────────────────────────────
  function onBurstTap(e) {
    e.stopPropagation();
    if (burstComplete) return;
    haptic();
    const newScore = burstScore + 1;
    setBurstScore(newScore);
    if (newScore >= BURST_TOTAL) {
      setBurstComplete(true);
      haptic([50, 30, 50, 30, 100]);
      setGamePhase('arjun');
      return;
    }
    if (burstAreaRef.current) {
      const rect = burstAreaRef.current.getBoundingClientRect();
      const nextPos = getNextBurstPos(rect, burstPrevPosRef.current);
      burstPrevPosRef.current = nextPos;
      setBurstPos(nextPos);
    }
  }

  // ── Step 5 — fetch AI cue word options ───────────────────────────────────
  useEffect(() => {
    if (screen !== 'step5' || !arousal) return;
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
  const colors      = arousal ? AROUSAL_COLORS[arousal] : AROUSAL_COLORS.calm_down;
  const focusOptions = FOCUS_OPTIONS[sport] || DEFAULT_FOCUS;
  const vizLines    = VIZ_SCRIPTS[sport] || DEFAULT_VIZ;
  const stepNums    = { entry: 0, step1: 1, step2: 2, step3: 3, step4: 4, step5: 5, done: 5 };
  const s2          = tb.step2;

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

          {/* ── STEP 2 — GAME A: Steady (calm_down) ──────────────────── */}
          {screen === 'step2' && arousal === 'calm_down' && (
            <div className="flex flex-col gap-6">
              {gamePhase === 'arjun' ? (
                <ArjunBubble>{s2.calm.arjun}</ArjunBubble>
              ) : (
                <>
                  <p className="text-lg font-bold text-ink">{s2.calm.label}</p>
                  <p className="text-sm text-slt">{s2.calm.instruction}</p>
                  <div className="flex flex-col items-center gap-3 py-4">
                    {/* Countdown above the circle — always visible even with finger on it */}
                    <div className="h-20 flex flex-col items-center justify-center">
                      {steadyComplete ? (
                        <span className="text-5xl" style={{ color: colors.accent }}>✓</span>
                      ) : steadyActive ? (
                        <span className="text-6xl font-bold tabular-nums leading-none" style={{ color: colors.accent }}>
                          {steadyCount}
                        </span>
                      ) : (
                        <span className="text-sm text-slt text-center">{s2.calm.touch}</span>
                      )}
                      {steadyAgain && !steadyComplete && (
                        <p className="text-xs mt-1" style={{ color: colors.accent }}>{s2.calm.again}</p>
                      )}
                    </div>
                    {/* Circle — touch target only, no text inside */}
                    <div
                      onTouchStart={onSteadyPress}
                      onMouseDown={onSteadyPress}
                      className="rounded-full"
                      style={{
                        width: '150px',
                        height: '150px',
                        background: steadyComplete
                          ? colors.accent
                          : steadyActive
                          ? `${colors.accent}cc`
                          : colors.light,
                        border: `3px solid ${colors.accent}`,
                        boxShadow: steadyFlash
                          ? `0 0 0 30px ${colors.accent}20, 0 0 50px ${colors.accent}40`
                          : steadyActive
                          ? `0 0 24px ${colors.accent}50`
                          : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.2s, box-shadow 0.15s',
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── STEP 2 — GAME B: Burst (fire_up) ─────────────────────── */}
          {screen === 'step2' && arousal === 'fire_up' && (
            <div className="flex flex-col gap-4">
              {gamePhase === 'arjun' ? (
                <ArjunBubble>{s2.fire.arjun}</ArjunBubble>
              ) : (
                <>
                  <p className="text-lg font-bold text-ink">{s2.fire.label}</p>
                  <p className="text-sm text-slt">{s2.fire.instruction}</p>
                  {/* Progress strip */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slt tabular-nums shrink-0">
                      {burstScore} / {BURST_TOTAL}
                    </span>
                    <div className="flex-1 h-1 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(burstScore / BURST_TOTAL) * 100}%`,
                          background: colors.accent,
                          transition: 'width 0.08s',
                        }}
                      />
                    </div>
                  </div>
                  {/* Game area */}
                  <style>{`@keyframes scaleIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
                  <div
                    ref={burstAreaRef}
                    className="relative w-full"
                    style={{ height: '320px' }}
                  >
                    {!burstComplete && burstPos.x > 0 && (
                      <button
                        key={burstScore}
                        onTouchStart={e => { e.preventDefault(); onBurstTap(e); }}
                        onClick={onBurstTap}
                        className="absolute rounded-full"
                        style={{
                          width: '72px',
                          height: '72px',
                          left: `${burstPos.x - 36}px`,
                          top:  `${burstPos.y - 36}px`,
                          background: colors.accent,
                          animation: 'scaleIn 0.12s ease-out forwards',
                          boxShadow: `0 0 20px ${colors.accent}60`,
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      />
                    )}
                    {burstComplete && (
                      <div className="absolute inset-0 flex items-center justify-center animate-fade-in">
                        <span className="text-2xl font-bold" style={{ color: colors.accent }}>
                          {s2.fire.on}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── STEP 2 — GAME C: Track (lock_in) ─────────────────────── */}
          {screen === 'step2' && arousal === 'lock_in' && (
            <div className="flex flex-col gap-4">
              {gamePhase === 'arjun' ? (
                <ArjunBubble>{s2.lock.arjun}</ArjunBubble>
              ) : (
                <>
                  <p className="text-lg font-bold text-ink">{s2.lock.label}</p>
                  <p className="text-sm text-slt">{s2.lock.instruction}</p>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${trackProgress * 100}%`,
                        background: colors.accent,
                      }}
                    />
                  </div>
                  {/* Game area */}
                  <div
                    ref={trackContainerRef}
                    className="relative w-full select-none"
                    style={{ height: '280px', touchAction: 'none', cursor: 'crosshair' }}
                    onTouchStart={e => {
                      if (e.touches.length > 0)
                        trackFingerPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                    }}
                    onTouchEnd={() => {
                      trackFingerPosRef.current = null;
                      if (trackOnTargetRef.current) {
                        trackOnTargetRef.current = false;
                        setTrackOnTarget(false);
                      }
                    }}
                    onMouseDown={e => {
                      trackFingerPosRef.current = { x: e.clientX, y: e.clientY };
                    }}
                    onMouseMove={e => {
                      if (e.buttons > 0) {
                        trackFingerPosRef.current = { x: e.clientX, y: e.clientY };
                      } else {
                        trackFingerPosRef.current = null;
                        if (trackOnTargetRef.current) {
                          trackOnTargetRef.current = false;
                          setTrackOnTarget(false);
                        }
                      }
                    }}
                    onMouseUp={() => {
                      trackFingerPosRef.current = null;
                      if (trackOnTargetRef.current) {
                        trackOnTargetRef.current = false;
                        setTrackOnTarget(false);
                      }
                    }}
                    onMouseLeave={() => {
                      trackFingerPosRef.current = null;
                      if (trackOnTargetRef.current) {
                        trackOnTargetRef.current = false;
                        setTrackOnTarget(false);
                      }
                    }}
                  >
                    <div
                      ref={trackCircleRef}
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: '48px',
                        height: '48px',
                        left: 'calc(50% - 24px)',
                        top:  'calc(50% - 24px)',
                        background: trackOnTarget ? colors.accent : 'transparent',
                        border: `3px solid ${colors.accent}`,
                        boxShadow: trackOnTarget
                          ? `0 0 24px ${colors.accent}90`
                          : `0 0 8px  ${colors.accent}30`,
                        transition: 'background 0.1s, box-shadow 0.1s',
                      }}
                    />
                    {trackComplete && (
                      <div className="absolute inset-0 flex items-center justify-center animate-fade-in">
                        <span className="text-2xl font-bold" style={{ color: colors.accent }}>✓</span>
                      </div>
                    )}
                  </div>
                </>
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
                  onClick={() => navigate('/train')}
                  className="w-full py-3.5 rounded-2xl text-white font-semibold text-base active:scale-[0.98] transition-transform"
                  style={{ background: colors.accent }}
                >
                  {tb.letsGo}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
