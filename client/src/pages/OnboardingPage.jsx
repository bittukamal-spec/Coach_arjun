import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

// ─── Data ─────────────────────────────────────────────────────────────────────

const SPORTS = [
  { value: 'cricket',    icon: '🏏', en: 'Cricket',     hi: 'क्रिकेट'       },
  { value: 'football',   icon: '⚽', en: 'Football',    hi: 'फुटबॉल'         },
  { value: 'badminton',  icon: '🏸', en: 'Badminton',   hi: 'बैडमिंटन'       },
  { value: 'athletics',  icon: '🏃', en: 'Athletics',   hi: 'एथलेटिक्स'      },
  { value: 'wrestling',  icon: '🤼', en: 'Wrestling',   hi: 'कुश्ती'          },
  { value: 'boxing',     icon: '🥊', en: 'Boxing',      hi: 'मुक्केबाज़ी'      },
  { value: 'kabaddi',    icon: '🤸', en: 'Kabaddi',     hi: 'कबड्डी'          },
  { value: 'tennis',     icon: '🎾', en: 'Tennis',      hi: 'टेनिस'           },
  { value: 'hockey',     icon: '🏑', en: 'Hockey',      hi: 'हॉकी'            },
  { value: 'swimming',   icon: '🏊', en: 'Swimming',    hi: 'तैराकी'          },
  { value: 'other',      icon: '🏅', en: 'Other sport', hi: 'अन्य खेल'        },
];

const COMPETITION_LEVELS = [
  { value: 'recreational', icon: '🌱', en: 'Just for fun / Club',          hi: 'मनोरंजन / क्लब स्तर'       },
  { value: 'local',        icon: '🏅', en: 'District / Local tournaments', hi: 'जिला / स्थानीय टूर्नामेंट' },
  { value: 'state',        icon: '🥈', en: 'State level',                  hi: 'राज्य स्तर'                 },
  { value: 'national',     icon: '🥇', en: 'National level',               hi: 'राष्ट्रीय स्तर'             },
  { value: 'international',icon: '🌍', en: 'International',                hi: 'अंतरराष्ट्रीय'              },
];

const LEVELS = [
  { value: 'beginner',     icon: '🌱', labelKey: 'levelBeginner',     descKey: 'levelBeginnerDesc'     },
  { value: 'amateur',      icon: '🏅', labelKey: 'levelAmateur',      descKey: 'levelAmateurDesc'      },
  { value: 'competitive',  icon: '🥈', labelKey: 'levelCompetitive',  descKey: 'levelCompetitiveDesc'  },
  { value: 'professional', icon: '🏆', labelKey: 'levelProfessional', descKey: 'levelProfessionalDesc' },
];

const CHALLENGES = [
  { value: 'nerves',          icon: '😰', en: 'Pre-match nerves & anxiety',   hi: 'मैच से पहले घबराहट'    },
  { value: 'failure',         icon: '😞', en: 'Dealing with losses & failure', hi: 'हार और असफलता से उबरना' },
  { value: 'focus',           icon: '🎯', en: 'Losing focus during play',      hi: 'खेल के दौरान ध्यान खोना' },
  { value: 'family_pressure', icon: '👨‍👩‍👦', en: 'Pressure from family/coaches', hi: 'परिवार/कोच का दबाव'   },
  { value: 'injury',          icon: '🏥', en: 'Recovering from injury',        hi: 'चोट से वापसी'           },
  { value: 'consistency',     icon: '📈', en: 'Staying consistent',            hi: 'लगातार अच्छा प्रदर्शन' },
];

const GOALS = [
  { value: 'focus',         icon: '🎯', labelKey: 'goalFocus'         },
  { value: 'pressure',      icon: '💪', labelKey: 'goalPressure'      },
  { value: 'nerves',        icon: '😰', labelKey: 'goalNerves'        },
  { value: 'confidence',    icon: '⭐', labelKey: 'goalConfidence'    },
  { value: 'resilience',    icon: '🔄', labelKey: 'goalResilience'    },
  { value: 'motivation',    icon: '🔥', labelKey: 'goalMotivation'    },
  { value: 'communication', icon: '🤝', labelKey: 'goalCommunication' },
  { value: 'injury',        icon: '🏥', labelKey: 'goalInjury'        },
];

const TOTAL_STEPS = 5;

// ─── Option row ───────────────────────────────────────────────────────────────

