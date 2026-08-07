import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Compass, Eye, Flag, HelpCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { Card, PageHeader, SaveStatus, Button } from '../../components/ui';
import {
  MAX_WHAT_HAPPENED_LENGTH,
  MAX_WHAT_NOTICED_LENGTH,
  MAX_HELPED_OR_GOT_IN_WAY_LENGTH,
  MAX_TAKE_FORWARD_LENGTH,
  textOrUndefined,
  cameFromMindJournal,
  contextLabelForEntry,
} from './constants';
import { SafetyGuidanceCard, StepProgress, useMindJournalSave } from './shared';

// ─── Guided reflection, step 2 of 2 — the four prompts, then the single
// save. Every prompt is optional, but a reflection made of nothing but a
// context type would be an empty record, so the server requires at least one
// state or one written answer; the Save button holds to the same rule rather
// than letting the athlete discover it as a 400. ────────────────────────────

// One prompt: label, bounded textarea, live counter. Bounds mirror
// validateEntry.js — the server rejects over-length text outright rather
// than truncating it, so the input never lets it get that far.
function PromptField({ id, label, placeholder, value, maxLength, onChange, icon: Icon, testId }) {
  return (
    <Card className="p-4 mb-3 elevation-card" data-testid={testId}>
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className="w-9 h-9 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <Icon size={16} />
        </span>
        <label htmlFor={id} className="text-body font-bold text-ink leading-snug">
          {label}
        </label>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value.slice(0, maxLength))}
        maxLength={maxLength}
        placeholder={placeholder}
        rows={3}
        className="input-field resize-none mb-1 border-0 bg-dark-700/80"
      />
      <p className="text-caption text-slt text-right tabular-nums">{value.length}/{maxLength}</p>
    </Card>
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
  const customState = typeof draft.customState === 'string' ? draft.customState : '';
  const trimmedCustom = customState.trim();
  const customContext = contextType === 'SOMETHING_ELSE' && typeof draft.customContext === 'string'
    ? draft.customContext.trim()
    : '';
  const contextLabel = contextLabelForEntry(
    { contextType, customContext: customContext || null },
    mj
  );

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
  const hasContent = states.length > 0 || trimmedCustom.length > 0 || written;
  const canSave = hasContent && !saving;

  function handleBack() {
    // Hand step 1 its own answers back so returning does not wipe them.
    // replace keeps the guided step history from stacking, and preserves
    // the Mind Journal origin marker when it was present.
    const next = { contextType, states, customState: trimmedCustom };
    if (contextType === 'SOMETHING_ELSE' && customContext) {
      next.customContext = customContext;
    }
    if (cameFromMindJournal(draft)) next.from = draft.from;
    navigate('/mind-journal/new', { state: next, replace: true });
  }

  async function handleSave() {
    if (!canSave) return;
    const payload = {
      entryType: 'GUIDED_REFLECTION',
      contextType,
      states,
      whatHappened: textOrUndefined(whatHappened),
      whatNoticed: textOrUndefined(whatNoticed),
      helpedOrGotInWay: textOrUndefined(helpedOrGotInWay),
      takeForward: textOrUndefined(takeForward),
    };
    const custom = textOrUndefined(customState);
    if (custom !== undefined) payload.customState = custom;
    if (contextType === 'SOMETHING_ELSE' && customContext) {
      payload.customContext = customContext;
    }
    const entry = await save(payload);
    if (entry) navigate(`/mind-journal/saved/${entry.id}`, { state: { entry }, replace: true });
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-10">
      <PageHeader onBack={handleBack} title={g.title} />

      <div className="px-page pt-5 max-w-lg mx-auto">
        {safety ? (
          <SafetyGuidanceCard guidance={safety.guidance} onDismiss={dismissSafety} />
        ) : (
          <>
            <StepProgress label={g.step2} step={2} />

            <div className="flex flex-wrap gap-1.5 mb-4" data-testid="mj-summary-pills">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold bg-brand-50 text-brand-500 border border-brand-500/20 max-w-full break-words">
                {contextLabel}
              </span>
              {states.map(key => (
                <span
                  key={key}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold bg-dark-700 text-ink border border-dark-600 max-w-full break-words"
                >
                  {mj.states[key]}
                </span>
              ))}
              {trimmedCustom.length > 0 && (
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold bg-dark-700 text-ink border border-dark-600 max-w-full break-words"
                  data-testid="mj-custom-state-pill"
                >
                  {trimmedCustom}
                </span>
              )}
            </div>

            <p className="text-body text-slt mb-5 leading-relaxed">{g.detailsIntro}</p>

            <PromptField
              id="reflection-what-happened"
              label={g.whatHappened}
              placeholder={g.whatHappenedPlaceholder}
              value={whatHappened}
              maxLength={MAX_WHAT_HAPPENED_LENGTH}
              onChange={setWhatHappened}
              icon={Compass}
              testId="mj-prompt-what-happened"
            />
            <PromptField
              id="reflection-what-noticed"
              label={g.whatNoticed}
              placeholder={g.whatNoticedPlaceholder}
              value={whatNoticed}
              maxLength={MAX_WHAT_NOTICED_LENGTH}
              onChange={setWhatNoticed}
              icon={Eye}
              testId="mj-prompt-what-noticed"
            />
            <PromptField
              id="reflection-helped-or-got-in-way"
              label={g.helpedOrGotInWay}
              placeholder={g.helpedOrGotInWayPlaceholder}
              value={helpedOrGotInWay}
              maxLength={MAX_HELPED_OR_GOT_IN_WAY_LENGTH}
              onChange={setHelpedOrGotInWay}
              icon={HelpCircle}
              testId="mj-prompt-helped"
            />
            <PromptField
              id="reflection-take-forward"
              label={g.takeForward}
              placeholder={g.takeForwardPlaceholder}
              value={takeForward}
              maxLength={MAX_TAKE_FORWARD_LENGTH}
              onChange={setTakeForward}
              icon={Flag}
              testId="mj-prompt-take-forward"
            />

            {!hasContent && <p className="text-caption text-slt mb-3">{g.needSomething}</p>}

            <div className="mb-3 empty:mb-0">
              <SaveStatus
                state={saving ? 'saving' : saveError ? 'error' : 'idle'}
                onRetry={handleSave}
                labels={{ saving: mj.saving, saved: mj.saved, saveFailed: saveError, retry: mj.retry }}
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={!canSave}
              className="w-full"
            >
              {saving ? mj.saving : g.saveBtn}
            </Button>

            <p className="text-caption text-slt mt-5 leading-relaxed text-center">{mj.disclosure}</p>
          </>
        )}
      </div>
    </div>
  );
}
