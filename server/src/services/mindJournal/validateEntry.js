// Pure validation for Mind Journal entry payloads. No I/O — unit-testable
// in isolation, and shared by the route handler so the request-parsing
// rules live in exactly one place.

const { STATE_KEYS } = require('./stateVocabulary');

const MAX_NOTE_LENGTH = 500;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

function validateStates(states) {
  if (!Array.isArray(states) || states.length < 1 || states.length > 2) {
    return { valid: false, error: 'states must include exactly 1 or 2 values' };
  }
  if (!states.every((s) => typeof s === 'string')) {
    return { valid: false, error: 'states must be strings' };
  }
  if (new Set(states).size !== states.length) {
    return { valid: false, error: 'states must not contain duplicates' };
  }
  if (!states.every((s) => STATE_KEYS.includes(s))) {
    return { valid: false, error: 'states must come from the allowed list' };
  }
  return { valid: true };
}

function validateNote(note) {
  if (note === undefined || note === null) return { valid: true, value: null };
  if (typeof note !== 'string') return { valid: false, error: 'note must be a string' };
  if (CONTROL_CHAR_RE.test(note)) return { valid: false, error: 'note contains invalid characters' };

  const trimmed = note.trim();
  if (trimmed.length === 0) return { valid: true, value: null };
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return { valid: false, error: `note must be ${MAX_NOTE_LENGTH} characters or fewer` };
  }
  return { valid: true, value: trimmed };
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

module.exports = { validateStates, validateNote, validateAllowedKeys, isPlainObject, MAX_NOTE_LENGTH };
