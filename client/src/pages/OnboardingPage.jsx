import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

// ─── Data ────────────────────────────────────────────────────────────────────

const SPORTS = [
  { value: 'cricket',   icon: '🏏', en: 'Cricket',    hi: 'क्रिकेट' },
  { value: 'football',  icon: '⚽', en: 'Football',   hi: 'फुटबॉल' },
  { value: 'badminton', icon: '🏸', en: 'Badminton',  hi: 'बैडमिंटन' },
  { value: 'athletics', icon: '🏃', en: 'Athletics',  hi: 'एथलेटिक्स' },
  { value: 'wrestling', icon: '🤼', en: 'Wrestling',  hi: 'कुश्ती' },
  { value: 'boxing',    icon: '🥊', en: 'Boxing',     hi: 'मुक्केबाज़ी' },
  { value: 'kabaddi',   icon: '🤸', en: 'Kabaddi',    hi: 'कबड्डी' },
  { value: 'tennis',    icon: '🎾', en: 'Tennis',     hi: 'टेनिस' },
  { value: 'hockey',    icon: '🏑', en: 'Hockey',     hi: 'हॉकी' },
  { value: 'swimming',  icon: '🏊', en: 'Swimming',   hi: 'तैराकी' },
  { value: 'other',     icon: '🏅', en: 'Other',      hi: 'अन्य' },
];

const COMPETITION_LEVELS = [
  { value: 'recreational', icon: '🌱', en: 'Just for fun / Club',           hi: 'मनोरंजन / क्लब स्तर' },
  { value: 'local',        icon: '🏅', en: 'District / Local tournaments',  hi: 'जिला / स्थानीय टूर्नामेंट' },
  { value: 'state',        icon: '🥈', en: 'State level',                   hi: 'राज्य स्तर' },
  { value: 'national',     icon: '🥇', en: 'National level',                hi: 'राष्ट्रीय स्तर' },
  { value: 'international',icon: '🌍', en: 'International',                 hi: 'अंतरराष्ट्रीय' },
];

const LEVELS = [
  { value: 'beginner',     emoij: '🌱', labelKey: 'levelBeginner',     descKey: 'levelBeginnerDesc' },
  { value: 'amateur',      emoij: '🏅', labelKey: 'levelAmateur',      descKey: 'levelAmateurDesc' },
  { value: 'competitive',  emoij: '🥈', labelKey: 'levelCompetitive',  descKey: 'levelCompetitiveDesc' },
  { value: 'professional', emoij: '🏆', labelKey: 'levelProfessional', descKey: 'levelProfessionalDesc' },
];

const CHALLENGES = [
  { value: 'nerves',          icon: '😰', en: 'Pre-match nerves & anxiety',         hi: 'मैच से पहले घबराहट' },
  { value: 'failure',         icon: '😞', en: 'Dealing with losses & failure',       hi: 'हार और असफलता से उबरना' },
  { value: 'focus',           icon: '🎯', en: 'Losing focus during play',            hi: 'खेल के दौरान ध्यान खोना' },
  { value: 'family_pressure', icon: '👨‍👩‍👦', en: 'Pressure from family/coaches',        hi: 'परिवार/कोच का दबाव' },
  { value: 'injury',          icon: '🏥', en: 'Recovering from injury',              hi: 'चोट से वापसी' },
  { value: 'consistency',     icon: '📈', en: 'Staying consistent',                  hi: 'लगातार अच्छा प्रदर्शन' },
];

const PRESSURE_RESPONSES = [
  { value: 'has_routine',     icon: '🧘', en: 'I have a routine (breathing, music)', hi: 'मेरी एक दिनचर्या है (सांस, संगीत)' },
  { value: 'talks_to_others', icon: '🗣️', en: 'I talk to someone I trust',          hi: 'मैं किसी भरोसेमंद से बात करता हूं' },
  { value: 'ignores_it',      icon: '😶', en: 'I try to ignore it and push through', hi: 'मैं इसे नजरअंदाज करने की कोशिश करता हूं' },
  { value: 'struggles',       icon: '😔', en: 'I struggle and it affects my game',   hi: 'मैं संघर्ष करता हूं और इसका असर पड़ता है' },
  { value: 'unaware',         icon: '🤷', en: "I've never thought about it",          hi: 'मैंने कभी इसके बारे में नहीं सोचा' },
];

