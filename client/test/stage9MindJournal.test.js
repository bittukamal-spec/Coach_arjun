// Source-text checks for Stage 9 (Mind Journal consistency). MindJournalPage
// .jsx contains JSX and cannot be imported directly by node:test without a
// transform — matching the established pattern elsewhere in this suite, these
// are source-text assertions.
//
// The Playbook half of this file went with the Playbook page: it was retired
// as an athlete-facing destination, so its section order and its (already
// removed) Mind Journal entry point have nothing left to assert. Every Mind
// Journal guarantee below is unchanged.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const mindJournal = readFileSync(path.join(root, 'src/pages/MindJournalPage.jsx'), 'utf8');
const contextScreen = readFileSync(path.join(root, 'src/pages/mindJournal/ArjunContextPage.jsx'), 'utf8');
const aiAccess = readFileSync(path.join(root, 'src/components/mindJournal/AiAccessPopover.jsx'), 'utf8');

// ── No scores, diagnosis, profiling, or auto-prescription copy ─────────────

test('MindJournalPage: no score, diagnosis, profiling, or auto-prescription language', () => {
  const codeOnly = mindJournal.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(codeOnly, /diagnos|profil|auto-prescri|automatic prescri/i, 'MindJournalPage must not introduce diagnosis/profiling/auto-prescription copy');
});

// ── Alignment with the Stage 3 foundation (headers, empty states, tokens) ──

test('MindJournalPage: uses the shared PageHeader primitive instead of a hand-rolled header', () => {
  assert.match(mindJournal, /import \{ Card, PageHeader, SectionLabel, SaveStatus \} from '\.\.\/components\/ui'/);
  assert.match(mindJournal, /<PageHeader onBack=\{\(\) => navigate\(-1\)\} title=\{mj\.title\}/);
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

// The opt-in defaults to off and only ever changes by an explicit action.
// Two surfaces now offer it — the dedicated /mind-journal/context screen
// (still routed for old deep links) and the Mind Journal header's popover —
// and both read the same server value and write the same endpoint. The
// guarantee is asserted on each.
test('Arjun context screen: opt-in still defaults to false and is only changed by explicit user action', () => {
  assert.match(contextScreen, /const \[contextEnabled, setContextEnabled\] = useState\(false\);/);
  assert.match(contextScreen, /onChange=\{handleContextToggle\}/);
});

test('AI-access popover: the same opt-in defaults to off and is only changed by explicit user action', () => {
  // The value is owned by the page's existing GET, which starts false, and
  // the popover changes it only from an onChange the athlete triggered.
  assert.match(mindJournal, /const \[contextEnabled, setContextEnabled\] = useState\(false\);/);
  assert.match(aiAccess, /onChange=\{handleToggle\}/);
  assert.match(aiAccess, /checked=\{contextEnabled\}/);
});

test('MindJournalPage: hosts no toggle of its own — the popover owns the single write path', () => {
  assert.doesNotMatch(mindJournal, /type="checkbox"/, 'the landing screen must not host a second opt-in control');
  assert.doesNotMatch(mindJournal, /method: 'PATCH'/, 'the landing screen must never write the context setting itself');
  // Exactly one write path across the Mind Journal home surface.
  assert.equal((aiAccess.match(/method: 'PATCH'/g) || []).length, 1);
});

test('MindJournalPage: athlete-authored note/entry text is rendered verbatim, never passed through translation', () => {
  // A card's title is the athlete's own words when they wrote any (a custom
  // event, a guided answer, a quick note) and Arjun's stored takeaway
  // previews below it. Both render the raw stored string, never a lookup
  // keyed by it.
  assert.match(mindJournal, /\{title\}/);
  assert.match(mindJournal, /entry\.customEvent/);
  assert.match(mindJournal, /isGuided \? guidedPreview\(entry\) : entry\.note/);
  assert.match(mindJournal, /\{takeaway\}/);
  const cardBody = mindJournal.slice(mindJournal.indexOf('const title ='), mindJournal.indexOf('export default function'));
  assert.doesNotMatch(
    cardBody,
    /translations\[|mj\.(states|contextTypes)\[(title|takeaway|preview)\]/,
    'athlete text is never used as a translation key'
  );
});
