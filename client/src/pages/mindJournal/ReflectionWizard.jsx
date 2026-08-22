import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Dumbbell, Trophy, CloudLightning, Sparkles, Gauge, ClipboardCheck,
  HeartPulse, Globe, Brain, Compass, MessageSquare, Activity, KeyRound,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import { PageHeader, Button, SaveStatus } from '../../components/ui';
import {
  REFLECTION_CONTEXT_KEYS, eventKeysForContext, THOUGHT_KEYS, RESPONSE_KEYS,
  REFLECTION_STATE_KEYS,
  BODY_KEYS, CUE_FEEDBACK_KEYS, MAX_TAG_SELECTIONS, MAX_CUSTOM_EVENT_LENGTH,
  MAX_CUSTOM_THOUGHT_LENGTH, MAX_CUSTOM_RESPONSE_LENGTH, MAX_CUSTOM_BODY_LENGTH,
  MAX_CUSTOM_CONTEXT_LENGTH, MAX_STATE_SELECTIONS,
  resolveConditionalQuestion, textOrUndefined, toggleStateKey,
} from './constants';
import { ChoiceChips, SafetyGuidanceCard, StepProgress, STATE_ICONS, useMindJournalSave, useMindJournalBack } from './shared';

// ─── The unified Mind Journal reflection — ONE component driving every
// question, rather than six routed pages. All answers live in this
// component's own state, so going Back is genuinely free: nothing is
// re-derived from router state and nothing is ever discarded.
//
// The athlete reports observations here. Nothing on any screen asks why
// something happened, what their problem is, or what they should change —
// that interpretation is Arjun's, and it happens after the save.
// ───────────────────────────────────────────────────────────────────────────

const CONTEXT_ICONS = {
  TRAINING: Dumbbell,
  COMPETITION: Trophy,
  TOUGH_MOMENT: CloudLightning,
  WENT_WELL: Sparkles,
  CONFIDENCE_PRESSURE: Gauge,
  SELECTION_TRIAL: ClipboardCheck,
  RECOVERY_INJURY: HeartPulse,
  OUTSIDE_SPORT: Globe,
  SOMETHING_ELSE: Brain,
};

// One empty multi-select answer: chosen keys plus an optional own-words label.
const emptyGroup = () => ({ tags: [], customOpen: false, custom: '' });

