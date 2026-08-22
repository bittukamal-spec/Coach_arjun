// Source-text checks for Stage 3 (Minimal UI foundation). The ui primitives
// contain JSX and cannot be imported directly by node:test without a
// transform — matching the established pattern in this suite
// (pilotVisibilityCleanup.test.js, chatPageSource.test.js), these are
// source-text assertions.
//
// The Mental Playbook page used to be this file's reference surface for
// "a real page consumes the foundation". It was retired as an athlete-facing
// destination, so those assertions went with it; MindJournalPage's use of the
// same PageHeader/Card/SectionLabel/px-page foundation is asserted in
// stage9MindJournal.test.js. Both retired routes (/playbook and the older
// /progress) now redirect to Home — asserted below.

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

test('barrel exports exactly the shared primitives', () => {
  // SaveStatus joined the barrel in Stage I: it moved out of components/
  // onboarding so Mind Journal could reuse it instead of hand-rolling a
  // second saving/saved/error treatment.
  const expected = ['Button', 'Card', 'PageHeader', 'SectionLabel', 'SaveStatus'];
  for (const name of expected) {
    assert.match(barrel, new RegExp(`export \\{ default as ${name} \\}`));
  }
  assert.equal((barrel.match(/export/g) || []).length, expected.length);
});

// ── 3. Retired library/progress routes redirect to Home ────────────────────

test('App: /playbook and /progress both redirect to /dashboard, replacing history', () => {
  assert.match(app, /path="\/playbook" element=\{<Navigate to="\/dashboard" replace \/>\}/);
  assert.match(app, /path="\/progress" element=\{<Navigate to="\/dashboard" replace \/>\}/);
});

test('App: no PlaybookPage component is mounted anywhere', () => {
  assert.doesNotMatch(app, /PlaybookPage/);
});

// ── 4. The shared gradient recipes stay global ─────────────────────────────

test('the shared gradient recipes still exist globally', () => {
  const css = readFileSync(path.join(root, 'src/index.css'), 'utf8');
  assert.match(css, /\.card-hero/);
  assert.match(css, /\.btn-gradient/);
});
