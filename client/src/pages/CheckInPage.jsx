import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { Zap } from 'lucide-react';

// ─── Data ─────────────────────────────────────────────────────────────────────

const METRICS = [
  {
    key: 'mood',
    labelKey: 'moodLabel',
    color: { ring: 'border-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-400' },
    options: [
      { v: 1, emoji: '😞', labelKey: 'mood1' },
      { v: 2, emoji: '😕', labelKey: 'mood2' },
      { v: 3, emoji: '😐', labelKey: 'mood3' },
      { v: 4, emoji: '😊', labelKey: 'mood4' },
      { v: 5, emoji: '😄', labelKey: 'mood5' },
    ],
  },
  {
    key: 'focus',
    labelKey: 'focusLabel',
    color: { ring: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
    options: [
      { v: 1, emoji: '🌀', labelKey: 'focus1' },
      { v: 2, emoji: '😶', labelKey: 'focus2' },
      { v: 3, emoji: '🧐', labelKey: 'focus3' },
      { v: 4, emoji: '🎯', labelKey: 'focus4' },
      { v: 5, emoji: '⚡', labelKey: 'focus5' },
    ],
  },
  {
    key: 'confidence',
    labelKey: 'confidenceLabel',
    color: { ring: 'border-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-400' },
    options: [
      { v: 1, emoji: '😨', labelKey: 'conf1' },
      { v: 2, emoji: '😟', labelKey: 'conf2' },
      { v: 3, emoji: '🙂', labelKey: 'conf3' },
      { v: 4, emoji: '💪', labelKey: 'conf4' },
      { v: 5, emoji: '🔥', labelKey: 'conf5' },
    ],
  },
];

// Rule-based insight — no API call needed
function getInsight(checkIn, language) {
  const { mood, focus, confidence } = checkIn;
  const avg = (mood + focus + confidence) / 3;

  const pick = (en, hi) => language === 'hi' ? hi : en;

  if (avg >= 4.5)  return pick("You're at your peak today! Push hard in training — this is your window.", "आज आप चोटी पर हैं! ट्रेनिंग में जोर लगाएं — यह आपका सुनहरा मौका है।");
  if (focus <= 2)  return pick("Focus is low today. Try box breathing: 4 counts in → hold 4 → out 4. Repeat 3 times.", "आज फोकस कम है। बॉक्स ब्रीदिंग आज़माएं: 4 सांस लें → 4 रोकें → 4 छोड़ें। 3 बार दोहराएं।");
  if (confidence <= 2) return pick("Confidence is shaky — that's normal before big challenges. Recall your best performance; that athlete is still you.", "आत्मविश्वास कम है — बड़े चैलेंज से पहले यह सामान्य है। अपने सर्वश्रेष्ठ प्रदर्शन को याद करें; वह एथलीट अभी भी आप हैं।");
  if (mood <= 2)   return pick("Mood is low — be kind to yourself today. A light session and good rest may serve you better than pushing hard.", "मूड कम है — आज खुद के प्रति दयालु रहें। हल्की ट्रेनिंग और अच्छा आराम आज बेहतर रहेगा।");
  if (avg >= 3.5)  return pick("Solid mental state today. Channel it into focused, deliberate practice.", "आज मानसिक स्थिति अच्छी है। इसे केंद्रित और सोच-समझकर की गई प्रैक्टिस में लगाएं।");
  return pick("Every check-in builds self-awareness. Your coach can help you work through today's feelings.", "हर चेक-इन आत्म-जागरूकता बढ़ाता है। आपका कोच आज की भावनाओं में मदद कर सकता है।");
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function MetricPill({ emoji, label, value, color }) {
  return (
    <div className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl ${color.bg} border border-dark-500`}>
      <span className="text-2xl">{emoji}</span>
      <span className={`text-xs font-semibold ${color.text}`}>{label}</span>
      <span className="text-xs text-slate-500">{value}/5</span>
    </div>
  );
}

function ResultCard({ checkIn, isNew, language, t, xpEarned, newAchievements }) {
  const insight = getInsight(checkIn, language);

  const metricEmojis = {
    mood:       METRICS[0].options[checkIn.mood - 1].emoji,
    focus:      METRICS[1].options[checkIn.focus - 1].emoji,
    confidence: METRICS[2].options[checkIn.confidence - 1].emoji,
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">✅</div>
        <h2 className="text-xl font-bold text-slate-100 mb-1">
          {isNew ? t.savedTitle : t.alreadyTitle}
        </h2>
        <p className="text-sm text-slate-400">
          {isNew ? t.savedSubtitle : t.alreadySubtitle}
        </p>
      </div>

      {/* Ratings summary */}
      <div className="flex justify-center gap-3 mb-5">
        {METRICS.map(m => (
          <MetricPill
            key={m.key}
            emoji={metricEmojis[m.key]}
            label={t[m.labelKey]}
            value={checkIn[m.key]}
            color={m.color}
          />
        ))}
      </div>

      {/* Reflection */}
      {checkIn.reflection && (
        <div className="bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 mb-3 text-sm text-slate-300 italic">
          "{checkIn.reflection}"
        </div>
      )}

      {/* Gratitude */}
      {checkIn.gratitude && (
        <div className="bg-win-500/10 border border-win-500/20 rounded-xl px-4 py-3 mb-3 text-sm text-win-300 flex items-start gap-2">
          <span className="shrink-0">🙏</span>
          <span className="italic">"{checkIn.gratitude}"</span>
        </div>
      )}

      {/* Energy + Sleep quick summary */}
      {(checkIn.energy || checkIn.sleep) && (
        <div className="flex items-center gap-3 mb-4">
          {checkIn.energy && (
            <div className="flex items-center gap-1.5 bg-dark-700 border border-dark-500 rounded-xl px-3 py-2 text-xs text-slate-300">
              <span>⚡</span>
              <span>Energy: {checkIn.energy}/5</span>
            </div>
          )}
          {checkIn.sleep && (
            <div className="flex items-center gap-1.5 bg-dark-700 border border-dark-500 rounded-xl px-3 py-2 text-xs text-slate-300">
              <span>🌙</span>
              <span>Sleep: {checkIn.sleep.charAt(0).toUpperCase() + checkIn.sleep.slice(1)}</span>
            </div>
          )}
        </div>
      )}

      {/* Insight */}
      <div className="bg-brand-600/10 border border-brand-600/20 rounded-xl px-4 py-3 mb-6 text-sm text-brand-300 leading-relaxed">
        💡 {insight}
      </div>

      {/* XP earned (only on new save) */}
      {isNew && xpEarned && (
        <div className="flex items-center justify-center gap-2 mb-4 animate-fade-in">
          <Zap size={16} className="text-brand-400" />
          <span className="text-brand-400 font-semibold text-sm">+{xpEarned} MXP earned</span>
        </div>
      )}

      {/* New achievements unlocked */}
      {isNew && newAchievements.length > 0 && (
        <div className="mb-5 space-y-2">
          {newAchievements.map(a => (
            <div key={a.key} className="flex items-center gap-3 bg-fire-500/10 border border-fire-500/20 rounded-xl px-4 py-3 animate-badge-pop">
              <span className="text-2xl">{a.icon}</span>
              <div>
                <p className="font-semibold text-fire-300 text-sm">Achievement unlocked!</p>
                <p className="text-white text-sm font-bold">{a.name}</p>
              </div>
              <span className="ml-auto text-xs font-semibold text-fire-400 bg-fire-500/20 px-2 py-0.5 rounded-full">+{a.xp} XP</span>
            </div>
          ))}
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-col gap-3">
        <Link
          to="/coaching"
          state={{ sessionType: 'post_checkin' }}
          className="btn-primary justify-center text-sm"
        >
          {t.talkToCoach}
        </Link>
        <Link to="/dashboard" className="btn-secondary justify-center text-sm">
          {t.backBtn}
        </Link>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

function CheckInPage() {
  const { user, token, language } = useAuth();
  const t = translations[language].checkin;

  const [pageState, setPageState] = useState('loading'); // loading | form | done | saved
  const [checkIn, setCheckIn]     = useState(null);
  const [ratings, setRatings]     = useState({ mood: 0, focus: 0, confidence: 0 });
  const [reflection, setReflection] = useState('');
  const [gratitude, setGratitude]   = useState('');
  const [energy, setEnergy]         = useState(0);   // 0 = not set
  const [sleep, setSleep]           = useState('');  // '' | 'poor' | 'ok' | 'great'
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [xpEarned, setXpEarned]       = useState(null);
  const [newAchievements, setNewAchievements] = useState([]);

  // ── Load today's status on mount ─────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch('/api/checkin/today', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.checkIn) {
            setCheckIn(data.checkIn);
            setPageState('done');
          } else {
            setPageState('form');
          }
        } else {
          setPageState('form');
        }
      } catch {
        setPageState('form');
      }
    }
    load();
  }, [token]);

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...ratings,
          reflection: reflection.trim() || undefined,
          gratitude: gratitude.trim() || undefined,
          energy: energy || undefined,
          sleep: sleep || undefined,
        }),
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
      } else if (res.status === 429) {
        setPageState('limit');
      } else {
        throw new Error(data.error || 'Save failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = ratings.mood > 0 && ratings.focus > 0 && ratings.confidence > 0;
  const charsLeft = 500 - reflection.length;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header */}
      <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/dashboard" className="hidden sm:block text-sm text-slate-400 hover:text-slate-200 transition-colors">
            {t.backToDashboard}
          </Link>
          <p className="font-semibold text-slate-100 text-sm sm:absolute sm:left-1/2 sm:-translate-x-1/2">{t.title}</p>
          <span className="text-xs font-semibold text-win-400 bg-win-500/10 border border-win-500/20 px-2 py-1 rounded-full ml-auto sm:ml-0">
            +10 MXP
          </span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 pb-20">

        {/* ── Loading ── */}
        {pageState === 'loading' && (
          <div className="flex justify-center pt-20">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ── Already done today ── */}
        {pageState === 'done' && checkIn && (
          <ResultCard checkIn={checkIn} isNew={false} language={language} t={t} xpEarned={null} newAchievements={[]} />
        )}

        {/* ── Just saved ── */}
        {pageState === 'saved' && checkIn && (
          <ResultCard checkIn={checkIn} isNew={true} language={language} t={t} xpEarned={xpEarned} newAchievements={newAchievements} />
        )}

        {/* ── Check-in form ── */}
        {pageState === 'form' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <p className="text-xl font-bold text-white mb-1">
                {language === 'hi' ? `आज कैसे हैं, ${user?.name?.split(' ')[0]}?` : `How are you today, ${user?.name?.split(' ')[0]}?`}
              </p>
              <p className="text-sm text-slate-500">{t.subtitle}</p>
            </div>

            {/* Rating rows */}
            {METRICS.map(metric => {
              const selected = ratings[metric.key];
              const selectedOption = metric.options.find(o => o.v === selected);
              return (
                <div key={metric.key} className="mb-7">
                  {/* Metric label + selected label */}
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-slate-200">{t[metric.labelKey]}</p>
                    {selectedOption && (
                      <span className={`text-sm font-medium ${metric.color.text} transition-all`}>
                        {t[selectedOption.labelKey]}
                      </span>
                    )}
                  </div>

                  {/* 5 emoji buttons */}
                  <div className="grid grid-cols-5 gap-2">
                    {metric.options.map(opt => {
                      const isSelected = selected === opt.v;
                      return (
                        <button
                          key={opt.v}
                          onClick={() => setRatings(prev => ({ ...prev, [metric.key]: opt.v }))}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all active:scale-95 ${
                            isSelected
                              ? `${metric.color.ring} ${metric.color.bg} shadow-sm scale-105`
                              : 'border-dark-600 bg-dark-800 hover:border-dark-500'
                          }`}
                        >
                          <span className="text-2xl leading-none">{opt.emoji}</span>
                          <span className={`text-xs font-medium ${isSelected ? metric.color.text : 'text-slate-500'}`}>
                            {opt.v}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Reflection */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="font-semibold text-slate-200 text-sm">{t.reflectionLabel}</label>
                <span className={`text-xs ${charsLeft < 50 ? 'text-orange-400' : 'text-slate-500'}`}>
                  {t.charsLeft(charsLeft)}
                </span>
              </div>
              <textarea
                value={reflection}
                onChange={e => setReflection(e.target.value.slice(0, 500))}
                placeholder={t.reflectionPlaceholder}
                rows={3}
                className="w-full bg-dark-700 border border-dark-500 text-slate-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none placeholder-slate-500"
              />
            </div>

            {/* Gratitude */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 font-semibold text-slate-200 text-sm">
                  <span>🙏</span> {t.gratitudeLabel}
                </label>
                {gratitude.trim() && (
                  <span className="text-xs font-semibold text-win-400 bg-win-500/10 border border-win-500/20 px-2 py-0.5 rounded-full">
                    {t.gratitudeXp}
                  </span>
                )}
              </div>
              <textarea
                value={gratitude}
                onChange={e => setGratitude(e.target.value.slice(0, 300))}
                placeholder={t.gratitudePlaceholder}
                rows={2}
                className="w-full bg-dark-700 border border-dark-500 text-slate-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-win-500 focus:border-transparent resize-none placeholder-slate-500"
              />
            </div>

            {/* Energy slider */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-1.5 font-semibold text-slate-200 text-sm">
                  <span>⚡</span> {t.energyLabel}
                </label>
                <div className="flex items-center gap-1.5">
                  {energy > 0 && (
                    <span className="text-sm font-medium text-fire-400">{t[`energy${energy}`]}</span>
                  )}
                  {energy > 0 && (
                    <span className="text-xs font-semibold text-fire-400 bg-fire-500/10 border border-fire-500/20 px-2 py-0.5 rounded-full">
                      {t.energyXp}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map(v => {
                  const emojis = ['😩', '😔', '😐', '💪', '🚀'];
                  const isSelected = energy === v;
                  return (
                    <button
                      key={v}
                      onClick={() => setEnergy(prev => prev === v ? 0 : v)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all active:scale-95 ${
                        isSelected
                          ? 'border-fire-500 bg-fire-500/10 scale-105'
                          : 'border-dark-600 bg-dark-800 hover:border-dark-500'
                      }`}
                    >
                      <span className="text-2xl leading-none">{emojis[v - 1]}</span>
                      <span className={`text-xs font-medium ${isSelected ? 'text-fire-400' : 'text-slate-500'}`}>{v}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sleep picker */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-1.5 font-semibold text-slate-200 text-sm">
                  <span>🌙</span> {t.sleepLabel}
                </label>
                {sleep && (
                  <span className="text-xs font-semibold text-fire-400 bg-fire-500/10 border border-fire-500/20 px-2 py-0.5 rounded-full">
                    {t.energyXp}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: 'poor',  label: t.sleepPoor,  emoji: '😴', color: 'border-red-500 bg-red-500/10 text-red-400' },
                  { val: 'ok',    label: t.sleepOk,    emoji: '😑', color: 'border-amber-500 bg-amber-500/10 text-amber-400' },
                  { val: 'great', label: t.sleepGreat, emoji: '🌟', color: 'border-win-500 bg-win-500/10 text-win-400' },
                ].map(opt => {
                  const isSelected = sleep === opt.val;
                  return (
                    <button
                      key={opt.val}
                      onClick={() => setSleep(prev => prev === opt.val ? '' : opt.val)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all active:scale-95 ${
                        isSelected ? opt.color + ' scale-105' : 'border-dark-600 bg-dark-800 hover:border-dark-500'
                      }`}
                    >
                      <span className="text-2xl leading-none">{opt.emoji}</span>
                      <span className={`text-xs font-medium ${isSelected ? '' : 'text-slate-500'}`}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 text-sm text-red-400 bg-red-950/20 border border-red-900/20 rounded-xl px-4 py-3">
                ⚠️ {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="w-full justify-center py-4 text-base rounded-2xl font-bold text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100
                bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 shadow-lg shadow-brand-900/40 flex items-center gap-2"
            >
              {submitting ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t.saving}</>
              ) : (
                <>{t.saveBtn} ⚡</>
              )}
            </button>

            {!canSubmit && (
              <p className="text-xs text-center text-slate-500 mt-3">
                {language === 'hi' ? 'तीनों मेट्रिक्स रेट करें' : 'Rate all three to save your pulse'}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default CheckInPage;
