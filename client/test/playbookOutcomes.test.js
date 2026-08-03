// Source-text checks for PR-13's "What I'm learning" section on the Mental
// Playbook page. PlaybookPage.jsx contains JSX and cannot be imported
// directly by node:test without a transform, so — matching the established
// pattern elsewhere in this suite — these are source-text assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const src = readFileSync(path.join(root, 'src/pages/PlaybookPage.jsx'), 'utf8');
const translations = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

// ── Outcome label mapping (pure logic, checked via source text) ───────────

test('PlaybookPage: all four outcome statuses have both English and Hindi labels, no score/percentage language', () => {
  // Stage I: the labels moved into the `playbook` translation namespace and
  // the page maps a stored status to a key. Both halves are still asserted —
  // the mapping here, the EN/HI copy in translations.
  const keyFor = { HELPED: 'outcomeHelped', HELPED_A_LITTLE: 'outcomeHelpedALittle', DID_NOT_HELP: 'outcomeDidNotHelp', NOT_TRIED: 'outcomeNotTried' };
  for (const [status, key] of Object.entries(keyFor)) {
    assert.match(src, new RegExp(`${status}:\\s*'${key}'`), `expected a label key for ${status}`);
    assert.match(translations, new RegExp(`${key}:`), `expected translated copy for ${status}`);
  }
  const labelsIdx = src.indexOf('const OUTCOME_KEYS');
  const labelsBlock = src.slice(labelsIdx, src.indexOf('};', labelsIdx));
  assert.doesNotMatch(labelsBlock, /%|score|streak/i);
});

// ── Section renders: heading, empty state, and per-item fields ────────────

test('PlaybookPage: renders a "What I\'m learning" section with an EN/HI heading', () => {
  assert.match(src, /\{pb\.learningHeading\}/);
  assert.match(translations, /learningHeading:/);
});

test('PlaybookPage: shows an empty state when there are no recorded outcomes yet', () => {
  const idx = src.indexOf('{pb.learningHeading}');
  const block = src.slice(idx, idx + 2600);
  assert.match(block, /data\?\.practiceOutcomes\?\.length \?/);
  assert.match(block, /\{pb\.learningEmpty\}/);
  assert.match(translations, /haven't recorded any lessons yet/i);
});

test('PlaybookPage: each outcome item renders the practice name, situation, translated outcome label, lesson, and a date', () => {
  const idx = src.indexOf('data.practiceOutcomes.map(');
  assert.ok(idx !== -1, 'expected practiceOutcomes to be mapped for rendering');
  // Stage F wrapped the date in the approved date-pill and the outcome in
  // the status-label recipe, which lengthens the block — every field below
  // must still be rendered from the same stored values.
  const block = src.slice(idx, idx + 1200);
  assert.match(block, /o\.practiceName/);
  assert.match(block, /o\.situation/);
  assert.match(block, /outcomeLabel\(o\.outcomeStatus, pb\)/);
  assert.match(block, /o\.lesson/);
  assert.match(block, /o\.outcomeRecordedAt/);
  assert.match(block, /key=\{o\.prescriptionId\}/, 'each item must be keyed by its real prescriptionId');
});

test('PlaybookPage: no chart, score, percentage, or streak language appears in the outcomes section', () => {
  const idx = src.indexOf('{pb.learningHeading}');
  const nextSectionIdx = src.length; // this is the last section in the file
  const block = src.slice(idx, nextSectionIdx);
  assert.doesNotMatch(block, /chart|percentage|%\s*success|streak/i);
});

// ── Existing Playbook content is preserved ─────────────────────────────────

test('PlaybookPage: existing sections (This week, Recent insight, Focus Cards, Saved cues, Reflections) are all still present', () => {
  assert.match(src, /\{pb\.thisWeek\}/);
  assert.match(src, /insightText\(data\.insight, hi\)/);
  assert.match(src, /\{pb\.focusCardsHeading\}/);
  assert.match(src, /\{pb\.cuesHeading\}/);
  assert.match(src, /\{pb\.reflectionsHeading\}/);
});

test('PlaybookPage: the section keeps the shared flat-card convention under its icon section heading', () => {
  // Refinement PR: sections now carry an icon SectionHeading and wrap their
  // content (entries AND empty state) in flat Card containers.
  const idx = src.indexOf("What I'm learning");
  const block = src.slice(idx, idx + 2600);
  assert.match(block, /SectionHeading/);
  assert.match(block, /<Card /);
});
