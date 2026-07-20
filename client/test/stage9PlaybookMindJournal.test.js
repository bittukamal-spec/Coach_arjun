// Source-text checks for Stage 9 (Playbook and Mind Journal consistency).
// PlaybookPage.jsx and MindJournalPage.jsx contain JSX and cannot be
// imported directly by node:test without a transform — matching the
// established pattern elsewhere in this suite, these are source-text
// assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const playbook = readFileSync(path.join(root, 'src/pages/PlaybookPage.jsx'), 'utf8');
const mindJournal = readFileSync(path.join(root, 'src/pages/MindJournalPage.jsx'), 'utf8');

// ── "What I'm learning" is first ────────────────────────────────────────────

test('PlaybookPage: "What I\'m learning" is the first section, before the weekly-summary hero', () => {
  const learningIdx = playbook.indexOf('"What I\'m learning"');
  const heroIdx = playbook.indexOf('variant="hero"');
  assert.ok(learningIdx !== -1 && heroIdx !== -1);
  assert.ok(learningIdx < heroIdx, '"What I\'m learning" must render before the weekly-summary hero card');
});

// ── Quiet Mind Journal entry point inside Playbook ──────────────────────────

test('PlaybookPage: has a Mind Journal entry point that navigates to /mind-journal', () => {
  assert.match(playbook, /onClick=\{\(\) => navigate\('\/mind-journal'\)\}/);
});

test('PlaybookPage: the Mind Journal entry point is a quiet text link, not a Card or the hero — does not compete with primary content', () => {
  const idx = playbook.indexOf("navigate('/mind-journal')");
  const block = playbook.slice(Math.max(0, idx - 200), idx + 300);
  assert.doesNotMatch(block, /<Card/, 'the Mind Journal entry point must not be wrapped in a Card primitive');
  assert.doesNotMatch(block, /variant="hero"/, 'the Mind Journal entry point must not use the hero gradient');
  assert.match(block, /text-caption text-slt/, 'the entry point must use quiet, secondary-weight text styling');
});

// ── No scores, diagnosis, profiling, or auto-prescription copy ─────────────

test('PlaybookPage and MindJournalPage: no score, diagnosis, profiling, or auto-prescription language', () => {
  for (const [name, src] of [['PlaybookPage', playbook], ['MindJournalPage', mindJournal]]) {
    const codeOnly = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(codeOnly, /diagnos|profil|auto-prescri|automatic prescri/i, `${name} must not introduce diagnosis/profiling/auto-prescription copy`);
  }
});

// ── Alignment with the Stage 3 foundation (headers, empty states, tokens) ──

test('MindJournalPage: uses the shared PageHeader primitive instead of a hand-rolled header', () => {
  assert.match(mindJournal, /import \{ Card, PageHeader, SectionLabel \} from '\.\.\/components\/ui'/);
  assert.match(mindJournal, /<PageHeader onBack=\{\(\) => navigate\(-1\)\} title=\{mj\.title\} \/>/);
});

test('MindJournalPage: uses the shared Card primitive and SectionLabel, not legacy card-surface/hand-rolled label classes', () => {
  assert.doesNotMatch(mindJournal, /card-surface/);
  assert.match(mindJournal, /<SectionLabel>\{mj\.recentHeading\}<\/SectionLabel>/);
});

test('MindJournalPage: uses semantic spacing/type tokens (px-page, text-body/caption/micro), not raw px-4/text-sm/text-xs utilities', () => {
  assert.match(mindJournal, /px-page/);
  assert.doesNotMatch(mindJournal, /px-4\b/);
  assert.doesNotMatch(mindJournal, /text-sm\b|text-xs\b/);
});

// ── Preserve Mind Journal privacy / opt-in and non-translation of athlete text ──

test('MindJournalPage: privacy opt-in still defaults to false and is only changed by explicit user action', () => {
  assert.match(mindJournal, /const \[contextEnabled, setContextEnabled\] = useState\(false\);/);
  assert.match(mindJournal, /onChange=\{handleContextToggle\}/);
});

test('MindJournalPage: athlete-authored note/entry text is rendered verbatim, never passed through translation', () => {
  assert.match(mindJournal, /\{entry\.note && <p[^>]*>\{entry\.note\}<\/p>\}/);
});
