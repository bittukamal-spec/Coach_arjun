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

// The merged "What's today?" container (day-context dropdown + recommended
// practice) was removed from Home along with the Playbook page — Home no
// longer asks the athlete to classify their day, and nothing replaced the
// recommendation, so there is no such container left to align.
test('Dashboard: no day-context dropdown or recommended-practice CTA remains to align', () => {
  assert.equal(dashboard.indexOf('RECOMMENDED PRACTICE'), -1);
  assert.doesNotMatch(dashboard, /<select/);
  assert.doesNotMatch(dashboard, /primaryAction/);
});

// Homepage-priority pass: the Mind Journal CTA reuses the exact same
// TrainGradientCard (wide layout) already approved for Train's "Match &
// Practice Reflection" banner — icon circle, then heading, then supporting
// copy stacked in one column, and an arrow badge in the card's own
// bottom-right corner. That shared component's own left-aligned column
// layout is the established, already-approved pattern for this exact card
// shape — see TrainGradientCard's `wide` case — so it is reused verbatim
// rather than re-deriving a centered layout here. Visual-identity pass:
// the card now uses the existing `purple` (violet) gradient variant and a
// distinct NotebookPen icon instead of amber/RingMark, so it no longer
// reads as a restyled copy of Train's amber Reflection card. No
// Illustration prop: this card's approved copy is noticeably longer than
// Train's own Reflection desc, and with the ghost illustration's narrower
// text column it wraps into the corner arrow badge at the ≥430px
// breakpoint (confirmed by screenshot) — so the illustration is
// intentionally omitted here.
test('Dashboard "Mind Journal" card: reuses TrainGradientCard (wide, violet, NotebookPen) with the approved heading/value copy, still opening /mind-journal', () => {
  const idx = dashboard.indexOf('MIND JOURNAL');
  assert.notEqual(idx, -1, 'the Mind Journal card section should still exist');
  const card = dashboard.slice(idx, idx + 2350);
  assert.match(card, /<TrainGradientCard/, 'reuses the shared premium gradient card, not a bespoke one');
  assert.match(card, /variant="purple"/, 'uses the existing violet/purple gradient variant, not amber');
  assert.match(card, /Icon=\{NotebookPen\}/, 'uses the existing NotebookPen Lucide icon, not BookOpen/RingMark');
  assert.doesNotMatch(card, /variant="amber"/, 'no longer amber — distinguishable from Train\'s Reflection card');
  assert.doesNotMatch(card, /Illustration=/, 'no ghost illustration — its longer copy collides with the arrow badge at ≥430px');
  assert.match(card, /\bwide\b/, 'the wide (icon → heading → copy, one column) layout is used');
  assert.match(card, /journalTitle/);
  assert.match(card, /journalHeading/);
  assert.match(card, /journalValue/);
  assert.match(card, /onClick=\{\(\) => navigate\('\/mind-journal'\)\}/);
});

// The redesigned Mind Journal hero reads left-to-right: heading, one
// supporting line, the effort micro-line, then its own CTA control. It is no
// longer an icon/copy/arrow bookend row with centered copy, so the centering
// guarantee moved onto the CTA itself — the shared recipe centers its own
// label, and the whole card remains one action.
test('Mind Journal hero: heading, supporting line, effort line and a single left-aligned CTA', () => {
  const idx = mindJournal.indexOf('mj-hero-new');
  assert.notEqual(idx, -1);
  const hero = mindJournal.slice(idx, mindJournal.indexOf('</Card>', idx));
  assert.match(hero, /\{mj\.hero\.heading\}/, 'heading renders');
  assert.match(hero, /\{mj\.hero\.sub\}/, 'one supporting line renders');
  assert.match(hero, /\{mj\.hero\.effort\}/, 'the effort micro-line renders');
  assert.match(hero, /\{mj\.hero\.cta\}/, 'the CTA label renders');
  // The CTA is a styled span inside the one card action, not a nested
  // control that would break the single accessible action.
  assert.match(hero, /inline-flex items-center gap-2[^"]*min-h-\[44px\]/);
  assert.doesNotMatch(hero, /<button|<Link/, 'no nested interactive controls inside the hero card');
});

// Unified reflection (PR 1): the separate Quick Note card was retired from
// the Mind Journal home, so there is no longer a second launch card there to
// assert centering on. The hero below it is now the single way in, and its
// own centering is asserted in mindJournalPage.test.js. QuickNotePage itself
// is untouched and still routed for compatibility until PR 2.
// The hero's own centering is asserted by the "New Reflection hero" test
// below, which is unchanged — this one only pins the removal.
test('Mind Journal home: the retired Quick Note card is gone, leaving one way in', () => {
  assert.equal(mindJournal.indexOf('mj-quick-note'), -1, 'the second launch card was retired');
  assert.notEqual(mindJournal.indexOf('data-testid="mj-hero-new"'), -1,
    'the single New reflection hero must still exist');
});

// The Playbook page was retired as an athlete-facing destination, so its own
// alignment guarantees (its Mind Journal entry point, its saved Focus Card
// summaries) went with it. Focus Cards keep their own dedicated surface at
// /focus-deck, which this file never covered.

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
