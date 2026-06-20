import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { Zap } from 'lucide-react';

// ─── Data ─────────────────────────────────────────────────────────────────────

const METRICS = [
  {
    key: 'mood',
    labelKey: 'moodLabel',
    questionEn: "How's your mood?",
    questionHi: 'आज का मूड कैसा है?',
    options: [
      { v: 1, emoji: '😞', labelKey: 'mood1' },
      { v: 2, emoji: '😕', labelKey: 'mood2' },
      { v: 3, emoji: '😐', labelKey: 'mood3' },
      { v: 4, emoji: '😊', labelKey: 'mood4' },
      { v: 5, emoji: '😄', labelKey: 'mood5' },
    ],
    color: 'border-brand-500 bg-brand-500/10 text-brand-600',
    barColor: 'bg-brand-500',
  },
  {
    key: 'focus',
    labelKey: 'focusLabel',
    questionEn: "How's your focus?",
    questionHi: 'आज का फोकस कैसा है?',
    options: [
      { v: 1, emoji: '🌀', labelKey: 'focus1' },
      { v: 2, emoji: '😶', labelKey: 'focus2' },
      { v: 3, emoji: '🧐', labelKey: 'focus3' },
      { v: 4, emoji: '🎯', labelKey: 'focus4' },
      { v: 5, emoji: '⚡', labelKey: 'focus5' },
    ],
    color: 'border-sky-500 bg-sky-500/10 text-sky-600',
    barColor: 'bg-sky-500',
  },
  {
    key: 'confidence',
    labelKey: 'confidenceLabel',
    questionEn: "How's your confidence?",
    questionHi: 'आत्मविश्वास कैसा है?',
    options: [
      { v: 1, emoji: '😨', labelKey: 'conf1' },
      { v: 2, emoji: '😟', labelKey: 'conf2' },
      { v: 3, emoji: '🙂', labelKey: 'conf3' },
      { v: 4, emoji: '💪', labelKey: 'conf4' },
      { v: 5, emoji: '🔥', labelKey: 'conf5' },
    ],
    color: 'border-win-500 bg-win-500/10 text-win-600',
    barColor: 'bg-win-500',
  },
];

const STEPS = ['mood', 'focus', 'confidence', 'notes'];

function getInsight(checkIn, language) {
  const { mood, focus, confidence } = checkIn;
  const avg = (mood + focus + confidence) / 3;
  const pick = (en, hi) => language === 'hi' ? hi : en;
  if (avg >= 4.5)  return pick("You're at your peak today! Push hard in training.", "आज आप चोटी पर हैं! ट्रेनिंग में जोर लगाएं।");
  if (focus <= 2)  return pick("Focus is low. Try box breathing: 4 in → hold 4 → out 4.", "आज फोकस कम है। बॉक्स ब्रीदिंग आज़माएं: 4 सांस लें → 4 रोकें → 4 छोड़ें।");
  if (confidence <= 2) return pick("Confidence is shaky — that's normal. Recall your best performance.", "आत्मविश्वास कम है — यह सामान्य है। अपने सर्वश्रेष्ठ प्रदर्शन को याद करें।");
  if (mood <= 2)   return pick("Mood is low — be kind to yourself today.", "मूड कम है — आज खुद के प्रति दयालु रहें।");
  if (avg >= 3.5)  return pick("Solid mental state today. Channel it into deliberate practice.", "आज मानसिक स्थिति अच्छी है। इसे प्रैक्टिस में लगाएं।");
  return pick("Every check-in builds self-awareness. Keep going.", "हर चेक-इन आत्म-जागरूकता बढ़ाता है। जारी रखें।");
}

// ─── Main component ────────────────────────────────────────────────────────────

