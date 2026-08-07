// Source-text checks for the app-wide CTA alignment pass. These protect the
// alignment *intent* the founder approved — primary/secondary CTA labels and
// whole-card actions render centered, while headings, form choices, and
// settings/nav rows keep reading left-to-right — without coupling to full
// Tailwind class strings (matching the established pattern in
// pilotVisibilityCleanup.test.js and mindJournalLinks.test.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const button = read('src/components/ui/Button.jsx');
const indexCss = read('src/index.css');
const practiceTile = read('src/components/train/PracticeTile.jsx');
const trainPage = read('src/pages/TrainPage.jsx');
const mentalRep = read('src/pages/MentalRepPage.jsx');
const accountPage = read('src/pages/AccountPage.jsx');

// ── 1. Shared button primitives stay centered ───────────────────────────────

test('shared <Button> centers its label/icon group by default', () => {
  // The base recipe (shared by every variant), not a per-variant override.
  assert.match(button, /inline-flex items-center justify-center/);
});

test('shared .btn-primary / .btn-secondary / .btn-ghost / .btn-gradient classes center their content', () => {
  const classBlocks = ['.btn-primary', '.btn-secondary', '.btn-ghost', '.btn-gradient'];
  for (const name of classBlocks) {
    const idx = indexCss.indexOf(`${name} {`);
    assert.notEqual(idx, -1, `${name} should still be defined in index.css`);
    const decl = indexCss.slice(idx, indexCss.indexOf('}', idx));
    assert.match(decl, /items-center/, `${name} should keep items-center`);
    assert.match(decl, /justify-center/, `${name} should keep justify-center`);
  }
});

// ── 2. Train practice tiles: whole card is the CTA, so it centers ───────────

test('Train practice tile (whole card = "open a tool") centers its icon, name and description', () => {
  assert.match(practiceTile, /items-center/);
  assert.doesNotMatch(practiceTile, /text-left/);
});

test('Train practice tile\'s secondary "reset history" link stays centered under the centered tile', () => {
  assert.match(trainPage, /self-center/);
  assert.doesNotMatch(trainPage, /self-start/);
});

// ── 3. Choice/context pickers are NOT CTA cards — they keep reading left ────

test('Quick Rep choice buttons (context/state/moment/cue pickers) stay left-aligned, not centered', () => {
  assert.match(mentalRep, /ChoiceButton[\s\S]{0,400}text-left/);
});

// ── 4. Settings/menu navigation rows are exempt from centering ──────────────

test('Account danger-zone rows (Sign out / Delete account) keep their icon+label left-aligned', () => {
  const idx = accountPage.indexOf('Account actions');
  assert.notEqual(idx, -1, 'the Account actions section should still exist');
  const section = accountPage.slice(idx, idx + 1200);
  assert.match(section, /text-left/);
});
