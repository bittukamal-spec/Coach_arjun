// Ritual rebuild PR 1 — source-level checks on the routine schema and its
// migration artifact (same approach as mindJournalSchema.test.js): the
// relations that full-account deletion and legacy-import idempotency depend
// on, and proof that the schema change is additive only.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');

const schema = readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');

function modelBlock(name) {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `model ${name} not found`);
  return match[0];
}

test('Routine and RitualLegacyImport cascade with the User (full account deletion leaves nothing)', () => {
  assert.match(modelBlock('Routine'), /user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(modelBlock('RitualLegacyImport'), /user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
  const user = modelBlock('User');
  assert.match(user, /routines\s+Routine\[\]/);
  assert.match(user, /ritualLegacyImport\s+RitualLegacyImport\?/);
});

test('legacy import is unique per athlete in the database, and deleting a routine only drops references to it', () => {
  const link = modelBlock('RitualLegacyImport');
  assert.match(link, /userId\s+String\s+@unique/);
  assert.match(link, /routineId\s+String\?\s+@unique/);
  assert.match(link, /onDelete: SetNull/);
  assert.match(modelBlock('Routine'), /sourceRoutine\s+Routine\?\s+@relation\("RoutineAdaptation", fields: \[sourceRoutineId\], references: \[id\], onDelete: SetNull\)/);
});

test('legacy ritual fields are kept unchanged', () => {
  const user = modelBlock('User');
  assert.match(user, /ritualName\s+String\?/);
  assert.match(user, /ritualSteps\s+String\s+@default\("\[\]"\)/);
});

test('the routines migration only creates new objects', () => {
  const dir = path.join(__dirname, '../prisma/migrations');
  const name = readdirSync(dir).find(d => d.endsWith('_add_routines'));
  assert.ok(name, 'routines migration missing');
  const sql = readFileSync(path.join(dir, name, 'migration.sql'), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  // Foreign-key action clauses on the NEW tables are not data changes.
  const statements = sql.replace(/ON (DELETE|UPDATE) (CASCADE|SET NULL|RESTRICT|NO ACTION)/g, '');
  assert.doesNotMatch(statements, /\bDROP\b|\bRENAME\b|\bDELETE\b|\bUPDATE\s+"|\bTRUNCATE\b/i);
  const altered = [...sql.matchAll(/ALTER TABLE "(\w+)"/g)].map(m => m[1]);
  assert.ok(altered.every(t => t === 'Routine' || t === 'RitualLegacyImport'), `alters existing table: ${altered}`);
  assert.deepEqual([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map(m => m[1]).sort(), ['RitualLegacyImport', 'Routine']);
});
