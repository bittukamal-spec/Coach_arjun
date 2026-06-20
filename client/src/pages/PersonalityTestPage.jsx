import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArrowLeft } from 'lucide-react';

// OCEAN trait order: O, C, E, A, N — two questions each, same order
const TRAIT_ORDER = ['O', 'C', 'E', 'A', 'N', 'O', 'C', 'E', 'A', 'N'];

function PersonalityTestPage() {
  const { user, token, language, updateUser } = useAuth();
  const t = translations[language].personality;
  const navigate = useNavigate();

  const [step, setStep] = useState('questions'); // 'questions' | 'results'
  const [answers, setAnswers] = useState(Array(10).fill(null));
  const [current, setCurrent] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleAnswer(val) {
    const next = [...answers];
    next[current] = val;
    setAnswers(next);
    if (current < 9) {
      setCurrent(current + 1);
    } else {
      setStep('results');
    }
  }

  function computeScores() {
    const totals = { O: [], C: [], E: [], A: [], N: [] };
    answers.forEach((val, i) => {
      if (val !== null) totals[TRAIT_ORDER[i]].push(val);
    });
    const scores = {};
    for (const [k, vals] of Object.entries(totals)) {
      scores[k] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    return scores;
  }

  async function handleSave() {
    const scores = computeScores();
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/me/ocean', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oceanO: scores.O, oceanC: scores.C, oceanE: scores.E,
          oceanA: scores.A, oceanN: scores.N,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        updateUser(data.user);
        navigate('/account');
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'results') {
    const scores = computeScores();
    const coachingNote = t.coachingNote(scores);
    return (
      <div className="min-h-screen bg-dark-900 text-ink flex flex-col">
        <div className="max-w-lg mx-auto w-full px-4 pt-8 pb-28 animate-fade-in">
          <button onClick={() => setStep('questions')} className="flex items-center gap-2 text-slt hover:text-ink mb-8 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm">{t.backBtn}</span>
          </button>

          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center mx-auto mb-4 text-3xl">
              🧠
            </div>
            <h1 className="text-2xl font-bold text-ink">{t.resultTitle}</h1>
            <p className="text-slt text-sm mt-2">{t.subtitle}</p>
          </div>

          <div className="space-y-4 mb-8">
            {t.traits.map((trait, i) => {
              const key = ['O', 'C', 'E', 'A', 'N'][i];
              const val = scores[key];
              const desc = t.traitDescriptions[i](val);
              return (
                <div key={key} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{t.traitEmojis[i]}</span>
                      <span className="font-semibold text-ink text-sm">{trait}</span>
                    </div>
                    <span className="text-brand-400 font-bold text-sm">{val}/5</span>
                  </div>
                  <div className="w-full bg-dark-600 rounded-full h-2 mb-2">
                    <div
                      className="h-2 rounded-full bg-brand-500 transition-all"
                      style={{ width: `${(val / 5) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-slt">{desc}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-brand-500/10 border border-brand-500/20 rounded-2xl p-4 mb-8">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">Arjun's coaching note</p>
            <p className="text-sm text-ink leading-relaxed">{coachingNote}</p>
          </div>

          {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full justify-center text-base py-4 disabled:opacity-50"
          >
            {saving ? t.saving : t.saveBtn}
          </button>
        </div>
      </div>
    );
  }

  const progress = ((current) / 10) * 100;

  return (
    <div className="min-h-screen bg-dark-900 text-ink flex flex-col">
      <div className="max-w-lg mx-auto w-full px-4 pt-8 pb-28 animate-fade-in">

        <button onClick={() => navigate('/account')} className="flex items-center gap-2 text-slt hover:text-ink mb-8 transition-colors">
          <ArrowLeft size={18} />
          <span className="text-sm">{t.backBtn}</span>
        </button>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-bold text-ink">{t.title}</h1>
            <span className="text-xs text-slt font-medium">{t.questionOf(current + 1, 10)}</span>
          </div>
          <p className="text-sm text-slt mb-4">{t.subtitle}</p>
          <div className="w-full bg-dark-700 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-brand-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="card mb-8 min-h-[120px] flex items-center">
          <p className="text-lg font-medium text-white leading-relaxed">
            {t.questions[current]}
          </p>
        </div>

        <div className="space-y-3">
          {t.scaleLabels.map((label, i) => (
            <button
              key={i}
              onClick={() => handleAnswer(i + 1)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all active:scale-95 text-left
                ${answers[current] === i + 1
                  ? 'border-brand-500 bg-brand-500/15 text-white'
                  : 'border-dark-600 bg-dark-800 text-ink hover:border-brand-600/50 hover:bg-dark-700'
                }`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                answers[current] === i + 1 ? 'bg-brand-500 text-white' : 'bg-dark-600 text-slt'
              }`}>
                {i + 1}
              </span>
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>

        {current > 0 && (
          <button
            onClick={() => setCurrent(current - 1)}
            className="mt-6 text-sm text-slt hover:text-ink transition-colors w-full text-center"
          >
            ← Previous question
          </button>
        )}
      </div>
    </div>
  );
}

export default PersonalityTestPage;
