// Structural schema checks for PR-8 (coaching-cycle and prescription
// foundations). Uses the generated Prisma DMMF for real structural
// assertions (fields, uniqueness, relations, enum types) plus a few
// source-text checks for things the DMMF doesn't expose directly (index
// declarations). No database connection is made or required — `prisma
// generate` (already run) is enough to produce the DMMF this file reads.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Prisma } = require('@prisma/client');

const { models, enums } = Prisma.dmmf.datamodel;
const schemaSrc = readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');

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

function enumNames() {
  return enums.map((e) => e.name);
}

// ── 1. All three models exist ────────────────────────────────────────────────

test('UserCoachingState, CoachingCycle, and Prescription models all exist', () => {
  const names = models.map((m) => m.name);
  assert.ok(names.includes('UserCoachingState'));
  assert.ok(names.includes('CoachingCycle'));
  assert.ok(names.includes('Prescription'));
});

// ── 2-3. UserCoachingState uniqueness ────────────────────────────────────────

test('UserCoachingState.userId is unique — exactly one row per user', () => {
  const field = getField(getModel('UserCoachingState'), 'userId');
  assert.equal(field.isUnique, true);
  assert.equal(field.isRequired, true);
});

test('UserCoachingState.activeCycleId is nullable and unique (one cycle cannot be active for two users)', () => {
  const field = getField(getModel('UserCoachingState'), 'activeCycleId');
  assert.equal(field.isRequired, false);
  assert.equal(field.isUnique, true);
});

test('UserCoachingState.activePrescriptionId is nullable and unique (one prescription cannot be active for two users)', () => {
  const field = getField(getModel('UserCoachingState'), 'activePrescriptionId');
  assert.equal(field.isRequired, false);
  assert.equal(field.isUnique, true);
});

// ── 4. Relations are valid ───────────────────────────────────────────────────

test('UserCoachingState relates to User, and to CoachingCycle/Prescription via named active pointers', () => {
  const state = getModel('UserCoachingState');
  const user = getField(state, 'user');
  assert.equal(user.kind, 'object');
  assert.equal(user.type, 'User');

  const activeCycle = getField(state, 'activeCycle');
  assert.equal(activeCycle.kind, 'object');
  assert.equal(activeCycle.type, 'CoachingCycle');
  assert.equal(activeCycle.relationName, 'ActiveCoachingCycle');

  const activePrescription = getField(state, 'activePrescription');
  assert.equal(activePrescription.kind, 'object');
  assert.equal(activePrescription.type, 'Prescription');
  assert.equal(activePrescription.relationName, 'ActivePrescription');
});

test('CoachingCycle belongs to one User and optionally references a source ChatSession', () => {
  const cycle = getModel('CoachingCycle');
  const user = getField(cycle, 'user');
  assert.equal(user.kind, 'object');
  assert.equal(user.type, 'User');
  assert.equal(user.isRequired, true);

  const chatSession = getField(cycle, 'sourceChatSession');
  assert.equal(chatSession.kind, 'object');
  assert.equal(chatSession.type, 'ChatSession');
  assert.equal(chatSession.isRequired, false, 'source ChatSession reference must be optional');
});

test('Prescription belongs to both a User and a CoachingCycle', () => {
  const prescription = getModel('Prescription');

  const user = getField(prescription, 'user');
  assert.equal(user.kind, 'object');
  assert.equal(user.type, 'User');
  assert.equal(user.isRequired, true);

  const userIdField = getField(prescription, 'userId');
  assert.equal(userIdField.isRequired, true, 'a prescription cannot exist without a valid user');

  const cycle = getField(prescription, 'cycle');
  assert.equal(cycle.kind, 'object');
  assert.equal(cycle.type, 'CoachingCycle');
  assert.equal(cycle.isRequired, true);

  const cycleIdField = getField(prescription, 'cycleId');
  assert.equal(cycleIdField.isRequired, true, 'a prescription cannot exist without a valid cycle');
});

// ── 5. Lifecycle fields use Prisma enums, not free strings ──────────────────

test('CoachingCycle.status and barrierConfirmationStatus are Prisma enums', () => {
  const cycle = getModel('CoachingCycle');

  const status = getField(cycle, 'status');
  assert.equal(status.kind, 'enum');
  assert.equal(status.type, 'CoachingCycleStatus');
  assert.ok(enumNames().includes('CoachingCycleStatus'));

  const barrierStatus = getField(cycle, 'barrierConfirmationStatus');
  assert.equal(barrierStatus.kind, 'enum');
  assert.equal(barrierStatus.type, 'BarrierConfirmationStatus');
  assert.ok(enumNames().includes('BarrierConfirmationStatus'));
});