function OptionRow({ icon, label, sublabel, selected, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border transition-all text-left active:scale-[0.99] ${
        selected
          ? 'border-brand-500 bg-brand-500/10'
          : disabled
          ? 'border-dark-700 bg-dark-800 opacity-30 cursor-not-allowed'
          : 'border-dark-600 bg-dark-800 hover:border-dark-400'
      }`}
    >
      <span className="text-2xl shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold leading-tight ${selected ? 'text-ink' : 'text-ink'}`}>{label}</p>
        {sublabel && <p className="text-xs text-slt mt-0.5">{sublabel}</p>}
      </div>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        selected ? 'border-brand-500 bg-brand-500' : 'border-dark-500'
      }`}>
        {selected && <span className="text-white text-[10px] font-bold">✓</span>}
      </div>
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

function OnboardingPage() {
  const { token, language, updateUser } = useAuth();
  const navigate = useNavigate();
  const t = translations[language].onboarding;
  const hi = language === 'hi';

  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    sport: '', competitionLevel: '', experienceLevel: '',
    primaryChallenge: '', goals: [], language,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function canContinue() {
    if (step === 1) return data.sport !== '';
    if (step === 2) return data.competitionLevel !== '';
    if (step === 3) return data.experienceLevel !== '';
    if (step === 4) return data.primaryChallenge !== '';
    if (step === 5) return data.goals.length > 0;
    return false;
  }

  function handleContinue() {
    if (step < TOTAL_STEPS) setStep(s => s + 1);
    else handleSubmit();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/me/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save');
      }
      const { user } = await res.json();
      updateUser(user);
      navigate('/mental-game-profile', { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  function toggleGoal(value) {
    setData(prev => {
      const already = prev.goals.includes(value);
      if (already) return { ...prev, goals: prev.goals.filter(g => g !== value) };
      if (prev.goals.length >= 3) return prev;
      return { ...prev, goals: [...prev.goals, value] };
    });
  }

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">

      {/* ── Fixed top bar: back arrow + progress ──────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 pt-4 pb-3 max-w-lg mx-auto w-full">
        {step > 1 ? (
          <button onClick={() => setStep(s => s - 1)} className="shrink-0 p-1 -ml-1 text-slt hover:text-ink transition-colors">
            <ChevronLeft size={24} />
          </button>
        ) : (
          <div className="w-7 shrink-0" />
        )}
        <div className="flex-1 h-1 bg-dark-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-500"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-32 max-w-lg mx-auto w-full">

        {/* Step 1: Sport */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h1 className="text-3xl font-bold text-ink mb-1">{t.sportTitle}</h1>
            <p className="text-slt mb-8">{t.sportSubtitle}</p>
            <div className="grid grid-cols-2 gap-3">
              {SPORTS.map(sport => (
                <OptionRow
                  key={sport.value}
                  icon={sport.icon}
                  label={hi ? sport.hi : sport.en}
                  selected={data.sport === sport.value}
                  onClick={() => setData(d => ({ ...d, sport: sport.value }))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Competition Level */}
        {step === 2 && (
          <div className="animate-fade-in">
            <h1 className="text-3xl font-bold text-ink mb-1">{t.competitionTitle}</h1>
            <p className="text-slt mb-8">{t.competitionSubtitle}</p>
            <div className="flex flex-col gap-3">
              {COMPETITION_LEVELS.map(level => (
                <OptionRow
                  key={level.value}
                  icon={level.icon}
                  label={hi ? level.hi : level.en}
                  selected={data.competitionLevel === level.value}
                  onClick={() => setData(d => ({ ...d, competitionLevel: level.value }))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Experience Level */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h1 className="text-3xl font-bold text-ink mb-1">{t.levelTitle}</h1>
            <p className="text-slt mb-8">{t.levelSubtitle}</p>
            <div className="flex flex-col gap-3">
              {LEVELS.map(level => (
                <OptionRow
                  key={level.value}
                  icon={level.icon}
                  label={t[level.labelKey]}
                  sublabel={t[level.descKey]}
                  selected={data.experienceLevel === level.value}
                  onClick={() => setData(d => ({ ...d, experienceLevel: level.value }))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Primary Challenge */}
        {step === 4 && (
          <div className="animate-fade-in">
            <h1 className="text-3xl font-bold text-ink mb-1">{t.challengeTitle}</h1>
            <p className="text-slt mb-8">{t.challengeSubtitle}</p>
            <div className="flex flex-col gap-3">
              {CHALLENGES.map(challenge => (
                <OptionRow
                  key={challenge.value}
                  icon={challenge.icon}
                  label={hi ? challenge.hi : challenge.en}
                  selected={data.primaryChallenge === challenge.value}
                  onClick={() => setData(d => ({ ...d, primaryChallenge: challenge.value }))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Goals (multi-select up to 3) */}
        {step === 5 && (
          <div className="animate-fade-in">
            <h1 className="text-3xl font-bold text-ink mb-1">{t.goalsTitle}</h1>
            <p className="text-slt mb-8">
              {t.goalsSubtitle}{' '}
              <span className={`font-semibold ${data.goals.length === 3 ? 'text-brand-600' : 'text-slt'}`}>
                ({data.goals.length}/3)
              </span>
            </p>
            <div className="flex flex-col gap-3">
              {GOALS.map(goal => {
                const selected = data.goals.includes(goal.value);
                const maxed    = data.goals.length >= 3 && !selected;
                return (
                  <OptionRow
                    key={goal.value}
                    icon={goal.icon}
                    label={t[goal.labelKey]}
                    selected={selected}
                    disabled={maxed}
                    onClick={() => toggleGoal(goal.value)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* ── Fixed bottom CTA ───────────────────────────────────── */}
      <div className="shrink-0 px-4 pb-8 pt-4 bg-dark-900 border-t border-dark-700 max-w-lg mx-auto w-full">
        <button
          onClick={handleContinue}
          disabled={!canContinue() || submitting}
          className="w-full py-4 rounded-2xl bg-brand-600 text-white font-bold text-base transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting
            ? (hi ? 'सेव हो रहा है…' : 'Saving…')
            : step === TOTAL_STEPS
            ? t.complete
            : t.continue}
        </button>
      </div>

    </div>
  );
}

export default OnboardingPage;
