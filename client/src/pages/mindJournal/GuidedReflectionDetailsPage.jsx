import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { PageHeader, SaveStatus } from '../../components/ui';
import {
  MAX_WHAT_HAPPENED_LENGTH,
  MAX_WHAT_NOTICED_LENGTH,
  MAX_HELPED_OR_GOT_IN_WAY_LENGTH,
  MAX_TAKE_FORWARD_LENGTH,
  textOrUndefined,
} from './constants';
import { SafetyGuidanceCard, useMindJournalSave } from './shared';

// ─── Guided reflection, step 2 of 2 — the four prompts, then the single
// save. Every prompt is optional, but a reflection made of nothing but a
// context type would be an empty record, so the server requires at least one
// state or one written answer; the Save button holds to the same rule rather
// than letting the athlete discover it as a 400. ────────────────────────────

// One prompt: label, bounded textarea, live counter. Bounds mirror
// validateEntry.js — the server rejects over-length text outright rather
// than truncating it, so the input never lets it get that far.
function PromptField({ id, label, placeholder, value, maxLength, onChange }) {
  return (
    <div className="mb-5">
      <label htmlFor={id} className="block text-body font-semibold text-ink mb-2">{label}</label>
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value.slice(0, maxLength))}
        maxLength={maxLength}
        placeholder={placeholder}
        rows={3}
        className="input-field resize-none mb-1"
      />
      <p className="text-caption text-slt text-right">{value.length}/{maxLength}</p>
    </div>
  );
}

export default function GuidedReflectionDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useAuth();
  const mj = translations[language].mindJournal;
  const g = mj.guided;

  const draft = location.state || {};
  const contextType = draft.contextType || null;
  const states = draft.states || [];

  const [whatHappened, setWhatHappened] = useState('');
  const [whatNoticed, setWhatNoticed] = useState('');
  const [helpedOrGotInWay, setHelpedOrGotInWay] = useState('');
  const [takeForward, setTakeForward] = useState('');
  const { saving, saveError, safety, dismissSafety, save } = useMindJournalSave();

  // Reached directly (a refresh, a bookmark) there is no step-1 answer to
  // save with, so send the athlete back to pick one rather than showing a
  // form that cannot succeed. Hooks above run first — this is a render-time
  // redirect, not an early return before the hooks.
  if (!contextType) return <Navigate to="/mind-journal/new" replace />;

  const written = [whatHappened, whatNoticed, helpedOrGotInWay, takeForward].some(v => v.trim().length > 0);
  const hasContent = states.length > 0 || written;
  const canSave = hasContent && !saving;

  function handleBack() {
    // Hand step 1 its own answers back so returning does not wipe them.
    navigate('/mind-journal/new', { state: { contextType, states }, replace: true });
  }

  async function handleSave() {
    if (!canSave) return;
    const entry = await save({
      entryType: 'GUIDED_REFLECTION',
      contextType,
      states,
      whatHappened: textOrUndefined(whatHappened),
      whatNoticed: textOrUndefined(whatNoticed),
      helpedOrGotInWay: textOrUndefined(helpedOrGotInWay),
      takeForward: textOrUndefined(takeForward),
    });
    if (entry) navigate(`/mind-journal/saved/${entry.id}`, { state: { entry }, replace: true });
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      <PageHeader onBack={handleBack} title={g.title} />

      <div className="px-page pt-4 max-w-lg mx-auto">
        {safety ? (
          <SafetyGuidanceCard guidance={safety.guidance} onDismiss={dismissSafety} />
        ) : (
          <>
            <p className="text-micro font-bold text-slt uppercase mb-4">{g.step2}</p>
            <p className="text-body text-slt mb-6 leading-relaxed">{g.detailsIntro}</p>

            <PromptField
              id="reflection-what-happened"
              label={g.whatHappened}
              placeholder={g.whatHappenedPlaceholder}
              value={whatHappened}
              maxLength={MAX_WHAT_HAPPENED_LENGTH}
              onChange={setWhatHappened}
            />
            <PromptField
              id="reflection-what-noticed"
              label={g.whatNoticed}
              placeholder={g.whatNoticedPlaceholder}
              value={whatNoticed}
              maxLength={MAX_WHAT_NOTICED_LENGTH}
              onChange={setWhatNoticed}
            />
            <PromptField
              id="reflection-helped-or-got-in-way"
              label={g.helpedOrGotInWay}
              placeholder={g.helpedOrGotInWayPlaceholder}
              value={helpedOrGotInWay}
              maxLength={MAX_HELPED_OR_GOT_IN_WAY_LENGTH}
              onChange={setHelpedOrGotInWay}
            />
            <PromptField
              id="reflection-take-forward"
              label={g.takeForward}
              placeholder={g.takeForwardPlaceholder}
              value={takeForward}
              maxLength={MAX_TAKE_FORWARD_LENGTH}
              onChange={setTakeForward}
            />

            {!hasContent && <p className="text-caption text-slt mb-3">{g.needSomething}</p>}

            <div className="mb-3 empty:mb-0">
              <SaveStatus
                state={saving ? 'saving' : saveError ? 'error' : 'idle'}
                onRetry={handleSave}
                labels={{ saving: mj.saving, saved: mj.saved, saveFailed: saveError, retry: mj.retry }}
              />
            </div>

            <button
              onClick={handleSave}
              disabled={!canSave}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-body active:scale-[0.98] transition-transform disabled:opacity-40"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {saving ? mj.saving : g.saveBtn}
            </button>

            <p className="text-caption text-slt mt-4 leading-relaxed">{mj.disclosure}</p>
          </>
        )}
      </div>
    </div>
  );
}
