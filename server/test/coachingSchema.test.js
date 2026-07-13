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

// ── 1. All four models exist ─────────────────────────────────────────────────

test('UserCoachingState, CoachingCycle, Prescription, and ActiveCoachingSelection models all exist', () => {
  const names = models.map((m) => m.name);
  assert.ok(names.includes('UserCoachingState'));
  assert.ok(names.includes('CoachingCycle'));
  assert.ok(names.includes('Prescription'));
  assert.ok(names.includes('ActiveCoachingSelection'));
});

// ── 2. UserCoachingState uniqueness ──────────────────────────────────────────

test('UserCoachingState.userId is unique — exactly one row per user', () => {
  const field = getField(getModel('UserCoachingState'), 'userId');
  assert.equal(field.isUnique, true);
  assert.equal(field.isRequired, true);
});

// ── 3. UserCoachingState → ActiveCoachingSelection is the only active pointer ─
// The old design put activeCycleId/activePrescriptionId directly on
// UserCoachingState as two independent nullable composite FKs. That's gone:
// the active pointer now lives entirely on ActiveCoachingSelection, reached
// through one optional 1:1 relation.

test('UserCoachingState relates to User, and to its active selection via one optional 1:1 relation', () => {
  const state = getModel('UserCoachingState');
  const user = getField(state, 'user');
  assert.equal(user.kind, 'object');
  assert.equal(user.type, 'User');

  const activeSelection = getField(state, 'activeSelection');
  assert.equal(activeSelection.kind, 'object');
  assert.equal(activeSelection.type, 'ActiveCoachingSelection');
  assert.equal(activeSelection.isRequired, false, 'absent entirely when there is no active cycle');
  assert.equal(activeSelection.isList, false);
});

