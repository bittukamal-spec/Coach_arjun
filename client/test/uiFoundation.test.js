// Source-text checks for Stage 3 (Minimal UI foundation). PlaybookPage.jsx and
// the ui primitives contain JSX and cannot be imported directly by node:test
// without a transform — matching the established pattern in this suite
// (pilotVisibilityCleanup.test.js, chatPageSource.test.js), these are
// source-text assertions.
//
// Reference surface: the VISIBLE Mental Playbook page at /playbook.
// (/progress was retired in PR #26 and now redirects to /playbook; the
// dormant ProgressPage.jsx must stay untouched by this stage.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const tailwindConfig = readFileSync(path.join(root, 'tailwind.config.js'), 'utf8');
const button = readFileSync(path.join(root, 'src/components/ui/Button.jsx'), 'utf8');
const card = readFileSync(path.join(root, 'src/components/ui/Card.jsx'), 'utf8');
const pageHeader = readFileSync(path.join(root, 'src/components/ui/PageHeader.jsx'), 'utf8');
const sectionLabel = readFileSync(path.join(root, 'src/components/ui/SectionLabel.jsx'), 'utf8');
const barrel = readFileSync(path.join(root, 'src/components/ui/index.js'), 'utf8');
const app = readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const playbook = readFileSync(path.join(root, 'src/pages/PlaybookPage.jsx'), 'utf8');
const progress = readFileSync(path.join(root, 'src/pages/ProgressPage.jsx'), 'utf8');

// ── 1. Tokens exist in the Tailwind config ──────────────────────────────────

test('tailwind config defines the Stage 3 type scale', () => {
  for (const token of ['display', 'title', 'heading', 'body', 'caption', 'micro']) {
    assert.match(tailwindConfig, new RegExp(`${token}:\\s*\\[`), `missing fontSize token: ${token}`);
  }
});

test('tailwind config defines semantic spacing tokens', () => {
  assert.match(tailwindConfig, /page:\s*'1rem'/);
  assert.match(tailwindConfig, /section:\s*'1\.75rem'/);
});

// ── 2. Primitives are minimal and flat by default ───────────────────────────

test('Card: flat variant is the default and has no gradient', () => {
  assert.match(card, /variant = 'flat'/);
  assert.match(card, /flat: 'bg-dark-800 border border-dark-600 rounded-2xl'/);
  assert.doesNotMatch(card, /flat:.*gradient/);
});

test('Card: hero variant reuses the existing signature gradient class', () => {
  assert.match(card, /hero: 'card-hero/);
});

test('Button: primary, outline and ghost variants only — no gradient variant', () => {
  assert.match(button, /primary:/);
  assert.match(button, /outline:/);
  assert.match(button, /ghost:/);
  assert.doesNotMatch(button, /gradient/i);
});

test('PageHeader: sticky header with back link or onBack button, uses type tokens', () => {
  assert.match(pageHeader, /sticky top-0/);
  assert.match(pageHeader, /text-heading/);
  assert.match(pageHeader, /ChevronLeft/);
  assert.match(pageHeader, /onBack/);
});

test('SectionLabel: uses the micro type token', () => {
  assert.match(sectionLabel, /text-micro/);
});

test('barrel exports exactly the four primitives', () => {
  for (const name of ['Button', 'Card', 'PageHeader', 'SectionLabel']) {
    assert.match(barrel, new RegExp(`export \\{ default as ${name} \\}`));
  }
  assert.equal((barrel.match(/export/g) || []).length, 4);
});

// ── 3. /progress stays retired and redirects to /playbook ──────────────────

test('App: /progress still redirects to /playbook', () => {
  assert.match(app, /path="\/progress" element=\{<Navigate to="\/playbook" replace \/>\}/);
});

// ── 4. The visible Playbook page consumes the foundation ────────────────────

test('PlaybookPage imports the ui primitives', () => {
  assert.match(playbook, /import \{ Card, PageHeader, SectionLabel \} from '\.\.\/components\/ui'/);
});

test('PlaybookPage uses PageHeader with the original navigate(-1) back behavior', () => {
  assert.match(playbook, /<PageHeader onBack=\{\(\) => navigate\(-1\)\}/);
});

test('PlaybookPage has exactly one gradient hero (the weekly-summary card)', () => {
  const heroCount = (playbook.match(/variant="hero"/g) || []).length;
  assert.equal(heroCount, 1);
  assert.match(playbook, /variant="hero"[^>]*>\s*<p[^>]*>\{hi \? 'इस हफ्ते' : 'This week'\}/);
});

test('PlaybookPage ordinary cards are flat Card primitives — no legacy card classes', () => {
  assert.doesNotMatch(playbook, /card-surface|card-elevated/);
});

test('PlaybookPage uses SectionLabel and semantic spacing, not legacy label/gutter classes', () => {
  assert.match(playbook, /<SectionLabel>/);
  assert.doesNotMatch(playbook, /SectionHeader/);
  assert.match(playbook, /px-page/);
});

test('PlaybookPage data behavior unchanged: read-only GET /api/playbook', () => {
  assert.match(playbook, /apiFetch\('\/api\/playbook'/);
  assert.equal((playbook.match(/apiFetch\(/g) || []).length, 1);
});

test('PlaybookPage links unchanged: focus-deck, self-talk, mental-rep, debrief', () => {
  assert.match(playbook, /navigate\('\/focus-deck'\)/);
  assert.match(playbook, /navigate\(data\?\.focusCards\?\.length \? '\/focus-deck' : '\/self-talk'\)/);
  assert.match(playbook, /navigate\('\/mental-rep'\)/);
  assert.match(playbook, /navigate\('\/debrief'\)/);
});

test('PlaybookPage content preserved: all sections present, "What I\'m learning" moved to the top (Stage 9)', () => {
  const idx = [
    playbook.indexOf('"What I\'m learning"'),
    playbook.indexOf("'This week'"),
    playbook.indexOf("'Focus Cards'"),
    playbook.indexOf("'Saved cues'"),
    playbook.indexOf("'Reflections'"),
  ];
  assert.ok(idx.every(i => i !== -1), 'a Playbook section heading is missing');
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), 'Playbook section order changed');
});

// ── 5. No hidden-ProgressPage visual work remains in this PR ────────────────

test('ProgressPage (dormant) is untouched: no ui-primitive imports or hero usage', () => {
  assert.doesNotMatch(progress, /components\/ui/);
  assert.doesNotMatch(progress, /variant="hero"/);
  assert.doesNotMatch(progress, /px-page|space-y-section|text-micro|text-display/);
});
