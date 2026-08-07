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
const contextScreen = readFileSync(path.join(root, 'src/pages/mindJournal/ArjunContextPage.jsx'), 'utf8');
const translations = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

// ── "What I'm learning" is first ────────────────────────────────────────────

test('PlaybookPage: "What I\'m learning" is the first section, before the weekly summary', () => {
  const learningIdx = playbook.indexOf('{pb.learningHeading}');
  // Stage F moved the weekly summary off the signature gradient onto the
  // approved flat elevated surface, so it is located by its own heading
  // rather than by variant="hero". The ordering guarantee is unchanged.
  const weekIdx = playbook.indexOf('{pb.thisWeek}');
  assert.ok(learningIdx !== -1 && weekIdx !== -1);
  assert.ok(learningIdx < weekIdx, '"What I\'m learning" must render before the weekly-summary card');
});

// ── Quiet Mind Journal entry point inside Playbook ──────────────────────────

test('PlaybookPage: has a Mind Journal entry point that navigates to /mind-journal', () => {
  assert.match(playbook, /onClick=\{\(\) => navigate\('\/mind-journal'\)\}/);
});

test('PlaybookPage: the Mind Journal entry point is a proper quiet card — flat, never the hero, with a privacy/no-score line', () => {
  // Refinement PR: the loose text-with-chevron row became a flat Card with
  // a title, a short privacy/no-score explanation, and one clear action.
  const idx = playbook.indexOf("navigate('/mind-journal')");
  const block = playbook.slice(Math.max(0, idx - 300), idx + 700);
  assert.match(block, /<Card/, 'the Mind Journal entry point is a quiet flat Card');
  assert.doesNotMatch(block, /variant="hero"/, 'the Mind Journal entry point must not use the hero gradient');
  assert.match(block, /text-caption text-slt/, 'the supporting line keeps quiet, secondary-weight text styling');
  assert.match(block, /\{pb\.journalDesc\}/, 'the card explains it is score-free');
  assert.match(translations, /कोई स्कोर नहीं/);
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
