import { useCallback, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import HelplineList from '../../components/HelplineList';
import { Card } from '../../components/ui';
import { STATE_KEYS } from './constants';

// Shared pieces for the two Mind Journal creation screens. Quick Note and
// the guided reflection both pick from the same eight states and both send
// athlete-written text through the same server-side safety screen, so the
// selection rule and the `needs_support` response handling live here once
// instead of being re-implemented (and drifting) on each screen.

// ── State selection ────────────────────────────────────────────────────────

export function StateChips({ selected, onToggle }) {
  const { language } = useAuth();
  const mj = translations[language].mindJournal;
  return (
    <div className="flex flex-wrap gap-2">
      {STATE_KEYS.map(key => {
        const isSelected = selected.includes(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(key)}
            // Sized locally rather than on the shared .chip recipe, which
            // other screens also use: 44px tall keeps these a comfortable
            // target without restyling chips app-wide.
            className="chip min-h-[44px] inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            style={isSelected ? { borderColor: 'var(--brand-primary)', backgroundColor: 'rgb(var(--brand-primary-rgb) / 0.15)', color: 'var(--brand-primary)' } : undefined}
          >
            {mj.states[key]}
          </button>
        );
      })}
    </div>
  );
}

// ── Safety guidance ────────────────────────────────────────────────────────

// Shown instead of the form when the server flags a submission. Nothing was
// persisted in that case, so this must never read as a save confirmation.
export function SafetyGuidanceCard({ guidance, onDismiss }) {
  const { language } = useAuth();
  const mj = translations[language].mindJournal;
  return (
    <Card className="p-4 mb-6">
      <h2 className="text-body font-bold text-amber-400 mb-2">{mj.safety.heading}</h2>
      {guidance && <p className="text-body text-slt leading-relaxed mb-4">{guidance}</p>}
      <div className="mb-4">
        <HelplineList />
      </div>
      <button
        onClick={onDismiss}
        className="w-full py-3 bg-dark-700 text-ink font-semibold rounded-2xl active:scale-95"
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
