import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { PageHeader, Button } from '../../components/ui';
import { toggleStateKey, mindJournalOriginState, cameFromMindJournal } from './constants';
import { StateChips, ContextTypeCards, StepProgress, useMindJournalBack } from './shared';

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
  const handleBack = useMindJournalBack();
  const { language } = useAuth();
  const mj = translations[language].mindJournal;
  const g = mj.guided;

  const draft = location.state || {};
  const [contextType, setContextType] = useState(draft.contextType || null);
  const [selected, setSelected] = useState(draft.states || []);
  const [customOpen, setCustomOpen] = useState(
    typeof draft.customState === 'string' && draft.customState.length > 0
  );
  const [customState, setCustomState] = useState(draft.customState || '');

  function handleContinue() {
    if (!contextType) return;
    const next = {
      contextType,
      states: selected,
      customState: customState.trim(),
    };
    if (cameFromMindJournal(draft)) next.from = draft.from;
    navigate('/mind-journal/new/details', { state: next });
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-10">
      <PageHeader onBack={handleBack} title={g.title} />

      <div className="px-page pt-5 max-w-lg mx-auto">
        <StepProgress label={g.step1} step={1} />

        <div className="flex items-start gap-3 mb-6 p-3.5 rounded-2xl bg-dark-800 border border-dark-600">
          <span
            className="w-9 h-9 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <Lightbulb size={16} />
          </span>
          <p className="text-body text-slt leading-relaxed pt-1">{g.step1Intro}</p>
        </div>

        {/* ── Context type — the one required answer ─────────────────── */}
        <p className="text-body font-bold text-ink mb-1">{g.contextHeading}</p>
        <p className="text-caption text-slt mb-3">{g.contextHint}</p>
        <ContextTypeCards value={contextType} onChange={setContextType} />

        {/* ── States — optional here, unlike a quick note ────────────── */}
        <p className="text-body font-bold text-ink mt-8 mb-1">{g.statesHeading}</p>
        <p className="text-caption text-slt mb-3">{g.statesHint}</p>
        <StateChips
          selected={selected}
          onToggle={key => setSelected(prev => toggleStateKey(prev, key, { customOpen }))}
          customOpen={customOpen}
          onCustomToggle={open => {
            setCustomOpen(open);
            if (!open) setCustomState('');
          }}
          customState={customState}
          onCustomChange={setCustomState}
        />

        <Button
          onClick={handleContinue}
          disabled={!contextType}
          className="w-full mt-8"
        >
          {g.continueBtn}
        </Button>

        <Link
          to="/mind-journal/quick"
          state={mindJournalOriginState()}
          className="flex items-center justify-center min-h-[44px] mt-3 text-caption font-semibold text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          {g.switchToQuick}
        </Link>

        <p className="text-caption text-slt mt-4 leading-relaxed text-center">{mj.disclosure}</p>
      </div>
    </div>
  );
}
