import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { PracticeHeader, PracticeIntro, PracticeScreen } from '../components/practice/PracticeShell';

// ── Self-abuse keyword guard ──────────────────────────────────────────────────
const ABUSE_WORDS = ['stupid', 'idiot', 'useless', 'pathetic', 'worthless', 'loser', 'failure', 'terrible', 'worst', 'hate myself'];
function hasSelfAbuse(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return ABUSE_WORDS.some(w => lower.includes(w));
}

// ── Chip component ────────────────────────────────────────────────────────────
function Chip({ label, selected, onClick, fullWidth, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'rounded-2xl px-4 py-2.5 text-sm font-medium border transition-colors text-left',
        fullWidth ? 'w-full' : '',
        disabled && !selected ? 'opacity-40 cursor-not-allowed' : '',
        selected
          ? 'bg-brand-500 border-brand-500 text-white'
          : 'bg-dark-800 border-dark-600 text-ink hover:border-brand-400',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── Arjun speech bubble ───────────────────────────────────────────────────────
function ArjunBubble({ children }) {
  return (
    <div className="bg-dark-800 border-l-4 border-brand-500 rounded-2xl px-4 py-3 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🏹</span>
        <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide">Arjun</p>
      </div>
      <p className="text-sm text-ink leading-relaxed">{children}</p>
    </div>
  );
}

// ── Loading dots ──────────────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-brand-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
// Flow: intro → entry (mode pick, or today's review if already done) →
// s1..s5 → done. Intro and wizard-step chrome come from the shared
// PracticeShell (Stage 6/7); entry and done keep their existing richer,
// scrollable layouts (result cards, collapsible history, bottom sheet) —
// same reasoning Stage 7 used for Pressure Reset's breathing screen — but
// reuse the shell's PracticeHeader for a consistent header bar. Submission
// payload, arjunInsight generation/display, self-abuse handling, and
// prescription-completion linkage are all unchanged from before this
// migration — only the chrome around the flow changes.
export default function DebriefPage() {
  const { token, language, user, updateUser } = useAuth();
  const t  = translations[language].atm;
  const hi = language === 'hi';
  const navigate = useNavigate();
  const location = useLocation();

  // Carries the exact prescriptionId + practiceKey when this reflection was
  // launched from a prescribed Mental Rep card (PR-12) — same ephemeral
  // route-state mechanism as BodyResetPage/ChatPage. Generic (non-
  // prescribed) debriefs simply have no state here, and behave exactly as
  // before.
  const prescriptionLinkRef = useRef(
    location.state?.prescriptionId && location.state?.practiceKey === 'post_performance_reflection'
      ? { prescriptionId: location.state.prescriptionId, practiceKey: location.state.practiceKey }
      : null
  );

  // ── State ─────────────────────────────────────────────────────────────────
  const [showInfo,        setShowInfo]        = useState(true);
  const [screen,          setScreen]          = useState('entry');  // 'entry'|'s1'|'s2'|'s3'|'s4'|'s5'|'done'
  const [mode,            setMode]            = useState(null);     // 'quick'|'full'
  const [eventType,       setEventType]       = useState(null);
  const [resultType,      setResultType]      = useState(null);
  const [wentWellChips,   setWentWellChips]   = useState([]);
  const [wentWellText,    setWentWellText]    = useState('');
  const [wouldChange,     setWouldChange]     = useState([]);       // multi-select array (max 3)
  const [wouldChangeText, setWouldChangeText] = useState('');
  const [selfAbuse,       setSelfAbuse]       = useState(false);
  const [nextFocus,       setNextFocus]       = useState(null);
  const [cueWordFeedback, setCueWordFeedback] = useState(null);
  const [submitting,      setSubmitting]      = useState(false);
  const [result,          setResult]          = useState(null);
  const [showXp,          setShowXp]          = useState(false);
  const [historyOpen,     setHistoryOpen]     = useState(false);
  const [sheetEntry,      setSheetEntry]      = useState(null);     // entry for bottom-sheet popup
  const [apiError,        setApiError]        = useState('');
  const [todayDebrief,    setTodayDebrief]    = useState(null);     // today's existing review (if any)
  const [loadingToday,    setLoadingToday]    = useState(true);

  const submitCalled = useRef(false);

  // ── Check for today's debrief on mount ────────────────────────────────────
  useEffect(() => {
    async function checkToday() {
      try {
        const res = await apiFetch('/api/debrief', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.todayDebrief) setTodayDebrief(data.todayDebrief);
        }
      } catch { /* ignore */ }
      setLoadingToday(false);
    }
    checkToday();
  }, [token]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const showCueScreen = mode === 'full' && !!user?.cueWord;
  const totalScreens  = showCueScreen ? 6 : 5;
  const screenIndex   = { entry: 0, s1: 1, s2: 2, s3: 3, s4: 4, s5: 5, done: totalScreens }[screen] ?? 0;

  // ── Auto-advance s1 when both chips picked ────────────────────────────────
  useEffect(() => {
    if (screen !== 's1') return;
    if (!eventType || !resultType) return;
    const tid = setTimeout(() => setScreen('s2'), 500);
    return () => clearTimeout(tid);
  }, [screen, eventType, resultType]);

  // ── Auto-submit when reaching done screen ────────────────────────────────
  useEffect(() => {
    if (screen !== 'done') return;
    if (submitting || result || submitCalled.current) return;
    submitCalled.current = true;
    submitDebrief();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // ── Show XP badge after result arrives ───────────────────────────────────
  useEffect(() => {
    if (!result) return;
    const tid = setTimeout(() => setShowXp(true), 600);
    return () => clearTimeout(tid);
  }, [result]);

  // Fire-and-forget exact prescription completion (PR-12) — only when this
  // reflection was genuinely launched from a prescribed
  // post_performance_reflection card. Never awaited: a failed/slow linkage
  // request must never delay or block the athlete from seeing their result.
  function completePrescriptionLink() {
    const link = prescriptionLinkRef.current;
    if (!link) return;
    apiFetch(`/api/prescriptions/${link.prescriptionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ practiceKey: link.practiceKey }),
    }).catch(() => {});
  }

  // ── API call ──────────────────────────────────────────────────────────────
  async function submitDebrief() {
    setSubmitting(true);
    setApiError('');
    try {
      const payload = {
        mode,
        eventType,
        resultType,
        wentWellChips,
        wentWellText:    wentWellText.trim() || undefined,
        wouldChange:     wouldChange.join(' / '),   // join multi-select array
        wouldChangeText: wouldChangeText.trim() || undefined,
        nextFocus,
        cueWordFeedback: cueWordFeedback || undefined,
      };
      const res = await apiFetch('/api/debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        // Already done today — fetch the existing review and show it
        const data = await res.json();
        setApiError('');
        const getRes = await apiFetch('/api/debrief', { headers: { Authorization: `Bearer ${token}` } });
        if (getRes.ok) {
          const getData = await getRes.json();
          if (getData.todayDebrief) setTodayDebrief(getData.todayDebrief);
        }
        setScreen('entry');
        return;
      }
      if (!res.ok) { setApiError('Could not save. Try again.'); return; }
      const data = await res.json();
      completePrescriptionLink();
      setResult(data);
      if (updateUser && data.xp !== undefined) updateUser({ xp: data.xp });
    } catch {
      setApiError('Could not save. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Sport-specific focus chips ────────────────────────────────────────────
  function getFocusChips() {
    const sport = user?.sport?.toLowerCase() || 'default';
    const map = t.screen4.sports;
    return map[sport] || map.default;
  }

  // ── goBack helper ─────────────────────────────────────────────────────────
  function goBack() {
    if (screen === 'entry') {
      navigate('/train');
    } else if (screen === 's1') {
      setScreen('entry');
    } else if (screen === 's2') {
      // Reset s1 selections so auto-advance doesn't fire on return
      setEventType(null);
      setResultType(null);
      setScreen('s1');
    } else if (screen === 's3') {
      setScreen('s2');
    } else if (screen === 's4') {
      setScreen('s3');
    } else if (screen === 's5') {
      setNextFocus(null);
      setScreen('s4');
    }
  }

  // ── Toggle wentWell chip (unlimited) ─────────────────────────────────────
  function toggleWentWell(chip) {
    setWentWellChips(prev =>
      prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]
    );
  }

  // ── Toggle wouldChange chip (max 3) ───────────────────────────────────────
  function toggleWouldChange(chip) {
    setWouldChange(prev => {
      if (prev.includes(chip)) return prev.filter(c => c !== chip);
      if (prev.length >= 3) return prev;
      return [...prev, chip];
    });
  }

  const headerTitle = t.intro.title;
  const progressFor = step => `${Math.round((step / totalScreens) * 100)}%`;

  // ═══════════════════════════════════════════════════════════════════════════
  // INFO / INTRO SCREEN — shared shell
  // ═══════════════════════════════════════════════════════════════════════════
  if (showInfo) {
    return (
      <PracticeIntro
        onBack={() => navigate('/train')}
        headerTitle={headerTitle}
        icon={ClipboardList}
        variant="amber"
        tag={hi ? 'मैच के बाद' : 'After match'}
        title={t.intro.title}
        desc={t.intro.desc}
        stats={[
          { label: hi ? 'समय' : 'Duration', value: t.intro.duration },
        ]}
        checklist={{
          title: hi ? 'क्या उम्मीद करें' : 'What to expect',
          items: t.intro.benefits,
        }}
        onStart={() => setShowInfo(false)}
        startLabel={t.intro.start}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTRY SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'entry') {
    const ad = t.entry.alreadyDone;

    // Loading state while checking today's debrief
    if (loadingToday) {
      return (
        <div className="min-h-screen bg-dark-900 flex items-center justify-center">
          <LoadingDots />
        </div>
      );
    }

    // Already done today — show existing review
    if (todayDebrief) {
      return (
        <div className="min-h-screen bg-dark-900 flex flex-col pb-6">
          <PracticeHeader onBack={() => navigate('/train')} title={headerTitle} />

          <main className="flex-1 max-w-lg mx-auto w-full px-4 py-10">
            {/* Done badge */}
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-ink mb-1">{ad.title}</h2>
              <p className="text-sm text-slt">{ad.sub}</p>
            </div>

            {/* Today's Arjun review */}
            {todayDebrief.arjunInsight && (
              <div className="bg-dark-800 border border-brand-500/30 rounded-2xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-sm">🏹</div>
                  <div>
                    <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide">{hi ? "अर्जुन का रिव्यू" : "Arjun's review"}</p>
                    {todayDebrief.eventType && (
                      <p className="text-[10px] text-slt">{todayDebrief.eventType}{todayDebrief.resultType ? ` · ${todayDebrief.resultType}` : ''}</p>
                    )}
                  </div>
                </div>
                <p className="text-sm text-ink leading-relaxed">{todayDebrief.arjunInsight}</p>
              </div>
            )}

            {/* Next focus */}
            {todayDebrief.nextFocus && (
              <div className="bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3 mb-6">
                <p className="text-xs text-slt mb-1">{hi ? 'अगली बार फोकस:' : 'Next focus:'}</p>
                <p className="text-base font-bold text-ink">{todayDebrief.nextFocus}</p>
              </div>
            )}

            {/* CTAs */}
            <div className="flex flex-col gap-3">
              <button onClick={() => navigate('/train')} className="btn-primary justify-center">
                {ad.back}
              </button>
            </div>
          </main>
        </div>
      );
    }

    // Normal entry — pick mode
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col pb-6">
        <PracticeHeader onBack={() => navigate('/train')} title={headerTitle} />

        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
          <h2 className="text-2xl font-black text-ink mb-5 leading-tight">{t.entry.prompt}</h2>

          <div className="flex flex-col gap-3">
            {[
              { key: 'quick', ...t.entry.quick },
              { key: 'full',  ...t.entry.full  },
            ].map(({ key, title, sub }) => (
              <button
                key={key}
                onClick={() => { setMode(key); setScreen('s1'); }}
                className="card-elevated hover:border-brand-400 px-5 py-4 text-left transition-colors active:scale-[0.98]"
              >
                <p className="font-bold text-ink mb-0.5">{title}</p>
                <p className="text-sm text-slt">{sub}</p>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — Event + Result
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 's1') {
    return (
      <PracticeScreen onBack={goBack} headerTitle={headerTitle} progress={progressFor(1)}>
        <p className="text-xs font-bold text-slt uppercase tracking-widest mb-4">1 / {totalScreens}</p>
        <h2 className="text-lg font-bold text-ink mb-4 text-center">{t.screen1.promptA}</h2>
        <div className="flex flex-wrap gap-2 mb-7">
          {t.screen1.events.map(ev => (
            <Chip key={ev} label={ev} selected={eventType === ev} onClick={() => setEventType(ev)} />
          ))}
        </div>

        <h2 className="text-lg font-bold text-ink mb-4 text-center">{t.screen1.promptB}</h2>
        <div className="flex flex-col gap-2">
          {t.screen1.results.map(r => (
            <Chip key={r} label={r} selected={resultType === r} onClick={() => setResultType(r)} fullWidth />
          ))}
        </div>

        {eventType && resultType && (
          <p className="text-xs text-slt text-center mt-6 animate-fade-in">
            {hi ? 'आगे बढ़ रहे हैं…' : 'Moving on…'}
          </p>
        )}
      </PracticeScreen>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — What went well (chips + optional text)
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 's2') {
    const canNext = wentWellChips.length > 0;
    return (
      <PracticeScreen onBack={goBack} headerTitle={headerTitle} progress={progressFor(2)}>
        <p className="text-xs font-bold text-slt uppercase tracking-widest mb-4">2 / {totalScreens}</p>
        <h2 className="text-lg font-bold text-ink mb-1 text-center">{t.screen2.prompt}</h2>
        <p className="text-sm text-slt mb-5 text-center">{t.screen2.sub}</p>

        <div className="flex flex-wrap gap-2 mb-5">
          {t.screen2.chips.map(chip => (
            <Chip key={chip} label={chip} selected={wentWellChips.includes(chip)} onClick={() => toggleWentWell(chip)} />
          ))}
        </div>

        {mode === 'full' && (
          <textarea
            value={wentWellText}
            onChange={e => setWentWellText(e.target.value)}
            placeholder={t.screen2.placeholder}
            maxLength={120}
            rows={2}
            className="w-full bg-dark-700 border border-dark-500 text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-slt resize-none mb-6"
          />
        )}

        <button
          onClick={() => setScreen('s3')}
          disabled={!canNext}
          className="btn-primary w-full justify-center py-4 text-base disabled:opacity-40"
        >
          {hi ? 'आगे →' : 'Next →'}
        </button>
      </PracticeScreen>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 3 — What would you change (multi-select, max 3)
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 's3') {
    const canNext = wouldChange.length > 0;
    const atMax   = wouldChange.length >= 3;
    return (
      <PracticeScreen onBack={goBack} headerTitle={headerTitle} progress={progressFor(3)}>
        <p className="text-xs font-bold text-slt uppercase tracking-widest mb-4">3 / {totalScreens}</p>
        <h2 className="text-lg font-bold text-ink mb-1 text-center">{t.screen3.prompt}</h2>
        <div className="flex items-center justify-center gap-2 mb-5">
          <p className="text-sm text-slt">{t.screen3.sub}</p>
          {atMax && (
            <span className="text-xs bg-brand-500/20 text-brand-400 border border-brand-500/30 px-2 py-0.5 rounded-full shrink-0">
              {hi ? 'अधिकतम' : 'Max 3'}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 mb-5">
          {t.screen3.chips.map(chip => (
            <Chip
              key={chip}
              label={chip}
              selected={wouldChange.includes(chip)}
              onClick={() => toggleWouldChange(chip)}
              disabled={atMax && !wouldChange.includes(chip)}
              fullWidth
            />
          ))}
        </div>

        {mode === 'full' && (
          <>
            <textarea
              value={wouldChangeText}
              onChange={e => {
                setWouldChangeText(e.target.value);
                setSelfAbuse(hasSelfAbuse(e.target.value));
              }}
              onBlur={() => setSelfAbuse(hasSelfAbuse(wouldChangeText))}
              placeholder={t.screen3.placeholder}
              maxLength={120}
              rows={2}
              className="w-full bg-dark-700 border border-dark-500 text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-slt resize-none"
            />
            {selfAbuse && (
              <>
                <p className="text-xs text-amber-400 mt-2 px-1">{t.screen3.selfAbuse.warning}</p>
                <p className="text-xs text-slt mt-1 px-1 mb-4">{t.screen3.selfAbuse.helpline}</p>
              </>
            )}
          </>
        )}

        <button
          onClick={() => setScreen('s4')}
          disabled={!canNext}
          className="btn-primary w-full justify-center py-4 text-base disabled:opacity-40 mt-6"
        >
          {hi ? 'आगे →' : 'Next →'}
        </button>
      </PracticeScreen>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 4 — Next focus (auto-advance on tap)
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 's4') {
    function pickFocus(chip) {
      setNextFocus(chip);
      setTimeout(() => setScreen(showCueScreen ? 's5' : 'done'), 400);
    }

    return (
      <PracticeScreen onBack={goBack} headerTitle={headerTitle} progress={progressFor(4)}>
        <p className="text-xs font-bold text-slt uppercase tracking-widest mb-4">4 / {totalScreens}</p>
        <h2 className="text-lg font-bold text-ink mb-1 text-center">{t.screen4.prompt}</h2>
        <p className="text-sm text-slt mb-5 text-center">{t.screen4.sub}</p>

        <div className="flex flex-col gap-2">
          {getFocusChips().map(chip => (
            <Chip key={chip} label={chip} selected={nextFocus === chip} onClick={() => pickFocus(chip)} fullWidth />
          ))}
        </div>

        {nextFocus && (
          <p className="text-xs text-slt text-center mt-6 animate-fade-in">
            {hi ? 'आगे बढ़ रहे हैं…' : 'Moving on…'}
          </p>
        )}
      </PracticeScreen>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 5 — Cue word feedback (auto-advance on tap)
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 's5') {
    function pickCue(value) {
      setCueWordFeedback(value);
      setTimeout(() => setScreen('done'), 400);
    }

    return (
      <PracticeScreen onBack={goBack} headerTitle={headerTitle} progress={progressFor(5)}>
        <p className="text-xs font-bold text-slt uppercase tracking-widest mb-4">5 / {totalScreens}</p>
        <h2 className="text-lg font-bold text-ink mb-2 text-center">{t.screen5.prompt}</h2>

        <div className="bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3 mb-6 flex items-center gap-3">
          <span className="text-2xl">🔑</span>
          <div>
            <p className="text-xs text-slt mb-0.5">{t.screen5.cueLabel}</p>
            <p className="text-lg font-bold text-ink">{user?.cueWord}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 mb-5">
          {t.screen5.chips.map(({ label, value }) => (
            <Chip
              key={value}
              label={label}
              selected={cueWordFeedback === value}
              onClick={() => pickCue(value)}
              fullWidth
            />
          ))}
        </div>

        <p className="text-xs text-slt px-1">{t.screen5.note}</p>
      </PracticeScreen>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DONE SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'done') {
    const xpLabel = mode === 'full' ? t.done.xp.full : t.done.xp.quick;

    return (
      <div className="min-h-screen bg-dark-900 flex flex-col pb-10">
        <PracticeHeader canGoBack={false} title={headerTitle} />

        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">

          {/* Loading state */}
          {submitting && !result && (
            <div className="flex flex-col items-center gap-4 py-16">
              <LoadingDots />
              <p className="text-sm text-slt">{t.done.loading}</p>
            </div>
          )}

          {/* Error state */}
          {apiError && (
            <div className="bg-red-950/20 border border-red-900/30 rounded-2xl px-4 py-3 mb-4">
              <p className="text-sm text-red-400">⚠️ {apiError}</p>
              <button
                onClick={() => { submitCalled.current = false; submitDebrief(); }}
                className="text-xs text-brand-400 mt-2 underline"
              >
                {hi ? 'फिर कोशिश करें' : 'Try again'}
              </button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="animate-fade-in">

              {/* XP badge */}
              {showXp && (
                <div className="flex justify-center mb-5 animate-fade-in">
                  <span className="inline-flex items-center gap-2 bg-win-500/20 text-win-400 border border-win-500/30 text-sm font-bold px-4 py-1.5 rounded-full">
                    ⚡ {xpLabel}
                  </span>
                </div>
              )}

              {/* Arjun's review */}
              {result.insight && (
                <div className="bg-dark-800 border border-brand-500/30 rounded-2xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-sm">🏹</div>
                    <div>
                      <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide">Arjun's review</p>
                      <p className="text-[10px] text-slt">{eventType} · {resultType}</p>
                    </div>
                  </div>
                  <p className="text-sm text-ink leading-relaxed">{result.insight}</p>
                </div>
              )}

              {/* Pattern card */}
              {result.pattern && (
                <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl px-4 py-3 mb-4">
                  <p className="text-xs font-semibold text-amber-400 mb-1">{t.done.pattern.label}</p>
                  <p className="text-sm text-ink">{result.pattern}</p>
                </div>
              )}

              {/* Next focus */}
              <div className="bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3 mb-5">
                <p className="text-xs text-slt mb-1">{hi ? 'अगली बार फोकस:' : 'Next focus:'}</p>
                <p className="text-base font-bold text-ink">{nextFocus}</p>
              </div>

              {/* Past reviews — collapsible, tap opens bottom-sheet */}
              {result.recentEntries?.length > 0 && (
                <div className="mb-6">
                  <button
                    onClick={() => setHistoryOpen(v => !v)}
                    className="flex items-center justify-between w-full mb-3"
                  >
                    <p className="text-xs font-semibold text-slt uppercase tracking-wide">{t.done.history.label}</p>
                    <span className="text-xs text-brand-400">{historyOpen ? '▲' : '▼'}</span>
                  </button>

                  {historyOpen && (
                    <div className="flex flex-col gap-2 animate-fade-in">
                      {result.recentEntries.map(entry => (
                        <button
                          key={entry.id}
                          onClick={() => setSheetEntry(entry)}
                          className="w-full bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3 text-left hover:border-brand-400 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium text-slt">{entry.eventType || 'Review'}</p>
                            <p className="text-xs text-slt">{new Date(entry.createdAt).toLocaleDateString()}</p>
                          </div>
                          <p className="text-sm text-ink">{hi ? 'अगला फोकस:' : 'Next focus:'} <span className="font-medium">{entry.nextFocus}</span></p>
                          {entry.arjunInsight && (
                            <p className="text-xs text-slt mt-1 line-clamp-2">{entry.arjunInsight}</p>
                          )}
                          <p className="text-xs text-brand-400 mt-1">{hi ? 'पूरी रिपोर्ट देखें →' : 'See full review →'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* CTAs */}
              <div className="flex flex-col gap-3">
                <button onClick={() => navigate('/train')} className="btn-primary justify-center">
                  {t.done.primary}
                </button>
              </div>
            </div>
          )}

          {/* ── Bottom-sheet: past review detail ── */}
          {sheetEntry && (
            <div
              className="fixed inset-0 z-50 flex items-end"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              onClick={() => setSheetEntry(null)}
            >
              <div
                className="w-full max-w-lg mx-auto bg-dark-800 border-t border-dark-600 rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                {/* Handle bar */}
                <div className="w-10 h-1 bg-dark-600 rounded-full mx-auto mb-4" />

                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-bold text-ink text-base">{sheetEntry.eventType || 'Review'}</p>
                    <p className="text-sm text-slt">{sheetEntry.resultType} · {new Date(sheetEntry.createdAt).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => setSheetEntry(null)} className="text-muted text-xl leading-none">✕</button>
                </div>

                {/* Arjun's review */}
                {sheetEntry.arjunInsight ? (
                  <div className="bg-dark-700 border border-brand-500/30 rounded-2xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">🏹</span>
                      <p className="text-xs font-bold text-brand-400 uppercase tracking-wide">Arjun's review</p>
                    </div>
                    <p className="text-sm text-ink leading-relaxed">{sheetEntry.arjunInsight}</p>
                  </div>
                ) : (
                  <div className="bg-dark-700 rounded-2xl p-4 mb-4">
                    <p className="text-sm text-slt">{hi ? 'इस रिव्यू के लिए कोई रिपोर्ट नहीं है।' : 'No Arjun review for this entry.'}</p>
                  </div>
                )}

                {/* Next focus */}
                <div className="bg-dark-700 border border-dark-600 rounded-2xl px-4 py-3 mb-3">
                  <p className="text-xs text-slt mb-0.5">{hi ? 'अगला फोकस' : 'Next focus'}</p>
                  <p className="font-bold text-ink">{sheetEntry.nextFocus}</p>
                </div>

                {/* What went well */}
                {sheetEntry.wentWell && (
                  <div className="bg-dark-700 border border-dark-600 rounded-2xl px-4 py-3">
                    <p className="text-xs text-slt mb-0.5">{hi ? 'क्या काम आया' : 'What worked'}</p>
                    <p className="text-sm text-ink">{sheetEntry.wentWell}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return null;
}
