import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

// ─── Data ─────────────────────────────────────────────────────────────────────

const METRICS = [
  {
    key: 'mood',
    labelKey: 'moodLabel',
    color: { ring: 'border-violet-500', bg: 'bg-violet-50', text: 'text-violet-600' },
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
    color: { ring: 'border-blue-500', bg: 'bg-blue-50', text: 'text-blue-600' },
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
    color: { ring: 'border-orange-500', bg: 'bg-orange-50', text: 'text-orange-600' },
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
    <div className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl ${color.bg} border border-opacity-30`}>
      <span className="text-2xl">{emoji}</span>
      <span className={`text-xs font-semibold ${color.text}`}>{label}</span>
      <span className="text-xs text-gray-400">{value}/5</span>
    </div>
  );
}

function ResultCard({ checkIn, isNew, language, t }) {
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
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          {isNew ? t.savedTitle : t.alreadyTitle}
        </h2>
        <p className="text-sm text-gray-500">
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
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-4 text-sm text-gray-700 italic">
          "{checkIn.reflection}"
        </div>
      )}

      {/* Insight */}
      <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3 mb-6 text-sm text-brand-800 leading-relaxed">
        💡 {insight}
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-3">
        <Link to="/coaching" className="btn-primary justify-center text-sm">
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
  const { token, language } = useAuth();
  const t = translations[language].checkin;

  const [pageState, setPageState] = useState('loading'); // loading | form | done | saved
  const [checkIn, setCheckIn]     = useState(null);
  const [ratings, setRatings]     = useState({ mood: 0, focus: 0, confidence: 0 });
  const [reflection, setReflection] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

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
        body: JSON.stringify({ ...ratings, reflection: reflection.trim() || undefined }),
      });
      const data = await res.json();
      if (res.status === 201) {
        setCheckIn(data.checkIn);
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/dashboard" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            {t.backToDashboard}
          </Link>
          <div className="text-center">
            <p className="font-semibold text-gray-900 text-sm">{t.title}</p>
          </div>
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-1 rounded-full">
            {t.usageLabel()}
          </span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">

        {/* ── Loading ── */}
        {pageState === 'loading' && (
          <div className="flex justify-center pt-20">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ── Already done today ── */}
        {pageState === 'done' && checkIn && (
          <ResultCard checkIn={checkIn} isNew={false} language={language} t={t} />
        )}

        {/* ── Just saved ── */}
        {pageState === 'saved' && checkIn && (
          <ResultCard checkIn={checkIn} isNew={true} language={language} t={t} />
        )}

        {/* ── Check-in form ── */}
        {pageState === 'form' && (
          <div className="animate-fade-in">
            <p className="text-gray-500 text-sm text-center mb-8">{t.subtitle}</p>

            {/* Rating rows */}
            {METRICS.map(metric => {
              const selected = ratings[metric.key];
              const selectedOption = metric.options.find(o => o.v === selected);
              return (
                <div key={metric.key} className="mb-7">
                  {/* Metric label + selected label */}
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-gray-800">{t[metric.labelKey]}</p>
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
                              : 'border-gray-100 bg-white hover:border-gray-300'
                          }`}
                        >
                          <span className="text-2xl leading-none">{opt.emoji}</span>
                          <span className={`text-xs font-medium ${isSelected ? metric.color.text : 'text-gray-400'}`}>
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
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="font-semibold text-gray-800 text-sm">{t.reflectionLabel}</label>
                <span className={`text-xs ${charsLeft < 50 ? 'text-orange-500' : 'text-gray-400'}`}>
                  {t.charsLeft(charsLeft)}
                </span>
              </div>
              <textarea
                value={reflection}
                onChange={e => setReflection(e.target.value.slice(0, 500))}
                placeholder={t.reflectionPlaceholder}
                rows={3}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none placeholder-gray-400 bg-white"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                ⚠️ {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="btn-primary w-full justify-center py-4 text-base rounded-2xl"
            >
              {submitting ? t.saving : t.saveBtn}
            </button>

            {!canSubmit && (
              <p className="text-xs text-center text-gray-400 mt-3">
                Rate all three metrics to save your check-in
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default CheckInPage;
