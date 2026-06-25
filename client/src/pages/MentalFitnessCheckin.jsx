import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ChevronLeft } from 'lucide-react';

const DIMS = ['focus', 'confidence', 'drive', 'calm', 'selftalk', 'bounce'];
const EMOJIS = {
  focus: '🎯', confidence: '💪', drive: '⚡',
  calm: '🧘', selftalk: '🗣️', bounce: '🔁',
};

export default function MentalFitnessCheckin() {
  const navigate = useNavigate();
  const { token, language } = useAuth();
  const t = translations[language];
  const mf = t.mentalFitness;
  const hi = language === 'hi';

  // step: 0=intro, 1–6=dimension cards, 7=submitting, 8=result
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState({});
  const [entry, setEntry] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const dimIndex = step - 1;
  const dim = DIMS[dimIndex];

  async function submit(finalScores) {
    setStep(7);
    setSubmitError(null);
    try {
      const res = await apiFetch('/api/mental-fitness', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalScores),
      });
      const data = await res.json();
      if (res.ok) {
        setEntry(data.entry);
      } else if (res.status === 409) {
        // Already done today — show existing entry
        setEntry(data.entry);
      } else {
        setSubmitError(data.error || (hi ? 'कुछ गलत हो गया' : 'Something went wrong'));
      }
    } catch {
      setSubmitError(hi ? 'नेटवर्क समस्या — दोबारा कोशिश करें' : 'Could not save — check your connection');
    }
    setStep(8);
  }

  function selectScore(val) {
    const updated = { ...scores, [dim]: val };
    setScores(updated);
    if (dimIndex < DIMS.length - 1) {
      setStep(step + 1);
    } else {
      submit(updated);
    }
  }

  function goBack() {
    if (step === 0) navigate(-1);
    else if (step <= 6) setStep(step - 1);
  }

  // ── Intro ─────────────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="px-4 pt-12 pb-6">
          <button onClick={() => navigate(-1)} className="text-gray-400 mb-8 flex items-center">
            <ChevronLeft size={22} />
          </button>
          <p className="text-2xl font-black text-ink leading-tight mb-3">{mf.title}</p>
          <p className="text-sm text-slt leading-relaxed">{mf.subtitle}</p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {DIMS.map((d) => (
              <div key={d} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xl mb-1">{EMOJIS[d]}</p>
                <p className="text-xs text-slt">{mf.dims[d]}</p>
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

  // ── Dimension cards (steps 1–6) ───────────────────────────────────────────
  if (step >= 1 && step <= 6) {
    const progress = (step / 6) * 100;
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* Progress header */}
        <div className="px-4 pt-12 pb-4 flex items-center gap-3">
          <button onClick={goBack} className="text-gray-400 shrink-0">
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, backgroundColor: '#185FA5' }}
            />
          </div>
          <span className="text-xs text-slt shrink-0">{step}/6</span>
        </div>

        {/* Card content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="text-5xl mb-5">{EMOJIS[dim]}</div>
          <p className="text-2xl font-black text-ink text-center mb-2">{mf.dims[dim]}</p>
          <p className="text-sm text-slt text-center mb-10 leading-relaxed">{mf.questions[dim]}</p>

          {/* 5-button rating row */}
          <div className="flex gap-3 w-full max-w-xs justify-center">
            {[1, 2, 3, 4, 5].map((val) => {
              const selected = scores[dim] === val;
              return (
                <button
                  key={val}
                  onClick={() => selectScore(val)}
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

  // ── Submitting (step 7) ────────────────────────────────────────────────────
  if (step === 7) {
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

  // ── Result (step 8) ────────────────────────────────────────────────────────
  const mfsScore = entry
    ? Math.round(DIMS.reduce((s, k) => s + (entry[k] || 0), 0) / DIMS.length * 20)
    : null;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-4 pt-12 pb-4">
        <p className="text-xl font-black text-ink mb-1">
          {submitError
            ? (hi ? 'कुछ गलत हो गया' : 'Something went wrong')
            : (hi ? 'चेक-इन हो गया ✓' : 'Done ✓')}
        </p>
        {submitError && (
          <p className="text-sm text-red-500 mt-1">{submitError}</p>
        )}
      </div>

      {entry && !submitError && (
        <div className="px-4 space-y-4">
          {/* 6 dimension chips */}
          <div className="grid grid-cols-3 gap-2">
            {DIMS.map((d) => (
              <div key={d} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xl">{EMOJIS[d]}</p>
                <p className="text-[11px] text-slt mt-0.5 leading-tight">{mf.dims[d]}</p>
                <p className="text-xl font-black mt-1" style={{ color: '#185FA5' }}>{entry[d]}<span className="text-xs font-normal text-slt">/5</span></p>
              </div>
            ))}
          </div>

          {/* Composite MFS score */}
          {mfsScore !== null && (
            <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slt mb-1">{hi ? 'आज का स्कोर' : "Today's score"}</p>
                <p className="text-3xl font-black" style={{ color: '#185FA5' }}>
                  {mfsScore}<span className="text-sm font-normal text-slt">/100</span>
                </p>
              </div>
              <p className="text-4xl">🧠</p>
            </div>
          )}

          {/* Arjun's coaching line */}
          {entry.arjunResponse && (
            <div className="rounded-xl p-4 border-2" style={{ borderColor: '#E2711D' }}>
              <p className="text-xs font-bold mb-1.5" style={{ color: '#E2711D' }}>Arjun</p>
              <p className="text-sm text-ink leading-relaxed">{entry.arjunResponse}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />
      <div className="px-4 pb-10">
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-[0.98] transition-transform"
          style={{ backgroundColor: '#185FA5' }}
        >
          {mf.doneBtn}
        </button>
      </div>
    </div>
  );
}
