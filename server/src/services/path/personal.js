// The athlete's own onboarding answers that personalise the app (founder,
// Nov 2026: "every question should take important data"). Read from the
// latest completed onboarding session — the profile check-in edits the same
// answers, so this is always current. Ids only; no free text.

const ids = (answers, qid) => (Array.isArray(answers?.[qid]?.answerIds) ? answers[qid].answerIds : []);

function personalFromAnswers(answers = {}) {
  return {
    firstSignal: ids(answers, 'first_signal')[0] || null,
    pressures: ids(answers, 'contextual_pressures').filter((x) => x !== 'different' && x !== 'nothing_outside'),
    helps: ids(answers, 'what_helps').filter((x) => x !== 'nothing_yet'),
    trainingTime: ids(answers, 'training_time')[0] || null,
  };
}

async function loadPersonal(prisma, userId) {
  if (!prisma?.onboardingSession?.findFirst) return personalFromAnswers({});
  try {
    const s = await prisma.onboardingSession.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { answers: true },
    });
    return personalFromAnswers(s?.answers || {});
  } catch (err) {
    console.error('[path] personal error:', err?.message);
    return personalFromAnswers({});
  }
}

// Plain words for Coach's internal note.
const SIGNAL_NOTE = {
  body: 'they notice it first in their BODY (tension, heartbeat) — start with body tools such as the Pressure Reset breathing',
  thoughts: 'they notice it first in their THOUGHTS ("don\'t mess up", replaying mistakes) — start with cue words and Focus Cards',
  feelings: 'they notice it first in their FEELINGS (anger, fear, frustration) — start by naming the feeling; the Mind Journal fits',
};
const PRESSURE_NOTE = {
  own_expectations: 'their own expectations', coach_behaviour: 'their coach', family_expectations: 'family expectations',
  comparison: 'comparison with other athletes', selection_pressure: 'selection', school_work: 'school or exams',
  money_travel: 'money, travel or facilities', injury_condition: 'injury', social_media: 'social media',
};
const HELPS_NOTE = {
  music: 'music', slow_breathing: 'slow breathing', talking: 'talking to someone', routine: 'a set routine',
  praying: 'praying', visualising: 'visualising', being_alone: 'time alone',
};
const TRAINING_NOTE = { morning: 'mornings', afternoon: 'afternoons', evening: 'evenings' };

function personalNoteLines(p) {
  if (!p) return [];
  const lines = [];
  if (SIGNAL_NOTE[p.firstSignal]) lines.push(`When pressure hits, ${SIGNAL_NOTE[p.firstSignal]}.`);
  const pr = (p.pressures || []).map((x) => PRESSURE_NOTE[x]).filter(Boolean);
  if (pr.length) lines.push(`Pressure mostly comes from: ${pr.join(', ')}. Keep this in mind; don't bring it up unless it fits.`);
  const h = (p.helps || []).map((x) => HELPS_NOTE[x]).filter(Boolean);
  if (h.length) lines.push(`What already helps them: ${h.join(', ')}. Build on these before suggesting something new.`);
  if (TRAINING_NOTE[p.trainingTime]) lines.push(`They usually train in the ${TRAINING_NOTE[p.trainingTime]}.`);
  return lines;
}

// Local reminder time from their training time (Hook fix 4): shortly before
// they usually train; the old fixed 18:00 otherwise.
const REMINDER_BY_TRAINING = { morning: '07:00', afternoon: '12:30', evening: '16:00' };
function reminderTimeFor(trainingTime) {
  return REMINDER_BY_TRAINING[trainingTime] || '18:00';
}

module.exports = { personalFromAnswers, loadPersonal, personalNoteLines, reminderTimeFor };
