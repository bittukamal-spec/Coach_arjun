// Source-text checks for Stage 3 (Minimal UI foundation). ProgressPage.jsx and
// the ui primitives contain JSX and cannot be imported directly by node:test
// without a transform — matching the established pattern in this suite
// (pilotVisibilityCleanup.test.js, chatPageSource.test.js), these are
// source-text assertions.

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

test('PageHeader: sticky header with optional back link, uses type tokens', () => {
  assert.match(pageHeader, /sticky top-0/);
  assert.match(pageHeader, /text-heading/);
  assert.match(pageHeader, /ChevronLeft/);
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

// ── 3. ProgressPage consumes the foundation ─────────────────────────────────

test('ProgressPage imports the ui primitives', () => {
  assert.match(progress, /import \{ Button, Card, PageHeader, SectionLabel \} from '\.\.\/components\/ui'/);
});

test('ProgressPage uses PageHeader instead of a hand-rolled header', () => {
  assert.match(progress, /<PageHeader backTo="\/dashboard" title=\{t\.title\}/);
  assert.doesNotMatch(progress, /<header/);
});

test('ProgressPage has exactly one gradient hero (the fitness score card)', () => {
  const heroCount = (progress.match(/variant="hero"/g) || []).length;
  assert.equal(heroCount, 1);
});

test('ProgressPage ordinary cards are flat Card primitives, not raw card divs', () => {
  assert.doesNotMatch(progress, /bg-dark-800 border border-dark-600 rounded-2xl/);
});

test('ProgressPage uses semantic spacing tokens', () => {
  assert.match(progress, /px-page/);
  assert.match(progress, /space-y-section/);
  assert.doesNotMatch(progress, /space-y-7/);
});

test('ProgressPage no longer defines its own SectionLabel', () => {
  assert.doesNotMatch(progress, /function SectionLabel/);
});