export default function ReflectionWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const handleExit = useMindJournalBack();
  const { token, language } = useAuth();
  const mj = translations[language].mindJournal;
  const r = mj.reflection;

  // ── Answers ──────────────────────────────────────────────────────────────
  const [contextType, setContextType] = useState(null);
  const [customContext, setCustomContext] = useState('');
  const [contextError, setContextError] = useState(null);
  const [event, setEvent] = useState(emptyGroup);
  const [state, setState] = useState(emptyGroup);
  const [thought, setThought] = useState(emptyGroup);
  const [response, setResponse] = useState(emptyGroup);
  const [body, setBody] = useState(emptyGroup);
  const [cueFeedback, setCueFeedback] = useState(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [focusWord, setFocusWord] = useState(null);
  const { saving, saveError, safety, dismissSafety, save } = useMindJournalSave();

  // Carries the exact prescriptionId + practiceKey when this reflection was
  // launched from a prescribed post_performance_reflection card — the same
  // ephemeral route-state mechanism BodyResetPage already uses, and the same
  // completion endpoint. Read once, on mount: a self-started reflection has
  // no such state and therefore never completes anything. The practiceKey
  // must match this flow's own practice, so a prescription for a different
  // practice can never be completed from here either.
  const prescriptionLinkRef = useRef(
    location.state?.prescriptionId && location.state?.practiceKey === 'post_performance_reflection'
      ? { prescriptionId: location.state.prescriptionId, practiceKey: location.state.practiceKey }
      : null
  );

  // Fire-and-forget exact prescription completion. Never awaited: a failed or
  // slow linkage request must never delay the athlete seeing their saved
  // reflection. Server-side completeActivePrescription is the single
  // completion mechanism and is already idempotent, so a replay settles on
  // the same completedAt instead of completing twice.
  const completePrescriptionLink = useCallback(() => {
    const link = prescriptionLinkRef.current;
    if (!link) return;
    apiFetch(`/api/prescriptions/${link.prescriptionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ practiceKey: link.practiceKey }),
    }).catch(() => {});
  }, [token]);

  // The athlete's active Focus Card word, read once. It only ever decides
  // whether the cue question can be asked at all — a missing card simply
  // means that question never appears.
  useEffect(() => {
    let alive = true;
    apiFetch('/api/mind-journal', { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (alive && data) setFocusWord(data.focusWord || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [token]);

  // ── Steps ────────────────────────────────────────────────────────────────
  // Q6 is resolved from the answers already given, so the step list grows by
  // at most one and never shows both the body and the cue question.
  const conditional = useMemo(
    () => resolveConditionalQuestion(
      { contextType, states: state.tags },
      { hasActiveFocusCard: !!focusWord },
    ),
    [contextType, state.tags, focusWord],
  );

  const steps = useMemo(() => {
    const list = ['context', 'event', 'state', 'thought', 'response'];
    if (conditional) list.push(conditional);
    return list;
  }, [conditional]);

  // Q6 can disappear if the athlete goes back and changes an answer. Clamp
  // rather than stranding them on a step that no longer exists.
  useEffect(() => {
    if (stepIndex > steps.length - 1) setStepIndex(steps.length - 1);
  }, [steps.length, stepIndex]);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Only one Q6 answer can ever exist; clear the other whenever it changes.
  useEffect(() => {
    if (conditional !== 'body' && (body.tags.length || body.custom)) setBody(emptyGroup());
    if (conditional !== 'cue' && cueFeedback) setCueFeedback(null);
  }, [conditional]); // eslint-disable-line react-hooks/exhaustive-deps

  function goBack() {
    if (stepIndex === 0) { handleExit(); return; }
    setStepIndex(i => i - 1);   // answers are untouched — Back never costs one
  }

  // A question is answered by a chip OR by its own "Write my own" text —
  // the athlete is never required to type, but an opened "Write my own" that
  // was left blank does not count as an answer.
  const groupAnswered = (g) => g.tags.length > 0 || g.custom.trim().length > 0;

  // Every structured question is required. Q6 is required only when the
  // resolver actually put it on screen.
  const stepComplete = {
    context: !!contextType && (contextType !== 'SOMETHING_ELSE' || customContext.trim().length > 0),
    event: groupAnswered(event),
    state: groupAnswered(state),
    thought: groupAnswered(thought),
    response: groupAnswered(response),
    body: groupAnswered(body),
    cue: !!cueFeedback,
  };
  const canContinue = stepComplete[step] === true;
  // Every question in this reflection's own step list must be answered
  // before it can be saved — Q6 counts only when the resolver showed it.
  const allRequiredAnswered = steps.every(name => stepComplete[name] === true);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saving || !allRequiredAnswered) return;
    const payload = {
      entryType: 'REFLECTION',
      contextType,
      eventTags: event.tags,
      states: state.tags,
      thoughtTags: thought.tags,
      responseTags: response.tags,
      bodyTags: conditional === 'body' ? body.tags : [],
    };
    if (contextType === 'SOMETHING_ELSE') payload.customContext = customContext.trim();
    const customs = [
      ['customEvent', event.custom], ['customState', state.custom],
      ['customThought', thought.custom], ['customResponse', response.custom],
    ];
    if (conditional === 'body') customs.push(['customBody', body.custom]);
    for (const [key, value] of customs) {
      const trimmed = textOrUndefined(value);
      if (trimmed !== undefined) payload[key] = trimmed;
    }
    if (conditional === 'cue' && cueFeedback) {
      payload.cueFeedback = cueFeedback;
      if (focusWord) payload.cueWordSnapshot = focusWord;
    }
    const entry = await save(payload);
    // Only a genuinely saved reflection completes a prescription — a
    // safety-flagged or failed save resolves to null and completes nothing.
    if (entry) {
      completePrescriptionLink();
      navigate(`/mind-journal/saved/${entry.id}`, { state: { entry }, replace: true });
    }
  }, [saving, allRequiredAnswered, event, state, thought, response, body, cueFeedback,
      contextType, conditional, customContext, focusWord, save, navigate, completePrescriptionLink]);

  // ── Screens ──────────────────────────────────────────────────────────────
  function continueFrom() {
    if (!canContinue) return;
    if (isLast) { handleSave(); return; }
    setStepIndex(i => i + 1);
  }

  // Q1 is a single choice, so tapping an option advances on its own — the one
  // place auto-advance is predictable. Every multi-select screen keeps an
  // explicit Next, so a tap never ends the question early.
  function pickContext(key) {
    setContextType(key);
    setContextError(null);
    if (key === 'SOMETHING_ELSE') return;   // needs its own words first
    setCustomContext('');
    setTimeout(() => setStepIndex(i => (i === 0 ? 1 : i)), 220);
  }

  function continueFromContext() {
    if (!contextType) return;
    if (contextType === 'SOMETHING_ELSE' && !customContext.trim()) {
      setContextError(r.q1.customRequired);
      return;
    }
    setStepIndex(1);
  }

  const groupProps = (group, setGroup, max = MAX_TAG_SELECTIONS) => ({
    selected: group.tags,
    onToggle: (key) => setGroup(g => ({
      ...g,
      tags: g.tags.includes(key)
        ? g.tags.filter(k => k !== key)
        : g.tags.length + (g.customOpen ? 1 : 0) >= max ? g.tags : [...g.tags, key],
    })),
    max,
    customOpen: group.customOpen,
    onCustomToggle: (open) => setGroup(g => ({ ...g, customOpen: open, custom: open ? g.custom : '' })),
    customValue: group.custom,
    onCustomChange: (v) => setGroup(g => ({ ...g, custom: v })),
    customChipLabel: r.writeMyOwn,
    customFieldLabel: r.writeMyOwnLabel,
    atMaxLabel: r.pickUpToTwo,
  });

  const opts = (keys, labels, Icon) => keys.map(key => ({ key, label: labels[key], Icon }));

  function renderStep() {
    if (step === 'context') {
      return (
        <>
          <h2 className="text-title font-bold text-ink mb-1">{r.q1.title}</h2>
          <p className="text-caption text-slt mb-4">{r.q1.hint}</p>
          <div className="space-y-2.5" role="radiogroup" aria-label={r.q1.title}>
            {REFLECTION_CONTEXT_KEYS.map(key => {
              const Icon = CONTEXT_ICONS[key] || Brain;
              const isSelected = contextType === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => pickContext(key)}
                  className={`w-full flex items-center gap-3.5 min-h-[56px] p-3.5 rounded-2xl border text-left transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    isSelected ? 'border-brand-500 bg-brand-50 elevation-card' : 'border-dark-600 bg-dark-800'
                  }`}
                >
                  <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-brand-500 text-white' : 'bg-dark-700 text-brand-500'}`} aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <span className={`flex-1 min-w-0 text-body font-bold ${isSelected ? 'text-brand-500' : 'text-ink'}`}>
                    {r.q1.options[key]}
                  </span>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-brand-500' : 'border-dark-500'}`} aria-hidden="true">
                    {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />}
                  </span>
                </button>
              );
            })}
          </div>

          {contextType === 'SOMETHING_ELSE' && (
            <div className="mt-3 p-3.5 rounded-2xl border border-dark-600 bg-dark-800" data-testid="mj-custom-context-field">
              <label htmlFor="reflection-custom-context" className="block text-body font-bold text-ink mb-1">{r.q1.customLabel}</label>
              <p className="text-caption text-slt mb-2 leading-snug">{r.q1.customHint}</p>
              <input
                id="reflection-custom-context"
                type="text"
                value={customContext}
                onChange={e => { setCustomContext(e.target.value.slice(0, MAX_CUSTOM_CONTEXT_LENGTH)); setContextError(null); }}
                maxLength={MAX_CUSTOM_CONTEXT_LENGTH}
                aria-invalid={contextError ? true : undefined}
                className="input-field w-full min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                autoComplete="off"
              />
              <div className="flex items-start justify-between gap-3 mt-1.5">
                {contextError
                  ? <p role="alert" className="text-caption text-amber-400 leading-snug">{contextError}</p>
                  : <span />}
                <p className="text-caption text-slt text-right tabular-nums shrink-0">{customContext.length}/{MAX_CUSTOM_CONTEXT_LENGTH}</p>
              </div>
            </div>
          )}

          <Button onClick={continueFromContext} disabled={!contextType} className="w-full mt-6">{r.next}</Button>
          <p className="text-caption text-slt mt-3 text-center">{r.everyQuestion}</p>
        </>
      );
    }

    if (step === 'event') {
      return (
        <QuestionScreen
          title={r.q2.title[contextType] || r.q2.title.SOMETHING_ELSE}
          hint={r.q2.hint}
          onNext={continueFrom}
          nextLabel={isLast ? r.save : r.next}
          canContinue={canContinue}
          saving={saving}
        >
          <ChoiceChips
            {...groupProps(event, setEvent)}
            options={opts(eventKeysForContext(contextType), r.q2.options, Compass)}
            maxCustomLength={MAX_CUSTOM_EVENT_LENGTH}
            testId="mj-event-chips"
          />
        </QuestionScreen>
      );
    }

    if (step === 'state') {
      return (
        <QuestionScreen title={r.q3.title} hint={r.q3.hint} onNext={continueFrom} nextLabel={isLast ? r.save : r.next} saving={saving} canContinue={canContinue}>
          <ChoiceChips
            {...groupProps(state, setState, MAX_STATE_SELECTIONS)}
            options={REFLECTION_STATE_KEYS.map(key => ({ key, label: mj.states[key], Icon: STATE_ICONS[key] }))}
            onToggle={(key) => setState(g => ({ ...g, tags: toggleStateKey(g.tags, key, { customOpen: g.customOpen }) }))}
            customFieldLabel={mj.customStateLabel}
            testId="mj-state-chips"
          />
        </QuestionScreen>
      );
    }

    if (step === 'thought') {
      return (
        <QuestionScreen title={r.q4.title} hint={r.q4.hint} onNext={continueFrom} nextLabel={isLast ? r.save : r.next} saving={saving} canContinue={canContinue}>
          <ChoiceChips
            {...groupProps(thought, setThought)}
            options={opts(THOUGHT_KEYS, r.q4.options, MessageSquare)}
            maxCustomLength={MAX_CUSTOM_THOUGHT_LENGTH}
            testId="mj-thought-chips"
          />
        </QuestionScreen>
      );
    }

    if (step === 'response') {
      return (
        <QuestionScreen title={r.q5.title} hint={r.q5.hint} onNext={continueFrom} nextLabel={isLast ? r.save : r.next} saving={saving} canContinue={canContinue}>
          <ChoiceChips
            {...groupProps(response, setResponse)}
            options={opts(RESPONSE_KEYS, r.q5.options, Activity)}
            maxCustomLength={MAX_CUSTOM_RESPONSE_LENGTH}
            testId="mj-response-chips"
          />
        </QuestionScreen>
      );
    }

    if (step === 'body') {
      return (
        <QuestionScreen title={r.q6body.title} hint={r.q6body.hint} onNext={continueFrom} nextLabel={r.save} saving={saving} canContinue={canContinue}>
          <ChoiceChips
            {...groupProps(body, setBody)}
            options={opts(BODY_KEYS, r.q6body.options, Activity)}
            maxCustomLength={MAX_CUSTOM_BODY_LENGTH}
            testId="mj-body-chips"
          />
        </QuestionScreen>
      );
    }

    // Cue — a single choice about a Focus Card the athlete actually has.
    return (
      <QuestionScreen title={r.q6cue.title} hint={r.q6cue.hint} onNext={handleSave} nextLabel={r.save} saving={saving} canContinue={canContinue}>
        <div className="flex items-center gap-3 mb-5 p-3.5 rounded-2xl border border-dark-600 bg-dark-800" data-testid="mj-cue-word">
          <span className="w-11 h-11 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0" aria-hidden="true">
            <KeyRound size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-caption text-slt">{r.q6cue.cueLabel}</p>
            <p className="text-body font-bold text-ink break-words">{focusWord}</p>
          </div>
        </div>
        <div className="space-y-2.5" role="radiogroup" aria-label={r.q6cue.title}>
          {CUE_FEEDBACK_KEYS.map(key => {
            const isSelected = cueFeedback === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setCueFeedback(key)}
                className={`w-full flex items-center gap-3 min-h-[52px] p-3.5 rounded-2xl border text-left transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  isSelected ? 'border-brand-500 bg-brand-50 text-brand-500 elevation-row' : 'border-dark-600 bg-dark-800 text-ink'
                }`}
              >
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-brand-500' : 'border-dark-500'}`} aria-hidden="true">
                  {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />}
                </span>
                <span className="text-body font-semibold flex-1">{r.q6cue.options[key]}</span>
              </button>
            );
          })}
        </div>
      </QuestionScreen>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-10">
      <PageHeader onBack={goBack} title={r.title} />
      <div className="px-page pt-5 max-w-lg mx-auto">
        {safety ? (
          <SafetyGuidanceCard guidance={safety.guidance} onDismiss={dismissSafety} />
        ) : (
          <>
            <StepProgress
              label={r.stepLabel(stepIndex + 1, steps.length)}
              step={stepIndex + 1}
              total={steps.length}
            />
            {renderStep()}

            <div className="mt-3 empty:mt-0">
              <SaveStatus
                state={saving ? 'saving' : saveError ? 'error' : 'idle'}
                onRetry={handleSave}
                labels={{ saving: r.saving, saved: mj.saved, saveFailed: saveError, retry: mj.retry }}
              />
            </div>
            <p className="text-caption text-slt mt-5 leading-relaxed text-center">{mj.disclosure}</p>
          </>
        )}
      </div>
    </div>
  );
}

// One multi-select question: heading, hint, the chips, then an explicit
// Next/Save. Never auto-advances — a tap here selects, it does not commit.
function QuestionScreen({ title, hint, children, onNext, nextLabel, saving, canContinue }) {
  return (
    <>
      <h2 className="text-title font-bold text-ink mb-1">{title}</h2>
      <p className="text-caption text-slt mb-4">{hint}</p>
      {children}
      {/* Every structured question is required, so this stays disabled until
          one is answered. There is no Skip: the questions carry the whole
          reflection, and typing is never what unlocks them — a chip is
          always enough. */}
      <Button onClick={onNext} disabled={saving || !canContinue} className="w-full mt-6">{nextLabel}</Button>
    </>
  );
}
