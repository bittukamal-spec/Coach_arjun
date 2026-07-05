import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, X, ChevronLeft, ChevronRight, Wind, Gamepad2, ClipboardList, RotateCcw, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import HelplineList from '../components/HelplineList';

const MFS_DIMS = ['focus', 'confidence', 'drive', 'calm', 'selftalk', 'bounce'];
const MFS_EMOJIS = {
  focus: '🎯', confidence: '💪', drive: '⚡',
  calm: '🧘', selftalk: '🗣️', bounce: '🔁',
};

const MOOD_OPTIONS = [
  { v: 1, emoji: '😞', labelKey: 'mood1' },
  { v: 2, emoji: '😕', labelKey: 'mood2' },
  { v: 3, emoji: '😐', labelKey: 'mood3' },
  { v: 4, emoji: '😊', labelKey: 'mood4' },
  { v: 5, emoji: '😄', labelKey: 'mood5' },
];

const TOTAL_QUESTIONS = 7;

function calcAvg(data) {
  const keys = ['mood', ...MFS_DIMS].filter(k => data[k] != null);
  if (!keys.length) return null;
  return (keys.reduce((s, k) => s + data[k], 0) / keys.length).toFixed(1);
}

const TOOL_MAP = {
  calm:       { toolKey: 'breathing',  to: '/breathing',          state: null, Icon: Wind          },
  focus:      { toolKey: 'focusLock',  to: '/games/focus-lock',   state: null, Icon: Gamepad2      },
  selftalk:   { toolKey: 'selftalk',   to: '/self-talk',          state: null, Icon: MessageSquare },
  bounce:     { toolKey: 'resetRally', to: '/games/reset-rally',  state: null, Icon: RotateCcw     },
  confidence: { toolKey: 'selftalk',   to: '/self-talk',          state: null, Icon: MessageSquare },
  drive:      { toolKey: 'debrief',    to: '/debrief',            state: null, Icon: ClipboardList },
};

function getRecommendedTool(entry) {
  const dims = ['calm', 'focus', 'selftalk', 'bounce', 'confidence', 'drive'];
  const sorted = dims.filter(d => entry[d] != null).sort((a, b) => entry[a] - entry[b]);
  return TOOL_MAP[sorted[0]] || TOOL_MAP.calm;
}

