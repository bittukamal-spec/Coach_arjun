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
//
// Custom context: optional athlete-authored label stored in `customContext`
// when contextType is SOMETHING_ELSE. Not server-required (legacy rows may
// have SOMETHING_ELSE with null customContext). Rejected for any other
// contextType or for quick-note / legacy shapes.

const { STATE_KEYS, STATE_LABELS, REFLECTION_STATE_KEYS } = require('./stateVocabulary');
const { CONTEXT_TYPE_KEYS, REFLECTION_CONTEXT_KEYS } = require('./contextTypeVocabulary');
const { eventKeysForContext } = require('./eventVocabulary');
const { THOUGHT_KEYS, RESPONSE_KEYS, BODY_KEYS, CUE_FEEDBACK_KEYS } = require('./reflectionVocabulary');
const { resolveConditionalQuestion } = require('./resolveConditionalQuestion');

const MAX_NOTE_LENGTH = 500;
const MAX_WHAT_HAPPENED_LENGTH = 1000;
const MAX_WHAT_NOTICED_LENGTH = 1000;
const MAX_HELPED_OR_GOT_IN_WAY_LENGTH = 1000;
const MAX_TAKE_FORWARD_LENGTH = 500;
const MAX_CUSTOM_STATE_LENGTH = 30;
const MAX_CUSTOM_CONTEXT_LENGTH = 80;
// Unified reflection (PR 1) — one short athlete-written label per question.
const MAX_CUSTOM_EVENT_LENGTH = 80;
const MAX_CUSTOM_THOUGHT_LENGTH = 80;
const MAX_CUSTOM_RESPONSE_LENGTH = 80;
const MAX_CUSTOM_BODY_LENGTH = 80;
const MAX_CUE_WORD_SNAPSHOT_LENGTH = 60;
// Every multi-select question in the unified reflection shares one cap.
const MAX_TAG_SELECTIONS = 2;

const ENTRY_TYPES = ['QUICK_NOTE', 'GUIDED_REFLECTION', 'REFLECTION'];

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

