// Ritual rebuild (PR 1) — pure mapping between the legacy single ritual
// (User.ritualName + User.ritualSteps JSON `[{type, label}]`) and routine
// steps (`[{id, kind, instruction, cue, origin}]`). No I/O.
//
// Wording and order are preserved exactly: a legacy label becomes the step
// instruction verbatim, in the same position.

const crypto = require('node:crypto');
const { LEGACY_STEP_TYPES, STEP_KINDS } = require('./validateRoutine');

// Parses User.ritualSteps. Returns the usable legacy steps in stored order
// (entries without a non-empty string label are skipped), or [] when the
// value is empty or unparseable. Never throws.
function parseLegacySteps(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(s => s && typeof s === 'object' && typeof s.label === 'string' && s.label.trim())
    .map(s => ({ type: LEGACY_STEP_TYPES.includes(s.type) ? s.type : 'custom', label: s.label }));
}

// Routine step kind → legacy step type. Kinds the legacy UI does not know
// (e.g. "reset", "prepare") appear there as "custom".
function legacyTypeFor(kind) {
  return LEGACY_STEP_TYPES.includes(kind) ? kind : 'custom';
}

// Legacy steps → fresh routine steps. The athlete wrote these themselves in
// the old builder, so their origin is "custom".
function legacyToRoutineSteps(legacySteps) {
  return legacySteps.map(s => ({
    id: crypto.randomUUID(),
    kind: STEP_KINDS.includes(s.type) ? s.type : 'custom',
    instruction: s.label,
    cue: null,
    origin: 'custom',
  }));
}

// Routine steps → the legacy mirror written to User.ritualSteps (the shape
// the current /ritual UI and Coach context already read).
function routineStepsToLegacy(steps) {
  return (Array.isArray(steps) ? steps : []).map(s => ({ type: legacyTypeFor(s.kind), label: s.instruction }));
}

// Applies a save from a cached legacy client onto the authoritative routine
// steps. A position whose legacy type and text are unchanged keeps its
// routine step exactly (id, kind, cue, origin), so a legacy client that
// cannot see cues or new kinds never erases them by re-saving. A changed
// position keeps its step id and (when the legacy type still matches) its
// kind, takes the new wording, drops the cue that belonged to the old
// wording, and becomes "custom" because the athlete edited it.
function mergeLegacyIntoRoutineSteps(existingSteps, legacySteps) {
  const current = Array.isArray(existingSteps) ? existingSteps : [];
  return legacySteps.map((l, i) => {
    const old = current[i];
    const sameType = old && legacyTypeFor(old.kind) === l.type;
    if (sameType && old.instruction === l.label) return old;
    return {
      id: old?.id || crypto.randomUUID(),
      kind: sameType ? old.kind : l.type,
      instruction: l.label,
      cue: null,
      origin: 'custom',
    };
  });
}

module.exports = {
  parseLegacySteps,
  legacyTypeFor,
  legacyToRoutineSteps,
  routineStepsToLegacy,
  mergeLegacyIntoRoutineSteps,
};
