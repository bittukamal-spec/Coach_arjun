// Source-text checks for the "Latest Lesson" section on the Mental Playbook
// page (formerly "What I'm learning", formerly a list of prescription
// outcomes). Modernization pass 2 (approved-mockup fidelity) turned this
// into a single-item overview: only the most recent outcome's lesson is
// shown, as the strongest text on the page — practice name, situation and
// outcome-status ("It helped") are intentionally no longer displayed here.
// PlaybookPage.jsx contains JSX and cannot be imported directly by node:test
// without a transform, so — matching the established pattern elsewhere in
// this suite — these are source-text assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const src = readFileSync(path.join(root, 'src/pages/PlaybookPage.jsx'), 'utf8');
const translations = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

// ── Section renders: heading, empty state, and the single populated item ──

test('PlaybookPage: renders a "Latest Lesson" section with an EN/HI heading', () => {
  assert.match(src, /\{pb\.learningHeading\}/);
  assert.match(translations, /learningHeading:/);
});

test('PlaybookPage: reads only the single most recent outcome (data?.practiceOutcomes?.[0])', () => {
  assert.match(src, /const lesson = data\?\.practiceOutcomes\?\.\[0\] \|\| null;/);
});

test('PlaybookPage: shows a compact empty state when there is no recorded lesson yet', () => {
  const idx = src.indexOf('{pb.learningHeading}');
  const block = src.slice(idx, idx + 800);
  assert.match(block, /lesson\?\.lesson \?/);
  assert.match(block, /\{pb\.learningEmptyTitle\}/);
  assert.match(block, /\{pb\.learningEmpty\}/);
  assert.match(translations, /learningEmptyTitle:\s*'No lesson yet'/);
  assert.match(translations, /Practice a Mental Rep and tell Arjun how it went/);
});

test('PlaybookPage: the populated lesson renders the stored lesson text and date, as the dominant text', () => {
  const idx = src.indexOf('lesson?.lesson ?');
  assert.ok(idx !== -1, 'expected the lesson to be conditionally rendered');
  const block = src.slice(Math.max(0, idx - 400), idx + 200);
  assert.match(block, /lesson\.outcomeRecordedAt/, 'the date is still the stored one');
  assert.match(block, /lesson\.lesson/);
  assert.match(block, /text-lg font-bold/, 'the lesson is the strongest/most dominant text in the card');
  assert.match(block, /break-words/);
});

test('PlaybookPage: no chart, score, percentage, or streak language appears in the Latest Lesson section', () => {
  const idx = src.indexOf('{pb.learningHeading}');
  const block = src.slice(idx, src.indexOf('This week — one number'));
  assert.doesNotMatch(block, /chart|percentage|%\s*success|streak/i);
});

// ── Outcome-status / practice-name / situation metadata intentionally gone ─

test('practice name, situation, and outcome-status ("It helped") are no longer rendered on the overview', () => {
  assert.doesNotMatch(src, /o\.practiceName|o\.situation|OUTCOME_KEYS|outcomeLabel/);
  // The underlying fields are still part of the fetched payload shape —
  // this pass only stops rendering them, it does not touch the API.
  assert.match(src, /apiFetch\('\/api\/playbook'/);
});

// ── Existing Playbook content is preserved ─────────────────────────────────

test('PlaybookPage: existing sections (This week, Focus Cards, Saved cues, Reflections) are all still present', () => {
  assert.match(src, /\{pb\.thisWeek\}/);
  assert.match(src, /\{pb\.focusCardsHeading\}/);
  assert.match(src, /\{pb\.cuesHeading\}/);
  assert.match(src, /\{pb\.reflectionsHeading\}/);
});

test('PlaybookPage: the "Recent insight" sparkle card was intentionally removed (not part of the approved mockup)', () => {
  assert.doesNotMatch(src, /insightText|Sparkles|data\.insight/);
});

test('PlaybookPage: Latest Lesson sits inside a single card under its icon SectionHeading — no nested box', () => {
  const idx = src.indexOf('Latest Lesson');
  const block = src.slice(idx, idx + 2000);
  assert.match(block, /<SectionHeading/);
  assert.match(block, /<Card/);
});
