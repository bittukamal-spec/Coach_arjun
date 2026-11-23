// Onboarding v2 (Nov 2026): the answers that personalise the app reach
// Coach's note, the reminder time and the check-in.
const test = require('node:test');
const assert = require('node:assert/strict');
const { personalFromAnswers, personalNoteLines, reminderTimeFor, loadPersonal } = require('../src/services/path/personal');
const { buildPathCoachSection } = require('../src/services/path/matchDay');
const { checkinScreens, checkinEditableQuestionIds } = require('../src/profile/profileService');

const answers = {
  first_signal: { answerIds: ['body'] },
  contextual_pressures: { answerIds: ['family_expectations', 'selection_pressure', 'different'], customText: 'x' },
  what_helps: { answerIds: ['music', 'praying'] },
  training_time: { answerIds: ['morning'] },
};

test('personal answers → ids only, free text dropped', () => {
  const p = personalFromAnswers(answers);
  assert.deepEqual(p, { firstSignal: 'body', pressures: ['family_expectations', 'selection_pressure'], helps: ['music', 'praying'], trainingTime: 'morning' });
  assert.deepEqual(personalFromAnswers({}), { firstSignal: null, pressures: [], helps: [], trainingTime: null });
});

test('Coach note uses them: first tool, pressure source, what helps, training time', () => {
  const lines = personalNoteLines(personalFromAnswers(answers)).join('\n');
  assert.match(lines, /BODY/);
  assert.match(lines, /Pressure Reset/);
  assert.match(lines, /family expectations, selection/);
  assert.match(lines, /music, praying/);
  assert.match(lines, /mornings/);
  const section = buildPathCoachSection({ path: { finished: true, personal: personalFromAnswers(answers) }, match: {} }, '2026-11-23');
  assert.match(section, /Path and next match \(internal\)/);
  assert.equal(personalNoteLines(null).length, 0);
});

test('reminders arrive shortly before they usually train; 18:00 when unknown', () => {
  assert.equal(reminderTimeFor('morning'), '07:00');
  assert.equal(reminderTimeFor('afternoon'), '12:30');
  assert.equal(reminderTimeFor('evening'), '16:00');
  assert.equal(reminderTimeFor('varies'), '18:00');
  assert.equal(reminderTimeFor(null), '18:00');
});

test('loadPersonal reads the latest completed onboarding and never throws', async () => {
  const fake = { onboardingSession: { findFirst: async ({ where }) => (where.status === 'COMPLETED' ? { answers } : null) } };
  assert.equal((await loadPersonal(fake, 'u1')).trainingTime, 'morning');
  const broken = { onboardingSession: { findFirst: async () => { throw new Error('db'); } } };
  assert.equal((await loadPersonal(broken, 'u1')).firstSignal, null);
  assert.equal((await loadPersonal({}, 'u1')).firstSignal, null);
});

test('the profile check-in can edit them (section "personal")', () => {
  const session = { branchId: 'mistakes', answers: {} };
  assert.deepEqual(checkinScreens(session).personal, ['first_signal', 'contextual_pressures', 'what_helps', 'training_time']);
  const editable = checkinEditableQuestionIds(session);
  for (const q of ['first_signal', 'contextual_pressures', 'what_helps', 'training_time']) assert.ok(editable.has(q), q);
});
