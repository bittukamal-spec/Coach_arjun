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

// The opt-in moved off the landing screen onto its own Arjun-context screen
// (PR 2A), so the guarantee is asserted where the control now lives. The
// landing screen only reports the value and must not be able to change it.
test('Arjun context screen: opt-in still defaults to false and is only changed by explicit user action', () => {
  assert.match(contextScreen, /const \[contextEnabled, setContextEnabled\] = useState\(false\);/);
  assert.match(contextScreen, /onChange=\{handleContextToggle\}/);
});

test('MindJournalPage: reports the context setting but carries no control that could change it', () => {
  assert.match(mindJournal, /const \[contextEnabled, setContextEnabled\] = useState\(false\);/);
  assert.doesNotMatch(mindJournal, /type="checkbox"/, 'the landing screen must not host the opt-in control');
  assert.doesNotMatch(mindJournal, /method: 'PATCH'/, 'the landing screen must never write the context setting');
});

test('MindJournalPage: athlete-authored note/entry text is rendered verbatim, never passed through translation', () => {
  // Quick notes and legacy rows preview through `preview`, guided
  // reflections add the labelled take-forward line — both render the raw
  // stored string, never a lookup keyed by it.
  assert.match(mindJournal, /\{showPreview &&[\s\S]*?\{preview\}/);
  assert.match(mindJournal, /\{entry\.takeForward\}/);
  assert.doesNotMatch(
    mindJournal.slice(mindJournal.indexOf('{showPreview'), mindJournal.indexOf('{entry.takeForward}')),
    /translations\[|mj\.(states|contextTypes)\[preview\]/
  );
});
