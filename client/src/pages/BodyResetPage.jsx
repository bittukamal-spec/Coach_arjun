import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Wind } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';
import HelplineList from '../components/HelplineList';
import GradientIconTile from '../components/train/GradientIconTile';
import InfoStatCard from '../components/train/InfoStatCard';
import ChecklistCard from '../components/train/ChecklistCard';

const CRISIS_KEYWORDS = [
  'suicide', 'kill myself', 'end my life', 'self harm', 'hurt myself',
  'want to die', 'not worth living', 'मरना', 'खत्म करना', 'खुद को चोट',
  'जीना नहीं', 'मर जाना',
];

function hasCrisis(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some(kw => lower.includes(kw));
}

const TIPS = ['tip1', 'tip2', 'tip3', 'tip4'];

function TensionPicker({ value, onChange, low, high }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted mb-2">
        <span>1 — {low}</span>
        <span>{high} — 10</span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`w-9 h-9 rounded-xl text-sm font-bold transition-all active:scale-95 ${
              value === n
                ? 'bg-brand-500 text-white'
                : 'bg-dark-700 text-slt hover:bg-dark-600'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function BodyResetPage() {
  const navigate = useNavigate();
  const { token, language, user } = useAuth();
  const t = translations[language]?.bodyReset || translations.en.bodyReset;
  const tSkill = translations[language]?.skillPathPressure || translations.en.skillPathPressure;
  const hi = language === 'hi';

  const [screen, setScreen] = useState(1);
  const [showSoftGate, setShowSoftGate] = useState(false);

  // Soft gate: has the athlete passed the Pressure Reset Quick Check?
  useEffect(() => {
    apiFetch('/api/skills/calm_body', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setShowSoftGate(!data?.quickCheckPassedAt))
      .catch(() => setShowSoftGate(false));
  }, [token]);

  // Minimal safety-incident log when a crisis keyword routes to the safety screen
  function reportCrisisEvent() {
    apiFetch('/api/safety/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ surface: 'body_reset', triggerType: 'crisis_keyword' }),
    }).catch(() => {});
  }

  // Feeling / Context
  const [feeling, setFeeling] = useState(null);
  const [feelingCustom, setFeelingCustom] = useState('');
  const [context, setContext] = useState(null);
  const [contextCustom, setContextCustom] = useState('');

  // Mode
  const [mode, setMode] = useState(null);

  // Ratings
  const [tensionBefore, setTensionBefore] = useState(null);
  const [readinessBefore, setReadinessBefore] = useState(null);
  const [tensionAfter, setTensionAfter] = useState(null);
  const [readinessAfter, setReadinessAfter] = useState(null);

  // Focus Word
  const [focusWord, setFocusWord] = useState(null);
  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const cardsFetchedRef = useRef(false);

  // Breathing timer
  const [breathPhase, setBreathPhase] = useState('inhale');
  const [phaseRemaining, setPhaseRemaining] = useState(3);
  const [cycleCount, setCycleCount] = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [breathingDone, setBreathingDone] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const pausedElapsedRef = useRef(0);
  const cyclesCompletedRef = useRef(0);
  const durationSecondsRef = useRef(0);
  // Live phase state in refs so pause/resume continues mid-cycle
  const phaseRef = useRef('inhale');
  const phaseTimeRef = useRef(0);
  const tipIdxRef = useRef(0);

  // Arjun note
  const [arjunNote, setArjunNote] = useState(null);
  const [arjunTags, setArjunTags] = useState([]);
  const [arjunAiModel, setArjunAiModel] = useState(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const cancelledRef = useRef(false);

  // Save
  const [saving, setSaving] = useState(false);

  // ── Protocol params ──────────────────────────────────────────────────────────
  const proto = mode === 'training'
    ? { inhale: 4, exhale: 6, totalSeconds: 180 }
    : { inhale: 3, exhale: 5, cycles: 3 };

  // ── Back navigation ──────────────────────────────────────────────────────────
  function goBack() {
    if (screen === 1) { navigate('/train'); return; }
    if (screen === 'safety') { navigate('/train'); return; }
    // Don't allow back during active breathing
    if (screen === 7 && timerRef.current) return;
    // Screens 2+3 are merged — skip 3 when going back from 4
    if (screen === 4) { setScreen(2); return; }
    if (typeof screen === 'number' && screen > 1) setScreen(s => s - 1);
  }

  // ── Fetch Focus Cards when reaching screen 6 ─────────────────────────────────
  useEffect(() => {
    if (screen !== 6 || cardsFetchedRef.current) return;
    cardsFetchedRef.current = true;
    setCardsLoading(true);
    apiFetch('/api/self-talk/cards?filter=active', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setCards(Array.isArray(data) ? data : []))
      .catch(() => setCards([]))
      .finally(() => setCardsLoading(false));
  }, [screen, token]);

  // ── Breathing timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 7) return;
    startTimer();
    return () => stopTimer();
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // The interval reads phase/cycle/elapsed from refs so it can be stopped and
  // resumed without losing progress.
  function runInterval() {
    stopTimer();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000) + pausedElapsedRef.current;
      durationSecondsRef.current = elapsed;
      setTotalElapsed(elapsed);

      // Rotate tip every 15 seconds
      const newTipIdx = Math.floor(elapsed / 15) % TIPS.length;
      if (newTipIdx !== tipIdxRef.current) { tipIdxRef.current = newTipIdx; setTipIndex(newTipIdx); }

      phaseTimeRef.current -= 1;
      setPhaseRemaining(phaseTimeRef.current);

      if (phaseTimeRef.current <= 0) {
        if (phaseRef.current === 'inhale') {
          phaseRef.current = 'exhale';
          phaseTimeRef.current = proto.exhale;
          setBreathPhase('exhale');
          setPhaseRemaining(phaseTimeRef.current);
        } else {
          cyclesCompletedRef.current += 1;
          setCycleCount(cyclesCompletedRef.current);

          if (mode === 'quick' && cyclesCompletedRef.current >= proto.cycles) {
            stopTimer();
            setBreathingDone(true);
            setScreen(8);
            return;
          }
          if (mode === 'training' && elapsed >= proto.totalSeconds) {
            stopTimer();
            setBreathingDone(true);
            setScreen(8);
            return;
          }
          phaseRef.current = 'inhale';
          phaseTimeRef.current = proto.inhale;
          setBreathPhase('inhale');
          setPhaseRemaining(phaseTimeRef.current);
        }
      }
    }, 1000);
  }

  function startTimer() {
    // Full reset — fresh session start only (not resume)
    setBreathPhase('inhale');
    setPhaseRemaining(proto.inhale);
    setCycleCount(0);
    setTotalElapsed(0);
    setBreathingDone(false);
    setPaused(false);
    cyclesCompletedRef.current = 0;
    durationSecondsRef.current = 0;
    pausedElapsedRef.current = 0;
    phaseRef.current = 'inhale';
    phaseTimeRef.current = proto.inhale;
    tipIdxRef.current = 0;
    startTimeRef.current = Date.now();
    runInterval();
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function togglePause() {
    if (paused) {
      // Resume exactly where we left off — phase, cycles and elapsed live in refs
      startTimeRef.current = Date.now();
      setPaused(false);
      runInterval();
    } else {
      pausedElapsedRef.current = durationSecondsRef.current;
      stopTimer();
      setPaused(true);
    }
  }

  // ── Fetch Arjun note on screen 8 ────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 8) return;
    cancelledRef.current = false;
    setNoteLoading(true);

    apiFetch('/api/body-reset/arjun-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        mode,
        feeling: feeling === 'custom' ? feelingCustom : feeling,
        context: context === 'custom' ? contextCustom : context,
        focusWordUsed: focusWord,
        tensionBefore,
        tensionAfter: null, // not yet rated
        sport: user?.sport || null,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (cancelledRef.current) return;
        setArjunNote(data.arjunNote || 'Good reset. Return to the next action.');
        setArjunTags(Array.isArray(data.tags) ? data.tags : []);
        setArjunAiModel(data.aiModel || null);
      })
      .catch(() => {
        if (cancelledRef.current) return;
        setArjunNote('Good reset. Return to the next action.');
        setArjunTags(['body_reset']);
      })
      .finally(() => { if (!cancelledRef.current) setNoteLoading(false); });

    return () => { cancelledRef.current = true; };
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save session ─────────────────────────────────────────────────────────────
  async function saveSession() {
    setSaving(true);
    try {
      await apiFetch('/api/body-reset/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode,
          feeling:         feeling === 'custom' ? null : feeling,
          feelingCustom:   feeling === 'custom' ? feelingCustom : null,
          context:         context === 'custom' ? null : context,
          contextCustom:   context === 'custom' ? contextCustom : null,
          focusWordUsed:   focusWord,
          tensionBefore,
          readinessBefore,
          tensionAfter,
          readinessAfter,
          cyclesCompleted: cyclesCompletedRef.current,
          durationSeconds: durationSecondsRef.current,
          arjunNote,
          arjunTags,
          aiModel: arjunAiModel,
        }),
      }).then(r => r.json());
      setScreen(11);
    } catch {
      setScreen(11);
    } finally {
      setSaving(false);
    }
  }

  // ── Feeling / Context options ─────────────────────────────────────────────────
  const feelingOpts = [
    { key: t.feeling.opt1, val: 'nervous' },
    { key: t.feeling.opt2, val: 'tense' },
    { key: t.feeling.opt3, val: 'unfocused' },
    { key: t.feeling.opt4, val: 'frustrated' },
    { key: t.feeling.opt5, val: 'overwhelmed' },
    { key: t.feeling.opt6, val: 'tired' },
    { key: t.feeling.opt7, val: 'angry' },
    { key: t.feeling.opt8, val: 'distracted' },
  ];
  const contextOpts = [
    { key: t.context.opt1, val: 'before_match' },
    { key: t.context.opt2, val: 'after_mistake' },
    { key: t.context.opt3, val: 'during_training' },
    { key: t.context.opt4, val: 'injury_worry' },
    { key: t.context.opt5, val: 'selection_pressure' },
    { key: t.context.opt6, val: 'team_conflict' },
    { key: t.context.opt7, val: 'low_confidence' },
    { key: t.context.opt8, val: 'general_stress' },
  ];

  // ── Circle scale for breathing animation ─────────────────────────────────────
  const circleScale = breathPhase === 'inhale' ? 1.25 : 0.85;
  const phaseSeconds = breathPhase === 'inhale' ? proto.inhale : proto.exhale;
  const transitionDuration = `${phaseSeconds}s`;

  // ── Elapsed formatting ────────────────────────────────────────────────────────
  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // ── Tension delta ─────────────────────────────────────────────────────────────
  function tensionDelta() {
    if (tensionBefore == null || tensionAfter == null) return null;
    const diff = tensionBefore - tensionAfter;
    const arrow = diff > 0 ? '↓' : diff < 0 ? '↑' : '→';
    const color = diff > 0 ? 'text-teal-400' : diff < 0 ? 'text-red-400' : 'text-slt';
    return { label: `${tensionBefore} → ${tensionAfter} ${arrow}`, color };
  }

  // ── Shared header with back button ───────────────────────────────────────────
  function Header({ canGoBack = true }) {
    return (
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 sticky top-0 bg-dark-900/95 backdrop-blur z-10">
        {canGoBack && (
          <button onClick={goBack} className="w-9 h-9 flex items-center justify-center rounded-full bg-dark-700 active:scale-95">
            <ArrowLeft size={18} className="text-ink" />
          </button>
        )}
        <h1 className="text-lg font-bold text-ink flex-1">{t.learn.title}</h1>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SAFETY SCREEN
  // ──────────────────────────────────────────────────────────────────────────────
  if (screen === 'safety') {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <div className="px-4 pt-8 pb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center mb-4">
            <span className="text-2xl">🤝</span>
          </div>
          <h1 className="text-xl font-bold text-ink mb-3">{hi ? 'एक पल रुको।' : 'One moment.'}</h1>
          <p className="text-sm text-slt leading-relaxed mb-6">{t.safety.message}</p>
          <div className="mb-8">
            <HelplineList />
          </div>
          <button
            onClick={() => navigate('/train')}
            className="w-full bg-dark-700 text-ink font-semibold py-3.5 rounded-2xl active:scale-95"
          >
            {t.safety.backBtn}
          </button>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SCREEN 1 — Learn
  // ──────────────────────────────────────────────────────────────────────────────
  if (screen === 1) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Header />
        <div className="px-4 pb-24">

          {/* Hero */}
          <div className="flex items-center gap-3 mb-5">
            <GradientIconTile icon={Wind} variant="teal" size={26} />
            <span className="tag-pill" style={{ '--tile-fg': '#2E7D6B', '--tile-bg': 'rgba(46,125,107,0.12)' }}>
              {t.learn.duration}
            </span>
          </div>
          <h2 className="text-2xl font-black text-ink mb-2 leading-tight">{t.learn.desc}</h2>

          {/* Duration / Best for / Goal */}
          <div className="flex gap-2.5 mb-6">
            <InfoStatCard label={hi ? 'समय' : 'Duration'} value={t.learn.duration} />
            <InfoStatCard label={hi ? 'किसके लिए' : 'Best for'} value={hi ? 'घबराया हुआ, तना हुआ' : 'Nervous, tight, or overloaded'} />
            <InfoStatCard label={hi ? 'लक्ष्य' : 'Goal'} value={hi ? 'अगले एक्शन पर वापसी' : 'Return to the next action'} />
          </div>

          <ChecklistCard
            title={hi ? 'क्या उम्मीद करें' : 'What to expect'}
            items={[t.learn.benefit1, t.learn.benefit2, t.learn.benefit3]}
          />

          <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 my-6">
            <p className="text-xs font-bold text-slt uppercase tracking-widest mb-2">{t.learn.educTitle}</p>
            <p className="text-sm text-slt leading-relaxed whitespace-pre-line">{t.learn.educBody}</p>
          </div>

          {showSoftGate && (
            <div className="card-surface p-4 mb-6" style={{ borderColor: 'rgba(46,125,107,0.3)' }}>
              <p className="text-sm text-ink mb-3">{tSkill.softGate.message}</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/skills/pressure-reset')}
                  className="text-sm font-semibold text-white bg-teal-500 px-4 py-2 rounded-xl active:scale-95 transition-transform"
                >
                  {tSkill.softGate.learnFirst}
                </button>
                <button
                  onClick={() => setShowSoftGate(false)}
                  className="text-sm font-medium text-slt active:opacity-70"
                >
                  {tSkill.softGate.startAnyway}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => setScreen(2)}
            className="w-full bg-teal-500 text-white font-bold py-4 rounded-2xl text-base active:scale-[0.98] transition-transform shadow-sm"
          >
            {t.learn.startBtn}
          </button>
          <button
            onClick={() => navigate('/body-reset/history')}
            className="w-full text-center text-xs text-muted font-medium mt-3 active:opacity-70"
          >
            {hi ? 'Reset history देखो →' : 'View history →'}
          </button>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SCREEN 2 — Feeling + Context (merged)
  // ──────────────────────────────────────────────────────────────────────────────
  if (screen === 2) {
    const isFeelingCustom = feeling === 'custom';
    const isContextCustom = context === 'custom';
    const feelingOk = feeling && (feeling !== 'custom' || feelingCustom.trim().length > 0);
    const contextOk = context && (context !== 'custom' || contextCustom.trim().length > 0);
    const canContinue = feelingOk && contextOk;

    function advance() {
      if (!canContinue) return;
      if (isFeelingCustom && hasCrisis(feelingCustom)) { reportCrisisEvent(); setScreen('safety'); return; }
      if (isContextCustom && hasCrisis(contextCustom)) { reportCrisisEvent(); setScreen('safety'); return; }
      setScreen(4);
    }

    return (
      <div className="min-h-screen bg-dark-900">
        <Header />
        <div className="px-4 pb-24">
          <p className="text-xs font-bold text-slt uppercase tracking-widest mb-1">1 / 7</p>

          {/* Feeling question */}
          <h2 className="text-xl font-bold text-ink mb-1">{t.feeling.heading}</h2>
          <p className="text-sm text-slt mb-4">{t.feeling.sub}</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {feelingOpts.map(opt => (
              <button
                key={opt.val}
                onClick={() => setFeeling(opt.val)}
                className={`py-3 px-3 rounded-2xl text-sm font-semibold border transition-all active:scale-95 ${
                  feeling === opt.val
                    ? 'bg-teal-500/15 border-teal-500/60 text-teal-400'
                    : 'bg-dark-800 border-dark-600 text-slt'
                }`}
              >
                {opt.key}
              </button>
            ))}
            <button
              onClick={() => setFeeling('custom')}
              className={`col-span-2 py-2 px-3 rounded-2xl text-sm font-semibold border transition-all active:scale-95 ${
                isFeelingCustom
                  ? 'bg-teal-500/15 border-teal-500/60 text-teal-400'
                  : 'bg-dark-800 border-dark-600 text-slt'
              }`}
            >
              {t.feeling.customLabel}
            </button>
          </div>
          {isFeelingCustom && (
            <textarea
              autoFocus
              value={feelingCustom}
              onChange={e => setFeelingCustom(e.target.value)}
              placeholder={t.feeling.customPlaceholder}
              rows={2}
              className="w-full bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3 text-sm text-ink placeholder-muted resize-none focus:outline-none focus:border-teal-500/60 mb-2"
            />
          )}

          {/* Context question — always visible below */}
          <div className="mt-6 mb-4">
            <h2 className="text-xl font-bold text-ink mb-1">{t.context.heading}</h2>
            <p className="text-sm text-slt mb-4">{t.context.sub}</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {contextOpts.map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setContext(opt.val)}
                  className={`py-3 px-3 rounded-2xl text-sm font-semibold border transition-all active:scale-95 ${
                    context === opt.val
                      ? 'bg-teal-500/15 border-teal-500/60 text-teal-400'
                      : 'bg-dark-800 border-dark-600 text-slt'
                  }`}
                >
                  {opt.key}
                </button>
              ))}
              <button
                onClick={() => setContext('custom')}
                className={`col-span-2 py-2 px-3 rounded-2xl text-sm font-semibold border transition-all active:scale-95 ${
                  isContextCustom
                    ? 'bg-teal-500/15 border-teal-500/60 text-teal-400'
                    : 'bg-dark-800 border-dark-600 text-slt'
                }`}
              >
                {t.context.customLabel}
              </button>
            </div>
            {isContextCustom && (
              <textarea
                value={contextCustom}
                onChange={e => setContextCustom(e.target.value)}
                placeholder={t.context.customPlaceholder}
                rows={2}
                className="w-full bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3 text-sm text-ink placeholder-muted resize-none focus:outline-none focus:border-teal-500/60 mb-2"
              />
            )}
          </div>

          <button
            disabled={!canContinue}
            onClick={advance}
            className="w-full bg-teal-500 text-white font-bold py-4 rounded-2xl text-base active:scale-[0.98] disabled:opacity-40"
          >
            {t.feeling.nextBtn}
          </button>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SCREEN 4 — Choose Mode
  // ──────────────────────────────────────────────────────────────────────────────
  if (screen === 4) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Header />
        <div className="px-4 pb-24">
          <p className="text-xs font-bold text-slt uppercase tracking-widest mb-1">2 / 7</p>
          <h2 className="text-xl font-bold text-ink mb-5">{t.mode.heading}</h2>
          <div className="space-y-3">
            {[
              { key: 'quick', title: t.mode.quickTitle, sub: t.mode.quickSub, detail: t.mode.quickDetail },
              { key: 'training', title: t.mode.trainingTitle, sub: t.mode.trainingSub, detail: t.mode.trainingDetail },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => { setMode(m.key); setScreen(5); }}
                className="w-full text-left bg-dark-800 border border-dark-600 hover:border-teal-500/40 rounded-2xl p-5 transition-all active:scale-[0.98] flex items-center justify-between"
              >
                <div>
                  <p className="text-base font-bold text-ink mb-0.5">{m.title}</p>
                  <p className="text-sm font-semibold text-teal-400 mb-1">{m.sub}</p>
                  <p className="text-xs text-muted">{m.detail}</p>
                </div>
                <ChevronRight size={20} className="text-slt shrink-0 ml-3" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SCREEN 5 — Before Rating
  // ──────────────────────────────────────────────────────────────────────────────
  if (screen === 5) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Header />
        <div className="px-4 pb-24">
          <p className="text-xs font-bold text-slt uppercase tracking-widest mb-1">3 / 7</p>
          <h2 className="text-xl font-bold text-ink mb-5">{t.before.heading}</h2>

          <div className="mb-6">
            <p className="text-sm font-semibold text-ink mb-3">{t.before.tensionLabel}</p>
            <TensionPicker value={tensionBefore} onChange={setTensionBefore} low={t.before.tensionLow} high={t.before.tensionHigh} />
          </div>

          <div className="mb-6">
            <p className="text-sm font-semibold text-ink mb-3">{t.before.readinessLabel}</p>
            <TensionPicker value={readinessBefore} onChange={setReadinessBefore} low={t.before.readinessLow} high={t.before.readinessHigh} />
            {readinessBefore && (
              <button onClick={() => setReadinessBefore(null)} className="text-xs text-muted mt-2 active:opacity-70">
                {t.before.skipLink}
              </button>
            )}
          </div>

          <button
            disabled={!tensionBefore}
            onClick={() => setScreen(6)}
            className="w-full bg-teal-500 text-white font-bold py-4 rounded-2xl text-base active:scale-[0.98] disabled:opacity-40"
          >
            {t.before.nextBtn}
          </button>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SCREEN 6 — Focus Word
  // ──────────────────────────────────────────────────────────────────────────────
  if (screen === 6) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Header />
        <div className="px-4 pb-24">
          <p className="text-xs font-bold text-slt uppercase tracking-widest mb-1">4 / 7</p>
          <h2 className="text-xl font-bold text-ink mb-1">{t.focus.heading}</h2>
          <p className="text-sm text-slt mb-5">{t.focus.sub}</p>

          {cardsLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-7 h-7 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : cards.length === 0 ? (
            <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 mb-4">
              <p className="text-sm text-slt">{t.focus.noCards}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mb-5">
              {cards.map(card => (
                <button
                  key={card.id}
                  onClick={() => setFocusWord(focusWord === card.focusWord ? null : card.focusWord)}
                  className={`px-4 py-2.5 rounded-2xl text-sm font-bold border transition-all active:scale-95 ${
                    focusWord === card.focusWord
                      ? 'bg-teal-500 border-teal-500 text-white'
                      : 'bg-dark-800 border-dark-600 text-slt'
                  }`}
                >
                  {card.focusWord}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setScreen(7)}
            className="w-full bg-teal-500 text-white font-bold py-4 rounded-2xl text-base active:scale-[0.98] mb-3"
          >
            {t.before.nextBtn}
          </button>
          {(cards.length > 0 || cardsLoading === false) && (
            <button onClick={() => { setFocusWord(null); setScreen(7); }} className="w-full text-xs text-muted active:opacity-70 py-1">
              {t.focus.skip}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SCREEN 7 — Breathing
  // ──────────────────────────────────────────────────────────────────────────────
  if (screen === 7) {
    const progress = mode === 'training'
      ? Math.min(totalElapsed / proto.totalSeconds, 1)
      : cycleCount / proto.cycles;

    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <div className="w-9 h-9" />
          <h1 className="text-lg font-bold text-ink flex-1">{t.learn.title}</h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
          {/* Breathing circle */}
          <div className="relative flex items-center justify-center mb-8">
            <div
              className="w-48 h-48 rounded-full bg-teal-500/20 border-2 border-teal-400/40"
              style={{
                transform: `scale(${circleScale})`,
                transition: `transform ${transitionDuration} ease-in-out`,
              }}
            />
            <div className="absolute flex flex-col items-center">
              <p className="text-2xl font-black text-teal-400">{phaseRemaining}</p>
              <p className="text-sm font-semibold text-ink">
                {breathPhase === 'inhale' ? t.breathing.inhale : t.breathing.exhale}
              </p>
            </div>
          </div>

          {/* Focus word */}
          {focusWord && (
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl px-5 py-2 mb-4">
              <p className="text-lg font-black text-teal-400">{focusWord}</p>
            </div>
          )}

          {/* Tip */}
          <p className="text-xs text-muted text-center mb-6 px-8">{t.breathing[TIPS[tipIndex]]}</p>

          {/* Progress */}
          {mode === 'training' ? (
            <div className="text-center mb-4">
              <p className="text-sm font-semibold text-slt">
                {formatTime(totalElapsed)} / {formatTime(proto.totalSeconds)}
              </p>
              <div className="w-48 h-1.5 bg-dark-700 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-teal-400 rounded-full transition-all" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-sm font-semibold text-slt mb-4">
              {t.breathing.cycle} {Math.min(cycleCount + 1, proto.cycles)} {t.breathing.cycleOf} {proto.cycles}
            </p>
          )}

          {/* Pause button (training only) */}
          {mode === 'training' && (
            <button
              onClick={togglePause}
              className="px-6 py-2.5 rounded-2xl bg-dark-700 text-sm font-semibold text-slt active:scale-95"
            >
              {paused ? t.breathing.resumeBtn : t.breathing.pauseBtn}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SCREEN 8 — Arjun Note
  // ──────────────────────────────────────────────────────────────────────────────
  if (screen === 8) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Header canGoBack={false} />
        <div className="px-4 pb-24">
          <p className="text-xs font-bold text-slt uppercase tracking-widest mb-1">5 / 7</p>
          <h2 className="text-xl font-bold text-ink mb-5">{t.note.heading}</h2>

          {noteLoading ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slt">{t.note.loading}</p>
            </div>
          ) : (
            <>
              {focusWord && (
                <div className="inline-flex items-center bg-teal-500/10 border border-teal-500/30 rounded-full px-3 py-1 mb-4">
                  <p className="text-xs font-bold text-teal-400">{focusWord}</p>
                </div>
              )}
              <div className="bg-brand-500/10 border border-brand-500/30 rounded-2xl p-4 mb-6">
                <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest mb-2">
                  {hi ? 'अर्जुन' : 'Arjun'}
                </p>
                <p className="text-sm text-slt leading-relaxed">{arjunNote}</p>
              </div>
              <button
                onClick={() => setScreen(9)}
                className="w-full bg-teal-500 text-white font-bold py-4 rounded-2xl text-base active:scale-[0.98]"
              >
                {t.note.continueBtn}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SCREEN 9 — After Rating
  // ──────────────────────────────────────────────────────────────────────────────
  if (screen === 9) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Header canGoBack={false} />
        <div className="px-4 pb-24">
          <p className="text-xs font-bold text-slt uppercase tracking-widest mb-1">6 / 7</p>
          <h2 className="text-xl font-bold text-ink mb-5">{t.after.heading}</h2>

          <div className="mb-6">
            <p className="text-sm font-semibold text-ink mb-3">{t.after.tensionLabel}</p>
            <TensionPicker value={tensionAfter} onChange={setTensionAfter} low={t.before.tensionLow} high={t.before.tensionHigh} />
          </div>

          <div className="mb-6">
            <p className="text-sm font-semibold text-ink mb-3">{t.after.readinessLabel}</p>
            <TensionPicker value={readinessAfter} onChange={setReadinessAfter} low={t.before.readinessLow} high={t.before.readinessHigh} />
            {readinessAfter && (
              <button onClick={() => setReadinessAfter(null)} className="text-xs text-muted mt-2 active:opacity-70">
                {t.after.skipLink}
              </button>
            )}
          </div>

          <button
            disabled={!tensionAfter}
            onClick={() => setScreen(10)}
            className="w-full bg-teal-500 text-white font-bold py-4 rounded-2xl text-base active:scale-[0.98] disabled:opacity-40"
          >
            {t.after.nextBtn}
          </button>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SCREEN 10 — Reset Card
  // ──────────────────────────────────────────────────────────────────────────────
  if (screen === 10) {
    const delta = tensionDelta();
    const feelingLabel = feeling === 'custom'
      ? feelingCustom
      : feelingOpts.find(o => o.val === feeling)?.key || feeling;
    const contextLabel = context === 'custom'
      ? contextCustom
      : contextOpts.find(o => o.val === context)?.key || context;

    return (
      <div className="min-h-screen bg-dark-900">
        <Header canGoBack={false} />
        <div className="px-4 pb-24">
          <p className="text-xs font-bold text-slt uppercase tracking-widest mb-1">7 / 7</p>
          <h2 className="text-xl font-bold text-ink mb-5">{t.card.heading}</h2>

          <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden mb-6">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-700">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                mode === 'quick' ? 'bg-teal-500/20 text-teal-400' : 'bg-brand-500/20 text-brand-400'
              }`}>
                {mode === 'quick' ? t.card.modeQuick : t.card.modeTraining}
              </span>
            </div>
            <div className="px-4 py-3 space-y-3">
              {feelingLabel && (
                <div>
                  <p className="text-[10px] font-semibold text-slt uppercase tracking-wider mb-0.5">{t.card.feelingLabel}</p>
                  <p className="text-sm text-ink">{feelingLabel}</p>
                </div>
              )}
              {contextLabel && (
                <div>
                  <p className="text-[10px] font-semibold text-slt uppercase tracking-wider mb-0.5">{t.card.contextLabel}</p>
                  <p className="text-sm text-ink">{contextLabel}</p>
                </div>
              )}
              {delta && (
                <div>
                  <p className="text-[10px] font-semibold text-slt uppercase tracking-wider mb-0.5">{t.card.tensionLabel}</p>
                  <p className={`text-sm font-bold ${delta.color}`}>{delta.label}</p>
                </div>
              )}
              {focusWord && (
                <div>
                  <p className="text-[10px] font-semibold text-slt uppercase tracking-wider mb-0.5">{t.card.focusWordLabel}</p>
                  <p className="text-sm font-bold text-teal-400">{focusWord}</p>
                </div>
              )}
            </div>
            {arjunNote && (
              <div className="px-4 py-3 border-t border-dark-700 bg-brand-500/5">
                <p className="text-[10px] font-bold text-brand-400 uppercase tracking-wider mb-1">{t.card.noteLabel}</p>
                <p className="text-sm text-slt leading-relaxed">{arjunNote}</p>
              </div>
            )}
          </div>

          <button
            disabled={saving}
            onClick={saveSession}
            className="w-full bg-teal-500 text-white font-bold py-4 rounded-2xl text-base active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? t.card.saving : t.card.saveBtn}
          </button>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SCREEN 11 — Done
  // ──────────────────────────────────────────────────────────────────────────────
  if (screen === 11) {
    const delta = tensionDelta();
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 pb-8">
        <div className="w-16 h-16 rounded-2xl bg-teal-500/15 flex items-center justify-center mb-4">
          <Wind size={28} className="text-teal-400" />
        </div>
        <h2 className="text-xl font-bold text-ink mb-2 text-center">{t.done.heading}</h2>
        {delta && (
          <p className={`text-base font-bold mb-6 ${delta.color}`}>
            {t.card.tensionLabel}: {delta.label}
          </p>
        )}
        <div className="w-full space-y-3">
          <button
            onClick={() => navigate('/body-reset')}
            className="w-full bg-teal-500 text-white font-bold py-4 rounded-2xl active:scale-[0.98]"
          >
            {t.done.anotherBtn}
          </button>
          <button
            onClick={() => navigate('/body-reset/history')}
            className="w-full bg-dark-700 text-ink font-semibold py-3.5 rounded-2xl active:scale-95"
          >
            {t.done.historyBtn}
          </button>
          <button
            onClick={() => navigate('/train')}
            className="w-full text-sm text-muted py-2 active:opacity-70"
          >
            {t.done.trainBtn}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
