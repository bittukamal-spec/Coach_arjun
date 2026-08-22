// Q6 resolver — deterministic, pure, no I/O.
//
// Most reflections finish after Q5. At most ONE extra question is ever
// shown, and never both:
//   - cue  : the athlete has an active Focus Card AND the situation is one
//            where that cue could reasonably have been used. Preferred when
//            both qualify, because it asks about something the athlete
//            already built for exactly this kind of moment.
//   - body : pressure/nerves-shaped situations, or any reflection where the
//            athlete actually reported feeling nervous or frustrated.
//   - none : neither adds useful information — skip straight to saving.
//
// This never asks why anything happened and never implies something needs
// fixing. It only asks for one more observation.

// Situations where a Focus Card / cue could plausibly have been used.
const CUE_RELEVANT_CONTEXTS = new Set([
  'COMPETITION',
  'TOUGH_MOMENT',
  'CONFIDENCE_PRESSURE',
  'SELECTION_TRIAL',
]);

// Situations that are inherently about pressure, nerves or the body.
const BODY_RELEVANT_CONTEXTS = new Set([
  'CONFIDENCE_PRESSURE',
  'TOUGH_MOMENT',
  'COMPETITION',
  'SELECTION_TRIAL',
  'RECOVERY_INJURY',
]);

// Reported states that make a body question worth asking regardless of context.
const BODY_RELEVANT_STATES = new Set(['nervous', 'frustrated', 'tired']);

/**
 * @param {object} answers  { contextType, states }
 * @param {object} options  { hasActiveFocusCard }
 * @returns {'cue'|'body'|null}
 */
function resolveConditionalQuestion(answers = {}, options = {}) {
  const contextType = answers.contextType || null;
  const states = Array.isArray(answers.states) ? answers.states : [];
  const hasActiveFocusCard = options.hasActiveFocusCard === true;

  // Cue first — it wins whenever both would qualify.
  if (hasActiveFocusCard && CUE_RELEVANT_CONTEXTS.has(contextType)) return 'cue';

  if (BODY_RELEVANT_CONTEXTS.has(contextType)) return 'body';
  if (states.some((s) => BODY_RELEVANT_STATES.has(s))) return 'body';

  return null;
}

module.exports = {
  resolveConditionalQuestion,
  CUE_RELEVANT_CONTEXTS,
  BODY_RELEVANT_CONTEXTS,
  BODY_RELEVANT_STATES,
};
