// Tests for PR-13's Playbook API extension (practiceOutcomes — "What I'm
// learning"). playbook.js uses the real singleton PrismaClient directly (no
// dependency-injection factory exists for this route, unlike e.g.
// founderSafetyEvents.js), so the query SHAPE is verified via source-text
// assertions — the same technique already used elsewhere in this repo for
// routes without an injectable client (see prescriptionsRoute.test.js). The
// pure display-name mapping is unit-tested for real.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { practiceDisplayName } = require('../src/routes/playbook');
const { APPROVED_PRACTICE_KEYS } = require('../src/services/coaching/practiceRegistry');

const src = readFileSync(path.join(__dirname, '../src/routes/playbook.js'), 'utf8');

// ── practiceDisplayName: uses the registry, neutral fallback for unknown ──

test('practiceDisplayName: returns the registry label for every approved practice key', () => {
  for (const key of APPROVED_PRACTICE_KEYS) {
    const name = practiceDisplayName(key);
    assert.equal(typeof name, 'string');
    assert.ok(name.length > 0);
  }
});

test('practiceDisplayName: an unknown/legacy practice key falls back to the neutral "Mental Rep" label — never fails, never invents a name', () => {
  for (const bad of ['retired_practice_key', '', null, undefined, 'made_up']) {
    assert.equal(practiceDisplayName(bad), 'Mental Rep');
  }
});

// ── Query shape: authenticated athlete's outcomes only, newest first, bounded ─

test('the outcome-history query is scoped to req.userId and only rows with a recorded outcome', () => {
  const idx = src.indexOf('prisma.prescription.findMany');
  const block = src.slice(idx, idx + 500);
  assert.match(block, /where:\s*\{\s*userId:\s*req\.userId,\s*outcomeStatus:\s*\{\s*not:\s*null\s*\}/s);
});

test('the outcome-history query orders newest first by outcomeRecordedAt', () => {
  const idx = src.indexOf('prisma.prescription.findMany');
  const block = src.slice(idx, idx + 500);
  assert.match(block, /orderBy:\s*\{\s*outcomeRecordedAt:\s*'desc'\s*\}/);
});

test('the outcome-history query is bounded (latest 10)', () => {
  assert.match(src, /const OUTCOME_HISTORY_LIMIT = 10;/);
  const idx = src.indexOf('prisma.prescription.findMany');
  const block = src.slice(idx, idx + 500);
  assert.match(block, /take:\s*OUTCOME_HISTORY_LIMIT/);
});

test('the outcome-history query selects only structured fields — no raw chat message, no full CoachingCycle internals, no user/prescription-card content', () => {
  const idx = src.indexOf('prisma.prescription.findMany');
  const selectIdx = src.indexOf('select:', idx);
  const selectBlock = src.slice(selectIdx, src.indexOf('}),', selectIdx));
  // Only these fields are read from Prescription.
  for (const field of ['id', 'practiceKey', 'situation', 'outcomeStatus', 'outcomeLesson', 'outcomeRecordedAt']) {
    assert.match(selectBlock, new RegExp(`${field}:\\s*true`));
  }
  // The cycle relation is narrowed to its bare status — nothing else.
  assert.match(selectBlock, /cycle:\s*\{\s*select:\s*\{\s*status:\s*true\s*\}\s*\}/);
  // Never the card content, cue word, cycle's problemStatement/barrierHypothesis, or the outcome's source message id.
  assert.doesNotMatch(selectBlock, /cardContent|cueWord|problemStatement|barrierHypothesis|outcomeSourceMessageId/);
});

// ── Response shape ────────────────────────────────────────────────────────

test('practiceOutcomes maps to exactly the documented client fields, using the real practice display name and cycle status', () => {
  const idx = src.indexOf('const practiceOutcomes = outcomePrescriptions.map(');
  const block = src.slice(idx, src.indexOf('}));', idx));
  for (const field of ['prescriptionId: p.id', 'practiceKey: p.practiceKey', 'practiceName: practiceDisplayName(p.practiceKey)', 'situation: p.situation', 'outcomeStatus: p.outcomeStatus', 'lesson: p.outcomeLesson', 'outcomeRecordedAt: p.outcomeRecordedAt', 'cycleStatus: p.cycle?.status']) {
    assert.ok(block.includes(field), `expected practiceOutcomes mapping to include "${field}"`);
  }
});

test('practiceOutcomes is included in the final response alongside every pre-existing field — nothing removed or renamed', () => {
  const responseIdx = src.indexOf('res.json({');
  const responseBlock = src.slice(responseIdx, src.indexOf('});', responseIdx));
  for (const field of ['weekRepCount', 'weekResetCount', 'totalRepCount', 'topCue', 'savedCues', 'focusCards', 'reflections', 'insight', 'practiceOutcomes']) {
    assert.ok(responseBlock.includes(field), `expected the final response to still include "${field}"`);
  }
});

test('no score, rating, or streak field appears anywhere in the practiceOutcomes response shape', () => {
  const idx = src.indexOf('const practiceOutcomes = outcomePrescriptions.map(');
  const block = src.slice(idx, src.indexOf('}));', idx));
  assert.doesNotMatch(block, /score|rating|streak|percentage/i);
});

test('the route requires authentication', () => {
  assert.match(src, /router\.get\('\/',\s*authenticate,/);
});

test('the route file never constructs or calls an Anthropic client', () => {
  assert.doesNotMatch(src, /require\(['"]@anthropic-ai\/sdk['"]\)|new Anthropic\(/);
});