test('UserCoachingState no longer carries activeCycleId/activePrescriptionId directly (superseded by ActiveCoachingSelection)', () => {
  const state = getModel('UserCoachingState');
  const fieldNames = state.fields.map((f) => f.name);
  assert.ok(!fieldNames.includes('activeCycleId'));
  assert.ok(!fieldNames.includes('activeCycle'));
  assert.ok(!fieldNames.includes('activePrescriptionId'));
  assert.ok(!fieldNames.includes('activePrescription'));
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

// ── ActiveCoachingSelection: the safe active-pointer design ──────────────────
// Fixes a real gap in the previous design: a composite FK on
// (activePrescriptionId, activeCycleId, userId) uses PostgreSQL's default
// MATCH SIMPLE semantics, which skips the ownership check entirely as soon
// as ANY referencing column is null — so a row with a non-null
// activePrescriptionId but a null activeCycleId would never even be
// checked against Prescription. Moving the active pointer to its own row,
// with cycleId/userId REQUIRED there, removes the bypass: a selection row
// simply cannot exist without a cycle, so "prescription active, no active
// cycle" has nowhere to be represented, let alone slip past a null-skipped
// check.

test('ActiveCoachingSelection exists with required user/state/cycle fields and a nullable prescriptionId', () => {
  const selection = getModel('ActiveCoachingSelection');

  const state = getField(selection, 'userCoachingState');
  assert.equal(state.kind, 'object');
  assert.equal(state.type, 'UserCoachingState');
  assert.equal(state.isRequired, true);
  assert.equal(getField(selection, 'userCoachingStateId').isRequired, true);

  const user = getField(selection, 'user');
  assert.equal(user.kind, 'object');
  assert.equal(user.type, 'User');
  assert.equal(user.isRequired, true);
  assert.equal(getField(selection, 'userId').isRequired, true);

  const cycle = getField(selection, 'cycle');
  assert.equal(cycle.kind, 'object');
  assert.equal(cycle.type, 'CoachingCycle');
  assert.equal(cycle.isRequired, true, 'a selection row cannot exist without a cycle');
  assert.equal(getField(selection, 'cycleId').isRequired, true);

  const prescriptionIdField = getField(selection, 'prescriptionId');
  assert.equal(prescriptionIdField.isRequired, false, 'prescriptionId alone is nullable — no prescription yet is valid');
});

test('ActiveCoachingSelection.cycle is a composite FK on (cycleId, userId) — the selected cycle must belong to this user', () => {
  const cycle = getField(getModel('ActiveCoachingSelection'), 'cycle');
  assert.deepEqual(cycle.relationFromFields, ['cycleId', 'userId']);
  assert.deepEqual(cycle.relationToFields, ['id', 'userId']);
});

test('ActiveCoachingSelection.prescription is a composite FK on (prescriptionId, cycleId, userId) — the selected prescription must belong to both this user and the selected cycle', () => {
  const prescription = getField(getModel('ActiveCoachingSelection'), 'prescription');
  assert.deepEqual(prescription.relationFromFields, ['prescriptionId', 'cycleId', 'userId']);
  assert.deepEqual(prescription.relationToFields, ['id', 'cycleId', 'userId']);
});

test('there is no nullable composite relation where a prescription pointer can be non-null while its cycle component is null', () => {
  // The bug this amendment fixes: cycleId/userId must be REQUIRED wherever
  // a nullable prescription-pointer composite FK exists, so MATCH SIMPLE's
  // null-column skip can only ever land on the prescription pointer itself.
  const selection = getModel('ActiveCoachingSelection');
  const prescriptionField = getField(selection, 'prescription');
  assert.equal(prescriptionField.isRequired, false, 'the prescription pointer itself is the only optional part');

  const [, cycleIdInFk, userIdInFk] = prescriptionField.relationFromFields;
  assert.equal(cycleIdInFk, 'cycleId');
  assert.equal(userIdInFk, 'userId');
  assert.equal(getField(selection, 'cycleId').isRequired, true, 'cycleId component must be required, never nullable');
  assert.equal(getField(selection, 'userId').isRequired, true, 'userId component must be required, never nullable');

  // The old unsafe shape (a nullable cycle pointer coexisting with a
  // nullable prescription pointer in the same composite FK) no longer
  // exists anywhere in the schema.
  assert.ok(!models.some((m) => m.fields.some((f) => f.name === 'activeCycleId')));
  assert.ok(!models.some((m) => m.fields.some((f) => f.name === 'activePrescriptionId')));
});

test('one selection per state, per cycle, and per prescription is enforced', () => {
  const selection = getModel('ActiveCoachingSelection');
  assert.equal(getField(selection, 'userCoachingStateId').isUnique, true);
  assert.equal(getField(selection, 'cycleId').isUnique, true);
  assert.equal(getField(selection, 'prescriptionId').isUnique, true);
});

test('mismatched user/cycle relationships are structurally impossible: every composite FK target is backed by a matching composite unique constraint', () => {
  // A composite FK can only be declared against a genuinely unique
  // combination on the referenced side — these are exactly the
  // (id, ...ownership-fields) uniques each composite relation above targets.
  assert.deepEqual(
    getModel('CoachingCycle').uniqueFields.some((f) => f.join(',') === 'id,userId'),
    true,
    'CoachingCycle must expose a (id, userId) composite unique for Prescription.cycle / ActiveCoachingSelection.cycle to target'
  );
  assert.deepEqual(
    getModel('Prescription').uniqueFields.some((f) => f.join(',') === 'id,cycleId,userId'),
    true,
    'Prescription must expose a (id, cycleId, userId) composite unique for ActiveCoachingSelection.prescription to target'
  );
});

test('delete behavior on every composite relation is Restrict or Cascade, never SetNull (userId can never be nulled)', () => {
  const cycle = getField(getModel('Prescription'), 'cycle');
  assert.equal(cycle.relationOnDelete, 'Cascade'); // unchanged parent-owns-child behavior, not SetNull

  const selectionCycle = getField(getModel('ActiveCoachingSelection'), 'cycle');
  assert.equal(selectionCycle.relationOnDelete, 'Restrict');

  const selectionPrescription = getField(getModel('ActiveCoachingSelection'), 'prescription');
  assert.equal(selectionPrescription.relationOnDelete, 'Restrict');

  const selectionState = getField(getModel('ActiveCoachingSelection'), 'userCoachingState');
  assert.equal(selectionState.relationOnDelete, 'Cascade'); // child row cleans up with its parent state
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
  // Prescription.cycle / ActiveCoachingSelection.cycle (§ composite
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

test('no expiry or automatic-abandonment field was added to any of the four models', () => {
  for (const name of ['UserCoachingState', 'CoachingCycle', 'Prescription', 'ActiveCoachingSelection']) {
    const fieldNames = getModel(name).fields.map((f) => f.name.toLowerCase());
    for (const forbidden of ['expiresat', 'expiry', 'autoabandon', 'timeoutat']) {
      assert.ok(!fieldNames.includes(forbidden), `${name} must not have a(n) ${forbidden} field`);
    }
  }
});

test('no XP, streak, score, or reward field was added to any of the four models', () => {
  for (const name of ['UserCoachingState', 'CoachingCycle', 'Prescription', 'ActiveCoachingSelection']) {
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
// Global uniqueness (a cycle/prescription can be the active-selection target
// for at most one ActiveCoachingSelection row) is expressed as single-column
// @@unique blocks alongside the composite @@unique entries the relations
// require — inline `String? @unique` and a block-form `@@unique([cycleId])`
// are equivalent, but only the block form can coexist with the composite
// @@unique entries.

test('ActiveCoachingSelection.cycleId and .prescriptionId each still carry a standalone global @@unique constraint', () => {
  const selection = getModel('ActiveCoachingSelection');
  assert.deepEqual(selection.uniqueFields.some((f) => f.join(',') === 'cycleId'), true);
  assert.deepEqual(selection.uniqueFields.some((f) => f.join(',') === 'prescriptionId'), true);

  const block = schemaSrc.slice(
    schemaSrc.indexOf('model ActiveCoachingSelection'),
    schemaSrc.indexOf('model CoachingCycle')
  );
  assert.match(block, /@@unique\(\[cycleId\]\)/);
  assert.match(block, /@@unique\(\[prescriptionId\]\)/);
});
