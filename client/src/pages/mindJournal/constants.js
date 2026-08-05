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

// Pure state toggle: deselects an already-selected state, and refuses a
// third — the server enforces the same 0-2 bound, this just keeps the UI
// honest. Kept here (not with the chip component) so it is directly
// unit-testable.
export function toggleStateKey(previous, key) {
  if (previous.includes(key)) return previous.filter(k => k !== key);
  if (previous.length >= 2) return previous;
  return [...previous, key];
}

// Athlete text is sent trimmed, and an empty field is omitted from the
// payload entirely rather than sent as '' — the server normalizes both to
// null, but omitting keeps the request honest about what was written.
export function textOrUndefined(value) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
