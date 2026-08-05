import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { PageHeader } from '../../components/ui';
import { CONTEXT_TYPE_KEYS, toggleStateKey } from './constants';
import { StateChips } from './shared';

// ─── Guided reflection, step 1 of 2 — what this was about, and how it felt.
// Nothing is written to the server here; the two answers are handed to step
// 2 through router state, and step 2 sends the whole reflection at once.
//
// Step 2 hands the same state back when the athlete goes back, so returning
// to this screen restores what was already picked instead of starting over.
// ───────────────────────────────────────────────────────────────────────────

export default function GuidedReflectionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useAuth();
  const mj = translations[language].mindJournal;
  const g = mj.guided;

  const draft = location.state || {};
  const [contextType, setContextType] = useState(draft.contextType || null);
  const [selected, setSelected] = useState(draft.states || []);

  function handleContinue() {
    if (!contextType) return;
    navigate('/mind-journal/new/details', { state: { contextType, states: selected } });
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      <PageHeader backTo="/mind-journal" title={g.title} />

      <div className="px-page pt-4 max-w-lg mx-auto">
        <p className="text-micro font-bold text-slt uppercase mb-4">{g.step1}</p>

        {/* ── Context type — the one required answer ─────────────────── */}
        <p className="text-body font-semibold text-ink mb-1">{g.contextHeading}</p>
        <p className="text-caption text-slt mb-3">{g.contextHint}</p>
        <div className="flex flex-wrap gap-2 mb-8">
          {CONTEXT_TYPE_KEYS.map(key => {
            const isSelected = contextType === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setContextType(key)}
                className="chip min-h-[44px] inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                style={isSelected ? { borderColor: 'var(--brand-primary)', backgroundColor: 'rgb(var(--brand-primary-rgb) / 0.15)', color: 'var(--brand-primary)' } : undefined}
              >
                {mj.contextTypes[key]}
              </button>
            );
          })}
        </div>

        {/* ── States — optional here, unlike a quick note ────────────── */}
        <p className="text-body font-semibold text-ink mb-1">{g.statesHeading}</p>
        <p className="text-caption text-slt mb-3">{g.statesHint}</p>
        <StateChips selected={selected} onToggle={key => setSelected(prev => toggleStateKey(prev, key))} />

        <button
          onClick={handleContinue}
          disabled={!contextType}
          className="w-full py-3.5 mt-8 rounded-2xl text-white font-bold text-body active:scale-[0.98] transition-transform disabled:opacity-40"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {g.continueBtn}
        </button>

        <p className="text-caption text-slt mt-4 leading-relaxed">{mj.disclosure}</p>
      </div>
    </div>
  );
}
