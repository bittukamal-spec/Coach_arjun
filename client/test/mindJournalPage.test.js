// Source-text checks for the score-free Mind Journal client rollout, plus
// full English/Hindi localization coverage. MindJournalPage.jsx/App.jsx/
// Dashboard.jsx contain JSX and cannot be imported directly by node:test
// without a transform — matching the established pattern elsewhere in this
// suite (vizSafety.test.js, playbookOutcomes.test.js), these are
// source-text assertions. translations.js is a plain module and is
// imported directly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { translations } from '../src/i18n/translations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const page = readFileSync(path.join(root, 'src/pages/MindJournalPage.jsx'), 'utf8');
const app = readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const dashboard = readFileSync(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8');

const STATE_KEYS = ['calm', 'focused', 'confident', 'motivated', 'nervous', 'frustrated', 'distracted', 'tired'];
const DEVANAGARI_RE = /[ऀ-ॿ]/;

// ── Localization (section 1) ────────────────────────────────────────────────

test('MindJournalPage: imports and uses the shared translation system, not a hardcoded second language', () => {
  assert.match(page, /import \{ translations \} from '\.\.\/i18n\/translations'/);
  assert.match(page, /const t = translations\[language\];/);
  assert.match(page, /const mj = t\.mindJournal;/);
  // No page-local hardcoded copy ternary, and no raw Devanagari text in the
  // component — every visible string comes from mj.*. formatDate's Intl
  // locale codes ('hi-IN'/'en-IN') are locale identifiers, not copy, so
  // they're excluded before checking for hardcoded ternary copy / Devanagari.
  const codeOnly = page.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const withoutLocaleCodes = codeOnly.replace(/'hi-IN'|'en-IN'/g, '');
  assert.doesNotMatch(withoutLocaleCodes, /language === 'hi' \? '/, 'must not hardcode a second-language ternary in the component');
  assert.doesNotMatch(withoutLocaleCodes, DEVANAGARI_RE, 'no hardcoded Devanagari text may appear in the page component');
});

test('translations.js: every Mind Journal athlete-visible string exists in both English and Hindi', () => {
  const REQUIRED_KEYS = [
    'title', 'subtitle', 'pickHint', 'notePlaceholder', 'saveBtn', 'saving', 'saved',
    'errorGeneric', 'errorNetwork', 'recentHeading', 'emptyState', 'loadError', 'retryBtn',
    'contextLabel', 'contextDisclosure', 'contextError',
  ];
  for (const lang of ['en', 'hi']) {
    const mj = translations[lang].mindJournal;
    assert.ok(mj, `translations.${lang}.mindJournal must exist`);
    for (const key of REQUIRED_KEYS) {
      assert.equal(typeof mj[key], 'string', `translations.${lang}.mindJournal.${key} must be a non-empty string`);
      assert.ok(mj[key].length > 0, `translations.${lang}.mindJournal.${key} must not be empty`);
    }
    assert.equal(typeof mj.safety.heading, 'string');
    assert.equal(typeof mj.safety.okBtn, 'string');
  }
});

test('translations.js: every one of the 8 fixed state keys has both an English and a Hindi (Devanagari) label', () => {
  for (const key of STATE_KEYS) {
    const en = translations.en.mindJournal.states[key];
    const hi = translations.hi.mindJournal.states[key];
    assert.equal(typeof en, 'string', `English label missing for state "${key}"`);
    assert.ok(en.length > 0, `English label empty for state "${key}"`);
    assert.equal(typeof hi, 'string', `Hindi label missing for state "${key}"`);
    assert.match(hi, DEVANAGARI_RE, `Hindi label for "${key}" must be natural Devanagari script, got: ${hi}`);
  }
});

test('translations.js: Hindi Mind Journal copy is genuine Devanagari, not English left untranslated', () => {
  const hi = translations.hi.mindJournal;
  for (const key of ['title', 'subtitle', 'pickHint', 'notePlaceholder', 'saveBtn', 'saving', 'saved', 'recentHeading', 'emptyState', 'loadError', 'retryBtn', 'contextLabel', 'contextDisclosure', 'contextError']) {
    assert.match(hi[key], DEVANAGARI_RE, `translations.hi.mindJournal.${key} must contain Devanagari script, got: ${hi[key]}`);
  }
  assert.match(hi.safety.heading, DEVANAGARI_RE);
  assert.match(hi.safety.okBtn, DEVANAGARI_RE);
});

test('MindJournalPage: renders translated state labels via mj.states[key], never the raw internal key text', () => {
  const idx = page.indexOf('STATE_KEYS.map(key =>');
  const block = page.slice(idx, idx + 700);
  assert.match(block, /\{mj\.states\[key\]\}/, 'chip label must come from the translation table');
  assert.doesNotMatch(block, />\{key\}</, 'must never render the raw internal key as the visible label');
});

test('MindJournalPage: recent-history items render translated labels via mj.states[k], never a raw key fallback', () => {
  const idx = page.indexOf('entries.map(entry =>');
  const block = page.slice(idx, idx + 700);
  assert.match(block, /entry\.states\.map\(k => mj\.states\[k\]\)/, 'must map through the translation table with no `|| k` raw-key fallback');
});

test('switching language never changes the API values submitted — the request body always uses internal state keys, not translated labels', () => {
  // The POST body is built from `selected` (populated by toggleState from
  // STATE_KEYS, the internal keys) — never from mj.states or any label text.
  const idx = page.indexOf('async function handleSave');
  const block = page.slice(idx, page.indexOf('setSaving(false);', idx));
  assert.match(block, /body: JSON\.stringify\(\{ states: selected, note:/, 'POST body must serialize the raw `selected` keys');
  assert.doesNotMatch(block, /mj\.states/, 'the save request must never reference translated label text');

  // toggleState only ever pushes STATE_KEYS entries (internal keys) into
  // `selected`, regardless of which language is active.
  const toggleIdx = page.indexOf('function toggleState');
  const toggleBlock = page.slice(toggleIdx, page.indexOf('\n  }', toggleIdx));
  assert.doesNotMatch(toggleBlock, /language|mj\./, 'state selection must be language-independent');
});

// ── State chips ──────────────────────────────────────────────────────────

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

test('MindJournalPage: handles loading, error, and success states for the save action, all from translations', () => {
  assert.match(page, /saving \? mj\.saving : mj\.saveBtn/, 'loading state');
  assert.match(page, /setSaveError\(data\?\.error \|\| mj\.errorGeneric\)/, 'error state');
  assert.match(page, /setSavedJustNow\(true\)/, 'success state');
  assert.match(page, /\{mj\.saved\}/, 'success confirmation copy must come from translations');
});

// ── Safety guidance ──────────────────────────────────────────────────────

test('MindJournalPage: a safetyFlag response shows guidance + helplines instead of a false success confirmation', () => {
  const idx = page.indexOf('async function handleSave');
  const block = page.slice(idx, page.indexOf('setSaving(false);', idx));
  assert.match(block, /data\?\.safetyFlag === 'needs_support'/);
  assert.match(block, /setSafetyGuidance\(data\.guidance/);
  const safetyIdx = block.indexOf("data?.safetyFlag === 'needs_support'");
  const successIdx = block.indexOf('data?.entry');
  assert.ok(safetyIdx !== -1 && successIdx !== -1 && safetyIdx < successIdx);

  assert.match(page, /import HelplineList from '\.\.\/components\/HelplineList'/);
  const renderIdx = page.indexOf('safetyGuidance ? (');
  const renderBlock = page.slice(renderIdx, renderIdx + 800);
  assert.match(renderBlock, /<HelplineList \/>/);
  assert.match(renderBlock, /\{mj\.safety\.heading\}/);
  assert.match(renderBlock, /\{mj\.safety\.okBtn\}/);
  assert.doesNotMatch(renderBlock, /\{mj\.saved\}/, 'must never show a save-success confirmation on the safety branch');
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

test('MindJournalPage: no chart, numerical rating, streak, mental fitness level, progress percentage, score, or reward animation appears in the actual code', () => {
  const codeOnly = page.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(codeOnly, /chart|rating|streak|percentage|reward|confetti|xpEarned|fitnessLevel|avgPct|\d+\/100|score/i);
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

// ── Routing / product language ────────────────────────────────────────────

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
  // Refinement PR: the entry is now a real <Link to="/mind-journal"> card.
  assert.match(dashboard, /to="\/mind-journal"/);
  assert.doesNotMatch(dashboard, /navigate\('\/mental-fitness'\)/);
  assert.doesNotMatch(dashboard, /to="\/mental-fitness"/);
});
