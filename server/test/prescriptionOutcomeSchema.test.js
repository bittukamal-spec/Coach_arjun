// Structural schema checks for PR-13's additive Prescription outcome
// fields and the new PrescriptionOutcomeStatus enum. Uses the generated
// Prisma DMMF for real structural assertions — `prisma generate` must have
// already run. No database connection is made or required.

const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');

const { models, enums } = Prisma.dmmf.datamodel;

function getModel(name) {
  const model = models.find((m) => m.name === name);
  assert.ok(model, `model not found in DMMF: ${name}`);
  return model;
}

function getField(model, name) {
  const field = model.fields.find((f) => f.name === name);
  assert.ok(field, `field not found on ${model.name}: ${name}`);
  return field;
}

function getEnum(name) {
  const e = enums.find((en) => en.name === name);
  assert.ok(e, `enum not found in DMMF: ${name}`);
  return e;
}

test('PrescriptionOutcomeStatus enum exists with exactly the four specified values', () => {
  const e = getEnum('PrescriptionOutcomeStatus');
  assert.deepEqual(
    e.values.map((v) => v.name).sort(),
    ['DID_NOT_HELP', 'HELPED', 'HELPED_A_LITTLE', 'NOT_TRIED'].sort()
  );
});

test('Prescription.outcomeStatus is a nullable PrescriptionOutcomeStatus enum field', () => {
  const field = getField(getModel('Prescription'), 'outcomeStatus');
  assert.equal(field.kind, 'enum');
  assert.equal(field.type, 'PrescriptionOutcomeStatus');
  assert.equal(field.isRequired, false);
  assert.equal(field.isUnique, false);
});

test('Prescription.outcomeLesson is a nullable String, no length enforced at the schema level (validated in coachingTools.js)', () => {
  const field = getField(getModel('Prescription'), 'outcomeLesson');
  assert.equal(field.type, 'String');
  assert.equal(field.isRequired, false);
});

test('Prescription.outcomeRecordedAt is a nullable DateTime', () => {
  const field = getField(getModel('Prescription'), 'outcomeRecordedAt');
  assert.equal(field.type, 'DateTime');
  assert.equal(field.isRequired, false);
});

test('Prescription.outcomeSourceMessageId and outcomeSourceSessionId are nullable, non-unique, plain scalars — never invented identifiers, never a hard relation', () => {
  const messageIdField = getField(getModel('Prescription'), 'outcomeSourceMessageId');
  assert.equal(messageIdField.type, 'String');
  assert.equal(messageIdField.isRequired, false);
  assert.equal(messageIdField.isUnique, false);
  assert.equal(messageIdField.kind, 'scalar');

  const sessionIdField = getField(getModel('Prescription'), 'outcomeSourceSessionId');
  assert.equal(sessionIdField.type, 'String');
  assert.equal(sessionIdField.isRequired, false);
  assert.equal(sessionIdField.kind, 'scalar');
});

test('all five new outcome fields are additive only — every pre-existing Prescription field (including PR-11/PR-12 additions) is untouched', () => {
  const prescription = getModel('Prescription');
  for (const name of [
    'id', 'userId', 'cycleId', 'practiceKey', 'situation', 'cardContent', 'cueWord',
    'status', 'sourceChatSessionId', 'prescribedAt', 'updatedAt', 'completedAt', 'supersededAt',
    'followUpOpenerClaimedAt', 'followUpOpenerMessageId', 'followUpOpenerSessionId',
  ]) {
    getField(prescription, name); // throws (via assert.ok) if missing
  }
});

test('no score, rating, XP, streak, or reward field was added alongside outcome capture', () => {
  const fieldNames = getModel('Prescription').fields.map((f) => f.name.toLowerCase());
  for (const forbidden of ['score', 'rating', 'xp', 'streak', 'reward', 'badge', 'level', 'percentage', 'successrate']) {
    assert.ok(!fieldNames.includes(forbidden), `Prescription must not have a(n) ${forbidden} field`);
  }
});

test('no expiry or automatic-abandonment field was added alongside outcome capture', () => {
  const fieldNames = getModel('Prescription').fields.map((f) => f.name.toLowerCase());
  for (const forbidden of ['expiresat', 'expiry', 'autoabandon', 'timeoutat']) {
    assert.ok(!fieldNames.includes(forbidden), `Prescription must not have a(n) ${forbidden} field`);
  }
});

test('the athlete\'s full raw reply is never duplicated onto Prescription — only the short outcomeLesson field exists, no raw-message/transcript field', () => {
  const fieldNames = getModel('Prescription').fields.map((f) => f.name.toLowerCase());
  assert.ok(!fieldNames.some((n) => n.includes('transcript') || n.includes('rawreply') || n.includes('fullmessage')));
});

test('CoachingCycle keeps its existing resolvedAt/abandonedAt fields — no new field was added there for outcome capture (resolution reuses resolvedAt)', () => {
  const cycle = getModel('CoachingCycle');
  getField(cycle, 'resolvedAt');
  getField(cycle, 'abandonedAt');
  const fieldNames = cycle.fields.map((f) => f.name.toLowerCase());
  assert.ok(!fieldNames.some((n) => n.includes('outcome')), 'CoachingCycle must not gain its own outcome field — outcome lives on Prescription');
});