function CheckInPage() {
  const { user, token, language } = useAuth();
  const t = translations[language].checkin;
  const hi = language === 'hi';

  const [pageState, setPageState]   = useState('loading'); // loading | steps | done | saved
  const [step, setStep]             = useState(0); // index into STEPS
  const [ratings, setRatings]       = useState({ mood: 0, focus: 0, confidence: 0 });
  const [reflection, setReflection] = useState('');
  const [checkIn, setCheckIn]       = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [xpEarned, setXpEarned]     = useState(null);
  const [newAchievements, setNewAchievements] = useState([]);
  const [advancing, setAdvancing]   = useState(false); // brief lock during auto-advance

  useEffect(() => {
    apiFetch('/api/checkin/today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.checkIn) { setCheckIn(data.checkIn); setPageState('done'); }
        else setPageState('steps');
      })
      .catch(() => setPageState('steps'));
  }, [token]);

  function handleRate(metricKey, value) {
    if (advancing) return;
    setRatings(prev => ({ ...prev, [metricKey]: value }));
    setAdvancing(true);
    setTimeout(() => {
      setStep(s => s + 1);
      setAdvancing(false);
    }, 380);
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...ratings, reflection: reflection.trim() || undefined }),
      });
      const data = await res.json();
      if (res.status === 201) {
        setCheckIn(data.checkIn);
        setXpEarned(data.xpEarned ?? 10);
        setNewAchievements(data.newAchievements ?? []);
        setPageState('saved');
      } else if (res.status === 409) {
        setCheckIn(data.checkIn);
        setPageState('done');
      } else {
        throw new Error(data.error || 'Save failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const currentMetric = METRICS[step]; // null when step === 3 (notes)
  const isNotesStep   = step === 3;
  const progressPct   = Math.min((step / 3) * 100, 100);

  // ── Result view (done or saved) ───────────────────────────────────────────

  if (pageState === 'done' || pageState === 'saved') {
    const isNew = pageState === 'saved';
    return (
      <div className="min-h-screen bg-dark-900">
        <header className="px-4 py-4 flex items-center gap-3 max-w-lg mx-auto">
          <Link to="/dashboard" className="text-slt hover:text-ink transition-colors">
            <ChevronLeft size={24} />
          </Link>
        </header>
        <main className="max-w-lg mx-auto px-4 pb-24 animate-fade-in">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-2xl font-bold text-ink mb-1">
              {isNew ? t.savedTitle : t.alreadyTitle}
            </h2>
            <p className="text-slt">{isNew ? t.savedSubtitle : t.alreadySubtitle}</p>
          </div>

          {/* Score bars */}
          <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5 mb-5">
            {METRICS.map(m => (
              <div key={m.key} className="mb-3 last:mb-0">
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm text-slt">{t[m.labelKey]}</span>
                  <span className="text-sm font-bold text-ink">{checkIn[m.key]}/5</span>
                </div>
                <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${m.barColor}`} style={{ width: `${(checkIn[m.key] / 5) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Insight */}
          <div className="bg-brand-500/10 border border-brand-500/20 rounded-2xl px-4 py-4 mb-5 text-sm text-brand-600 leading-relaxed">
            💡 {getInsight(checkIn, language)}
          </div>

          {/* XP */}
          {isNew && xpEarned && (
            <div className="flex items-center justify-center gap-2 mb-4">
              <Zap size={16} className="text-brand-500" />
              <span className="text-brand-600 font-semibold text-sm">+{xpEarned} MXP earned</span>
            </div>
          )}

          {/* Achievements */}
          {isNew && newAchievements.length > 0 && (
            <div className="mb-5 space-y-2">
              {newAchievements.map(a => (
                <div key={a.key} className="flex items-center gap-3 bg-fire-500/10 border border-fire-500/20 rounded-2xl px-4 py-3">
                  <span className="text-2xl">{a.icon}</span>
                  <div>
                    <p className="font-semibold text-fire-600 text-sm">Achievement unlocked!</p>
                    <p className="text-ink text-sm font-bold">{a.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CTAs */}
          <div className="flex flex-col gap-3">
            <Link
              to="/coaching"
              state={{ sessionType: 'post_checkin' }}
              className="w-full text-center py-4 bg-brand-600 text-white font-bold rounded-2xl active:scale-[0.98] transition-transform"
            >
              {t.talkToCoach}
            </Link>
            <Link
              to="/dashboard"
              className="w-full text-center py-3.5 bg-dark-800 border border-dark-600 text-ink font-semibold rounded-2xl active:scale-[0.98] transition-transform"
            >
              {t.backBtn}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Step-by-step form ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">

      {/* Progress bar */}
      <div className="shrink-0 flex items-center gap-3 px-4 pt-4 pb-3 max-w-lg mx-auto w-full">
        <button
          onClick={() => step > 0 ? setStep(s => s - 1) : null}
          className={`shrink-0 p-1 -ml-1 transition-colors ${step > 0 ? 'text-slt hover:text-ink' : 'text-dark-700 pointer-events-none'}`}
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex-1 h-1 bg-dark-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-400"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-4 pt-8 pb-8 max-w-lg mx-auto w-full">

        {/* ── Metric step (0-2) ── */}
        {!isNotesStep && currentMetric && (
          <div key={currentMetric.key} className="animate-fade-in flex flex-col flex-1">
            <div className="mb-10">
              <p className="text-xs font-bold text-slt uppercase tracking-widest mb-2">
                {hi ? 'आज का चेक-इन' : "Today's check-in"}
              </p>
              <h1 className="text-3xl font-bold text-ink">
                {hi ? currentMetric.questionHi : currentMetric.questionEn}
              </h1>
            </div>

            <div className="flex flex-col gap-3">
              {currentMetric.options.map(opt => {
                const selected = ratings[currentMetric.key] === opt.v;
                return (
                  <button
                    key={opt.v}
                    onClick={() => handleRate(currentMetric.key, opt.v)}
                    disabled={advancing}
                    className={`flex items-center gap-4 px-5 py-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                      selected
                        ? currentMetric.color
                        : 'border-dark-600 bg-dark-800 hover:border-dark-400'
                    }`}
                  >
                    <span className="text-3xl shrink-0">{opt.emoji}</span>
                    <span className={`font-semibold text-base ${selected ? '' : 'text-ink'}`}>
                      {t[opt.labelKey]}
                    </span>
                    {selected && <span className="ml-auto text-sm">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Notes step (3) ── */}
        {isNotesStep && (
          <div className="animate-fade-in flex flex-col flex-1">
            <div className="mb-8">
              <p className="text-xs font-bold text-slt uppercase tracking-widest mb-2">
                {hi ? 'आज का चेक-इन' : "Today's check-in"}
              </p>
              <h1 className="text-3xl font-bold text-ink mb-1">
                {hi ? 'कुछ नोट्स?' : 'Any notes?'}
              </h1>
              <p className="text-slt">{hi ? 'वैकल्पिक — छोड़ सकते हैं' : 'Optional — you can skip this'}</p>
            </div>

            {/* Quick score recap */}
            <div className="flex gap-2 mb-6">
              {METRICS.map(m => (
                <div key={m.key} className="flex-1 bg-dark-800 border border-dark-600 rounded-xl py-2 text-center">
                  <p className="text-xs text-slt mb-0.5">{t[m.labelKey]}</p>
                  <p className="font-bold text-ink">{ratings[m.key]}/5</p>
                </div>
              ))}
            </div>

            <textarea
              value={reflection}
              onChange={e => setReflection(e.target.value.slice(0, 500))}
              placeholder={hi ? 'आज के बारे में कुछ लिखें…' : 'Write anything about today…'}
              rows={4}
              className="w-full bg-dark-800 border border-dark-600 text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none placeholder-slt mb-4"
            />

            {error && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                ⚠️ {error}
              </div>
            )}

            <div className="flex flex-col gap-3 mt-auto">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-4 bg-brand-600 text-white font-bold rounded-2xl text-base active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t.saving}</>
                  : <>{t.saveBtn} ⚡</>}
              </button>
              {!submitting && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-3 text-slt hover:text-ink text-sm font-medium transition-colors"
                >
                  {hi ? 'नोट छोड़ें और सेव करें' : 'Skip notes & save'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CheckInPage;
