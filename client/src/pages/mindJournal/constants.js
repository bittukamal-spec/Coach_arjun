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

// ── Unified reflection (PR 1) ──────────────────────────────────────────────
// Mirrors server/src/services/mindJournal/{contextTypeVocabulary,
// eventVocabulary,reflectionVocabulary}.js exactly. Duplicated here (rather
// than fetched) so the wizard can render without a round trip; the server
// stays the authority and rejects anything outside these sets.

// Q1 — the nine choices, in screen order. SOMETHING_ELSE is "Write my own".
export const REFLECTION_CONTEXT_KEYS = [
  'TRAINING', 'COMPETITION', 'TOUGH_MOMENT', 'WENT_WELL', 'CONFIDENCE_PRESSURE',
  'SELECTION_TRIAL', 'RECOVERY_INJURY', 'OUTSIDE_SPORT', 'SOMETHING_ELSE',
];

// Q2 — context-adaptive observable events.
export const CONTEXT_TO_EVENTS = {
  TRAINING: ['full_session', 'part_of_session', 'new_or_hard_drill', 'repeated_mistake', 'coach_feedback', 'first_time_back', 'trained_while_tired'],
  COMPETITION: ['whole_match', 'start_of_play', 'end_of_play', 'key_moment', 'after_a_mistake', 'close_score', 'crowd_or_noise', 'did_not_get_to_play'],
  TOUGH_MOMENT: ['made_a_mistake', 'things_went_wrong_fast', 'criticised_or_shouted_at', 'compared_to_someone', 'left_out_or_benched', 'body_did_not_respond', 'it_went_on_for_a_while'],
  WENT_WELL: ['executed_a_skill', 'stayed_with_a_plan', 'came_back_after_mistake', 'helped_a_teammate', 'handled_a_big_moment', 'trained_when_i_did_not_feel_like_it', 'noticed_improvement'],
  CONFIDENCE_PRESSURE: ['before_playing', 'during_a_big_moment', 'being_watched', 'expected_to_perform', 'after_a_run_of_bad_days', 'trying_something_new', 'talking_about_my_sport'],
  SELECTION_TRIAL: ['trial_or_selection_day', 'waiting_for_a_decision', 'got_selected', 'not_selected', 'watched_by_selectors', 'competing_with_teammates', 'travelling_for_it'],
  RECOVERY_INJURY: ['rest_day', 'lighter_training', 'injured_during_play', 'in_rehab', 'first_session_back', 'watching_others_train', 'waiting_on_a_medical_update'],
  OUTSIDE_SPORT: ['school_or_studies', 'family', 'friends', 'sleep', 'health', 'travel_or_schedule', 'money_or_equipment'],
  RECOVERY_DAY: ['rest_day', 'lighter_training', 'first_session_back', 'watching_others_train'],
  SOMETHING_ELSE: ['before_it_happened', 'while_it_was_happening', 'after_it_happened', 'it_lasted_a_while', 'it_happened_suddenly', 'it_kept_repeating'],
};

export function eventKeysForContext(contextType) {
  return CONTEXT_TO_EVENTS[contextType] || [];
}

// Q4 / Q5 / Q6
export const THOUGHT_KEYS = [
  'knew_what_to_do', 'focused_on_what_i_needed', 'worried_about_result', 'worried_about_mistake',
  'stuck_on_a_mistake', 'what_others_would_think', 'not_sure_what_to_do',
  'thinking_about_something_else', 'dont_remember',
];
export const RESPONSE_KEYS = [
  'stayed_focused', 'reset_and_moved_on', 'kept_going_normally', 'went_too_fast', 'played_it_safe',
  'pushed_harder', 'kept_replaying_it', 'lost_focus', 'changed_what_i_was_doing',
  'talked_to_someone', 'dont_remember',
];
export const BODY_KEYS = [
  'relaxed', 'tense', 'heart_racing', 'shaky', 'heavy', 'tired', 'lots_of_energy',
  'nothing_unusual', 'not_sure',
];
export const CUE_FEEDBACK_KEYS = ['helped', 'forgot', 'no_help'];

// One shared cap for every multi-select question in the reflection.
export const MAX_TAG_SELECTIONS = 2;
export const MAX_CUSTOM_EVENT_LENGTH = 80;
export const MAX_CUSTOM_THOUGHT_LENGTH = 80;
export const MAX_CUSTOM_RESPONSE_LENGTH = 80;
export const MAX_CUSTOM_BODY_LENGTH = 80;

// Q6 resolver — mirrors resolveConditionalQuestion.js exactly.
const CUE_RELEVANT_CONTEXTS = ['COMPETITION', 'TOUGH_MOMENT', 'CONFIDENCE_PRESSURE', 'SELECTION_TRIAL'];
const BODY_RELEVANT_CONTEXTS = ['CONFIDENCE_PRESSURE', 'TOUGH_MOMENT', 'COMPETITION', 'SELECTION_TRIAL', 'RECOVERY_INJURY'];
const BODY_RELEVANT_STATES = ['nervous', 'frustrated', 'tired'];

export function resolveConditionalQuestion(answers = {}, options = {}) {
  const contextType = answers.contextType || null;
  const states = Array.isArray(answers.states) ? answers.states : [];
  if (options.hasActiveFocusCard === true && CUE_RELEVANT_CONTEXTS.includes(contextType)) return 'cue';
  if (BODY_RELEVANT_CONTEXTS.includes(contextType)) return 'body';
  if (states.some(s => BODY_RELEVANT_STATES.includes(s))) return 'body';
  return null;
}

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