const GOALS = [
  { value: 'focus',         icon: '🎯', labelKey: 'goalFocus' },
  { value: 'pressure',      icon: '💪', labelKey: 'goalPressure' },
  { value: 'nerves',        icon: '😰', labelKey: 'goalNerves' },
  { value: 'confidence',    icon: '⭐', labelKey: 'goalConfidence' },
  { value: 'resilience',    icon: '🔄', labelKey: 'goalResilience' },
  { value: 'motivation',    icon: '🔥', labelKey: 'goalMotivation' },
  { value: 'communication', icon: '🤝', labelKey: 'goalCommunication' },
  { value: 'injury',        icon: '🏥', labelKey: 'goalInjury' },
];

const TOTAL_STEPS = 5;

// ─── Component ───────────────────────────────────────────────────────────────

function OnboardingPage() {
  const { token, language, updateUser } = useAuth();
  const navigate = useNavigate();
  const t = translations[language].onboarding;

  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    sport: '',
    competitionLevel: '',
    experienceLevel: '',
    primaryChallenge: '',
    goals: [],
    language: language, // auto-detected from app UI; not shown as a step
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Navigation helpers ──────────────────────────────────────────────────

  function canContinue() {
    if (step === 1) return data.sport !== '';
    if (step === 2) return data.competitionLevel !== '';
    if (step === 3) return data.experienceLevel !== '';
    if (step === 4) return data.primaryChallenge !== '';
    if (step === 5) return data.goals.length > 0;
    return false;
  }

  function handleContinue() {
    if (step < TOTAL_STEPS) {
      setStep(s => s + 1);
    } else {
      handleSubmit();
    }
  }

  // ── Submission ──────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/me/onboarding', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save');
      }

      const { user } = await res.json();
      updateUser(user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  // ── Goal toggle ─────────────────────────────────────────────────────────

  function toggleGoal(value) {
    setData(prev => {
      const already = prev.goals.includes(value);
      if (already) {
        return { ...prev, goals: prev.goals.filter(g => g !== value) };
      }
      if (prev.goals.length >= 3) return prev; // max 3
      return { ...prev, goals: [...prev.goals, value] };
    });
  }

  // ── Progress bar ────────────────────────────────────────────────────────

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-calm-50 flex flex-col">

      {/* Top bar */}
      <header className="px-4 py-5 flex items-center justify-between max-w-lg mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧠</span>
          <span className="font-bold text-gray-900 tracking-tight">MindGame</span>
        </div>
        <span className="text-sm text-gray-400">{t.stepOf(step, TOTAL_STEPS)}</span>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100 mx-4 rounded-full max-w-lg mx-auto w-[calc(100%-2rem)]">
        <div
          className="h-1 bg-brand-500 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Card */}
      <main className="flex-1 flex items-start justify-center px-4 pt-8 pb-20">
        <div className="w-full max-w-lg">

          {/* ── Step 1: Sport ── */}
          {step === 1 && (
            <div className="animate-fade-in">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{t.sportTitle}</h1>
              <p className="text-gray-500 text-sm mb-6">{t.sportSubtitle}</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {SPORTS.map(sport => (
                  <button
                    key={sport.value}
                    onClick={() => setData(d => ({ ...d, sport: sport.value }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${
                      data.sport === sport.value
                        ? 'border-brand-500 bg-brand-50 shadow-md'
                        : 'border-gray-100 bg-white hover:border-brand-200'
                    }`}
                  >
                    <span className="text-2xl">{sport.icon}</span>
                    <span className="text-xs font-medium text-gray-700 text-center leading-tight">
                      {language === 'hi' ? sport.hi : sport.en}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Competition Level ── */}
          {step === 2 && (
            <div className="animate-fade-in">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{t.competitionTitle}</h1>
              <p className="text-gray-500 text-sm mb-6">{t.competitionSubtitle}</p>
              <div className="flex flex-col gap-3">
                {COMPETITION_LEVELS.map(level => (
                  <button
                    key={level.value}
                    onClick={() => setData(d => ({ ...d, competitionLevel: level.value }))}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                      data.competitionLevel === level.value
                        ? 'border-brand-500 bg-brand-50 shadow-md'
                        : 'border-gray-100 bg-white hover:border-brand-200'
                    }`}
                  >
                    <span className="text-2xl">{level.icon}</span>
                    <span className="font-semibold text-gray-900">
                      {language === 'hi' ? level.hi : level.en}
                    </span>
                    {data.competitionLevel === level.value && (
                      <span className="ml-auto text-brand-500 text-lg">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Experience Level ── */}
          {step === 3 && (
            <div className="animate-fade-in">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{t.levelTitle}</h1>
              <p className="text-gray-500 text-sm mb-6">{t.levelSubtitle}</p>
              <div className="flex flex-col gap-3">
                {LEVELS.map(level => (
                  <button
                    key={level.value}
                    onClick={() => setData(d => ({ ...d, experienceLevel: level.value }))}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                      data.experienceLevel === level.value
                        ? 'border-brand-500 bg-brand-50 shadow-md'
                        : 'border-gray-100 bg-white hover:border-brand-200'
                    }`}
                  >
                    <span className="text-2xl">{level.emoij}</span>
                    <div>
                      <p className="font-semibold text-gray-900">{t[level.labelKey]}</p>
                      <p className="text-xs text-gray-500">{t[level.descKey]}</p>
                    </div>
                    {data.experienceLevel === level.value && (
                      <span className="ml-auto text-brand-500 text-lg">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 4: Biggest Mental Challenge ── */}
          {step === 4 && (
            <div className="animate-fade-in">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{t.challengeTitle}</h1>
              <p className="text-gray-500 text-sm mb-6">{t.challengeSubtitle}</p>
              <div className="flex flex-col gap-3">
                {CHALLENGES.map(challenge => (
                  <button
                    key={challenge.value}
                    onClick={() => setData(d => ({ ...d, primaryChallenge: challenge.value }))}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                      data.primaryChallenge === challenge.value
                        ? 'border-brand-500 bg-brand-50 shadow-md'
                        : 'border-gray-100 bg-white hover:border-brand-200'
                    }`}
                  >
                    <span className="text-2xl">{challenge.icon}</span>
                    <span className="font-semibold text-gray-900">
                      {language === 'hi' ? challenge.hi : challenge.en}
                    </span>
                    {data.primaryChallenge === challenge.value && (
                      <span className="ml-auto text-brand-500 text-lg">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 5: Goals ── */}
          {step === 5 && (
            <div className="animate-fade-in">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{t.goalsTitle}</h1>
              <div className="flex items-center justify-between mb-6">
                <p className="text-gray-500 text-sm">{t.goalsSubtitle}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  data.goals.length === 3
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.goalsSelected(data.goals.length)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {GOALS.map(goal => {
                  const selected  = data.goals.includes(goal.value);
                  const maxed     = data.goals.length >= 3 && !selected;
                  return (
                    <button
                      key={goal.value}
                      onClick={() => toggleGoal(goal.value)}
                      disabled={maxed}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                        selected
                          ? 'border-brand-500 bg-brand-50 shadow-md'
                          : maxed
                          ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                          : 'border-gray-100 bg-white hover:border-brand-200'
                      }`}
                    >
                      <span className="text-xl">{goal.icon}</span>
                      <span className="text-sm font-medium text-gray-800 leading-tight">
                        {t[goal.labelKey]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Error message ── */}
          {error && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              ⚠️ {error}
            </div>
          )}

          {/* ── Navigation buttons ── */}
          <div className="flex items-center justify-between mt-8">
            {step > 1 ? (
              <button
                onClick={() => setStep(s => s - 1)}
                className="text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
              >
                {t.back}
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={handleContinue}
              disabled={!canContinue() || submitting}
              className="btn-primary px-8 py-3 rounded-2xl"
            >
              {submitting
                ? (language === 'hi' ? 'सेव हो रहा है…' : 'Saving…')
                : step === TOTAL_STEPS
                ? t.complete
                : t.continue}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default OnboardingPage;
