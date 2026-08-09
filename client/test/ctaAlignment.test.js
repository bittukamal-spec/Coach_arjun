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
const dashboard = read('src/pages/Dashboard.jsx');
const mindJournal = read('src/pages/MindJournalPage.jsx');
const playbook = read('src/pages/PlaybookPage.jsx');

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

// Visual refresh: the Train page's own "View history" secondary link was
// removed entirely — that access now lives on the Pressure Reset intro
// screen instead (BodyResetPage.jsx, proven in pressureResetShell.dom.test.jsx
// and navigationIaCleanup.dom.test.jsx), so there is no more centered
// secondary link on Train to assert here.
test('Train page no longer carries its own "reset history" secondary link (relocated to Pressure Reset intro)', () => {
  // Comments stripped — the page's own explanatory comment about WHERE the
  // control moved to legitimately contains the phrase "View history".
  const stripComments = (s) => s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(stripComments(trainPage), /View history/i);
  assert.doesNotMatch(trainPage, /historyTo/);
});

// ── 2b. Whole-card feature/action launches center too — a card doesn't stay
// left-aligned merely because it has a chevron; it centers when its actual
// job is "start/open this feature", not "identify a destination in a list".

test('Dashboard "Talk to Arjun" hero: the whole card launches Coach, so its copy centers', () => {
  const idx = dashboard.indexOf('TALK TO ARJUN');
  assert.notEqual(idx, -1, 'the Talk to Arjun hero section should still exist');
  const hero = dashboard.slice(idx, idx + 2200);
  assert.match(hero, /text-center/, 'the title/sub block centers');
  assert.match(hero, /openCoach/, 'still the same approved copy');
  assert.match(hero, /to="\/coaching"/, 'still the same route');
});

// Visual refresh: "What's today?" and "Recommended practice" are now one
// merged container (dropdown row + recommendation row). The recommendation
// row reads left-aligned (icon, title/desc) like a settings/choice row
// rather than a single-action launch card, so it intentionally does NOT
// center — matching the approved mockup. Mockup-fidelity pass: the CTA
// button moved from beside that row (where its own intrinsic width
// squeezed the title/desc into a narrow column) to a full-width row below
// it — same button, same routing, just stacked instead of side-by-side.
test('Dashboard merged "What\'s today?" container: recommendation row keeps its existing CTA button and routing, laid out left-to-right', () => {
  const idx = dashboard.indexOf('RECOMMENDED PRACTICE');
  assert.notEqual(idx, -1, 'the recommended-practice section should still exist');
  const card = dashboard.slice(idx, idx + 3600);
  assert.match(card, /btn-primary/, 'the CTA button keeps the approved primary recipe');
  assert.match(card, /navigate\(primaryAction\.to, primaryActionState\)/, 'routing is unchanged');
  assert.match(card, /<select/, 'the day-context picker is the new dropdown control');
});

// Visual refresh: the Mind Journal CTA is now an illustrated banner (art on
// the left, copy on the right) rather than a single centered launch row, so
// its heading/value copy reads left-aligned next to the illustration.
test('Dashboard "Mind Journal" card: illustrated CTA with the approved heading/value/CTA copy, still opening /mind-journal', () => {
  const idx = dashboard.indexOf('MIND JOURNAL');
  assert.notEqual(idx, -1, 'the Mind Journal card section should still exist');
  const card = dashboard.slice(idx, idx + 1700);
  assert.match(card, /MindJournalArt/, 'the illustrated CTA treatment is present');
  assert.match(card, /journalTitle/);
  assert.match(card, /journalHeading/);
  assert.match(card, /journalValue/);
  assert.match(card, /journalCta/);
  assert.match(card, /to="\/mind-journal"/);
});

test('Mind Journal "New Reflection" hero: whole card starts a reflection, so its title/desc center', () => {
  const idx = mindJournal.indexOf('mj-hero-new');
  assert.notEqual(idx, -1);
  const hero = mindJournal.slice(idx, idx + 1700);
  assert.match(hero, /newReflection\.cardTitle\}[\s\S]{0,20}<\/p>/, 'title still renders');
  assert.match(hero, /flex-1 text-center|text-center flex-1|min-w-0 flex-1 text-center/);
});

test('Mind Journal "Quick Note" card: whole card starts a note, so its title/desc center', () => {
  const idx = mindJournal.indexOf('mj-quick-note');
  assert.notEqual(idx, -1);
  const card = mindJournal.slice(idx, idx + 900);
  assert.match(card, /flex-1 min-w-0 text-center/);
});

// Modernization pass: the Mind Journal entry point was removed from
// Playbook entirely (Mind Journal now lives on Home only), so there is no
// more Playbook "Mind Journal" card to assert centering on here.
test('Playbook no longer carries a Mind Journal entry point (moved to Home only)', () => {
  assert.doesNotMatch(playbook, /navigate\('\/mind-journal'\)/);
  assert.doesNotMatch(playbook, /journalTitle|journalDesc/);
});

// ── 2c. Saved/summary content inside Playbook stays left — not a CTA card ───

test('Playbook saved Focus Cards stay left-aligned (saved content, not a CTA card)', () => {
  const idx = playbook.indexOf('{pb.focusCardsHeading}');
  assert.notEqual(idx, -1);
  const section = playbook.slice(idx, idx + 900);
  assert.match(section, /text-left/);
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
