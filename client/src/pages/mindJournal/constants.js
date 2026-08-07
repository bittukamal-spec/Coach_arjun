// Fixed Mind Journal vocabularies and field limits.
//
// These mirror the server contract exactly — the state list in
// server/src/services/mindJournal/stateVocabulary.js, the context types in
// contextTypeVocabulary.js, and the MAX_* bounds in validateEntry.js. They
// are duplicated here (rather than fetched) so the creation screens can
// render and bound input without a round trip; the server remains the
// authority and rejects anything outside these sets.

export const STATE_KEYS = ['calm', 'focused', 'confident', 'motivated', 'nervous', 'frustrated', 'distracted', 'tired'];

export const CONTEXT_TYPE_KEYS = ['TRAINING', 'COMPETITION', 'TOUGH_MOMENT', 'RECOVERY_DAY', 'SOMETHING_ELSE'];

export const MAX_NOTE_LENGTH = 500;
export const MAX_WHAT_HAPPENED_LENGTH = 1000;
export const MAX_WHAT_NOTICED_LENGTH = 1000;
export const MAX_HELPED_OR_GOT_IN_WAY_LENGTH = 1000;
export const MAX_TAKE_FORWARD_LENGTH = 500;
export const MAX_CUSTOM_STATE_LENGTH = 30;
export const MAX_CUSTOM_CONTEXT_LENGTH = 80;
export const MAX_STATE_SELECTIONS = 2;

// Router state marker: child screens opened from the Mind Journal home pass
// this so their header back control can use genuine history navigation
// instead of pushing another /mind-journal entry (which created a
// Quick-Note ↔ Journal back-gesture loop).
export const FROM_MIND_JOURNAL = 'mindJournal';

export function mindJournalOriginState(extra = {}) {
  return { from: FROM_MIND_JOURNAL, ...extra };
}

export function cameFromMindJournal(locationState) {
  return locationState?.from === FROM_MIND_JOURNAL;
}

// Preview precedence for a guided reflection in the recent list: the first
// of these that the athlete actually filled in is what the card shows.
export const GUIDED_PREVIEW_FIELDS = ['whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'takeForward'];

// First non-empty guided field, in the precedence order above. Returns null
// for a quick note or a legacy row (all four fields are null there).
export function guidedPreview(entry) {
  for (const field of GUIDED_PREVIEW_FIELDS) {
    if (entry[field]) return entry[field];
  }
  return null;
}

// How many of the two state slots are occupied. Opening "Something else"
// reserves one slot even before text is typed, so a third selection cannot
// sneak in; an empty custom value is still not a valid save.
export function stateSlotCount(selected, customOpen) {
  return selected.length + (customOpen ? 1 : 0);
}

// Pure state toggle: deselects an already-selected state, and refuses a
// third — the server enforces the same bound, this just keeps the UI
// honest. Kept here (not with the chip component) so it is directly
// unit-testable. `customOpen` counts toward the two-slot budget.
export function toggleStateKey(previous, key, { customOpen = false } = {}) {
  if (previous.includes(key)) return previous.filter(k => k !== key);
  if (stateSlotCount(previous, customOpen) >= MAX_STATE_SELECTIONS) return previous;
  return [...previous, key];
}

// Labels for display: built-in keys go through the translation table; the
// athlete's customState is shown verbatim and never reinterpreted.
export function stateTagsForEntry(entry, mj) {
  const tags = Array.isArray(entry?.states)
    ? entry.states.map(k => mj.states[k]).filter(Boolean)
    : [];
  if (entry?.customState) tags.push(entry.customState);
  return tags;
}

// Visible context label for guided reflections. Prefer the athlete's
// customContext when contextType is SOMETHING_ELSE; otherwise the translated
// enum label. Never translates athlete-written text.
export function contextLabelForEntry(entry, mj) {
  if (!entry?.contextType) return null;
  if (entry.contextType === 'SOMETHING_ELSE' && entry.customContext) {
    return entry.customContext;
  }
  return mj.contextTypes[entry.contextType] || mj.contextTypes.SOMETHING_ELSE;
}

// Athlete text is sent trimmed, and an empty field is omitted from the
// payload entirely rather than sent as '' — the server normalizes both to
// null, but omitting keeps the request honest about what was written.
export function textOrUndefined(value) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
