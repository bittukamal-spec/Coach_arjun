// Ritual rebuild (PR 2) — the deterministic routine-suggestion rules, as
// plain data. No logic, no I/O. suggestRoutine.js reads these tables.
//
// Content rules this file follows (review them here, not in the logic):
//  - Every step is something the athlete can do at that moment. No
//    motivational slogans, explanations, journaling or long exercises.
//  - Rules are chosen by time window + purpose, and a caller's timeWindow
//    can override the category default, so no wording assumes a category:
//    no "today", "session", "play" — only the last / next / first action
//    and what comes next.
//  - Steps set a plan or a focus for the next action; they never ask the
//    athlete to pre-commit to an exact outcome.
//  - Sport-neutral wording only. Sport- or role-specific content needs
//    authoring and review first.
//  - Breathing appears only in settle rules (seconds, short, longer) and as
//    one breath in the short reset rule. A seconds-long reset is a release
//    action plus the plan for the next action — no breathing.
//  - Visualisation appears only in the short and longer prepare rules, as
//    process imagery (carrying out the action), never outcome imagery.
//  - No physical warm-up is ever suggested. Physical steps come only from
//    the athlete's own habits.
//  - Step limits are maxima, not targets: rules are not padded to fill them.
//  - Cue steps never assume a stored cue exists.
//  - English is the source wording (BLOCKS). BLOCK_TEXT_HI carries the
//    Hindi wording of the same blocks (Ritual PR 4); it follows every rule
//    above and must keep one entry per block.
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
  RELEASE:       { kind: 'reset',     instruction: 'Let the last action go and shift attention to the next one' },
  LEAVE_BEHIND:  { kind: 'reset',     instruction: 'Let what happened before go and shift attention to what comes next' },
  ONE_BREATH:    { kind: 'breathe',   instruction: 'Take one slow breath with a longer exhale' },
  SLOW_BREATHS:  { kind: 'breathe',   instruction: 'Take three slow breaths, each with a longer exhale' },
  NEXT_PLAN:     { kind: 'prepare',   instruction: 'Choose your plan for the next action' },
  FIRST_PLAN:    { kind: 'prepare',   instruction: 'Choose your plan for your first action' },
  FOCUS_NEXT:    { kind: 'prepare',   instruction: 'Choose one thing to focus on for the next action' },
  FOCUS_AHEAD:   { kind: 'prepare',   instruction: 'Choose one thing to focus on for what comes next' },
  PICTURE_NEXT:  { kind: 'visualize', instruction: 'Picture yourself carrying out your next action clearly' },
  PICTURE_FIRST: { kind: 'visualize', instruction: 'Picture yourself carrying out your first action clearly' },
  CUE:           { kind: 'cue',       instruction: 'Say one short cue for the next action' },
  TRUST:         { kind: 'cue',       instruction: 'Remind yourself of one thing you trust in your game' },
  ENERGY:        { kind: 'cue',       instruction: 'Use one energy word to switch on' },
});

// Hindi wording per block, same meaning and rules as the English source.
const BLOCK_TEXT_HI = Object.freeze({
  RELEASE:       'पिछले एक्शन को जाने दो और ध्यान अगले पर ले जाओ',
  LEAVE_BEHIND:  'जो पहले हुआ उसे जाने दो और ध्यान आगे आने वाले पर लगाओ',
  ONE_BREATH:    'एक धीमी साँस लो और उसे धीरे-धीरे लंबा छोड़ो',
  SLOW_BREATHS:  'तीन धीमी साँसें लो, हर बार धीरे-धीरे लंबा छोड़ो',
  NEXT_PLAN:     'अगले एक्शन के लिए अपना प्लान चुनो',
  FIRST_PLAN:    'अपने पहले एक्शन के लिए अपना प्लान चुनो',
  FOCUS_NEXT:    'अगले एक्शन के लिए एक चीज़ चुनो जिस पर ध्यान दोगे',
  FOCUS_AHEAD:   'आगे जो आने वाला है, उसके लिए एक चीज़ चुनो जिस पर ध्यान दोगे',
  PICTURE_NEXT:  'खुद को अपना अगला एक्शन साफ़-साफ़ करते हुए देखो',
  PICTURE_FIRST: 'खुद को अपना पहला एक्शन साफ़-साफ़ करते हुए देखो',
  CUE:           'अगले एक्शन के लिए एक छोटा क्यू वर्ड बोलो',
  TRUST:         'अपने खेल की एक बात याद करो जिस पर तुम्हें भरोसा है',
  ENERGY:        'खुद को चालू करने के लिए एक एनर्जी वर्ड बोलो',
});

const SUGGESTION_LANGUAGES = Object.freeze(['en', 'hi']);

// window → purpose → ordered block names. No list is longer than that
// window's step limit, and none is padded to reach it.
const RULES = Object.freeze({
  seconds: Object.freeze({
    reset:      ['RELEASE', 'NEXT_PLAN'],
    settle:     ['ONE_BREATH', 'NEXT_PLAN'],
    focus:      ['NEXT_PLAN', 'CUE'],
    confidence: ['NEXT_PLAN', 'TRUST'],
    activate:   ['ENERGY', 'NEXT_PLAN'],
    prepare:    ['NEXT_PLAN', 'CUE'],
  }),
  short: Object.freeze({
    reset:      ['RELEASE', 'ONE_BREATH', 'NEXT_PLAN'],
    settle:     ['ONE_BREATH', 'NEXT_PLAN', 'CUE'],
    focus:      ['FOCUS_NEXT', 'NEXT_PLAN', 'CUE'],
    confidence: ['NEXT_PLAN', 'TRUST'],
    activate:   ['ENERGY', 'NEXT_PLAN'],
    prepare:    ['NEXT_PLAN', 'PICTURE_NEXT', 'CUE'],
  }),
  longer: Object.freeze({
    reset:      ['LEAVE_BEHIND', 'FOCUS_AHEAD', 'CUE'],
    settle:     ['SLOW_BREATHS', 'FOCUS_AHEAD', 'CUE'],
    focus:      ['FOCUS_AHEAD', 'CUE'],
    confidence: ['FOCUS_AHEAD', 'TRUST'],
    activate:   ['FOCUS_AHEAD', 'ENERGY'],
    prepare:    ['FOCUS_AHEAD', 'FIRST_PLAN', 'PICTURE_FIRST', 'CUE'],
  }),
});

// Conservative structure when no purpose rule applies: the plan or focus
// for what comes next and, where there is room, a cue — nothing that
// assumes what the athlete needs.
const FALLBACK = Object.freeze({
  seconds: ['NEXT_PLAN'],
  short:   ['NEXT_PLAN', 'CUE'],
  longer:  ['FOCUS_AHEAD', 'CUE'],
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
  BLOCK_TEXT_HI,
  SUGGESTION_LANGUAGES,
  RULES,
  FALLBACK,
  TEMPLATE_VERSION,
};
