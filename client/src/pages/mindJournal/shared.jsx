import { useCallback, useState } from 'react';
import {
  Brain,
  Check,
  CloudLightning,
  Crosshair,
  Dumbbell,
  Eye,
  Frown,
  Heart,
  Moon,
  Sparkles,
  Trophy,
  Wind,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import HelplineList from '../../components/HelplineList';
import { Card } from '../../components/ui';
import { CONTEXT_TYPE_KEYS, STATE_KEYS } from './constants';

// Shared pieces for the two Mind Journal creation screens. Quick Note and
// the guided reflection both pick from the same eight states and both send
// athlete-written text through the same server-side safety screen, so the
// selection rule and the `needs_support` response handling live here once
// instead of being re-implemented (and drifting) on each screen.

// ── Icons ──────────────────────────────────────────────────────────────────

const STATE_ICONS = {
  calm: Wind,
  focused: Crosshair,
  confident: Sparkles,
  motivated: Zap,
  nervous: CloudLightning,
  frustrated: Frown,
  distracted: Eye,
  tired: Moon,
};

const CONTEXT_ICONS = {
  TRAINING: Dumbbell,
  COMPETITION: Trophy,
  TOUGH_MOMENT: CloudLightning,
  RECOVERY_DAY: Heart,
  SOMETHING_ELSE: Brain,
};

// ── Progress ───────────────────────────────────────────────────────────────

export function StepProgress({ label, step, total = 2 }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="mb-5" data-testid="mj-step-progress">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-micro font-bold text-slt uppercase">{label}</p>
        <p className="text-caption font-semibold text-brand-500 tabular-nums">{step}/{total}</p>
      </div>
      <div
        className="h-1.5 rounded-full bg-dark-600 overflow-hidden"
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── State selection ────────────────────────────────────────────────────────

export function StateChips({ selected, onToggle, compact = false }) {
  const { language } = useAuth();
  const mj = translations[language].mindJournal;
  return (
    <div
      className={compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-2.5'}
      data-testid="mj-state-chips"
    >
      {STATE_KEYS.map(key => {
        const isSelected = selected.includes(key);
        const Icon = STATE_ICONS[key] || Wind;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(key)}
            className={`relative flex items-center gap-2.5 min-h-[48px] px-3 py-2.5 rounded-2xl border text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              isSelected
                ? 'border-brand-500 bg-brand-50 text-brand-500 elevation-row'
                : 'border-dark-600 bg-dark-800 text-ink'
            }`}
          >
            <span
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                isSelected ? 'bg-brand-500 text-white' : 'bg-dark-700 text-slt'
              }`}
              aria-hidden="true"
            >
              <Icon size={16} />
            </span>
            <span className="text-body font-semibold leading-snug flex-1">{mj.states[key]}</span>
            {isSelected && (
              <span
                className="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center"
                aria-hidden="true"
              >
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Context type cards (guided step 1) ─────────────────────────────────────

export function ContextTypeCards({ value, onChange }) {
  const { language } = useAuth();
  const mj = translations[language].mindJournal;
  return (
    <div className="space-y-2.5" data-testid="mj-context-cards" role="radiogroup" aria-label={mj.guided.contextHeading}>
      {CONTEXT_TYPE_KEYS.map(key => {
        const isSelected = value === key;
        const Icon = CONTEXT_ICONS[key] || Brain;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-pressed={isSelected}
            aria-label={mj.contextTypes[key]}
            onClick={() => onChange(key)}
            className={`w-full flex items-center gap-3.5 min-h-[64px] p-3.5 rounded-2xl border text-left transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              isSelected
                ? 'border-brand-500 bg-brand-50 elevation-card'
                : 'border-dark-600 bg-dark-800'
            }`}
          >
            <span
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                isSelected ? 'bg-brand-500 text-white' : 'bg-dark-700 text-brand-500'
              }`}
              aria-hidden="true"
            >
              <Icon size={20} />
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block text-body font-bold ${isSelected ? 'text-brand-500' : 'text-ink'}`}>
                {mj.contextTypes[key]}
              </span>
              <span className="block text-caption text-slt mt-0.5 leading-snug">
                {mj.contextTypeHints[key]}
              </span>
            </span>
            <span
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                isSelected ? 'border-brand-500' : 'border-dark-500'
              }`}
              aria-hidden="true"
            >
              {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function contextIconFor(entryType, contextType) {
  if (entryType === 'GUIDED_REFLECTION') {
    return CONTEXT_ICONS[contextType] || Brain;
  }
  return Sparkles;
}

// ── Safety guidance ────────────────────────────────────────────────────────

// Shown instead of the form when the server flags a submission. Nothing was
// persisted in that case, so this must never read as a save confirmation.
export function SafetyGuidanceCard({ guidance, onDismiss }) {
  const { language } = useAuth();
  const mj = translations[language].mindJournal;
  return (
    <Card className="p-4 mb-6 elevation-card">
      <h2 className="text-body font-bold text-amber-400 mb-2">{mj.safety.heading}</h2>
      {guidance && <p className="text-body text-slt leading-relaxed mb-4">{guidance}</p>}
      <div className="mb-4">
        <HelplineList />
      </div>
      <button
        onClick={onDismiss}
        className="w-full py-3 bg-dark-700 text-ink font-semibold rounded-2xl active:scale-95 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {mj.safety.okBtn}
      </button>
    </Card>
  );
}

// ── Save ───────────────────────────────────────────────────────────────────

// POSTs one entry and resolves the three outcomes the server can return:
// created, safety-flagged, or failed. Resolves to the created entry on
// success and to null otherwise, so callers can navigate on a real save and
// only on a real save.
export function useMindJournalSave() {
  const { token, language } = useAuth();
  const mj = translations[language].mindJournal;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  // Wrapped in an object rather than held as the bare guidance string: the
  // server can flag a submission without any guidance text, and the safety
  // screen still has to replace the form instead of falling through to the
  // success path.
  const [safety, setSafety] = useState(null);

  const save = useCallback(async (payload) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch('/api/mind-journal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(data?.error || mj.errorGeneric);
        return null;
      }
      if (data?.safetyFlag === 'needs_support') {
        setSafety({ guidance: data.guidance || null });
        return null;
      }
      return data?.entry ?? null;
    } catch {
      setSaveError(mj.errorNetwork);
      return null;
    } finally {
      setSaving(false);
    }
  }, [token, mj.errorGeneric, mj.errorNetwork]);

  return { saving, saveError, safety, dismissSafety: () => setSafety(null), save };
}
