// Approved Mental Rep practice set for chat prescriptions (PR-10) —
// docs/ARJUN-MVP-SPEC.md §3.2: "Approved practice set (complete — nothing
// else may be prescribed)". Games (Focus Lock, Reset Rally) are explicitly
// NOT prescription targets in the pilot, so they are absent here by design.
// Key style follows the repo's existing snake_case convention
// (SkillProgress.skillKey, PlanSession.toolId, Prescription.practiceKey).

const APPROVED_PRACTICES = {
  pressure_reset: {
    label: 'Pressure Reset',
    surface: '/body-reset',
  },
  focus_cue_building: {
    label: 'Focus cue building (Focus Card)',
    surface: '/self-talk',
  },
  attentional_routine: {
    label: 'Simple attentional routine',
    surface: 'chat-coached',
  },
  pre_performance_routine: {
    label: 'Pre-performance routine',
    surface: 'prep-flow + chat',
  },
  mistake_reset_routine: {
    label: 'Mistake reset routine',
    surface: 'chat-coached',
  },
  guided_rehearsal: {
    label: 'Brief guided rehearsal',
    surface: 'chat / prep-flow',
  },
  post_performance_reflection: {
    label: 'Post-performance reflection',
    surface: '/debrief',
  },
  acclimatization_homework: {
    label: 'Acclimatization homework',
    surface: 'real-world homework (no app surface)',
  },
};

const APPROVED_PRACTICE_KEYS = Object.keys(APPROVED_PRACTICES);

function isApprovedPracticeKey(key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(APPROVED_PRACTICES, key);
}

module.exports = { APPROVED_PRACTICES, APPROVED_PRACTICE_KEYS, isApprovedPracticeKey };