export default function MentalFitnessCheckin() {
  const navigate = useNavigate();
  const { token, language } = useAuth();
  const t = translations[language];
  const mf = t.mentalFitness;
  const ci = t.checkin;
  const hi = language === 'hi';

  const [step, setStep]               = useState(0);
  const [scores, setScores]           = useState({});
  const [entry, setEntry]             = useState(null);
  const [xpEarned, setXpEarned]       = useState(null);
  const [newAchievements, setNewAchievements] = useState([]);
  const [submitError, setSubmitError] = useState(null);
  const [showReport, setShowReport]   = useState(false);

  const dimIndex = step - 2;
  const currentDim = MFS_DIMS[dimIndex];

  async function submit(finalScores) {
    setStep(8);
    setSubmitError(null);
    try {
      const res = await apiFetch('/api/mental-fitness', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(finalScores),
      });
      const data = await res.json();
      if (res.ok) {
        setEntry(data.entry);
        setXpEarned(data.xpEarned ?? null);
        setNewAchievements(data.newAchievements ?? []);
      } else if (res.status === 409) {
        setEntry(data.entry);
      } else {
        setSubmitError(data.error || (hi ? 'कुछ गलत हो गया' : 'Something went wrong'));
      }
    } catch {
      setSubmitError(hi ? 'नेटवर्क समस्या — दोबारा कोशिश करें' : 'Could not save — check your connection');
    }
    setStep(9);
  }

  function selectMood(val) {
    setScores(prev => ({ ...prev, mood: val }));
    setStep(2);
  }

  function selectDim(val) {
    const updated = { ...scores, [currentDim]: val };
    setScores(updated);
    if (dimIndex < MFS_DIMS.length - 1) {
      setStep(step + 1);
    } else {
      submit(updated);
    }
  }

  function goBack() {
    if (step === 0) navigate(-1);
    else if (step <= 7) setStep(step - 1);
  }

  const progressPct = step >= 1 && step <= 7 ? (step / TOTAL_QUESTIONS) * 100 : 0;

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <div className="px-4 pt-12 pb-6">
          <button onClick={() => navigate(-1)} className="text-muted mb-8 flex items-center">
            <ChevronLeft size={22} />
          </button>
          <p className="text-2xl font-black text-ink leading-tight mb-3">{mf.title}</p>
          <p className="text-sm text-slt leading-relaxed">{mf.subtitle}</p>

          <div className="mt-6 space-y-2">
            {[{ key: 'mood', emoji: '😊' }, ...MFS_DIMS.map(d => ({ key: d, emoji: MFS_EMOJIS[d] }))].map(({ key, emoji }) => (
              <div key={key} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-dark-800/60">
                <span className="text-xl mt-0.5 shrink-0">{emoji}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink leading-tight">{mf.dims[key]}</p>
                  <p className="text-xs text-slt leading-snug mt-0.5">{mf.dimDescriptions[key]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1" />
        <div className="px-4 pb-10">
          <button
            onClick={() => setStep(1)}
            className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-[0.98] transition-transform"
            style={{ backgroundColor: '#185FA5' }}
          >
            {mf.startBtn}
          </button>
        </div>
      </div>
    );
  }

  // ── Mood card (step 1) ─────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <div className="px-4 pt-12 pb-4 flex items-center gap-3">
          <button onClick={goBack} className="text-muted shrink-0">
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1 h-1.5 bg-dark-600 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, backgroundColor: '#185FA5' }} />
          </div>
          <span className="text-xs text-slt shrink-0">1/{TOTAL_QUESTIONS}</span>
        </div>

        <div className="flex-1 flex flex-col px-5 pt-8">
          <p className="text-2xl font-black text-ink mb-1">{mf.moodQuestion}</p>
          <p className="text-xs text-slt mb-8">{mf.moodCardLabel}</p>

          <div className="space-y-3">
            {MOOD_OPTIONS.map(opt => {
              const selected = scores.mood === opt.v;
              return (
                <button
                  key={opt.v}
                  onClick={() => selectMood(opt.v)}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98]"
                  style={{
                    borderColor: selected ? '#185FA5' : 'rgb(var(--dark-600))',
                    backgroundColor: selected ? 'rgba(24,95,165,0.15)' : 'rgb(var(--dark-700))',
                  }}
                >
                  <span className="text-3xl shrink-0">{opt.emoji}</span>
                  <span className="font-semibold text-ink text-base">{ci[opt.labelKey]}</span>
                  {selected && <span className="ml-auto text-sm" style={{ color: '#185FA5' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── MFS Likert cards (steps 2–7) ───────────────────────────────────────────
  if (step >= 2 && step <= 7) {
    const labels = mf.likertLabels[currentDim];
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <div className="px-4 pt-12 pb-4 flex items-center gap-3">
          <button onClick={goBack} className="text-muted shrink-0">
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1 h-1.5 bg-dark-600 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, backgroundColor: '#185FA5' }} />
          </div>
          <span className="text-xs text-slt shrink-0">{step}/{TOTAL_QUESTIONS}</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 py-8">
          <div className="text-5xl mb-5">{MFS_EMOJIS[currentDim]}</div>
          <p className="text-2xl font-black text-ink text-center mb-2">{mf.dims[currentDim]}</p>
          <p className="text-sm text-slt text-center mb-12 leading-relaxed">{mf.questions[currentDim]}</p>

          {/* Likert scale — 5 circles, no numbers */}
          <div className="w-full max-w-xs">
            <div className="flex justify-between items-center">
              {[1, 2, 3, 4, 5].map(val => {
                const selected = scores[currentDim] === val;
                return (
                  <button
                    key={val}
                    onClick={() => selectDim(val)}
                    className="w-12 h-12 rounded-full border-2 transition-all active:scale-95 flex items-center justify-center"
                    style={{
                      borderColor: selected ? '#185FA5' : 'rgb(var(--dark-600))',
                      backgroundColor: selected ? '#185FA5' : 'rgb(var(--dark-700))',
                    }}
                  >
                    {selected && (
                      <div className="w-4 h-4 rounded-full bg-white opacity-70" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between mt-3 px-1">
              <span className="text-[11px] text-slt">{labels.low}</span>
              <span className="text-[11px] text-slt">{labels.high}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Submitting (step 8) ────────────────────────────────────────────────────
  if (step === 8) {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center gap-5">
        <div
          className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: '#185FA5', borderTopColor: 'transparent' }}
        />
        <p className="text-sm text-slt">{mf.submitting}</p>
      </div>
    );
  }

  // ── Result (step 9) ────────────────────────────────────────────────────────
  const displayEntry = entry || {};
  const avg = entry ? calcAvg(entry) : null;
  const avgPct = avg ? Math.round((parseFloat(avg) / 5) * 100) : null;
  // Floor rule: very low check-in → show gentle support + helplines (display only, no score change)
  const showSupport = entry && (parseFloat(avg) <= 2 || entry.selftalk === 1);

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <div className="px-4 pt-12 pb-4">
        <p className="text-xl font-black text-ink mb-1">
          {submitError ? (hi ? 'कुछ गलत हो गया' : 'Something went wrong') : (hi ? 'चेक-इन हो गया ✓' : 'Done ✓')}
        </p>
        {submitError && <p className="text-sm text-red-500 mt-1">{submitError}</p>}
      </div>

      {!submitError && (
        <div className="px-4 space-y-4">
          {/* Score — word label first, number second */}
          {avgPct !== null && (
            <div className="rounded-2xl p-5" style={{ backgroundColor: '#185FA5' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/70 mb-1">{hi ? 'आज' : 'Today'}</p>
                  <p className="text-2xl font-black text-white leading-tight">{mf.scoreLabel(avgPct)}</p>
                  <p className="text-base font-semibold text-white/80 mt-1">{avgPct}<span className="text-sm font-normal opacity-70">/100</span></p>
                </div>
                <p className="text-5xl">🧠</p>
              </div>
            </div>
          )}

          {/* Mood row */}
          <div className="bg-dark-700 border border-dark-600 rounded-xl p-3 flex items-center gap-3">
            <span className="text-2xl">
              {MOOD_OPTIONS.find(o => o.v === displayEntry.mood)?.emoji ?? '😐'}
            </span>
            <div>
              <p className="text-xs text-slt">{mf.dims.mood}</p>
              <p className="text-base font-black" style={{ color: '#185FA5' }}>{displayEntry.mood}/5</p>
            </div>
          </div>

          {/* 6 MFS dims grid */}
          <div className="grid grid-cols-3 gap-2">
            {MFS_DIMS.map(d => (
              <div key={d} className="bg-dark-700 border border-dark-600 rounded-xl p-3 text-center">
                <p className="text-xl">{MFS_EMOJIS[d]}</p>
                <p className="text-[11px] text-slt mt-0.5 leading-tight">{mf.dims[d]}</p>
                <p className="text-xl font-black mt-1" style={{ color: '#185FA5' }}>
                  {displayEntry[d]}<span className="text-xs font-normal text-slt">/5</span>
                </p>
              </div>
            ))}
          </div>

          {/* Gentle support on very low scores */}
          {showSupport && (
            <div className="bg-dark-700 border border-dark-600 rounded-2xl p-4">
              <p className="text-sm font-semibold text-ink mb-1">{mf.support.title}</p>
              <p className="text-xs text-slt leading-relaxed mb-3">{mf.support.body}</p>
              <HelplineList />
            </div>
          )}

          {/* XP earned */}
          {xpEarned > 0 && (
            <div className="flex items-center gap-2 justify-center py-1">
              <Zap size={15} className="text-brand-500" />
              <span className="text-sm font-semibold text-brand-300">+{xpEarned} MXP</span>
            </div>
          )}

          {/* Arjun's report — open popup */}
          {entry?.arjunResponse && (
            <button
              onClick={() => setShowReport(true)}
              className="w-full text-left rounded-xl p-4 border-2 active:scale-[0.98] transition-transform"
              style={{ borderColor: '#E2711D' }}
            >
              <p className="text-xs font-bold mb-1" style={{ color: '#E2711D' }}>Arjun</p>
              <p className="text-sm text-slt">{hi ? 'रिपोर्ट देखें →' : 'View your report →'}</p>
            </button>
          )}
        </div>
      )}

      <div className="flex-1" />
      <div className="px-4 pb-10 space-y-3">
        {/* Primary CTA — the tool recommended from today's lowest dimension */}
        {!submitError && entry && (() => {
          const rec = getRecommendedTool(entry);
          const toolInfo = mf.toolRec[rec.toolKey];
          return (
            <button
              onClick={() => navigate(rec.to, rec.state ? { state: rec.state } : undefined)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-semibold text-sm active:scale-[0.98] transition-transform"
              style={{ backgroundColor: '#185FA5' }}
            >
              <rec.Icon size={16} />
              <span>{toolInfo.title} — {toolInfo.desc}</span>
              <ChevronRight size={15} />
            </button>
          );
        })()}
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full py-3.5 rounded-2xl border border-dark-600 text-slt font-semibold text-sm active:scale-[0.98] transition-transform"
        >
          {mf.doneBtn}
        </button>
      </div>

      {/* Arjun's report popup */}
      {showReport && entry?.arjunResponse && (() => {
        const rec = getRecommendedTool(entry);
        const toolInfo = mf.toolRec[rec.toolKey];
        return (
          <>
            <div className="fixed inset-0 z-[60] bg-black/60" onClick={() => setShowReport(false)} />
            <div className="fixed bottom-0 inset-x-0 z-[60] bg-dark-800 border-t border-dark-600 rounded-t-2xl px-5 pt-5 pb-12 animate-fade-in shadow-xl max-h-[85vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-base bg-dark-700">🧠</div>
                  <div>
                    <p className="font-bold text-ink text-sm">{hi ? 'अर्जुन की रिपोर्ट' : "Arjun's report"}</p>
                    {avgPct !== null && <p className="text-xs text-slt">{avgPct}/100 {mf.avgLabel}</p>}
                  </div>
                </div>
                <button
                  onClick={() => setShowReport(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-dark-600 text-slt"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Report text */}
              <div className="bg-dark-700 border border-dark-600 rounded-xl p-4 mb-5">
                <p className="text-sm text-ink leading-relaxed">{entry.arjunResponse}</p>
              </div>

              {/* Tool recommendation */}
              <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-2.5">{mf.toolRec.sectionLabel}</p>
              <button
                onClick={() => { setShowReport(false); navigate(rec.to, rec.state ? { state: rec.state } : undefined); }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 active:scale-[0.98] transition-transform mb-3"
                style={{ borderColor: '#185FA5' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-dark-700">
                  <rec.Icon size={18} style={{ color: '#185FA5' }} />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-ink text-sm">{toolInfo.title}</p>
                  <p className="text-xs text-slt">{toolInfo.desc}</p>
                </div>
                <ChevronRight size={16} style={{ color: '#185FA5' }} />
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
}
