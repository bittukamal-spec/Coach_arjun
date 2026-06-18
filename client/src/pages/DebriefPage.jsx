import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

const QUESTIONS = [
  { key: 'wentWell',       maxLen: 500, rows: 4 },
  { key: 'doDifferently',  maxLen: 500, rows: 4 },
  { key: 'nextFocus',      maxLen: 300, rows: 3 },
];

function DebriefPage() {
  const { token, language, updateUser } = useAuth();
  const t = translations[language].debrief;
  const navigate = useNavigate();

  const [step, setStep]         = useState(0); // 0-2 = questions, 3 = result
  const [answers, setAnswers]   = useState({ wentWell: '', doDifferently: '', nextFocus: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');
  const [result, setResult]     = useState(null); // { arjunInsight, xp, xpEarned }

  const q = QUESTIONS[step];
  const labelKey = ['q1Label', 'q2Label', 'q3Label'][step];
  const placeholderKey = ['q1Placeholder', 'q2Placeholder', 'q3Placeholder'][step];
  const currentAnswer = answers[q?.key] || '';
  const isLast = step === QUESTIONS.length - 1;

  function handleNext() {
    if (!currentAnswer.trim()) return;
    if (!isLast) {
      setStep(s => s + 1);
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/api/debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(answers),
      });
      if (!res.ok) { setError('Could not save. Try again.'); return; }
      const data = await res.json();
      setResult(data);
      if (updateUser && data.xp !== undefined) updateUser({ xp: data.xp });
      setStep(3);
    } catch {
      setError('Could not save. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Result screen ─────────────────────────────────────────────────────────

  if (step === 3 && result) {
    return (
      <div className="min-h-screen bg-dark-900 pb-20">
        <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <Link to="/dashboard" className="text-sm text-slate-400 hover:text-slate-200">{t.backDash}</Link>
            <p className="font-semibold text-slate-100">{t.title}</p>
            <div className="w-20" />
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-10 animate-fade-in">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🧠</div>
            <h2 className="text-2xl font-bold text-white mb-2">{t.resultTitle}</h2>
            <span className="inline-block bg-win-500/20 text-win-400 border border-win-500/30 text-sm font-semibold px-3 py-1 rounded-full">
              {t.resultXp}
            </span>
          </div>

          {result.arjunInsight && (
            <div className="bg-dark-800 border border-brand-500/30 rounded-2xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-sm">
                  🏹
                </div>
                <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide">{t.insightLabel}</p>
              </div>
              <p className="text-slate-200 text-sm leading-relaxed">{result.arjunInsight}</p>
            </div>
          )}

          {/* Summary of answers */}
          <div className="flex flex-col gap-3 mb-8">
            {[
              { label: t.q1Label, value: answers.wentWell },
              { label: t.q2Label, value: answers.doDifferently },
              { label: t.q3Label, value: answers.nextFocus },
            ].map(({ label, value }) => (
              <div key={label} className="bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>
                <p className="text-sm text-slate-300 leading-relaxed">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <Link
              to="/coaching"
              state={{ sessionType: 'post_match' }}
              className="btn-primary justify-center"
            >
              {t.talkToArjun}
            </Link>
            <Link to="/dashboard" className="btn-secondary justify-center">
              {t.backBtn}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Question screen ───────────────────────────────────────────────────────

  const progress = ((step) / QUESTIONS.length) * 100;

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col pb-20">
      <header className="shrink-0 bg-dark-900 border-b border-dark-600 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          {step > 0 ? (
            <button onClick={() => setStep(s => s - 1)} className="text-sm text-slate-400 hover:text-slate-200">
              ← Back
            </button>
          ) : (
            <Link to="/dashboard" className="text-sm text-slate-400 hover:text-slate-200">{t.backDash}</Link>
          )}
          <p className="font-semibold text-slate-100">{t.title}</p>
          <p className="text-xs text-slate-500">{t.stepOf(step + 1, QUESTIONS.length)}</p>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-dark-700">
        <div
          className="h-full bg-brand-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8 animate-fade-in flex flex-col">
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {t.stepOf(step + 1, QUESTIONS.length)}
          </p>
          <h2 className="text-xl font-bold text-white mb-6 leading-snug">
            {t[labelKey]}
          </h2>

          <textarea
            value={currentAnswer}
            onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
            placeholder={t[placeholderKey]}
            maxLength={q.maxLen}
            rows={q.rows}
            autoFocus
            className="w-full bg-dark-700 border border-dark-500 text-slate-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slate-500 resize-none leading-relaxed"
          />
          <p className="text-xs text-slate-600 text-right mt-1">{currentAnswer.length}/{q.maxLen}</p>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/20 border border-red-900/20 rounded-xl px-4 py-2 mb-4">
            ⚠️ {error}
          </p>
        )}

        <button
          onClick={handleNext}
          disabled={!currentAnswer.trim() || submitting}
          className="btn-primary w-full justify-center py-4 text-base disabled:opacity-40"
        >
          {submitting
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />{t.submitting}</>
            : isLast ? t.submit : t.next}
        </button>
      </main>
    </div>
  );
}

export default DebriefPage;
