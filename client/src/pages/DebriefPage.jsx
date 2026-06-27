import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

// ── Self-abuse keyword guard ──────────────────────────────────────────────────
const ABUSE_WORDS = ['stupid', 'idiot', 'useless', 'pathetic', 'worthless', 'loser', 'failure', 'terrible', 'worst', 'hate myself'];
function hasSelfAbuse(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return ABUSE_WORDS.some(w => lower.includes(w));
}

// ── Chip component ────────────────────────────────────────────────────────────
function Chip({ label, selected, onClick, fullWidth }) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-2xl px-4 py-2.5 text-sm font-medium border transition-colors text-left',
        fullWidth ? 'w-full' : '',
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
    <div className="bg-white border-l-4 border-brand-500 rounded-2xl px-4 py-3 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🏹</span>
        <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">Arjun</p>
      </div>
      <p className="text-sm text-gray-800 leading-relaxed">{children}</p>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ current, total }) {
  return (
    <div className="h-1 bg-dark-700 w-full">
      <div
        className="h-full bg-brand-500 transition-all duration-500"
        style={{ width: `${(current / total) * 100}%` }}
      />
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
export default function DebriefPage() {
  const { token, language, user, updateUser } = useAuth();
  const t  = translations[language].atm;
  const hi = language === 'hi';
  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────────────────────────────
  const [screen,         setScreen]         = useState('entry');  // 'entry'|'s1'|'s2'|'s3'|'s4'|'s5'|'done'
  const [mode,           setMode]           = useState(null);     // 'quick'|'full'
  const [eventType,      setEventType]      = useState(null);
  const [resultType,     setResultType]     = useState(null);
  const [wentWellChips,  setWentWellChips]  = useState([]);
  const [wentWellText,   setWentWellText]   = useState('');
  const [wouldChange,    setWouldChange]    = useState(null);
  const [wouldChangeText,setWouldChangeText]= useState('');
  const [selfAbuse,      setSelfAbuse]      = useState(false);
  const [nextFocus,      setNextFocus]      = useState(null);
  const [cueWordFeedback,setCueWordFeedback]= useState(null);
  const [submitting,     setSubmitting]     = useState(false);
  const [result,         setResult]         = useState(null);
  const [showXp,         setShowXp]         = useState(false);
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [apiError,       setApiError]       = useState('');

  const submitCalled = useRef(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const showCueScreen = mode === 'full' && !!user?.cueWord;
  const totalScreens  = showCueScreen ? 6 : 5;

  const screenIndex = { entry: 0, s1: 1, s2: 2, s3: 3, s4: 4, s5: 5, done: totalScreens }[screen] ?? 0;

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
        wouldChange,
        wouldChangeText: wouldChangeText.trim() || undefined,
        nextFocus,
        cueWordFeedback: cueWordFeedback || undefined,
      };
      const res = await apiFetch('/api/debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { setApiError('Could not save. Try again.'); return; }
      const data = await res.json();
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
    if (screen === 's1') { setScreen('entry'); }
    else if (screen === 's2') { setScreen('s1'); }
    else if (screen === 's3') { setScreen('s2'); }
    else if (screen === 's4') { setScreen('s3'); }
    else if (screen === 's5') { setNextFocus(null); setScreen('s4'); }
    else if (screen === 'done') { /* shouldn't happen — disable back on done */ }
  }

  // ── Toggle wentWell chip ──────────────────────────────────────────────────
  function toggleWentWell(chip) {
    setWentWellChips(prev =>
      prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]
    );
  }

  // ── Screen header ─────────────────────────────────────────────────────────
  function Header({ showBack = true, step = null }) {
    return (
      <>
        <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10 shrink-0">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            {showBack ? (
              <button onClick={goBack} className="text-sm text-slt hover:text-ink">← Back</button>
            ) : (
              <button onClick={() => navigate('/train')} className="text-sm text-slt hover:text-ink">✕</button>
            )}
            <p className="font-semibold text-ink">{hi ? 'मैच की समीक्षा' : 'Match review'}</p>
            {step != null ? (
              <p className="text-xs text-slt">{step}/{totalScreens}</p>
            ) : (
              <div className="w-10" />
            )}
          </div>
        </header>
        {step != null && <ProgressBar current={step} total={totalScreens} />}
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTRY SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'entry') {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col pb-6">
        <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <button onClick={() => navigate('/train')} className="text-sm text-slt hover:text-ink">✕</button>
            <p className="font-semibold text-ink">{hi ? 'मैच की समीक्षा' : 'Match review'}</p>
            <div className="w-10" />
          </div>
        </header>

        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-10">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🧠</div>
            <h2 className="text-xl font-bold text-ink mb-2">{t.entry.prompt}</h2>
          </div>

          <div className="flex flex-col gap-3">
            {[
              { key: 'quick', ...t.entry.quick },
              { key: 'full',  ...t.entry.full  },
            ].map(({ key, title, sub }) => (
              <button
                key={key}
                onClick={() => { setMode(key); setScreen('s1'); }}
                className="bg-dark-800 border border-dark-600 hover:border-brand-400 rounded-2xl px-5 py-4 text-left transition-colors active:scale-[0.98]"
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
      <div className="min-h-screen bg-dark-900 flex flex-col pb-6">
        <Header showBack step={1} />
        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 overflow-y-auto">
          <h2 className="text-lg font-bold text-ink mb-4">{t.screen1.promptA}</h2>
          <div className="flex flex-wrap gap-2 mb-7">
            {t.screen1.events.map(ev => (
              <Chip key={ev} label={ev} selected={eventType === ev} onClick={() => setEventType(ev)} />
            ))}
          </div>

          <h2 className="text-lg font-bold text-ink mb-4">{t.screen1.promptB}</h2>
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
        </main>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — What went well (chips + optional text)
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 's2') {
    const canNext = wentWellChips.length > 0;
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col pb-6">
        <Header showBack step={2} />
        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 flex flex-col overflow-y-auto">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink mb-1">{t.screen2.prompt}</h2>
            <p className="text-sm text-slt mb-5">{t.screen2.sub}</p>

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
                className="w-full bg-dark-700 border border-dark-500 text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-slt resize-none"
              />
            )}
          </div>

          <button
            onClick={() => setScreen('s3')}
            disabled={!canNext}
            className="mt-6 btn-primary w-full justify-center py-4 text-base disabled:opacity-40"
          >
            {hi ? 'आगे →' : 'Next →'}
          </button>
        </main>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 3 — What would you change
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 's3') {
    const canNext = !!wouldChange;
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col pb-6">
        <Header showBack step={3} />
        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 flex flex-col overflow-y-auto">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink mb-1">{t.screen3.prompt}</h2>
            <p className="text-sm text-slt mb-5">{t.screen3.sub}</p>

            <div className="flex flex-col gap-2 mb-5">
              {t.screen3.chips.map(chip => (
                <Chip key={chip} label={chip} selected={wouldChange === chip} onClick={() => setWouldChange(chip)} fullWidth />
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
                  <p className="text-xs text-amber-400 mt-2 px-1">{t.screen3.selfAbuse.warning}</p>
                )}
              </>
            )}
          </div>

          <button
            onClick={() => setScreen('s4')}
            disabled={!canNext}
            className="mt-6 btn-primary w-full justify-center py-4 text-base disabled:opacity-40"
          >
            {hi ? 'आगे →' : 'Next →'}
          </button>
        </main>
      </div>
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
      <div className="min-h-screen bg-dark-900 flex flex-col pb-6">
        <Header showBack step={4} />
        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 overflow-y-auto">
          <h2 className="text-lg font-bold text-ink mb-1">{t.screen4.prompt}</h2>
          <p className="text-sm text-slt mb-5">{t.screen4.sub}</p>

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
        </main>
      </div>
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
      <div className="min-h-screen bg-dark-900 flex flex-col pb-6">
        <Header showBack step={5} />
        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 overflow-y-auto">
          <h2 className="text-lg font-bold text-ink mb-2">{t.screen5.prompt}</h2>

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
        </main>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DONE SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'done') {
    const xpLabel = mode === 'full' ? t.done.xp.full : t.done.xp.quick;

    return (
      <div className="min-h-screen bg-dark-900 flex flex-col pb-10">
        <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div className="w-10" />
            <p className="font-semibold text-ink">{hi ? 'मैच की समीक्षा' : 'Match review'}</p>
            <div className="w-10" />
          </div>
        </header>

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
                <div className="flex justify-center mb-6 animate-fade-in">
                  <span className="inline-flex items-center gap-2 bg-win-500/20 text-win-400 border border-win-500/30 text-sm font-bold px-4 py-1.5 rounded-full">
                    ⚡ {xpLabel}
                  </span>
                </div>
              )}

              {/* Arjun's insight */}
              {result.insight && (
                <div className="bg-dark-800 border border-brand-500/30 rounded-2xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-sm">🏹</div>
                    <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide">Arjun</p>
                  </div>
                  <p className="text-sm text-ink leading-relaxed">{result.insight}</p>
                </div>
              )}

              {/* Pattern card (full mode only, when pattern exists) */}
              {result.pattern && (
                <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl px-4 py-3 mb-4">
                  <p className="text-xs font-semibold text-amber-400 mb-1">{t.done.pattern.label}</p>
                  <p className="text-sm text-ink">{result.pattern}</p>
                </div>
              )}

              {/* Next focus summary */}
              <div className="bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3 mb-4">
                <p className="text-xs text-slt mb-1">{hi ? 'अगली बार फोकस:' : 'Next focus:'}</p>
                <p className="text-base font-bold text-ink">{nextFocus}</p>
              </div>

              {/* Past reviews */}
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
                        <div key={entry.id} className="bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-slt">{entry.eventType || 'Review'}</p>
                            <p className="text-xs text-slt">{new Date(entry.createdAt).toLocaleDateString()}</p>
                          </div>
                          <p className="text-sm text-ink truncate">{entry.wentWell}</p>
                        </div>
                      ))}
                      <button onClick={() => navigate('/sessions')} className="text-xs text-brand-400 text-right mt-1">
                        {t.done.history.seeAll} →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* CTAs */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => navigate('/coaching', { state: { sessionType: 'post_match' } })}
                  className="btn-primary justify-center"
                >
                  {t.done.secondary}
                </button>
                <button onClick={() => navigate('/train')} className="btn-secondary justify-center">
                  {t.done.primary}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return null;
}
