// Routines in Coach (Nov 2026). "Talk to Arjun" on a Ritual routine links
// the conversation to that routine (ChatSession.focusRoutineId). Coach then
// gets a short internal note with that ONE routine — not the athlete's whole
// routine list — and can offer an improved version with the propose_routine
// tool. The card the athlete sees is built here; saving happens only when
// the athlete taps Save (routines API, validated + safety-screened again).

const { screenSafetyFields } = require('../safety');

const CATEGORY_TEXT = {
  session_preparation: 'before playing or training',
  repeated_moment: 'a moment that repeats during play (e.g. between balls or points)',
  pressure_moment: 'a single pressure moment',
  own_situation: "a situation the athlete chose",
};

const MAX_NOTE_FIELD = 200;
const clip = (v, max = MAX_NOTE_FIELD) => {
  const t = String(v || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

// Internal system note (uncached, after the stable prompt). Empty without a
// linked routine.
function buildRoutineFocusSection(routine) {
  if (!routine) return '';
  const steps = (Array.isArray(routine.steps) ? routine.steps : [])
    .map((s, i) => `${i + 1}. ${clip(s?.instruction, 120)}`)
    .join('\n');
  return `

## Routine the athlete is discussing (internal)
They opened this conversation from their saved routine "${clip(routine.name || 'My routine', 60)}" — used ${CATEGORY_TEXT[routine.category] || 'in their own situation'}.
Current steps:
${steps || '(none)'}
If you and the athlete agree on a better version, call propose_routine with the COMPLETE new step list (leave out name and category) so they can save it to this routine with one tap. Never say it has been saved — the athlete decides.`;
}

// The SSE payload for the card, or null when there is nothing safe to show.
// Model-written step text is screened here; a flagged proposal is dropped
// (the reply itself has already passed the chat's own checks).
function buildRoutineProposalEvent(proposal, focusRoutine) {
  if (!proposal || !Array.isArray(proposal.steps) || proposal.steps.length === 0) return null;
  if (screenSafetyFields(proposal.name || null, ...proposal.steps).flagged) return null;
  const updating = !!focusRoutine;
  return {
    t: 'routine_proposal',
    proposal: {
      mode: updating ? 'update' : 'create',
      routineId: updating ? focusRoutine.id : null,
      routineName: updating ? (focusRoutine.name || null) : null,
      name: updating ? (focusRoutine.name || null) : proposal.name,
      category: updating ? focusRoutine.category : proposal.category,
      steps: proposal.steps,
    },
  };
}

module.exports = { buildRoutineFocusSection, buildRoutineProposalEvent };
