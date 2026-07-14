// Structural schema checks for PR-11's additive Prescription fields (the
// deterministic next-open follow-up opener claim). Uses the generated
// Prisma DMMF for real structural assertions — `prisma generate` must have
// already run. No database connection is made or required.

const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');

const { models } = Prisma.dmmf.datamodel;

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

test('Prescription gains followUpOpenerClaimedAt: a nullable DateTime, never required', () => {
  const field = getField(getModel('Prescription'), 'followUpOpenerClaimedAt');
  assert.equal(field.type, 'DateTime');
  assert.equal(field.isRequired, false);
  assert.equal(field.isUnique, false);
});

test('Prescription gains followUpOpenerMessageId: a nullable, non-unique String (the real persisted Message id)', () => {
  const field = getField(getModel('Prescription'), 'followUpOpenerMessageId');
  assert.equal(field.type, 'String');
  assert.equal(field.isRequired, false);
  // Deliberately NOT a unique constraint: the once-only guarantee comes
  // entirely from the transactional conditional claim on
  // followUpOpenerClaimedAt (WHERE it is null), not from a database
  // constraint on this field. A unique index here would also force
  // `prisma db push` to require --accept-data-loss on deploy, which this
  // repo's rollout must never pass.
  assert.equal(field.isUnique, false, 'uniqueness is not required for the atomic claim or duplicate prevention');
});

test('Prescription gains followUpOpenerSessionId: a nullable String, not a hard relation', () => {
  const field = getField(getModel('Prescription'), 'followUpOpenerSessionId');
  assert.equal(field.type, 'String');
  assert.equal(field.isRequired, false);
  assert.equal(field.kind, 'scalar', 'a plain scalar — no relation expansion needed for a nullable audit trail');
});

test('all three new fields are additive only — every pre-existing Prescription field is untouched', () => {
  const prescription = getModel('Prescription');
  for (const name of [
    'id', 'userId', 'cycleId', 'practiceKey', 'situation', 'cardContent', 'cueWord',
    'status', 'sourceChatSessionId', 'prescribedAt', 'updatedAt', 'completedAt', 'supersededAt',
  ]) {
    getField(prescription, name); // throws (via assert.ok) if missing
  }
});

test('no expiry, automatic-abandonment, outcome, or rating field was added alongside the opener claim', () => {
  const fieldNames = getModel('Prescription').fields.map((f) => f.name.toLowerCase());
  for (const forbidden of ['expiresat', 'expiry', 'autoabandon', 'timeoutat', 'outcome', 'rating', 'completedpractice']) {
    assert.ok(!fieldNames.includes(forbidden), `Prescription must not have a(n) ${forbidden} field`);
  }
});

test('no raw chat transcript field was added for the follow-up opener', () => {
  const fieldNames = getModel('Prescription').fields.map((f) => f.name.toLowerCase());
  assert.ok(!fieldNames.some((n) => n.includes('transcript') || n.includes('followupopenertext')), 'the opener text lives only on the Message row, never duplicated onto Prescription');
});
