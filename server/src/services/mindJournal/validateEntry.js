// Pure validation for Mind Journal entry payloads. No I/O — unit-testable
// in isolation, and shared by the route handler so the request-parsing
// rules live in exactly one place.
//
// PR 1 of the guided-reflection redesign: extends the original quick-note
// validator (states + note only) with entryType/contextType/four narrative
// fields, while keeping every original rule byte-for-byte for the legacy
// shape (entryType omitted) and the equivalent explicit QUICK_NOTE shape —
// the currently deployed client sends only { states, note } and must keep
// working unchanged.
//
// Custom state: one optional athlete-authored label stored in `customState`
// (never inside the fixed `states` array). Counts toward the same 1–2 /
// 0–2 total-state budget as a built-in selection.

const { STATE_KEYS, STATE_LABELS } = require('./stateVocabulary');
const { CONTEXT_TYPE_KEYS } = require('./contextTypeVocabulary');

const MAX_NOTE_LENGTH = 500;
const MAX_WHAT_HAPPENED_LENGTH = 1000;
const MAX_WHAT_NOTICED_LENGTH = 1000;
const MAX_HELPED_OR_GOT_IN_WAY_LENGTH = 1000;
const MAX_TAKE_FORWARD_LENGTH = 500;
const MAX_CUSTOM_STATE_LENGTH = 30;

const ENTRY_TYPES = ['QUICK_NOTE', 'GUIDED_REFLECTION'];

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

// states: the fixed-vocabulary array alone. Total-state budget (including
// optional customState) is enforced by the caller after both are validated.
// Omitted `states` under min:0 normalizes to [].
function validateStates(states, { min = 1, max = 2 } = {}) {
  const arr = states === undefined && min === 0 ? [] : states;
  if (!Array.isArray(arr)) {
    return { valid: false, error: `states must be an array of ${min}-${max} value${max === 1 ? '' : 's'}` };
  }
  if (arr.length < min || arr.length > max) {
    return { valid: false, error: `states must include ${min}-${max} value${max === 1 ? '' : 's'}` };
  }
  if (!arr.every((s) => typeof s === 'string')) {
    return { valid: false, error: 'states must be strings' };
  }
  if (new Set(arr).size !== arr.length) {
    return { valid: false, error: 'states must not contain duplicates' };
  }
  if (!arr.every((s) => STATE_KEYS.includes(s))) {
    return { valid: false, error: 'states must come from the allowed list' };
  }
  return { valid: true, value: arr };
}

// Shared bounded-text rule for every optional athlete-authored string field:
// undefined/null passes through as null; empty/whitespace-only normalizes
// to null; control characters and over-length values are rejected outright
// — never silently truncated.
function validateBoundedText(value, maxLength, fieldName) {
  if (value === undefined || value === null) return { valid: true, value: null };
  if (typeof value !== 'string') return { valid: false, error: `${fieldName} must be a string` };
  if (CONTROL_CHAR_RE.test(value)) return { valid: false, error: `${fieldName} contains invalid characters` };

  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: true, value: null };
  if (trimmed.length > maxLength) {
    return { valid: false, error: `${fieldName} must be ${maxLength} characters or fewer` };
  }
  return { valid: true, value: trimmed };
}

function validateNote(note) {
  return validateBoundedText(note, MAX_NOTE_LENGTH, 'note');
}
function validateWhatHappened(v) {
  return validateBoundedText(v, MAX_WHAT_HAPPENED_LENGTH, 'whatHappened');
}
function validateWhatNoticed(v) {
  return validateBoundedText(v, MAX_WHAT_NOTICED_LENGTH, 'whatNoticed');
}
function validateHelpedOrGotInWay(v) {
  return validateBoundedText(v, MAX_HELPED_OR_GOT_IN_WAY_LENGTH, 'helpedOrGotInWay');
}
function validateTakeForward(v) {
  return validateBoundedText(v, MAX_TAKE_FORWARD_LENGTH, 'takeForward');
}

function validateCustomState(value) {
  return validateBoundedText(value, MAX_CUSTOM_STATE_LENGTH, 'customState');
}