// states: the fixed-vocabulary array alone. Total-state budget (including
// optional customState) is enforced by the caller after both are validated.
// Omitted `states` under min:0 normalizes to [].
function validateStates(states, { min = 1, max = 2, allowed = STATE_KEYS } = {}) {
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
  if (!arr.every((s) => allowed.includes(s))) {
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

function validateCustomContext(value) {
  return validateBoundedText(value, MAX_CUSTOM_CONTEXT_LENGTH, 'customContext');
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

// ── Unified reflection (PR 1) helpers ─────────────────────────────────────

// One multi-select answer list: 0-2 values, no duplicates, every value from
// the question's own allowed vocabulary. Omitted normalizes to [].
function validateTagList(value, allowedKeys, fieldName) {
  const arr = value === undefined || value === null ? [] : value;
  if (!Array.isArray(arr)) return { valid: false, error: `${fieldName} must be an array` };
  if (arr.length > MAX_TAG_SELECTIONS) {
    return { valid: false, error: `${fieldName} must include at most ${MAX_TAG_SELECTIONS} values` };
  }
  if (!arr.every((v) => typeof v === 'string')) {
    return { valid: false, error: `${fieldName} must be strings` };
  }
  if (new Set(arr).size !== arr.length) {
    return { valid: false, error: `${fieldName} must not contain duplicates` };
  }
  if (!arr.every((v) => allowedKeys.includes(v))) {
    return { valid: false, error: `${fieldName} must come from the allowed list` };
  }
  return { valid: true, value: arr };
}

// A tag list plus its optional "Write my own" label share ONE budget of 2,
// exactly like states + customState already do.
function validateTagGroup(tags, custom, allowedKeys, fieldName, maxCustomLength) {
  const tagsCheck = validateTagList(tags, allowedKeys, fieldName);
  if (!tagsCheck.valid) return tagsCheck;
  const customCheck = validateBoundedText(custom, maxCustomLength, `custom${fieldName[0].toUpperCase()}${fieldName.slice(1, -4)}`);
  if (!customCheck.valid) return customCheck;
  if (tagsCheck.value.length + (customCheck.value ? 1 : 0) > MAX_TAG_SELECTIONS) {
    return { valid: false, error: `${fieldName} and its custom value together must total at most ${MAX_TAG_SELECTIONS}` };
  }
  return { valid: true, value: { tags: tagsCheck.value, custom: customCheck.value } };
}

// A required multi-select question is answered by a chip OR by its own
// "Write my own" text — never by requiring the athlete to type.
function answeredGroup(group) {
  return group.tags.length > 0 || group.custom !== null;
}

function validateCueFeedback(value) {
  if (value === undefined || value === null) return { valid: true, value: null };
  if (!CUE_FEEDBACK_KEYS.includes(value)) {
    return { valid: false, error: 'cueFeedback must be one of the approved values' };
  }
  return { valid: true, value };
}

// The redesigned reflection shape. contextType is the one required answer
// (Q1); every other question is optional to answer, but a reflection made of
// nothing but a context would be an empty record — so at least one answer
// beyond the context is required, matching the existing guided rule.
function validateReflectionEntry(body, { hasActiveFocusCard = false } = {}) {
  const contextTypeCheck = validateContextType(body.contextType, { required: true });
  if (!contextTypeCheck.valid) return contextTypeCheck;
  const contextType = contextTypeCheck.value;
  if (!REFLECTION_CONTEXT_KEYS.includes(contextType)) {
    return { valid: false, error: 'contextType is not offered by the reflection flow' };
  }

  const customContextCheck = validateCustomContext(body.customContext);
  if (!customContextCheck.valid) return customContextCheck;
  if (customContextCheck.value !== null && contextType !== 'SOMETHING_ELSE') {
    return { valid: false, error: 'customContext is only used when contextType is SOMETHING_ELSE' };
  }

  // Q2 — event tags are validated against THIS context's own vocabulary.
  const eventGroup = validateTagGroup(
    body.eventTags, body.customEvent, eventKeysForContext(contextType), 'eventTags', MAX_CUSTOM_EVENT_LENGTH,
  );
  if (!eventGroup.valid) return eventGroup;
  if (!answeredGroup(eventGroup.value)) {
    return { valid: false, error: 'eventTags must include at least one answer' };
  }

  // Q3 — the same eight states plus a reflection-only "not sure", so a
  // required question always has an honest answer available.
  const statesCheck = validateStates(body.states, { min: 0, max: 2, allowed: REFLECTION_STATE_KEYS });
  if (!statesCheck.valid) return statesCheck;
  const customStateCheck = validateCustomState(body.customState);
  if (!customStateCheck.valid) return customStateCheck;
  if (totalStateCount(statesCheck.value, customStateCheck.value) > 2) {
    return { valid: false, error: 'states and customState together must total at most 2' };
  }
  if (customMatchesSelectedBuiltIn(customStateCheck.value, statesCheck.value)) {
    return { valid: false, error: 'customState must not repeat a selected built-in state' };
  }
  if (statesCheck.value.length === 0 && customStateCheck.value === null) {
    return { valid: false, error: 'states must include at least one answer' };
  }

  const thoughtGroup = validateTagGroup(
    body.thoughtTags, body.customThought, THOUGHT_KEYS, 'thoughtTags', MAX_CUSTOM_THOUGHT_LENGTH,
  );
  if (!thoughtGroup.valid) return thoughtGroup;
  if (!answeredGroup(thoughtGroup.value)) {
    return { valid: false, error: 'thoughtTags must include at least one answer' };
  }

  const responseGroup = validateTagGroup(
    body.responseTags, body.customResponse, RESPONSE_KEYS, 'responseTags', MAX_CUSTOM_RESPONSE_LENGTH,
  );
  if (!responseGroup.valid) return responseGroup;
  if (!answeredGroup(responseGroup.value)) {
    return { valid: false, error: 'responseTags must include at least one answer' };
  }

  const bodyGroup = validateTagGroup(
    body.bodyTags, body.customBody, BODY_KEYS, 'bodyTags', MAX_CUSTOM_BODY_LENGTH,
  );
  if (!bodyGroup.valid) return bodyGroup;

  const cueFeedbackCheck = validateCueFeedback(body.cueFeedback);
  if (!cueFeedbackCheck.valid) return cueFeedbackCheck;
  const cueWordSnapshotCheck = validateBoundedText(body.cueWordSnapshot, MAX_CUE_WORD_SNAPSHOT_LENGTH, 'cueWordSnapshot');
  if (!cueWordSnapshotCheck.valid) return cueWordSnapshotCheck;

  // Q6 is ONE question or none — body and cue can never both be answered.
  const hasBody = bodyGroup.value.tags.length > 0 || bodyGroup.value.custom !== null;
  if (hasBody && cueFeedbackCheck.value !== null) {
    return { valid: false, error: 'a reflection answers at most one of the body or cue question' };
  }
  if (cueWordSnapshotCheck.value !== null && cueFeedbackCheck.value === null) {
    return { valid: false, error: 'cueWordSnapshot is only stored alongside cueFeedback' };
  }

  // The narrative + note fields belong to the earlier shapes only.
  for (const [fieldName, value] of [
    ['note', body.note],
    ['whatHappened', body.whatHappened],
    ['whatNoticed', body.whatNoticed],
    ['helpedOrGotInWay', body.helpedOrGotInWay],
    ['takeForward', body.takeForward],
  ]) {
    if (!isAbsentOrNull(value)) {
      return { valid: false, error: `${fieldName} is not used for a reflection` };
    }
  }

  // Q6 is conditional: required only when the resolver would actually have
  // shown it. Either variant satisfies it — the resolver's own preference
  // can flip mid-reflection if the athlete saves a Focus Card in another
  // tab, and a completed reflection must never be rejected over that race.
  if (resolveConditionalQuestion(
    { contextType, states: statesCheck.value },
    { hasActiveFocusCard },
  ) !== null && !hasBody && cueFeedbackCheck.value === null) {
    return { valid: false, error: 'this reflection needs an answer to its final question' };
  }

  return {
    valid: true,
    value: {
      entryType: 'REFLECTION',
      contextType,
      customContext: customContextCheck.value,
      eventTags: eventGroup.value.tags,
      customEvent: eventGroup.value.custom,
      states: statesCheck.value,
      customState: customStateCheck.value,
      thoughtTags: thoughtGroup.value.tags,
      customThought: thoughtGroup.value.custom,
      responseTags: responseGroup.value.tags,
      customResponse: responseGroup.value.custom,
      bodyTags: bodyGroup.value.tags,
      customBody: bodyGroup.value.custom,
      cueFeedback: cueFeedbackCheck.value,
      cueWordSnapshot: cueWordSnapshotCheck.value,
      note: null,
      whatHappened: null,
      whatNoticed: null,
      helpedOrGotInWay: null,
      takeForward: null,
    },
  };
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
//     record). customContext is optional and only allowed with SOMETHING_ELSE.
function validateMindJournalEntry(body, options = {}) {
  const entryTypeCheck = validateEntryType(body.entryType);
  if (!entryTypeCheck.valid) return entryTypeCheck;
  const entryType = entryTypeCheck.value;

  if (entryType === 'REFLECTION') {
    return validateReflectionEntry(body, options);
  }

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

    const customContextCheck = validateCustomContext(body.customContext);
    if (!customContextCheck.valid) return customContextCheck;
    if (customContextCheck.value !== null && contextTypeCheck.value !== 'SOMETHING_ELSE') {
      return { valid: false, error: 'customContext is only used when contextType is SOMETHING_ELSE' };
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
        customContext: customContextCheck.value,
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
    ['customContext', body.customContext],
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
      customContext: null,
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
  validateTagList,
  validateTagGroup,
  validateCueFeedback,
  validateReflectionEntry,
  answeredGroup,
  validateNote,
  validateWhatHappened,
  validateWhatNoticed,
  validateHelpedOrGotInWay,
  validateTakeForward,
  validateCustomState,
  validateCustomContext,
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
  MAX_CUSTOM_CONTEXT_LENGTH,
  MAX_CUSTOM_EVENT_LENGTH,
  MAX_CUSTOM_THOUGHT_LENGTH,
  MAX_CUSTOM_RESPONSE_LENGTH,
  MAX_CUSTOM_BODY_LENGTH,
  MAX_CUE_WORD_SNAPSHOT_LENGTH,
  MAX_TAG_SELECTIONS,
};
