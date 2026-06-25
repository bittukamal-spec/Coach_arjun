import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ChevronLeft } from 'lucide-react';

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

// step 0 = intro, step 1 = mood, steps 2–7 = MFS dims, step 8 = submitting, step 9 = result
const TOTAL_QUESTIONS = 7; // 1 mood + 6 dims

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

  const dimIndex = step - 2; // 0–5 for MFS dims (step 2–7)
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
    setStep(2); // jump to first MFS dim
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
    else if (step === 1) setStep(0);
    else if (step >= 2 && step <= 7) setStep(step - 1);
  }

  const progressPct = step >= 1 && step <= 7 ? (step / TOTAL_QUESTIONS) * 100 : 0;

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="px-4 pt-12 pb-6">
          <button onClick={() => navigate(-1)} className="text-gray-400 mb-8 flex items-center">
            <ChevronLeft size={22} />
          </button>
          <p className="text-2xl font-black text-ink leading-tight mb-3">{mf.title}</p>
          <p className="text-sm text-slt leading-relaxed">{mf.subtitle}</p>

          <div className="mt-8 space-y-2">
            <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <span className="text-xl">😊</span>
              <span className="text-sm font-semibold text-ink">{mf.dims.mood}</span>
              <span className="text-xs text-slt ml-auto">{mf.moodCardLabel}</span>
            </div>
            {MFS_DIMS.map(d => (
              <div key={d} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <span className="text-xl">{MFS_EMOJIS[d]}</span>
                <span className="text-sm font-semibold text-ink">{mf.dims[d]}</span>
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
      <div className="min-h-screen bg-white flex flex-col">
        <div className="px-4 pt-12 pb-4 flex items-center gap-3">
          <button onClick={goBack} className="text-gray-400 shrink-0">
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%`, backgroundColor: '#185FA5' }}
            />
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
                    borderColor: selected ? '#185FA5' : '#E5E7EB',
                    backgroundColor: selected ? '#EFF6FF' : 'white',
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

  // ── MFS dimension cards (steps 2–7) ───────────────────────────────────────
  if (step >= 2 && step <= 7) {
    const questionNumber = step; // 2–7 = questions 2–7
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="px-4 pt-12 pb-4 flex items-center gap-3">
          <button onClick={goBack} className="text-gray-400 shrink-0">
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%`, backgroundColor: '#185FA5' }}
            />
          </div>
          <span className="text-xs text-slt shrink-0">{questionNumber}/{TOTAL_QUESTIONS}</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="text-5xl mb-5">{MFS_EMOJIS[currentDim]}</div>
          <p className="text-2xl font-black text-ink text-center mb-2">{mf.dims[currentDim]}</p>
          <p className="text-sm text-slt text-center mb-10 leading-relaxed">{mf.questions[currentDim]}</p>

          <div className="flex gap-3 w-full max-w-xs justify-center">
            {[1, 2, 3, 4, 5].map((val) => {
              const selected = scores[currentDim] === val;
              return (
                <button
                  key={val}
                  onClick={() => selectDim(val)}
                  className="flex-1 aspect-square rounded-xl text-lg font-black border-2 transition-all active:scale-95"
                  style={{
                    borderColor: selected ? '#185FA5' : '#E5E7EB',
                    backgroundColor: selected ? '#185FA5' : 'white',
                    color: selected ? 'white' : '#374151',
                  }}
                >
                  {val}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between w-full max-w-xs mt-2 px-1">
            <span className="text-[10px] text-slt">{hi ? 'कम' : 'Low'}</span>
            <span className="text-[10px] text-slt">{hi ? 'ज़्यादा' : 'High'}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Submitting (step 8) ────────────────────────────────────────────────────
  if (step === 8) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-5">
        <div
          className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: '#185FA5', borderTopColor: 'transparent' }}
        />
        <p className="text-sm text-slt">{mf.submitting}</p>
      </div>
    );
  }

  // ── Result (step 9) ────────────────────────────────────────────────────────
  const allScores = entry || scores;
  const mfsScore = entry
    ? Math.round(MFS_DIMS.reduce((s, k) => s + (entry[k] || 0), 0) / MFS_DIMS.length * 20)
    : null;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-4 pt-12 pb-4">
        <p className="text-xl font-black text-ink mb-1">
          {submitError
            ? (hi ? 'कुछ गलत हो गया' : 'Something went wrong')
            : (hi ? 'चेक-इन हो गया ✓' : 'Done ✓')}
        </p>
        {submitError && <p className="text-sm text-red-500 mt-1">{submitError}</p>}
      </div>

      {!submitError && (
        <div className="px-4 space-y-4">
          {/* Mood */}
          <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
            <span className="text-2xl">
              {MOOD_OPTIONS.find(o => o.v === (entry?.mood ?? allScores.mood))?.emoji ?? '😐'}
            </span>
            <div>
              <p className="text-xs text-slt">{mf.dims.mood}</p>
              <p className="text-base font-black" style={{ color: '#185FA5' }}>{entry?.mood ?? allScores.mood}/5</p>
            </div>
          </div>

          {/* 6 MFS chips */}
          <div className="grid grid-cols-3 gap-2">
            {MFS_DIMS.map(d => (
              <div key={d} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xl">{MFS_EMOJIS[d]}</p>
                <p className="text-[11px] text-slt mt-0.5 leading-tight">{mf.dims[d]}</p>
                <p className="text-xl font-black mt-1" style={{ color: '#185FA5' }}>
                  {entry?.[d] ?? allScores[d]}<span className="text-xs font-normal text-slt">/5</span>
                </p>
              </div>
            ))}
          </div>

          {/* Composite MFS score */}
          {mfsScore !== null && (
            <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slt mb-1">{hi ? 'आज का मानसिक स्कोर' : "Today's mental score"}</p>
                <p className="text-3xl font-black" style={{ color: '#185FA5' }}>
                  {mfsScore}<span className="text-sm font-normal text-slt">/100</span>
                </p>
              </div>
              <p className="text-4xl">🧠</p>
            </div>
          )}

          {/* XP earned */}
          {xpEarned > 0 && (
            <div className="flex items-center gap-2 justify-center py-1">
              <Zap size={15} className="text-brand-500" />
              <span className="text-sm font-semibold text-brand-600">+{xpEarned} MXP</span>
            </div>
          )}

          {/* Arjun's coaching line */}
          {entry?.arjunResponse && (
            <div className="rounded-xl p-4 border-2" style={{ borderColor: '#E2711D' }}>
              <p className="text-xs font-bold mb-1.5" style={{ color: '#E2711D' }}>Arjun</p>
              <p className="text-sm text-ink leading-relaxed">{entry.arjunResponse}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />
      <div className="px-4 pb-10 space-y-3">
        <button
          onClick={() => navigate('/coaching', { state: { sessionType: 'post_checkin' } })}
          className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-[0.98] transition-transform"
          style={{ backgroundColor: '#185FA5' }}
        >
          {mf.talkToArjun}
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full py-3.5 rounded-2xl border border-gray-200 text-slt font-semibold text-sm active:scale-[0.98] transition-transform"
        >
          {mf.doneBtn}
        </button>
      </div>
    </div>
  );
}
