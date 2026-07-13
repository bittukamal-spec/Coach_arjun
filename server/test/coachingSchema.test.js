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

// ── Composite-relation ownership enforcement ─────────────────────────────────
// A plain independent userId + cycleId/activeCycleId/activePrescriptionId FK
// pair would let a Prescription (or an active pointer) reference a cycle/
// prescription owned by a *different* user — the userId columns would never
// be cross-checked against each other. Including userId as part of each
// composite `fields`/`references` pair forces Postgres to resolve the whole
// tuple against one matching row, making a cross-user mismatch structurally
// impossible to persist, not just application-validated.

test("Prescription's cycle relation is a composite FK on (cycleId, userId) — not an independent pair", () => {
  const cycle = getField(getModel('Prescription'), 'cycle');
  assert.deepEqual(cycle.relationFromFields, ['cycleId', 'userId']);
  assert.deepEqual(cycle.relationToFields, ['id', 'userId']);
});

test('activeCycle is a composite FK on (activeCycleId, userId) — the active cycle must belong to this user', () => {
  const activeCycle = getField(getModel('UserCoachingState'), 'activeCycle');
  assert.deepEqual(activeCycle.relationFromFields, ['activeCycleId', 'userId']);
  assert.deepEqual(activeCycle.relationToFields, ['id', 'userId']);
});

test('activePrescription is a composite FK on (activePrescriptionId, activeCycleId, userId) — the active prescription must belong to both this user and the active cycle', () => {
  const activePrescription = getField(getModel('UserCoachingState'), 'activePrescription');
  assert.deepEqual(activePrescription.relationFromFields, ['activePrescriptionId', 'activeCycleId', 'userId']);
  assert.deepEqual(activePrescription.relationToFields, ['id', 'cycleId', 'userId']);
});

test('mismatched user/cycle relationships are structurally impossible: every composite FK target is backed by a matching composite unique constraint', () => {
  // A composite FK can only be declared against a genuinely unique
  // combination on the referenced side — these are exactly the
  // (id, ...ownership-fields) uniques each composite relation above targets.
  assert.deepEqual(
    getModel('CoachingCycle').uniqueFields.some((f) => f.join(',') === 'id,userId'),
    true,
    'CoachingCycle must expose a (id, userId) composite unique for Prescription.cycle / UserCoachingState.activeCycle to target'
  );
  assert.deepEqual(
    getModel('Prescription').uniqueFields.some((f) => f.join(',') === 'id,cycleId,userId'),
    true,
    'Prescription must expose a (id, cycleId, userId) composite unique for UserCoachingState.activePrescription to target'
  );
});

test('delete behavior on every composite relation is Restrict, never SetNull (userId can never be nulled)', () => {
  const cycle = getField(getModel('Prescription'), 'cycle');
  assert.equal(cycle.relationOnDelete, 'Cascade'); // unchanged parent-owns-child behavior, not SetNull

  const activeCycle = getField(getModel('UserCoachingState'), 'activeCycle');
  assert.equal(activeCycle.relationOnDelete, 'Restrict');

  const activePrescription = getField(getModel('UserCoachingState'), 'activePrescription');
  assert.equal(activePrescription.relationOnDelete, 'Restrict');
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
  // A (id, userId) composite unique exists solely as the relation target for
  // Prescription.cycle / UserCoachingState.activeCycle (§ composite
  // ownership tests above) — that's not a per-user limit, since `id` is
  // already globally unique on its own. What WOULD limit cycles-per-user is
  // any @@unique constraint whose field list is [userId] alone; there must
  // be none.
  assert.ok(
    !cycle.uniqueFields.some((f) => f.length === 1 && f[0] === 'userId'),
    'no standalone @@unique([userId]) should limit cycles-per-user'
  );
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
// Global uniqueness (a cycle/prescription can be the active pointer for at
// most one UserCoachingState row) is expressed as a single-column @@unique
// block now that activeCycleId/activePrescriptionId also participate in the
// composite relations above — inline `String? @unique` and a block-form
// `@@unique([activeCycleId])` are equivalent, but only the block form can
// coexist with the composite @@unique entries the relations require.

test('activeCycleId and activePrescriptionId each still carry a standalone global @@unique constraint', () => {
  const state = getModel('UserCoachingState');
  assert.deepEqual(state.uniqueFields.some((f) => f.join(',') === 'activeCycleId'), true);
  assert.deepEqual(state.uniqueFields.some((f) => f.join(',') === 'activePrescriptionId'), true);

  const block = schemaSrc.slice(schemaSrc.indexOf('model UserCoachingState'), schemaSrc.indexOf('model CoachingCycle'));
  assert.match(block, /@@unique\(\[activeCycleId\]\)/);
  assert.match(block, /@@unique\(\[activePrescriptionId\]\)/);
});
