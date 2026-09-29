// Ritual rebuild (PR 1) — strict request-shape validation for saved
// routines. Pure: no I/O, no AI, no persistence. Returns either
// { valid: true, value } with trimmed, normalized fields, or
// { valid: false, error } with a stable machine-readable error string.
//
// Limits reuse the legacy ritual's own where one exists (5 steps, 120-char
// step text, 60-char name — see routes/ritual.js and RitualPage.jsx) so an
// imported ritual and its legacy mirror always fit both shapes.

const crypto = require('node:crypto');

const CATEGORIES = ['repeated_moment', 'pressure_moment', 'session_preparation', 'own_situation'];

// The legacy ritual's five step types, plus the two in-game kinds the
// redesign needs (reset after an action, prepare for the next one). Stored
// as plain strings, so later PRs can add kinds without a schema change.
const LEGACY_STEP_TYPES = ['breathe', 'cue', 'visualize', 'physical', 'custom'];
const STEP_KINDS = [...LEGACY_STEP_TYPES, 'reset', 'prepare'];
const STEP_ORIGINS = ['existing', 'suggested', 'custom'];

const LIMITS = Object.freeze({
  MAX_ACTIVE_ROUTINES: 5,
  MAX_STEPS: 5,
  NAME: 60,
  INSTRUCTION: 120,
  CUE: 60,
  SPORT: 120, // onboarding's custom "other" sport limit
  ROLE: 120,
  MOMENT: 200,
  START_TRIGGER: 120,
  PURPOSE: 200,
  MAX_HABITS: 5,
  HABIT: 120,
  TEMPLATE_KEY: 60,
  MAX_TEMPLATE_VERSION: 1000,
  STEP_ID: 64,
  MAX_BODY_BYTES: 16 * 1024,
});

const TEXT_FIELDS = {
  sport: LIMITS.SPORT,
  role: LIMITS.ROLE,
  moment: LIMITS.MOMENT,
  startTrigger: LIMITS.START_TRIGGER,
  purpose: LIMITS.PURPOSE,
};

const CREATE_KEYS = [
  'name', 'category', 'sport', 'role', 'moment', 'startTrigger', 'existingHabits',
  'purpose', 'steps', 'sourceRoutineId', 'templateKey', 'templateVersion',
];
// Adaptation lineage is fixed at creation; it can never be re-pointed.
const PATCH_KEYS = CREATE_KEYS.filter(k => k !== 'sourceRoutineId');
const STEP_KEYS = ['id', 'kind', 'instruction', 'cue', 'origin'];

const STEP_ID_RE = /^[A-Za-z0-9_-]+$/;
const TEMPLATE_KEY_RE = /^[a-z0-9_.-]+$/;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function bodyTooLarge(body) {
  try {
    return Buffer.byteLength(JSON.stringify(body ?? null), 'utf8') > LIMITS.MAX_BODY_BYTES;
  } catch {
    return true;
  }
}

// Optional text: absent → undefined (field untouched), null/'' → null,
// otherwise a trimmed string within `max`.
function optionalText(value, max, field) {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: `invalid_${field}` };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, error: `${field}_too_long` };
  return { ok: true, value: trimmed };
}

function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > LIMITS.MAX_STEPS) {
    return { ok: false, error: 'invalid_steps' };
  }
  const seenIds = new Set();
  const out = [];
  for (const step of steps) {
    if (!isPlainObject(step)) return { ok: false, error: 'invalid_step' };
    if (Object.keys(step).some(k => !STEP_KEYS.includes(k))) return { ok: false, error: 'invalid_step' };

    if (!STEP_KINDS.includes(step.kind)) return { ok: false, error: 'invalid_step_kind' };

    if (typeof step.instruction !== 'string' || !step.instruction.trim()) {
      return { ok: false, error: 'invalid_step_instruction' };
    }
    const instruction = step.instruction.trim();
    if (instruction.length > LIMITS.INSTRUCTION) return { ok: false, error: 'step_instruction_too_long' };

    const cue = optionalText(step.cue, LIMITS.CUE, 'step_cue');
    if (!cue.ok) return cue;

    const origin = step.origin === undefined ? 'custom' : step.origin;
    if (!STEP_ORIGINS.includes(origin)) return { ok: false, error: 'invalid_step_origin' };

    let id = step.id;
    if (id === undefined || id === null) {
      id = crypto.randomUUID();
    } else if (typeof id !== 'string' || !id || id.length > LIMITS.STEP_ID || !STEP_ID_RE.test(id)) {
      return { ok: false, error: 'invalid_step_id' };
    }
    if (seenIds.has(id)) return { ok: false, error: 'duplicate_step_id' };
    seenIds.add(id);

    out.push({ id, kind: step.kind, instruction, cue: cue.value ?? null, origin });
  }
  return { ok: true, value: out };
}

