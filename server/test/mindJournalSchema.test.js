// Structural schema checks for the score-free Mind Journal rollout. Uses the
// generated Prisma DMMF for real structural assertions — same technique as
// coachingSchema.test.js. No database connection is made or required
// (`prisma generate` — already run — is enough to produce the DMMF).

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

test('MindJournalEntry model exists with id, userId, user relation, states, note, createdAt', () => {
  const entry = getModel('MindJournalEntry');

  getField(entry, 'id');
  const userId = getField(entry, 'userId');
  assert.equal(userId.isRequired, true);

  const user = getField(entry, 'user');
  assert.equal(user.kind, 'object');
  assert.equal(user.type, 'User');
  assert.equal(user.relationOnDelete, 'Cascade');

  const states = getField(entry, 'states');
  assert.equal(states.type, 'String');
  assert.equal(states.isList, true, 'states must be a String array');

  const note = getField(entry, 'note');
  assert.equal(note.type, 'String');
  assert.equal(note.isRequired, false, 'note must be nullable');

  getField(entry, 'createdAt');
});

test('MindJournalEntry has no unique constraint of any kind (additive, no back-compat break)', () => {
  const entry = getModel('MindJournalEntry');
  assert.equal(entry.uniqueFields.length, 0);
  for (const field of entry.fields) {
    assert.equal(field.isUnique, false, `${field.name} must not be unique`);
  }
});

test('MindJournalEntry has no score/rating/streak/XP/reward/aggregate/interpretation/summary field', () => {
  const entry = getModel('MindJournalEntry');
  const fieldNames = entry.fields.map((f) => f.name.toLowerCase());
  const forbidden = [
    'score', 'rating', 'percentage', 'level', 'xp', 'streak', 'reward',
    'aggregate', 'interpretation', 'summary', 'mood', 'sentiment', 'insight',
  ];
  for (const word of forbidden) {
    assert.ok(!fieldNames.some((n) => n.includes(word)), `MindJournalEntry must not have a(n) ${word} field (found among: ${fieldNames.join(', ')})`);
  }
});

test('MindJournalEntry is indexed on (userId, createdAt) for the bounded recent-history query', () => {
  const entry = getModel('MindJournalEntry');
  // Prisma DMMF doesn't expose plain @@index directly; fall back to source text.
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const schemaSrc = readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
  const block = schemaSrc.slice(schemaSrc.indexOf('model MindJournalEntry'), schemaSrc.indexOf('model ToolReport'));
  assert.match(block, /@@index\(\[userId,\s*createdAt\]\)/);
  assert.ok(entry); // keep the DMMF lookup meaningfully used above
});

test('User.mindJournalEntries is a list relation, and User.mindJournalContextEnabled is a required Boolean defaulting to false', () => {
  const user = getModel('User');

  const relation = getField(user, 'mindJournalEntries');
  assert.equal(relation.kind, 'object');
  assert.equal(relation.type, 'MindJournalEntry');
  assert.equal(relation.isList, true);

  const contextEnabled = getField(user, 'mindJournalContextEnabled');
  assert.equal(contextEnabled.type, 'Boolean');
  assert.equal(contextEnabled.isRequired, true);
  assert.equal(contextEnabled.hasDefaultValue, true);
  assert.equal(contextEnabled.default, false);
});

// ── Compatibility guarantee: the legacy scored model is completely
// unchanged by this PR ──────────────────────────────────────────────────────

test('MentalFitnessEntry model is unchanged and still present (legacy scored data untouched)', () => {
  const legacy = getModel('MentalFitnessEntry');
  const fieldNames = legacy.fields.map((f) => f.name).sort();
  assert.deepEqual(fieldNames, [
    'arjunResponse', 'bounce', 'calm', 'confidence', 'createdAt', 'date',
    'drive', 'focus', 'id', 'mood', 'selftalk', 'user', 'userId',
  ]);
  assert.deepEqual(legacy.uniqueFields.some((f) => f.join(',') === 'userId,date'), true);
});

test('generic CheckIn model is untouched by this PR', () => {
  const checkIn = getModel('CheckIn');
  const fieldNames = checkIn.fields.map((f) => f.name).sort();
  assert.deepEqual(fieldNames, [
    'confidence', 'createdAt', 'energy', 'focus', 'gratitude', 'id', 'mood',
    'reflection', 'sleep', 'type', 'user', 'userId',
  ]);
});
