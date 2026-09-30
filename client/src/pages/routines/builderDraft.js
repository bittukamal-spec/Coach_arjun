// Routine Builder (PR 3) — pure draft helpers. No React, no network, no
// storage: the builder page keeps the draft in React state and only these
// functions shape it. The suggestion rules themselves live on the server
// (POST /api/routines/suggest); nothing here decides what a routine
// contains.
//
// Limits mirror server/src/services/routines/validateRoutine.js.

export const LIMITS = Object.freeze({
  MAX_ROUTINES: 5, // MAX_ACTIVE_ROUTINES
  MAX_STEPS: 5,
  MAX_HABITS: 5,
  NAME: 60,
  INSTRUCTION: 120,
  MOMENT: 200,
  HABIT: 120,
  ROLE: 120,
});

// Athlete-facing situation choice → existing routine category. The
// translation key is the category itself.
export const SITUATIONS = Object.freeze([
  'session_preparation',
  'repeated_moment',
  'pressure_moment',
  'own_situation',
]);

// Athlete-facing purpose choice → suggestion-only purposeKey (never stored).
export const PURPOSES = Object.freeze(['settle', 'reset', 'focus', 'confidence', 'activate', 'prepare', 'not_sure']);

export const TIME_WINDOWS = Object.freeze(['seconds', 'short', 'longer']);

// Categories whose timing is known; the others ask "How much time do you
// usually have?". Never inferred from the moment text.
const DEFAULT_TIME_WINDOW = Object.freeze({
  repeated_moment: 'seconds',
  session_preparation: 'longer',
});

export function needsTimingQuestion(category) {
  return !DEFAULT_TIME_WINDOW[category];
}

export function timeWindowFor(category, chosenWindow) {
  return DEFAULT_TIME_WINDOW[category] || chosenWindow || null;
}

// Body for POST /api/routines/suggest — structured inputs only.
export function suggestionRequest({ category, purposeKey, timeWindow, habits }) {
  const body = { category };
  if (purposeKey) body.purposeKey = purposeKey;
  const window = timeWindowFor(category, timeWindow);
  if (window) body.timeWindow = window;
  if (habits && habits.length) body.existingHabits = [...habits];
  return body;
}

// Default routine name: the athlete's own moment, whitespace-collapsed and
// kept within the name limit (cut at a word boundary where one is close),
// falling back to the situation label only when the moment gives nothing.
export function defaultRoutineName(moment, fallbackLabel) {
  const text = typeof moment === 'string' ? moment.trim().replace(/\s+/g, ' ') : '';
  if (!text) return (fallbackLabel || '').slice(0, LIMITS.NAME).trim();
  if (text.length <= LIMITS.NAME) return text;
  const cut = text.slice(0, LIMITS.NAME);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace >= 20 ? cut.slice(0, lastSpace) : cut).trim();
}

let keySeq = 0;
function nextKey() {
  keySeq += 1;
  return `d${keySeq}`;
}

// Suggested steps → editable draft steps. `key` is local only (React list
// identity); `suggestedText` remembers the reviewed wording so an edit can be
// told apart from the original.
export function draftFromSuggestion(steps) {
  return (Array.isArray(steps) ? steps : []).map(s => ({
    key: nextKey(),
    kind: s.kind,
    instruction: s.instruction,
    origin: s.origin,
    suggestedText: s.origin === 'suggested' ? s.instruction : null,
  }));
}

// Editing a suggested step makes it the athlete's own ("custom") as soon as
// its text differs from the suggestion. An existing-habit step stays
// "existing": it is still something they already do, in their words.
export function editStep(steps, key, text) {
  return steps.map(s => {
    if (s.key !== key) return s;
    let origin = s.origin;
    if (s.suggestedText !== null && s.suggestedText !== undefined) {
      origin = text === s.suggestedText ? 'suggested' : 'custom';
    }
    return { ...s, instruction: text, origin };
  });
}

export function deleteStep(steps, key) {
  return steps.filter(s => s.key !== key);
}

export function moveStep(steps, key, direction) {
  const i = steps.findIndex(s => s.key === key);
  const j = i + (direction === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= steps.length) return steps;
  const next = [...steps];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function addStep(steps) {
  if (steps.length >= LIMITS.MAX_STEPS) return steps;
  return [...steps, { key: nextKey(), kind: 'custom', instruction: '', origin: 'custom', suggestedText: null }];
}

export function canSave({ name, steps }) {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!n || n.length > LIMITS.NAME) return false;
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > LIMITS.MAX_STEPS) return false;
  return steps.every(s => typeof s.instruction === 'string' && s.instruction.trim() && s.instruction.trim().length <= LIMITS.INSTRUCTION);
}

// Body for POST /api/routines. existingHabits is derived from the FINAL
// reviewed steps (origin "existing"), in their final order and final text,
// so deleting, editing or moving a habit on Review is exactly what is saved.
// purposeKey and timeWindow are suggestion-only and never sent.
export function buildSaveBody({ name, category, moment, purposeText, steps, suggestion, role }) {
  const body = {
    name: name.trim(),
    category,
    moment: moment.trim(),
    purpose: purposeText || null,
    existingHabits: steps.filter(s => s.origin === 'existing').map(s => s.instruction),
    steps: steps.map(s => ({ kind: s.kind, instruction: s.instruction, cue: null, origin: s.origin })),
  };
  if (suggestion?.templateKey) {
    body.templateKey = suggestion.templateKey;
    body.templateVersion = suggestion.templateVersion;
  }
  if (typeof role === 'string' && role.trim() && role.trim().length <= LIMITS.ROLE) body.role = role.trim();
  return body;
}

// Reads any routines API response and classifies it. A flagged save or
// import is recognised by its payload, whatever the HTTP status (the routines
// API answers 200; the legacy ritual API answers 422), so a flagged response
// is never mistaken for a success or a generic failure.
export async function readRoutineResponse(res) {
  const data = await res.json().catch(() => null);
  if (data?.safetyFlag === 'needs_support') return { type: 'safety', guidance: data.guidance || null };
  if (res.status === 409 && data?.error === 'routine_limit_reached') return { type: 'limit' };
  if (res.ok) return { type: 'ok', data };
  return { type: 'error', error: data?.error || null };
}
