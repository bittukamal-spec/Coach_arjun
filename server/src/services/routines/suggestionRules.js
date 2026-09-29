// Ritual rebuild (PR 2) — the deterministic routine-suggestion rules, as
// plain data. No logic, no I/O. suggestRoutine.js reads these tables.
//
// Content rules this file follows (review them here, not in the logic):
//  - Every step is something the athlete can do at that moment. No
//    motivational slogans, explanations, journaling or long exercises.
//  - Sport-neutral wording only. Sport- or role-specific content needs
//    authoring and review first.
//  - Breathing appears only in "settle" rules and in the short "reset"
//    rule (one quick breath). A seconds-long reset is a release action plus
//    the next action — no breathing.
//  - No physical warm-up is ever suggested. Physical steps come only from
//    the athlete's own habits.
//  - English only for now.
//
// Kinds are existing routine step kinds (validateRoutine.js STEP_KINDS).

const PURPOSE_KEYS = Object.freeze(['settle', 'reset', 'focus', 'confidence', 'activate', 'prepare']);
// Explicitly "no specific purpose" — handled exactly like an absent key.
const NO_PURPOSE_KEYS = Object.freeze(['not_sure']);

const TIME_WINDOWS = Object.freeze(['seconds', 'short', 'longer']);

// Default time window per existing category. own_situation has none: its
// timing is unknown, so it uses the conservative fallback unless the caller
// states a time window explicitly.
const DEFAULT_TIME_WINDOW = Object.freeze({
  repeated_moment: 'seconds',
  pressure_moment: 'short',
  session_preparation: 'longer',
  own_situation: null,
});
// Window used for own_situation's conservative fallback structure.
const OWN_SITUATION_FALLBACK_WINDOW = 'short';

// Preferred TOTAL steps (athlete habits + suggestions) for each window.
// Suggestions stop at this number. Athlete habits are never cut to fit it.
const WINDOW_STEP_LIMIT = Object.freeze({
  seconds: 2,
  short: 3,
  longer: 4,
});

const BLOCKS = Object.freeze({
  RELEASE:        { kind: 'reset',     instruction: 'Turn away from the last play and let it go' },
  LEAVE_BEHIND:   { kind: 'reset',     instruction: 'Leave whatever happened before this session behind you' },
  ONE_BREATH:     { kind: 'breathe',   instruction: 'Take one slow breath out' },
  SLOW_BREATHS:   { kind: 'breathe',   instruction: 'Take three slow breaths, breathing out longer than in' },
  NEXT_ACTION:    { kind: 'prepare',   instruction: 'Decide exactly what you will do next' },
  FIRST_ACTION:   { kind: 'prepare',   instruction: 'Decide your first action when play starts' },
  LOOK_TARGET:    { kind: 'prepare',   instruction: 'Pick one target and keep your eyes on it' },
  SESSION_FOCUS:  { kind: 'prepare',   instruction: 'Choose one thing to focus on today' },
  REHEARSE_FIRST: { kind: 'visualize', instruction: 'Picture your first action going the way you want' },
  RECALL_SUCCESS: { kind: 'visualize', instruction: 'Recall one time you did this well' },
  CUE:            { kind: 'cue',       instruction: 'Say your one-word cue' },
  TRUST_CUE:      { kind: 'cue',       instruction: 'Say one short line about what you trust in your game' },
  ENERGY_CUE:     { kind: 'cue',       instruction: 'Say one energy word to lift your intensity' },
});

// window → purpose → ordered block names. No list is longer than that
// window's step limit. "seconds" never uses visualisation or multi-breath
// sequences.
const RULES = Object.freeze({
  seconds: Object.freeze({
    reset:      ['RELEASE', 'NEXT_ACTION'],
    settle:     ['ONE_BREATH', 'NEXT_ACTION'],
    focus:      ['NEXT_ACTION', 'CUE'],
    confidence: ['NEXT_ACTION', 'TRUST_CUE'],
    activate:   ['ENERGY_CUE', 'NEXT_ACTION'],
    prepare:    ['NEXT_ACTION', 'CUE'],
  }),
  short: Object.freeze({
    reset:      ['RELEASE', 'ONE_BREATH', 'NEXT_ACTION'],
    settle:     ['ONE_BREATH', 'NEXT_ACTION', 'CUE'],
    focus:      ['LOOK_TARGET', 'NEXT_ACTION', 'CUE'],
    confidence: ['RECALL_SUCCESS', 'NEXT_ACTION', 'TRUST_CUE'],
    activate:   ['ENERGY_CUE', 'NEXT_ACTION'],
    prepare:    ['NEXT_ACTION', 'REHEARSE_FIRST', 'CUE'],
  }),
  longer: Object.freeze({
    reset:      ['LEAVE_BEHIND', 'SESSION_FOCUS', 'CUE'],
    settle:     ['SLOW_BREATHS', 'SESSION_FOCUS', 'REHEARSE_FIRST', 'CUE'],
    focus:      ['SESSION_FOCUS', 'REHEARSE_FIRST', 'CUE'],
    confidence: ['RECALL_SUCCESS', 'SESSION_FOCUS', 'TRUST_CUE'],
    activate:   ['SESSION_FOCUS', 'REHEARSE_FIRST', 'ENERGY_CUE'],
    prepare:    ['SESSION_FOCUS', 'REHEARSE_FIRST', 'FIRST_ACTION', 'CUE'],
  }),
});

// Conservative structure when no purpose rule applies: the next action and,
// where there is room, a cue — nothing that assumes what the athlete needs.
const FALLBACK = Object.freeze({
  seconds: ['NEXT_ACTION'],
  short:   ['NEXT_ACTION', 'CUE'],
  longer:  ['SESSION_FOCUS', 'CUE'],
});

const TEMPLATE_VERSION = 1;

// Nested lists and blocks are frozen too, so no caller can alter the rules.
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) Object.freeze(value);
  if (value && typeof value === 'object') Object.values(value).forEach(deepFreeze);
  return value;
}
[BLOCKS, RULES, FALLBACK].forEach(deepFreeze);

module.exports = {
  PURPOSE_KEYS,
  NO_PURPOSE_KEYS,
  TIME_WINDOWS,
  DEFAULT_TIME_WINDOW,
  OWN_SITUATION_FALLBACK_WINDOW,
  WINDOW_STEP_LIMIT,
  BLOCKS,
  RULES,
  FALLBACK,
  TEMPLATE_VERSION,
};
