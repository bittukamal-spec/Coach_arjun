import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import { PracticeScreen, PracticeCompletion } from '../../components/practice/PracticeShell';
import SelectableOption from '../../components/onboarding/SelectableOption';
import { SafetyGuidanceCard } from '../mindJournal/shared';
import StepEditor from './StepEditor';
import {
  LIMITS, SITUATIONS, PURPOSES, TIME_WINDOWS,
  needsTimingQuestion, suggestionRequest, defaultRoutineName,
  draftFromSuggestion, editStep, deleteStep, moveStep, addStep, canSave,
  buildSaveBody, readRoutineResponse,
} from './builderDraft';

// /ritual/new — build a routine with Arjun, one question at a time:
// situation → moment → purpose → habits → (timing, only when needed) →
// review → saved. The whole draft lives in this component's state: nothing
// is written until the athlete taps "Save my routine", and leaving the page
// discards the draft.

function ChoiceList({ options, selected, onSelect, labelFor }) {
  return (
    <div role="radiogroup" className="flex flex-col gap-2">
      {options.map(value => (
        <SelectableOption key={value} label={labelFor(value)} selected={selected === value} onSelect={() => onSelect(value)} />
      ))}
    </div>
  );
}

function ContinueButton({ onClick, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="btn-gradient w-full py-3.5 mt-6 disabled:opacity-50" style={{ minHeight: '52px' }}>
      {children}
    </button>
  );
}

const INPUT_CLASS = 'w-full bg-dark-700 border border-dark-500 text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-slt';