function validateHabits(habits) {
  if (habits === undefined) return { ok: true, value: undefined };
  if (habits === null) return { ok: true, value: [] };
  if (!Array.isArray(habits) || habits.length > LIMITS.MAX_HABITS) return { ok: false, error: 'invalid_existing_habits' };
  const out = [];
  for (const h of habits) {
    if (typeof h !== 'string' || !h.trim()) return { ok: false, error: 'invalid_existing_habits' };
    if (h.trim().length > LIMITS.HABIT) return { ok: false, error: 'existing_habit_too_long' };
    out.push(h.trim());
  }
  return { ok: true, value: out };
}

function validateFields(body, { requireAll }) {
  const value = {};

  if (body.name !== undefined || requireAll) {
    if (typeof body.name !== 'string' || !body.name.trim()) return { valid: false, error: 'name_required' };
    if (body.name.trim().length > LIMITS.NAME) return { valid: false, error: 'name_too_long' };
    value.name = body.name.trim();
  }

  if (body.category !== undefined || requireAll) {
    if (!CATEGORIES.includes(body.category)) return { valid: false, error: 'invalid_category' };
    value.category = body.category;
  }

  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    const r = optionalText(body[field], max, field);
    if (!r.ok) return { valid: false, error: r.error };
    if (r.value !== undefined) value[field] = r.value;
  }

  const habits = validateHabits(body.existingHabits);
  if (!habits.ok) return { valid: false, error: habits.error };
  if (habits.value !== undefined) value.existingHabits = habits.value;

  if (body.steps !== undefined || requireAll) {
    const steps = validateSteps(body.steps);
    if (!steps.ok) return { valid: false, error: steps.error };
    value.steps = steps.value;
  }

  if (body.templateKey !== undefined) {
    if (body.templateKey === null) value.templateKey = null;
    else if (typeof body.templateKey !== 'string' || !body.templateKey
      || body.templateKey.length > LIMITS.TEMPLATE_KEY || !TEMPLATE_KEY_RE.test(body.templateKey)) {
      return { valid: false, error: 'invalid_template_key' };
    } else value.templateKey = body.templateKey;
  }

  if (body.templateVersion !== undefined) {
    if (body.templateVersion === null) value.templateVersion = null;
    else if (!Number.isInteger(body.templateVersion) || body.templateVersion < 1
      || body.templateVersion > LIMITS.MAX_TEMPLATE_VERSION) {
      return { valid: false, error: 'invalid_template_version' };
    } else value.templateVersion = body.templateVersion;
  }

  return { valid: true, value };
}

function validateCreateRoutine(body) {
  if (!isPlainObject(body)) return { valid: false, error: 'invalid_body' };
  if (Object.keys(body).some(k => !CREATE_KEYS.includes(k))) return { valid: false, error: 'unexpected_field' };

  const result = validateFields(body, { requireAll: true });
  if (!result.valid) return result;

  if (body.sourceRoutineId !== undefined && body.sourceRoutineId !== null) {
    if (!isValidRoutineId(body.sourceRoutineId)) return { valid: false, error: 'invalid_source_routine_id' };
    result.value.sourceRoutineId = body.sourceRoutineId;
  }
  return result;
}

function validatePatchRoutine(body) {
  if (!isPlainObject(body)) return { valid: false, error: 'invalid_body' };
  const keys = Object.keys(body);
  if (keys.length === 0) return { valid: false, error: 'empty_patch' };
  if (keys.some(k => !PATCH_KEYS.includes(k))) return { valid: false, error: 'unexpected_field' };
  return validateFields(body, { requireAll: false });
}

function isValidRoutineId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= LIMITS.STEP_ID && STEP_ID_RE.test(id);
}

// Every athlete-authored string in a raw, not-yet-validated body, capped per
// field — same defensive collection Mind Journal uses, so a malformed value
// can never reach the scanner and distress text is screened even when the
// rest of the payload would fail validation.
const MAX_PRESCREEN_FIELD_LENGTH = 2000;
function collectRoutineText(body) {
  if (!isPlainObject(body)) return [];
  const cap = v => (typeof v === 'string' && v ? v.slice(0, MAX_PRESCREEN_FIELD_LENGTH) : null);
  const out = [cap(body.name), ...Object.keys(TEXT_FIELDS).map(k => cap(body[k]))];
  if (Array.isArray(body.existingHabits)) {
    for (const h of body.existingHabits.slice(0, 20)) out.push(cap(h));
  }
  if (Array.isArray(body.steps)) {
    for (const s of body.steps.slice(0, 20)) {
      if (isPlainObject(s)) out.push(cap(s.instruction), cap(s.cue));
    }
  }
  return out.filter(Boolean);
}

module.exports = {
  CATEGORIES,
  LEGACY_STEP_TYPES,
  STEP_KINDS,
  STEP_ORIGINS,
  LIMITS,
  bodyTooLarge,
  collectRoutineText,
  isPlainObject,
  isValidRoutineId,
  validateCreateRoutine,
  validatePatchRoutine,
};
