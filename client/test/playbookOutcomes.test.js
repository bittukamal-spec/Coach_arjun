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

// ── Outcome label mapping (pure logic, checked via source text) ───────────

test('PlaybookPage: all four outcome statuses have both English and Hindi labels, no score/percentage language', () => {
  for (const status of ['HELPED', 'HELPED_A_LITTLE', 'DID_NOT_HELP', 'NOT_TRIED']) {
    assert.match(src, new RegExp(`${status}:\\s*\\{\\s*en:`), `expected an English label for ${status}`);
  }
  const labelsIdx = src.indexOf('const OUTCOME_LABELS');
  const labelsBlock = src.slice(labelsIdx, src.indexOf('};', labelsIdx));
  assert.doesNotMatch(labelsBlock, /%|score|streak/i);
});

// ── Section renders: heading, empty state, and per-item fields ────────────

test('PlaybookPage: renders a "What I\'m learning" section with an EN/HI heading', () => {
  assert.match(src, /What I'm learning/);
});

test('PlaybookPage: shows an empty state when there are no recorded outcomes yet', () => {
  const idx = src.indexOf("What I'm learning");
  const block = src.slice(idx, idx + 1500);
  assert.match(block, /data\?\.practiceOutcomes\?\.length \?/);
  assert.match(block, /haven't recorded any lessons yet/i);
});

test('PlaybookPage: each outcome item renders the practice name, situation, translated outcome label, lesson, and a date', () => {
  const idx = src.indexOf('data.practiceOutcomes.map(');
  assert.ok(idx !== -1, 'expected practiceOutcomes to be mapped for rendering');
  const block = src.slice(idx, idx + 700);
  assert.match(block, /o\.practiceName/);
  assert.match(block, /o\.situation/);
  assert.match(block, /outcomeLabel\(o\.outcomeStatus, hi\)/);
  assert.match(block, /o\.lesson/);
  assert.match(block, /o\.outcomeRecordedAt/);
  assert.match(block, /key=\{o\.prescriptionId\}/, 'each item must be keyed by its real prescriptionId');
});

test('PlaybookPage: no chart, score, percentage, or streak language appears in the outcomes section', () => {
  const idx = src.indexOf("What I'm learning");
  const nextSectionIdx = src.length; // this is the last section in the file
  const block = src.slice(idx, nextSectionIdx);
  assert.doesNotMatch(block, /chart|percentage|%\s*success|streak/i);
});

// ── Existing Playbook content is preserved ─────────────────────────────────

test('PlaybookPage: existing sections (This week, Recent insight, Focus Cards, Saved cues, Reflections) are all still present', () => {
  assert.match(src, /This week/);
  assert.match(src, /insightText\(data\.insight, hi\)/);
  assert.match(src, /Focus Cards/);
  assert.match(src, /Saved cues/);
  assert.match(src, /Reflections/);
});

test('PlaybookPage: does not redesign the page — SectionHeader and card-surface conventions are reused for the new section', () => {
  const idx = src.indexOf("What I'm learning");
  const block = src.slice(idx, idx + 900);
  assert.match(block, /<SectionHeader>/);
  assert.match(block, /card-surface/);
});