export default function RoutineBuilderPage() {
  const navigate = useNavigate();
  const { token, language, user } = useAuth();
  const t = (translations[language] || translations.en).routineBuilder;

  // ── Answers ────────────────────────────────────────────────────────────
  const [stage, setStage] = useState('situation');
  const [category, setCategory] = useState(null);
  const [moment, setMoment] = useState('');
  const [purposeKey, setPurposeKey] = useState(null);
  const [habits, setHabits] = useState([]);
  const [habitInput, setHabitInput] = useState('');
  const [editingHabit, setEditingHabit] = useState(null); // { index, text }
  const [timeWindow, setTimeWindow] = useState(null);

  // ── Review draft ───────────────────────────────────────────────────────
  const [suggestion, setSuggestion] = useState(null); // engine output + inputsKey
  const [steps, setSteps] = useState([]);
  const [stepsEdited, setStepsEdited] = useState(false);
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [pendingReplace, setPendingReplace] = useState(false);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [suggestionError, setSuggestionError] = useState(false);

  // ── Save ───────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [safety, setSafety] = useState(null);
  const [saved, setSaved] = useState(null);

  const stages = ['situation', 'moment', 'purpose', 'habits', ...(needsTimingQuestion(category) ? ['timing'] : []), 'review'];
  const stageIndex = stages.indexOf(stage);
  const progress = stageIndex >= 0 ? `${Math.round(((stageIndex + 1) / stages.length) * 100)}%` : null;

  const requestBody = suggestionRequest({ category, purposeKey, timeWindow, habits });
  const inputsKey = JSON.stringify(requestBody);

  function goBack() {
    if (stageIndex <= 0) navigate('/ritual');
    else setStage(stages[stageIndex - 1]);
  }

  function next() {
    const following = stages[stageIndex + 1];
    if (following === 'review') enterReview();
    else setStage(following);
  }

  async function fetchSuggestion() {
    setLoadingSuggestion(true);
    setSuggestionError(false);
    setPendingReplace(false);
    try {
      const res = await apiFetch('/api/routines/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) throw new Error('suggest');
      const data = await res.json();
      setSuggestion({ ...data.suggestion, inputsKey });
      setSteps(draftFromSuggestion(data.suggestion.steps));
      setStepsEdited(false);
    } catch {
      setSuggestionError(true);
    } finally {
      setLoadingSuggestion(false);
    }
  }

  function enterReview() {
    setStage('review');
    if (!nameEdited) setName(defaultRoutineName(moment, t.situations[category]));
    if (suggestion && suggestion.inputsKey === inputsKey) return;
    // Answers changed since the last suggestion: replace it, but never throw
    // away the athlete's own edits without asking.
    if (suggestion && stepsEdited) { setPendingReplace(true); return; }
    fetchSuggestion();
  }

  function keepEdits() {
    setPendingReplace(false);
    setSuggestion(s => ({ ...s, inputsKey }));
  }

  function changeSteps(updater) {
    setSteps(updater);
    setStepsEdited(true);
  }

  // ── Habits ─────────────────────────────────────────────────────────────
  function addHabit() {
    if (!habitInput.trim() || habits.length >= LIMITS.MAX_HABITS) return;
    setHabits(h => [...h, habitInput]);
    setHabitInput('');
  }
  function saveHabitEdit() {
    if (!editingHabit || !editingHabit.text.trim()) return;
    setHabits(h => h.map((v, i) => (i === editingHabit.index ? editingHabit.text : v)));
    setEditingHabit(null);
  }
  function removeHabit(index) {
    setHabits(h => h.filter((_, i) => i !== index));
    if (editingHabit?.index === index) setEditingHabit(null);
  }

  // ── Save ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (saving || !canSave({ name, steps })) return;
    setSaving(true);
    setSaveError(false);
    setLimitReached(false);
    setSafety(null);
    try {
      const body = buildSaveBody({
        name,
        category,
        moment,
        purposeText: purposeKey && purposeKey !== 'not_sure' ? t.purposes[purposeKey] : null,
        steps,
        suggestion,
        role: user?.position,
      });
      const res = await apiFetch('/api/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const outcome = await readRoutineResponse(res);
      // A flagged save leaves every answer and edit in place so the athlete
      // can change it and try again.
      if (outcome.type === 'safety') setSafety({ guidance: outcome.guidance });
      else if (outcome.type === 'limit') setLimitReached(true);
      else if (outcome.type === 'ok' && outcome.data?.routine) { setSaved(outcome.data.routine); setStage('saved'); }
      else setSaveError(true);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  // ── Screens ────────────────────────────────────────────────────────────
  if (stage === 'saved' && saved) {
    return (
      <PracticeCompletion>
        <h1 className="text-2xl font-bold text-ink mb-2">{t.savedTitle}</h1>
        <p className="text-sm text-slt mb-8 max-w-xs">{t.savedBody}</p>
        <div className="w-full max-w-xs flex flex-col gap-3">
          <Link to={`/ritual/${saved.id}`} className="btn-primary justify-center py-3.5">{t.viewRoutine}</Link>
          <Link to="/ritual" className="btn-secondary justify-center">{t.backToRoutines}</Link>
        </div>
      </PracticeCompletion>
    );
  }

  const screen = { onBack: goBack, headerTitle: t.builderTitle, progress };

  if (stage === 'situation') {
    return (
      <PracticeScreen {...screen} title={t.situationTitle}>
        <ChoiceList options={SITUATIONS} selected={category} onSelect={setCategory} labelFor={v => t.situations[v]} />
        <ContinueButton onClick={next} disabled={!category}>{t.continue}</ContinueButton>
      </PracticeScreen>
    );
  }

  if (stage === 'moment') {
    return (
      <PracticeScreen {...screen} title={t.momentTitle} sub={t.momentHint}>
        <textarea
          value={moment}
          onChange={e => setMoment(e.target.value)}
          maxLength={LIMITS.MOMENT}
          rows={3}
          aria-label={t.momentTitle}
          placeholder={t.momentPlaceholder}
          className={`${INPUT_CLASS} resize-none`}
        />
        <ContinueButton onClick={next} disabled={!moment.trim()}>{t.continue}</ContinueButton>
      </PracticeScreen>
    );
  }

  if (stage === 'purpose') {
    return (
      <PracticeScreen {...screen} title={t.purposeTitle}>
        <ChoiceList options={PURPOSES} selected={purposeKey} onSelect={setPurposeKey} labelFor={v => t.purposes[v]} />
        <ContinueButton onClick={next} disabled={!purposeKey}>{t.continue}</ContinueButton>
      </PracticeScreen>
    );
  }

  if (stage === 'habits') {
    const atMax = habits.length >= LIMITS.MAX_HABITS;
    return (
      <PracticeScreen {...screen} title={t.habitsTitle} sub={t.habitsSub}>
        {habits.length > 0 && (
          <ol className="flex flex-col gap-2 mb-4">
            {habits.map((habit, i) => (
              <li key={i} className="bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3">
                {editingHabit?.index === i ? (
                  <div className="flex gap-2">
                    <input
                      value={editingHabit.text}
                      onChange={e => setEditingHabit({ index: i, text: e.target.value })}
                      maxLength={LIMITS.HABIT}
                      aria-label={t.editHabit}
                      className={INPUT_CLASS}
                    />
                    <button type="button" onClick={saveHabitEdit} className="btn-secondary shrink-0">{t.saveHabit}</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-ink flex-1 min-w-0 break-words whitespace-pre-wrap">{habit}</p>
                    <button type="button" onClick={() => setEditingHabit({ index: i, text: habit })} className="text-caption text-brand-400 min-h-[44px] px-2">
                      {t.editHabit}
                    </button>
                    <button type="button" onClick={() => removeHabit(i)} className="text-caption text-red-400 min-h-[44px] px-2">
                      {t.removeHabit}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {!atMax && (
          <div className="flex gap-2">
            <input
              value={habitInput}
              onChange={e => setHabitInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHabit(); } }}
              maxLength={LIMITS.HABIT}
              aria-label={t.habitPlaceholder}
              placeholder={t.habitPlaceholder}
              className={INPUT_CLASS}
            />
            <button type="button" onClick={addHabit} disabled={!habitInput.trim()} className="btn-secondary shrink-0 disabled:opacity-50">
              {t.addHabit}
            </button>
          </div>
        )}
        <p className="text-caption text-slt mt-2">{t.habitsMax(LIMITS.MAX_HABITS)}</p>
        {habits.length === 0 ? (
          <button type="button" onClick={next} className="btn-secondary w-full justify-center mt-6">{t.nothingYet}</button>
        ) : (
          <ContinueButton onClick={next} disabled={!!editingHabit}>{t.continue}</ContinueButton>
        )}
      </PracticeScreen>
    );
  }

  if (stage === 'timing') {
    return (
      <PracticeScreen {...screen} title={t.timingTitle}>
        <ChoiceList options={TIME_WINDOWS} selected={timeWindow} onSelect={setTimeWindow} labelFor={v => t.timing[v]} />
        <ContinueButton onClick={next} disabled={!timeWindow}>{t.continue}</ContinueButton>
      </PracticeScreen>
    );
  }

  // ── Review ─────────────────────────────────────────────────────────────
  return (
    <PracticeScreen {...screen} title={t.reviewTitle} sub={t.reviewSub}>
      {safety && <SafetyGuidanceCard guidance={safety.guidance} onDismiss={() => setSafety(null)} />}

      {pendingReplace && (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 mb-4" role="alertdialog" aria-label={t.replaceTitle}>
          <p className="text-sm font-semibold text-ink mb-1">{t.replaceTitle}</p>
          <p className="text-sm text-slt mb-3">{t.replaceBody}</p>
          <div className="flex gap-2">
            <button type="button" onClick={fetchSuggestion} className="btn-primary flex-1 justify-center">{t.replaceConfirm}</button>
            <button type="button" onClick={keepEdits} className="btn-secondary flex-1 justify-center">{t.replaceKeep}</button>
          </div>
        </div>
      )}

      {loadingSuggestion && <p className="text-sm text-slt py-6 text-center" role="status">{t.loadingSuggestion}</p>}

      {suggestionError && !loadingSuggestion && (
        <div className="py-4">
          <p className="text-sm text-red-400 mb-3" role="alert">{t.suggestionError}</p>
          <button type="button" onClick={fetchSuggestion} className="btn-secondary">{t.retry}</button>
        </div>
      )}

      {!loadingSuggestion && suggestion && !pendingReplace && (
        <>
          <label className="block text-sm font-semibold text-ink mb-2" htmlFor="routine-name">{t.nameLabel}</label>
          <input
            id="routine-name"
            value={name}
            onChange={e => { setName(e.target.value); setNameEdited(true); }}
            maxLength={LIMITS.NAME}
            className={`${INPUT_CLASS} mb-5`}
          />

          <StepEditor
            steps={steps}
            t={t}
            onEdit={(key, text) => changeSteps(s => editStep(s, key, text))}
            onMove={(key, dir) => changeSteps(s => moveStep(s, key, dir))}
            onDelete={key => changeSteps(s => deleteStep(s, key))}
            onAdd={() => changeSteps(s => addStep(s))}
          />

          {limitReached && <p className="text-sm text-slt mt-4" role="status">{t.limitReached(LIMITS.MAX_ROUTINES)}</p>}
          {saveError && <p className="text-sm text-red-400 mt-4" role="alert">{t.saveError}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave({ name, steps })}
            className="btn-gradient w-full py-3.5 mt-6 disabled:opacity-50"
            style={{ minHeight: '52px' }}
          >
            {saving ? t.saving : t.save}
          </button>
        </>
      )}
    </PracticeScreen>
  );
}
