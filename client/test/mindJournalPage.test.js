// Source-text checks for the score-free Mind Journal client rollout.
// MindJournalPage.jsx/App.jsx/Dashboard.jsx contain JSX and cannot be
// imported directly by node:test without a transform — matching the
// established pattern elsewhere in this suite (vizSafety.test.js,
// playbookOutcomes.test.js), these are source-text assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const page = readFileSync(path.join(root, 'src/pages/MindJournalPage.jsx'), 'utf8');
const app = readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const dashboard = readFileSync(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8');

// ── State chips ──────────────────────────────────────────────────────────

test('MindJournalPage: all 8 allowed states have both English and Hindi labels', () => {
  for (const key of ['calm', 'focused', 'confident', 'motivated', 'nervous', 'frustrated', 'distracted', 'tired']) {
    assert.match(page, new RegExp(`${key}:\\s*\\{\\s*en:`), `expected an English label for ${key}`);
  }
});

test('MindJournalPage: state chips are accessible <button> elements with aria-pressed reflecting selection', () => {
  const idx = page.indexOf('STATE_KEYS.map(key =>');
  const block = page.slice(idx, idx + 700);
  assert.match(block, /<button/);
  assert.match(block, /aria-pressed=\{isSelected\}/);
  assert.match(block, /onClick=\{\(\) => toggleState\(key\)\}/);
});

test('MindJournalPage: toggleState prevents selecting more than 2, and deselects an already-selected state', () => {
  const idx = page.indexOf('function toggleState');
  const block = page.slice(idx, page.indexOf('\n  }', idx));
  assert.match(block, /if \(prev\.includes\(key\)\) return prev\.filter\(k => k !== key\);/, 'must deselect a selected state');
  assert.match(block, /if \(prev\.length >= 2\) return prev;/, 'must not allow a third selection');
});

// ── Note ─────────────────────────────────────────────────────────────────

test('MindJournalPage: note is optional and length-bounded to 500 characters, with a visible counter', () => {
  assert.match(page, /const MAX_NOTE_LENGTH = 500;/);
  assert.match(page, /maxLength=\{MAX_NOTE_LENGTH\}/);
  assert.match(page, /\{note\.length\}\/\{MAX_NOTE_LENGTH\}/);
  assert.match(page, /note: note\.trim\(\) \? note : undefined/, 'note must be optional in the request payload');
});

// ── Save behavior ────────────────────────────────────────────────────────

test('MindJournalPage: Save is disabled until at least one state is selected, and while a save is in flight', () => {
  assert.match(page, /disabled=\{selected\.length === 0 \|\| saving\}/);
});

test('MindJournalPage: prevents duplicate submissions while saving (guarded at the top of handleSave)', () => {
  const idx = page.indexOf('async function handleSave');
  const block = page.slice(idx, idx + 300);
  assert.match(block, /if \(selected\.length === 0 \|\| saving\) return;/);
});

test('MindJournalPage: Save POSTs to the new /api/mind-journal endpoint only — never the old scored endpoint', () => {
  assert.match(page, /apiFetch\('\/api\/mind-journal', \{\s*method: 'POST'/);
  assert.doesNotMatch(page, /\/api\/mental-fitness/, 'must never call the legacy scored endpoint');
});

test('MindJournalPage: handles loading, error, and success states for the save action', () => {
  assert.match(page, /saving \? \(hi \? 'सेव हो रहा है…' : 'Saving…'\)/, 'loading state');
  assert.match(page, /setSaveError\(/, 'error state');
  assert.match(page, /setSavedJustNow\(true\)/, 'success state');
});

// ── Safety guidance ──────────────────────────────────────────────────────

test('MindJournalPage: a safetyFlag response shows guidance + helplines instead of a false success confirmation', () => {
  const idx = page.indexOf('async function handleSave');
  const block = page.slice(idx, page.indexOf('setSaving(false);', idx));
  assert.match(block, /data\?\.safetyFlag === 'needs_support'/);
  assert.match(block, /setSafetyGuidance\(data\.guidance/);
  // The safety branch must be checked before the entry/success branch.
  const safetyIdx = block.indexOf("data?.safetyFlag === 'needs_support'");
  const successIdx = block.indexOf('data?.entry');
  assert.ok(safetyIdx !== -1 && successIdx !== -1 && safetyIdx < successIdx);

  assert.match(page, /import HelplineList from '\.\.\/components\/HelplineList'/);
  const renderIdx = page.indexOf('safetyGuidance ? (');
  const renderBlock = page.slice(renderIdx, renderIdx + 800);
  assert.match(renderBlock, /<HelplineList \/>/);
  assert.doesNotMatch(renderBlock, /सेव हो गया|Saved ✓/, 'must never show a save-success confirmation on the safety branch');
});

// ── Recent entries: empty / loading / error / populated, no scores ───────

test('MindJournalPage: recent entries render loading, error, empty, and populated states', () => {
  assert.match(page, /entries === null/, 'loading state');
  assert.match(page, /entries === false/, 'error state');
  assert.match(page, /entries\.length === 0/, 'empty state');
  assert.match(page, /entries\.map\(entry =>/, 'populated state');
});

test('MindJournalPage: each recent entry shows only translated state labels, optional note, and a date — no score field', () => {
  const idx = page.indexOf('entries.map(entry =>');
  const block = page.slice(idx, idx + 700);
  assert.match(block, /entry\.states\.map\(k =>/);
  assert.match(block, /entry\.note &&/);
  assert.match(block, /formatDate\(entry\.createdAt\)/);
  assert.doesNotMatch(block, /score|rating|percentage|streak/i);
});

test('MindJournalPage: no chart, numerical rating, streak, mental fitness level, progress percentage, or reward animation appears in the actual code (the file\'s own comments only ever mention these words to say they were deliberately left out)', () => {
  const codeOnly = page.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(codeOnly, /chart|rating|streak|percentage|reward|confetti|xpEarned|fitnessLevel|avgPct|\d+\/100/i);
  // Every mention of the word "score" in actual code is part of a "not
  // scored" / "not used to score" disclaimer, never a numeric display.
  const scoreMentions = codeOnly.match(/.{0,25}score.{0,10}/gi) || [];
  assert.ok(scoreMentions.length > 0, 'expected the intentional "not scored" disclaimer copy to be present');
  for (const mention of scoreMentions) {
    assert.match(mention, /कोई score नहीं|not scored|not used to score|उपयोग score/, `unexpected "score" mention: ${mention}`);
  }
});

// ── Optional Arjun context opt-in ──────────────────────────────────────────

test('MindJournalPage: context toggle reflects the server-persisted value on load, not localStorage', () => {
  assert.match(page, /setContextEnabled\(!!data\.contextEnabled\)/);
  assert.doesNotMatch(page, /localStorage/, 'context preference must never be sourced from localStorage');
  assert.match(page, /checked=\{contextEnabled\}/);
});

test('MindJournalPage: toggling calls PATCH /api/mind-journal/context and reverts to the previous value on failure', () => {
  const idx = page.indexOf('async function handleContextToggle');
  const block = page.slice(idx, page.indexOf('\n  }', page.indexOf('setContextSaving(false);', idx)));
  assert.match(block, /method: 'PATCH'/);
  assert.match(block, /'\/api\/mind-journal\/context'/);
  assert.match(block, /setContextEnabled\(previous\)/, 'must restore the previous value on failure');
  assert.match(block, /setContextError\(true\)/, 'must show an error on failure');
});

test('MindJournalPage: the opt-in is off by default (component state) and only flips via an explicit toggle', () => {
  assert.match(page, /const \[contextEnabled, setContextEnabled\] = useState\(false\);/);
});

// ── Routing / product language (section H) ────────────────────────────────

test('App.jsx: /mind-journal route renders MindJournalPage', () => {
  assert.match(app, /import MindJournalPage from '\.\/pages\/MindJournalPage'/);
  const idx = app.indexOf("path=\"/mind-journal\"");
  const block = app.slice(idx, idx + 200);
  assert.match(block, /<MindJournalPage \/>/);
});

test('App.jsx: the old /mental-fitness path redirects to the new score-free experience, and no longer renders the old scored page', () => {
  const idx = app.indexOf('path="/mental-fitness"');
  const block = app.slice(idx, idx + 150);
  assert.match(block, /<Navigate to="\/mind-journal" replace \/>/);
  assert.doesNotMatch(app, /MentalFitnessCheckin/, 'the old scored page must no longer be reachable from any route');
});

test('Dashboard.jsx: the visible check-in link now opens Mind Journal, not the old scored page', () => {
  assert.match(dashboard, /navigate\('\/mind-journal'\)/);
  assert.doesNotMatch(dashboard, /navigate\('\/mental-fitness'\)/);
});
