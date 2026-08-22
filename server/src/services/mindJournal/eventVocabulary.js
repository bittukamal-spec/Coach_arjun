// Q2 — "What happened?" — the observable-event vocabulary for the unified
// Mind Journal reflection (PR 1).
//
// Deliberately SMALL: roughly 6-8 choices per context. These describe what
// the athlete can actually observe about the situation, never how well they
// performed. There is no result/performance grading here by design — the
// athlete reports, Arjun interprets.
//
// Mirrors the existing vocabulary-module pattern (stateVocabulary.js,
// contextTypeVocabulary.js): plain arrays, no Prisma, no I/O, so validation
// stays fast and unit-testable without a database.

// Every context key here must exist in CONTEXT_TYPE_KEYS. SOMETHING_ELSE
// ("Write my own" at Q1) uses the generic set — the athlete has already told
// us what it was about in their own words.
const CONTEXT_TO_EVENTS = {
  TRAINING: [
    'full_session',
    'part_of_session',
    'new_or_hard_drill',
    'repeated_mistake',
    'coach_feedback',
    'first_time_back',
    'trained_while_tired',
  ],
  COMPETITION: [
    'whole_match',
    'start_of_play',
    'end_of_play',
    'key_moment',
    'after_a_mistake',
    'close_score',
    'crowd_or_noise',
    'did_not_get_to_play',
  ],
  TOUGH_MOMENT: [
    'made_a_mistake',
    'things_went_wrong_fast',
    'criticised_or_shouted_at',
    'compared_to_someone',
    'left_out_or_benched',
    'body_did_not_respond',
    'it_went_on_for_a_while',
  ],
  WENT_WELL: [
    'executed_a_skill',
    'stayed_with_a_plan',
    'came_back_after_mistake',
    'helped_a_teammate',
    'handled_a_big_moment',
    'trained_when_i_did_not_feel_like_it',
    'noticed_improvement',
  ],
  CONFIDENCE_PRESSURE: [
    'before_playing',
    'during_a_big_moment',
    'being_watched',
    'expected_to_perform',
    'after_a_run_of_bad_days',
    'trying_something_new',
    'talking_about_my_sport',
  ],
  SELECTION_TRIAL: [
    'trial_or_selection_day',
    'waiting_for_a_decision',
    'got_selected',
    'not_selected',
    'watched_by_selectors',
    'competing_with_teammates',
    'travelling_for_it',
  ],
  RECOVERY_INJURY: [
    'rest_day',
    'lighter_training',
    'injured_during_play',
    'in_rehab',
    'first_session_back',
    'watching_others_train',
    'waiting_on_a_medical_update',
  ],
  OUTSIDE_SPORT: [
    'school_or_studies',
    'family',
    'friends',
    'sleep',
    'health',
    'travel_or_schedule',
    'money_or_equipment',
  ],
  // Historical guided-reflection context, still selectable so an athlete
  // whose entry pre-dates RECOVERY_INJURY sees a coherent set.
  RECOVERY_DAY: [
    'rest_day',
    'lighter_training',
    'first_session_back',
    'watching_others_train',
  ],
  SOMETHING_ELSE: [
    'before_it_happened',
    'while_it_was_happening',
    'after_it_happened',
    'it_lasted_a_while',
    'it_happened_suddenly',
    'it_kept_repeating',
  ],
};

const ALL_EVENT_KEYS = [...new Set(Object.values(CONTEXT_TO_EVENTS).flat())];

// Valid event keys for one context. Unknown context -> empty list, so the
// validator rejects any tag rather than silently accepting everything.
function eventKeysForContext(contextType) {
  return CONTEXT_TO_EVENTS[contextType] || [];
}

module.exports = { CONTEXT_TO_EVENTS, ALL_EVENT_KEYS, eventKeysForContext };