// Reject a custom label that merely restates a selected built-in key or its
// English display label (case-insensitive). Hindi labels are not checked —
// the athlete may write in either language.
function customMatchesSelectedBuiltIn(customState, selectedStates) {
  if (!customState) return false;
  const lower = customState.toLowerCase();
  for (const key of selectedStates) {
    if (typeof key === 'string' && key.toLowerCase() === lower) return true;
    const en = STATE_LABELS[key]?.en;
    if (en && en.toLowerCase() === lower) return true;
  }
  return false;
}

function totalStateCount(states, customState) {
  return states.length + (customState ? 1 : 0);
}

function validateEntryType(entryType) {
  if (entryType === undefined || entryType === null) return { valid: true, value: null };
  if (!ENTRY_TYPES.includes(entryType)) {
    return { valid: false, error: 'entryType must be QUICK_NOTE or GUIDED_REFLECTION' };
  }
  return { valid: true, value: entryType };
}

function validateContextType(contextType, { required }) {
  if (contextType === undefined || contextType === null) {
    return required
      ? { valid: false, error: 'contextType is required for a guided reflection' }
      : { valid: true, value: null };
  }
  if (!CONTEXT_TYPE_KEYS.includes(contextType)) {
    return { valid: false, error: 'contextType must be one of the approved values' };
  }
  return { valid: true, value: contextType };
}

function isAbsentOrNull(v) {
  return v === undefined || v === null;
}

// A plain JSON object — never an array, null, or a non-object (string,
// number, boolean) body.
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Strict request-shape guard: the body must be a plain object containing
// ONLY the allowed top-level keys — extra fields like score/rating/progress
// are rejected outright rather than silently ignored.
function validateAllowedKeys(body, allowedKeys) {
  if (!isPlainObject(body)) {
    return { valid: false, error: 'request body must be a JSON object' };
  }
  const unexpected = Object.keys(body).filter((k) => !allowedKeys.includes(k));
  if (unexpected.length > 0) {
    return { valid: false, error: `unexpected field(s): ${unexpected.join(', ')}` };
  }
  return { valid: true };
}