test('Prescription.status is a Prisma enum', () => {
  const status = getField(getModel('Prescription'), 'status');
  assert.equal(status.kind, 'enum');
  assert.equal(status.type, 'PrescriptionStatus');
  assert.ok(enumNames().includes('PrescriptionStatus'));
});

test('the three lifecycle/confirmation enums have exactly the specified values', () => {
  const byName = (name) => enums.find((e) => e.name === name).values.map((v) => v.name);
  assert.deepEqual(byName('CoachingCycleStatus').sort(), ['ABANDONED', 'ACTIVE', 'RESOLVED']);
  assert.deepEqual(byName('BarrierConfirmationStatus').sort(), ['CONFIRMED', 'CORRECTED', 'PENDING']);
  assert.deepEqual(byName('PrescriptionStatus').sort(), ['ACTIVE', 'COMPLETED', 'SUPERSEDED']);
});

// ── 6. CoachingCycle supports historical records (many per user) ────────────

test('CoachingCycle.userId is not unique — a user can have many historical cycles', () => {
  const field = getField(getModel('CoachingCycle'), 'userId');
  assert.equal(field.isUnique, false);
  const cycle = getModel('CoachingCycle');
  assert.equal(cycle.uniqueFields.length, 0, 'no @@unique constraint should limit cycles-per-user');
});

test('User.coachingCycles is a list relation (not a single/unique pointer)', () => {
  const user = getModel('User');
  const field = getField(user, 'coachingCycles');
  assert.equal(field.isList, true);
});

// ── 7. Timestamps present for each model's required lifecycle events ────────

test('CoachingCycle has timestamps for creation, update, resolution, and explicit abandonment', () => {
  const cycle = getModel('CoachingCycle');
  for (const name of ['createdAt', 'updatedAt', 'resolvedAt', 'abandonedAt']) {
    getField(cycle, name);
  }
  assert.equal(getField(cycle, 'resolvedAt').isRequired, false);
  assert.equal(getField(cycle, 'abandonedAt').isRequired, false);
});

test('Prescription has timestamps for prescribed, completed, and superseded', () => {
  const prescription = getModel('Prescription');
  for (const name of ['prescribedAt', 'completedAt', 'supersededAt']) {
    getField(prescription, name);
  }
  assert.equal(getField(prescription, 'completedAt').isRequired, false);
  assert.equal(getField(prescription, 'supersededAt').isRequired, false);
});

// ── 8. No automatic expiry/abandonment field, no gamification field ─────────

test('no expiry or automatic-abandonment field was added to any of the three models', () => {
  for (const name of ['UserCoachingState', 'CoachingCycle', 'Prescription']) {
    const fieldNames = getModel(name).fields.map((f) => f.name.toLowerCase());
    for (const forbidden of ['expiresat', 'expiry', 'autoabandon', 'timeoutat']) {
      assert.ok(!fieldNames.includes(forbidden), `${name} must not have a(n) ${forbidden} field`);
    }
  }
});

test('no XP, streak, score, or reward field was added to any of the three models', () => {
  for (const name of ['UserCoachingState', 'CoachingCycle', 'Prescription']) {
    const fieldNames = getModel(name).fields.map((f) => f.name.toLowerCase());
    for (const forbidden of ['xp', 'streak', 'score', 'reward', 'badge', 'level']) {
      assert.ok(!fieldNames.includes(forbidden), `${name} must not have a(n) ${forbidden} field`);
    }
  }
});

test('Prescription stores byte-consistent card content, not a raw chat transcript', () => {
  const prescription = getModel('Prescription');
  const cardContent = getField(prescription, 'cardContent');
  assert.equal(cardContent.type, 'String');
  const fieldNames = prescription.fields.map((f) => f.name.toLowerCase());
  assert.ok(!fieldNames.some((n) => n.includes('transcript')), 'must not store a full chat transcript');
});

// ── DB-enforced uniqueness at the schema-source level (belt and suspenders) ──

test('activeCycleId and activePrescriptionId are declared @unique in the Prisma source', () => {
  const block = schemaSrc.slice(schemaSrc.indexOf('model UserCoachingState'), schemaSrc.indexOf('model CoachingCycle'));
  assert.match(block, /activeCycleId\s+String\?\s+@unique/);
  assert.match(block, /activePrescriptionId\s+String\?\s+@unique/);
});
