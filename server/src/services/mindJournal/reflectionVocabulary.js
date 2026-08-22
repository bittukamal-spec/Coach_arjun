// Q4 (thoughts), Q5 (response), Q6 (body / cue) vocabularies for the unified
// Mind Journal reflection (PR 1).
//
// Every option describes something the athlete can observe and report about
// themselves. None of them names a problem, a cause, a fix or a training
// priority — that interpretation is Arjun's job, never a question we put to
// a 14-17 year old athlete.

// Q4 — "What was going through your mind when this happened?"
const THOUGHT_KEYS = [
  'knew_what_to_do',
  'focused_on_what_i_needed',
  'worried_about_result',
  'worried_about_mistake',
  'stuck_on_a_mistake',
  'what_others_would_think',
  'not_sure_what_to_do',
  'thinking_about_something_else',
  'dont_remember',
];

// Q5 — "What did you do when this happened?"
// Plain observable behaviour, no psychological labels and no self-diagnosis.
const RESPONSE_KEYS = [
  'stayed_focused',
  'reset_and_moved_on',
  'kept_going_normally',
  'went_too_fast',
  'played_it_safe',
  'pushed_harder',
  'kept_replaying_it',
  'lost_focus',
  'changed_what_i_was_doing',
  'talked_to_someone',
  'dont_remember',
];

// Q6, body variant — "What did you notice in your body?"
const BODY_KEYS = [
  'relaxed',
  'tense',
  'heart_racing',
  'shaky',
  'heavy',
  'tired',
  'lots_of_energy',
  'nothing_unusual',
  'not_sure',
];

// Q6, cue variant. Values preserve the existing post-performance cue-feedback
// semantics already in use so answers stay comparable across both eras.
const CUE_FEEDBACK_KEYS = ['helped', 'forgot', 'no_help'];

module.exports = { THOUGHT_KEYS, RESPONSE_KEYS, BODY_KEYS, CUE_FEEDBACK_KEYS };
