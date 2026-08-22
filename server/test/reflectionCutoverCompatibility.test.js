// PR 2 cutover — server-side compatibility contract.
//
// The athlete-facing reflection surface moved to the Mind Journal. Nothing
// behind it was migrated, rewritten, or deleted: the Debrief route, the
// Prisma model, historical rows and historical ToolReports all stay exactly
// where they were, readable.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const read = (rel) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

const { APPROVED_PRACTICES, isApprovedPracticeKey } = require('../src/services/coaching/practiceRegistry');
const { SKILL_REGISTRY, getSkill } = require('../src/config/skillRegistry');

// ── Reflection routing ─────────────────────────────────────────────────────

test('post_performance_reflection is still an approved Coach-prescribable practice', () => {
  assert.ok(isApprovedPracticeKey('post_performance_reflection'));
  assert.equal(APPROVED_PRACTICES.post_performance_reflection.label, 'Post-performance reflection');
});

test('the reflection practice surface points at the Mind Journal reflection flow', () => {
  assert.equal(APPROVED_PRACTICES.post_performance_reflection.surface, '/mind-journal/new');
});

test('skillRegistry.reflection routes to the Mind Journal reflection flow', () => {
  const reflection = SKILL_REGISTRY.reflection;
  assert.ok(reflection, 'the reflection skill must still exist');
  assert.equal(reflection.route, '/mind-journal/new');
  assert.equal(reflection.skillKey, 'reflection');
  assert.equal(getSkill('reflection').route, '/mind-journal/new');
  // No other skill quietly picked up the retired route.
  for (const [key, skill] of Object.entries(SKILL_REGISTRY)) {
    assert.notEqual(skill.route, '/debrief', `${key} must not route to the retired screen`);
  }
});

test('no server-side registry still routes an athlete to /debrief', () => {
  for (const file of [
    'src/config/skillRegistry.js',
    'src/services/planGenerator.js',
    'src/services/coaching/practiceRegistry.js',
  ]) {
    assert.doesNotMatch(read(file), /'\/debrief'/, `${file} must not route to the retired screen`);
  }
});

// ── Nothing was deleted ────────────────────────────────────────────────────

test('the Debrief server route stays mounted and intact — history remains readable', () => {
  const index = read('src/index.js');
  assert.match(index, /require\('\.\/routes\/debrief'\)/);
  assert.match(index, /app\.use\('\/api\/debrief',\s+debriefRoutes\)/);
  const route = read('src/routes/debrief.js');
  assert.match(route, /router\.get\(/, 'the read endpoint still exists');
});

test('the Prisma Debrief model is untouched — no field dropped, no destructive change', () => {
  const schema = read('prisma/schema.prisma');
  const start = schema.indexOf('model Debrief {');
  assert.ok(start !== -1, 'the Debrief model must still exist');
  const block = schema.slice(start, schema.indexOf('}', start));
  for (const field of [
    'wentWell', 'doDifferently', 'nextFocus', 'arjunInsight', 'mode', 'eventType',
    'resultType', 'wentWellChips', 'wentWellText', 'wouldChange', 'wouldChangeText',
    'cueWordFeedback', 'sport', 'xpAwarded', 'createdAt',
  ]) {
    assert.match(block, new RegExp(`\\b${field}\\b`), `Debrief.${field} must be preserved`);
  }
});

test('this PR ships no migration, backfill or cleanup touching reflection history', () => {
  const changed = [
    'src/services/mindJournal/loadReflectionContext.js',
    'src/routes/playbook.js',
    'src/routes/chat.js',
  ];
  for (const file of changed) {
    const src = read(file);
    assert.doesNotMatch(src, /debrief\.(delete|deleteMany|update|updateMany|create)/i,
      `${file} must never write to Debrief`);
    assert.doesNotMatch(src, /toolReport\.(delete|deleteMany|update|updateMany)/i,
      `${file} must never rewrite or remove a historical ToolReport`);
  }
});

// ── ToolReport: no duplicate reflection record ─────────────────────────────

test('a Mind Journal reflection creates no Debrief-style ToolReport', () => {
  const src = read('src/routes/mindJournal.js');
  assert.doesNotMatch(src, /toolReport/i,
    'the dedicated reflection context is canonical — a duplicate ToolReport must not be written');
});

test('the legacy debrief ToolReport rows are excluded from the prompt, not deleted', () => {
  const chat = read('src/routes/chat.js');
  assert.match(chat, /toolType: \{ not: 'debrief' \}/);
  assert.doesNotMatch(chat, /toolReport\.delete/);
});

test('the Debrief route still writes its own ToolReport for its own historical flow', () => {
  // Frozen, not rewritten: the retired route keeps behaving exactly as it
  // did for anything that still calls it directly.
  assert.match(read('src/routes/debrief.js'), /toolReport\.create/);
});