// Full request-shape + field validation for POST /api/mind-journal. Caller
// must run validateAllowedKeys first (unrelated top-level keys are rejected
// there, before this ever runs). Returns { valid: true, value: {...all
// fields, normalized} } or { valid: false, error }.
//
// Three shapes, never blended:
//   - legacy (entryType omitted) and QUICK_NOTE: identical rules — total
//     states (built-in + optional customState) required (1-2), note optional
//     (<=500), no guided fields, no contextType. The currently deployed
//     client only ever sends { states, note } and must keep working.
//   - GUIDED_REFLECTION: contextType required, total states optional (0-2),
//     note must be absent/null, every narrative field individually optional,
//     but at least one state (built-in or custom) OR one non-empty narrative
//     field is required (contextType alone would create an empty-feeling
//     record).
function validateMindJournalEntry(body) {
  const entryTypeCheck = validateEntryType(body.entryType);
  if (!entryTypeCheck.valid) return entryTypeCheck;
  const entryType = entryTypeCheck.value;

  if (entryType === 'GUIDED_REFLECTION') {
    const contextTypeCheck = validateContextType(body.contextType, { required: true });
    if (!contextTypeCheck.valid) return contextTypeCheck;

    const statesCheck = validateStates(body.states, { min: 0, max: 2 });
    if (!statesCheck.valid) return statesCheck;

    const customStateCheck = validateCustomState(body.customState);
    if (!customStateCheck.valid) return customStateCheck;

    if (totalStateCount(statesCheck.value, customStateCheck.value) > 2) {
      return { valid: false, error: 'states and customState together must total at most 2' };
    }
    if (customMatchesSelectedBuiltIn(customStateCheck.value, statesCheck.value)) {
      return { valid: false, error: 'customState must not repeat a selected built-in state' };
    }

    if (!isAbsentOrNull(body.note)) {
      return { valid: false, error: 'note is not used for a guided reflection' };
    }

    const whatHappenedCheck = validateWhatHappened(body.whatHappened);
    if (!whatHappenedCheck.valid) return whatHappenedCheck;
    const whatNoticedCheck = validateWhatNoticed(body.whatNoticed);
    if (!whatNoticedCheck.valid) return whatNoticedCheck;
    const helpedOrGotInWayCheck = validateHelpedOrGotInWay(body.helpedOrGotInWay);
    if (!helpedOrGotInWayCheck.valid) return helpedOrGotInWayCheck;
    const takeForwardCheck = validateTakeForward(body.takeForward);
    if (!takeForwardCheck.valid) return takeForwardCheck;

    const hasAnyState = statesCheck.value.length > 0 || customStateCheck.value !== null;
    const hasAnyText = [whatHappenedCheck.value, whatNoticedCheck.value, helpedOrGotInWayCheck.value, takeForwardCheck.value]
      .some((v) => v !== null);
    if (!hasAnyState && !hasAnyText) {
      return { valid: false, error: 'a guided reflection needs at least one state or one written field besides the context' };
    }

    return {
      valid: true,
      value: {
        entryType: 'GUIDED_REFLECTION',
        contextType: contextTypeCheck.value,
        states: statesCheck.value,
        customState: customStateCheck.value,
        note: null,
        whatHappened: whatHappenedCheck.value,
        whatNoticed: whatNoticedCheck.value,
        helpedOrGotInWay: helpedOrGotInWayCheck.value,
        takeForward: takeForwardCheck.value,
      },
    };
  }

  // Legacy (entryType omitted) and QUICK_NOTE share identical rules.
  if (!isAbsentOrNull(body.contextType)) {
    return { valid: false, error: 'contextType is only used for a guided reflection' };
  }
  for (const [fieldName, value] of [
    ['whatHappened', body.whatHappened],
    ['whatNoticed', body.whatNoticed],
    ['helpedOrGotInWay', body.helpedOrGotInWay],
    ['takeForward', body.takeForward],
  ]) {
    if (!isAbsentOrNull(value)) {
      return { valid: false, error: `${fieldName} is only used for a guided reflection` };
    }
  }

  // Built-in states alone still accept the classic 1–2 shape; with an
  // optional customState the combined total must land in 1–2.
  const statesCheck = validateStates(body.states, { min: 0, max: 2 });
  if (!statesCheck.valid) return statesCheck;

  const customStateCheck = validateCustomState(body.customState);
  if (!customStateCheck.valid) return customStateCheck;

  const total = totalStateCount(statesCheck.value, customStateCheck.value);
  if (total < 1 || total > 2) {
    return { valid: false, error: 'states and customState together must total 1-2' };
  }
  if (customMatchesSelectedBuiltIn(customStateCheck.value, statesCheck.value)) {
    return { valid: false, error: 'customState must not repeat a selected built-in state' };
  }

  const noteCheck = validateNote(body.note);
  if (!noteCheck.valid) return noteCheck;

  return {
    valid: true,
    value: {
      entryType, // null for the legacy shape, 'QUICK_NOTE' if sent explicitly
      contextType: null,
      states: statesCheck.value,
      customState: customStateCheck.value,
      note: noteCheck.value,
      whatHappened: null,
      whatNoticed: null,
      helpedOrGotInWay: null,
      takeForward: null,
    },
  };
}

module.exports = {
  validateStates,
  validateNote,
  validateWhatHappened,
  validateWhatNoticed,
  validateHelpedOrGotInWay,
  validateTakeForward,
  validateCustomState,
  validateEntryType,
  validateContextType,
  validateMindJournalEntry,
  validateAllowedKeys,
  isPlainObject,
  MAX_NOTE_LENGTH,
  MAX_WHAT_HAPPENED_LENGTH,
  MAX_WHAT_NOTICED_LENGTH,
  MAX_HELPED_OR_GOT_IN_WAY_LENGTH,
  MAX_TAKE_FORWARD_LENGTH,
  MAX_CUSTOM_STATE_LENGTH,
};
