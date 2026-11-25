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

test('Dashboard "Talk to Arjun" block: the whole sun-coloured row launches Coach', () => {
  // Playbook redesign: a left-aligned colour block (drawing, title/sub, arrow),
  // no longer a centered gradient hero.
  const idx = dashboard.indexOf('TALK TO ARJUN');
  assert.notEqual(idx, -1, 'the Talk to Arjun section should still exist');
  const hero = dashboard.slice(idx, idx + 1400);
  assert.match(hero, /bg-sun/, 'the sun colour block');
  assert.match(hero, /<Teer pose="wave"[^>]*motion="twice"/, 'carries Teer, who waves twice then stops');
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
test('Dashboard "Mind Journal": a blush square tile in the Your space row, opening /mind-journal', () => {
  // Founder (Nov 2026): Home was too busy, so Mind Journal, My practice and
  // Weekly reviews sit in one sideways row of square tiles, like Tools.
  const idx = dashboard.indexOf('YOUR SPACE');
  assert.notEqual(idx, -1, 'the Your space row should exist');
  const row = dashboard.slice(idx, dashboard.indexOf('QUICK STARTS'));
  assert.match(row, /<ToolTile to="\/mind-journal" tone="blush"/);
  assert.match(row, /<JournalArt size=\{\d+\} \/>/);
  assert.doesNotMatch(dashboard, /TrainGradientCard/, 'Home no longer uses the gradient card');
});

// Playbook founder layout (Nov 2026): the Mind Journal hero is centred,
// straight on the blush page — heading, one supporting line, the effort
// micro-line, then a sun CTA pill. The CTA is a styled span inside the one
// link, so the whole hero stays a single accessible action.
test('Mind Journal hero: centred heading, supporting line, effort line and a single CTA pill', () => {
  const idx = mindJournal.indexOf('mj-hero-new');
  assert.notEqual(idx, -1);
  const hero = mindJournal.slice(idx, mindJournal.indexOf('</Link>', idx));
  assert.match(hero, /\{mj\.hero\.heading\}/, 'heading renders');
  assert.match(hero, /\{mj\.hero\.sub\}/, 'one supporting line renders');
  assert.match(hero, /\{mj\.hero\.effort\}/, 'the effort micro-line renders');
  assert.match(hero, /\{mj\.hero\.cta\}/, 'the CTA label renders');
  assert.match(hero, /text-center/, 'the hero is centred');
  assert.match(hero, /<span className="inline-flex items-center justify-center[^"]*min-h-\[56px\][^"]*bg-sun/);
  assert.doesNotMatch(hero, /<button|<Link/, 'no nested interactive controls inside the hero');
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

test('Account actions (Sign out / Delete account) are full-width buttons with a 44px+ target', () => {
  const idx = accountPage.indexOf('Account actions');
  assert.notEqual(idx, -1, 'the Account actions section should still exist');
  const section = accountPage.slice(idx, idx + 1400);
  assert.match(section, /onClick=\{logout\}/);
  assert.match(section, /w-full min-h-\[52px\]/);
  assert.match(section, /w-full min-h-\[44px\]/);
});
