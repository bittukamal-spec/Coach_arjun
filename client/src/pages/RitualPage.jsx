import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { Trophy, Wind, MessageCircle, Target, Dumbbell, Pencil } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const STEP_TYPES = ['breathe', 'cue', 'visualize', 'physical', 'custom'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const STEP_ICON_MAP = {
  breathe:   Wind,
  cue:       MessageCircle,
  visualize: Target,
  physical:  Dumbbell,
  custom:    Pencil,
};

function StepIcon({ type, size = 20 }) {
  const Icon = STEP_ICON_MAP[type] || Pencil;
  return <Icon size={size} className="text-slt" />;
}

// ── Builder sub-component ─────────────────────────────────────────────────────

function Builder({ initial, onSave, onCancel, t }) {
  const [name, setName]   = useState(initial.name || '');
  const [steps, setSteps] = useState(
    initial.steps.length > 0 ? initial.steps : [{ type: 'breathe', label: '' }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function addStep() {
    if (steps.length >= 5) return;
    setSteps(prev => [...prev, { type: 'custom', label: '' }]);
  }

  function removeStep(i) {
    setSteps(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateStep(i, field, value) {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  async function handleSave() {
    if (saving) return;
    if (!name.trim()) { setError(t.nameLabel + ' is required'); return; }
    const validSteps = steps.filter(s => s.label.trim());
    if (validSteps.length === 0) { setError('Add at least one step'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await onSave({ ritualName: name.trim(), steps: validSteps });
      if (!res.ok) setError('Could not save. Try again.');
    } catch {
      setError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Ritual name */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-ink mb-2">{t.nameLabel}</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t.namePlaceholder}
          maxLength={60}
          className="w-full bg-dark-700 border border-dark-500 text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slt"
        />
      </div>

      {/* Steps */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-ink">{t.steps || 'Steps'}</p>
          <p className="text-xs text-slt">{t.maxSteps}</p>
        </div>

        <div className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <div key={i} className="bg-dark-700 border border-dark-500 rounded-2xl p-4">
              {/* Step number + remove */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slt uppercase tracking-wide">
                  Step {i + 1}
                </span>
                {steps.length > 1 && (
                  <button
                    onClick={() => removeStep(i)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    {t.removeStep}
                  </button>
                )}
              </div>

              {/* Type picker */}
              <div className="flex gap-2 flex-wrap mb-3">
                {STEP_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => updateStep(i, 'type', type)}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl border transition-all ${
                      step.type === type
                        ? 'bg-brand-500/20 border-brand-500/60 text-brand-300'
                        : 'bg-dark-800 border-dark-600 text-slt hover:text-ink'
                    }`}
                  >
                    <StepIcon type={type} size={14} />
                    <span>{t.stepTypes[type]}</span>
                  </button>
                ))}
              </div>

              {/* Label input */}
              <input
                value={step.label}
                onChange={e => updateStep(i, 'label', e.target.value)}
                placeholder={t.stepPlaceholders[step.type]}
                maxLength={120}
                className="w-full bg-dark-800 border border-dark-600 text-ink rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slt"
              />
            </div>
          ))}
        </div>

        {steps.length < 5 && (
          <button
            onClick={addStep}
            className="mt-3 w-full py-3 border-2 border-dashed border-dark-500 text-slt hover:text-ink hover:border-dark-400 rounded-2xl text-sm font-medium transition-all"
          >
            {t.addStep}
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/20 border border-red-900/20 rounded-xl px-4 py-2 mb-4">
          ⚠️ {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary justify-center"
        >
          {saving ? 'Saving…' : t.save}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="btn-secondary justify-center">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ── Walkthrough sub-component ─────────────────────────────────────────────────

function Walkthrough({ steps, t, onFinish }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone]       = useState(false);

  const step = steps[stepIdx];
  const progress = ((stepIdx) / steps.length) * 100;

  function advance() {
    if (stepIdx < steps.length - 1) {
      setStepIdx(i => i + 1);
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 animate-fade-in">
        <div className="mb-6"><Trophy size={56} className="text-fire-500 mx-auto" /></div>
        <h2 className="text-2xl font-bold text-ink mb-3">{t.doneTitle}</h2>
        <p className="text-slt mb-10 max-w-xs">{t.doneSub}</p>
        <button onClick={onFinish} className="btn-primary px-10 py-3">
          {t.backDash.replace('←', '').trim()}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col animate-fade-in">
      {/* Progress bar */}
      <div className="h-1 bg-dark-700 mb-8">
        <div
          className="h-full bg-brand-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <p className="text-xs font-semibold text-slt uppercase tracking-wide mb-6">
          {t.walkthroughOf(stepIdx + 1, steps.length)}
        </p>

        <div className="w-24 h-24 rounded-full bg-brand-500/15 border-2 border-brand-500/40 flex items-center justify-center mb-6">
          <StepIcon type={step.type} size={36} />
        </div>

        <h2 className="text-xl font-bold text-ink mb-3 leading-tight max-w-xs">
          {step.label}
        </h2>

        <div className="flex gap-2 mt-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === stepIdx ? 'bg-brand-400 scale-125' : i < stepIdx ? 'bg-brand-700' : 'bg-dark-600'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="px-4 pb-4 shrink-0">
        <button
          onClick={advance}
          className="btn-primary w-full justify-center py-4 text-base"
        >
          {stepIdx < steps.length - 1 ? t.nextStep : t.finishRitual}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function RitualPage() {
  const { token, language } = useAuth();
  const t = translations[language].ritual;

  const [mode, setMode]           = useState('loading'); // loading | view | build | walk
  const [ritualName, setRitualName] = useState('');
  const [steps, setSteps]         = useState([]);
  const [savedMsg, setSavedMsg]   = useState(false);

  useEffect(() => {
    apiFetch('/api/ritual/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.steps?.length > 0) {
          setRitualName(data.ritualName || '');
          setSteps(data.steps);
          setMode('view');
        } else {
          setMode('build');
        }
      })
      .catch(() => setMode('build'));
  }, [token]);

  async function handleSave({ ritualName: name, steps: newSteps }) {
    const res = await apiFetch('/api/ritual/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ritualName: name, steps: newSteps }),
    });
    if (res.ok) {
      setRitualName(name);
      setSteps(newSteps);
      setMode('view');
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    }
    return res;
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center pb-20">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Walkthrough ────────────────────────────────────────────────────────────

  if (mode === 'walk') {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col pb-20">
        <header className="shrink-0 bg-dark-900 border-b border-dark-600 px-4 py-4">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <button onClick={() => setMode('view')} className="text-sm text-slt hover:text-ink">
              {t.backDash}
            </button>
            <p className="font-semibold text-ink text-sm truncate max-w-[160px]">{ritualName}</p>
            <div className="w-20" />
          </div>
        </header>
        <Walkthrough steps={steps} t={t} onFinish={() => setMode('view')} />
      </div>
    );
  }

  // ── Builder ────────────────────────────────────────────────────────────────

  if (mode === 'build') {
    return (
      <div className="min-h-screen bg-dark-900 pb-20">
        <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            {steps.length > 0 ? (
              <button onClick={() => setMode('view')} className="text-sm text-slt hover:text-ink">
                ← Back
              </button>
            ) : (
              <Link to="/train" className="text-sm text-slt hover:text-ink">{t.backDash}</Link>
            )}
            <p className="font-semibold text-ink">{t.title}</p>
            <div className="w-20" />
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <p className="text-sm text-slt max-w-xs mx-auto leading-relaxed">{t.subtitle}</p>
          </div>
          <Builder
            initial={{ name: ritualName, steps }}
            onSave={handleSave}
            onCancel={steps.length > 0 ? () => setMode('view') : null}
            t={t}
          />
        </main>
      </div>
    );
  }

  // ── View ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-900 pb-20">
      <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/train" className="text-sm text-slt hover:text-ink">{t.backDash}</Link>
          <p className="font-semibold text-ink">{t.title}</p>
          <button onClick={() => setMode('build')} className="text-sm text-brand-400 hover:text-brand-300 font-medium">
            {t.editRitual}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 animate-fade-in">

        {savedMsg && (
          <div className="mb-4 text-center text-win-400 text-sm font-semibold animate-fade-in">
            ✅ {t.saved}
          </div>
        )}

        {/* Ritual name */}
        <div className="text-center mb-8">
          <div className="mb-3"><Trophy size={44} className="text-fire-500 mx-auto" /></div>
          <h2 className="text-xl font-bold text-ink">{ritualName}</h2>
          <p className="text-xs text-slt mt-1">{steps.length} steps</p>
        </div>

        {/* Steps list */}
        <div className="flex flex-col gap-3 mb-8">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-4 bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3.5">
              <div className="w-8 h-8 rounded-full bg-dark-700 border border-dark-500 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-slt">{i + 1}</span>
              </div>
              <StepIcon type={step.type} size={24} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink leading-tight">{step.label}</p>
                <p className="text-xs text-slt capitalize mt-0.5">{t.stepTypes[step.type]}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Use ritual CTA */}
        <button
          onClick={() => setMode('walk')}
          className="btn-primary w-full justify-center py-4 text-base mb-3"
        >
          {t.useRitual} →
        </button>
        <p className="text-xs text-slt text-center">
          {language === 'hi'
            ? 'खेलने या ट्रेनिंग से 2-5 मिनट पहले करें'
            : 'Do this 2-5 minutes before you play or train'}
        </p>
      </main>
    </div>
  );
}

export default RitualPage;
