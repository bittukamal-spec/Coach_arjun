// Mind Journal creation flow — home, quick note, the two guided-reflection
// steps, the saved confirmation, and the Arjun-context control.
//
// The screens are JSX and cannot be imported by node:test without a
// transform, so they are checked as source text — the established pattern in
// this suite (vizSafety.test.js, playbookOutcomes.test.js). translations.js
// and the Mind Journal constants module are plain ESM and are imported and
// exercised directly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { translations } from '../src/i18n/translations.js';
import {
  STATE_KEYS,
  CONTEXT_TYPE_KEYS,
  MAX_NOTE_LENGTH,
  MAX_WHAT_HAPPENED_LENGTH,
  MAX_TAKE_FORWARD_LENGTH,
  guidedPreview,
  toggleStateKey,
  textOrUndefined,
} from '../src/pages/mindJournal/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = (p) => readFileSync(path.join(root, 'src', p), 'utf8');

const home = src('pages/MindJournalPage.jsx');
const quick = src('pages/mindJournal/QuickNotePage.jsx');
const step1 = src('pages/mindJournal/GuidedReflectionPage.jsx');
const step2 = src('pages/mindJournal/GuidedReflectionDetailsPage.jsx');
const savedScreen = src('pages/mindJournal/ReflectionSavedPage.jsx');
const contextScreen = src('pages/mindJournal/ArjunContextPage.jsx');
const shared = src('pages/mindJournal/shared.jsx');
const app = src('App.jsx');
const dashboard = src('pages/Dashboard.jsx');

const SCREENS = [
  ['MindJournalPage', home],
  ['QuickNotePage', quick],
  ['GuidedReflectionPage', step1],
  ['GuidedReflectionDetailsPage', step2],
  ['ReflectionSavedPage', savedScreen],
  ['ArjunContextPage', contextScreen],
];

const DEVANAGARI_RE = /[ऀ-ॿ]/;
const codeOnly = (s) => s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// Body of a top-level async handler, from its declaration to its closing
// brace at component indent — so payload assertions read only that handler.
const handlerBody = (source, name) => {
  const start = source.indexOf(`async function ${name}`);
  assert.ok(start !== -1, `${name} must exist`);
  return source.slice(start, source.indexOf('\n  }', start));
};

// ── Pure helpers (real behaviour, not source text) ─────────────────────────

test('toggleStateKey: selects, deselects, and refuses a third state', () => {
  assert.deepEqual(toggleStateKey([], 'calm'), ['calm']);
  assert.deepEqual(toggleStateKey(['calm'], 'tired'), ['calm', 'tired']);
  assert.deepEqual(toggleStateKey(['calm', 'tired'], 'calm'), ['tired'], 'must deselect an already-selected state');
  assert.deepEqual(toggleStateKey(['calm', 'tired'], 'focused'), ['calm', 'tired'], 'must refuse a third selection');
  // Never mutates the array it was given.
  const before = ['calm'];
  toggleStateKey(before, 'tired');
  assert.deepEqual(before, ['calm']);
});

test('guidedPreview: falls through whatHappened → whatNoticed → helpedOrGotInWay → takeForward', () => {
  const empty = { whatHappened: null, whatNoticed: null, helpedOrGotInWay: null, takeForward: null };
  assert.equal(guidedPreview({ ...empty, whatHappened: 'a', whatNoticed: 'b', helpedOrGotInWay: 'c', takeForward: 'd' }), 'a');
  assert.equal(guidedPreview({ ...empty, whatNoticed: 'b', helpedOrGotInWay: 'c', takeForward: 'd' }), 'b');
  assert.equal(guidedPreview({ ...empty, helpedOrGotInWay: 'c', takeForward: 'd' }), 'c');
  assert.equal(guidedPreview({ ...empty, takeForward: 'd' }), 'd');
  assert.equal(guidedPreview(empty), null, 'a legacy/quick row has no guided preview');
});

test('textOrUndefined: trims, and omits an empty or whitespace-only field entirely', () => {
  assert.equal(textOrUndefined('  hello  '), 'hello');
  assert.equal(textOrUndefined(''), undefined);
  assert.equal(textOrUndefined('   \n  '), undefined);
});

test('constants mirror the server contract exactly', () => {
  assert.deepEqual(STATE_KEYS, ['calm', 'focused', 'confident', 'motivated', 'nervous', 'frustrated', 'distracted', 'tired']);
  assert.deepEqual(CONTEXT_TYPE_KEYS, ['TRAINING', 'COMPETITION', 'TOUGH_MOMENT', 'RECOVERY_DAY', 'SOMETHING_ELSE']);
  assert.equal(MAX_NOTE_LENGTH, 500);
  assert.equal(MAX_WHAT_HAPPENED_LENGTH, 1000);
  assert.equal(MAX_TAKE_FORWARD_LENGTH, 500);
});

// ── Localization ───────────────────────────────────────────────────────────

test('every Mind Journal screen reads copy from the shared translation system, with no hardcoded second language', () => {
  for (const [name, source] of SCREENS) {
    assert.match(source, /import \{ translations \} from '[^']*i18n\/translations'/, `${name} must use the shared translations`);
    const withoutLocaleCodes = codeOnly(source).replace(/'hi-IN'|'en-IN'/g, '');
    assert.doesNotMatch(withoutLocaleCodes, /language === 'hi' \? '/, `${name} must not hardcode a second-language ternary`);
    assert.doesNotMatch(withoutLocaleCodes, DEVANAGARI_RE, `${name} must not contain hardcoded Devanagari copy`);
  }
});

test('translations.js: every Mind Journal athlete-visible string exists in both English and Hindi', () => {
  const FLAT_KEYS = [
    'title', 'subtitle', 'privacyAria', 'pickHint', 'saving', 'saved', 'errorGeneric', 'errorNetwork', 'retry',
    'recentHeading', 'emptyState', 'loadError', 'retryBtn', 'disclosure', 'takeForwardLabel',
    'contextLabel', 'contextDisclosure', 'contextError',
  ];
  const GROUPED_KEYS = {
    newReflection: ['cardTitle', 'cardDesc', 'cta'],
    quickNote: ['action', 'cardDesc', 'title', 'tag', 'intro', 'statesHeading', 'prompt', 'notePlaceholder', 'saveBtn'],
    guided: [
      'title', 'step1', 'step2', 'step1Intro', 'contextHeading', 'contextHint', 'statesHeading', 'statesHint',
      'continueBtn', 'switchToQuick', 'detailsIntro', 'whatHappened', 'whatHappenedPlaceholder', 'whatNoticed',
      'whatNoticedPlaceholder', 'helpedOrGotInWay', 'helpedOrGotInWayPlaceholder', 'takeForward',
      'takeForwardPlaceholder', 'needSomething', 'saveBtn',
    ],
    savedScreen: ['title', 'heading', 'body', 'doneBtn', 'viewBtn', 'contextHint'],
    contextStatus: ['label', 'on', 'off', 'manage'],
    contextScreen: ['title', 'heading', 'body', 'latestFive', 'notUsed', 'offKeepsEntries', 'doneBtn', 'loadError'],
    safety: ['heading', 'okBtn'],
  };

  for (const lang of ['en', 'hi']) {
    const mj = translations[lang].mindJournal;
    assert.ok(mj, `translations.${lang}.mindJournal must exist`);
    for (const key of FLAT_KEYS) {
      assert.equal(typeof mj[key], 'string', `translations.${lang}.mindJournal.${key} must be a string`);
      assert.ok(mj[key].length > 0, `translations.${lang}.mindJournal.${key} must not be empty`);
    }
    for (const [group, keys] of Object.entries(GROUPED_KEYS)) {
      assert.ok(mj[group], `translations.${lang}.mindJournal.${group} must exist`);
      for (const key of keys) {
        assert.equal(typeof mj[group][key], 'string', `translations.${lang}.mindJournal.${group}.${key} must be a string`);
        assert.ok(mj[group][key].length > 0, `translations.${lang}.mindJournal.${group}.${key} must not be empty`);
      }
    }
    for (const key of CONTEXT_TYPE_KEYS) {
      assert.equal(typeof mj.contextTypeHints[key], 'string', `translations.${lang}.mindJournal.contextTypeHints.${key}`);
      assert.ok(mj.contextTypeHints[key].length > 0);
    }
  }
});

test('translations.js: all 8 states and all 5 context types have English and Devanagari labels', () => {
  for (const key of STATE_KEYS) {
    assert.ok(translations.en.mindJournal.states[key]?.length, `English label missing for state "${key}"`);
    assert.match(translations.hi.mindJournal.states[key], DEVANAGARI_RE, `Hindi state label for "${key}" must be Devanagari`);
  }
  for (const key of CONTEXT_TYPE_KEYS) {
    assert.ok(translations.en.mindJournal.contextTypes[key]?.length, `English label missing for context type "${key}"`);
    assert.match(translations.hi.mindJournal.contextTypes[key], DEVANAGARI_RE, `Hindi context label for "${key}" must be Devanagari`);
  }
});

test('translations.js: Hindi Mind Journal copy is genuine Devanagari, not English left untranslated', () => {
  const hi = translations.hi.mindJournal;
  for (const key of ['title', 'subtitle', 'pickHint', 'recentHeading', 'emptyState', 'loadError', 'retryBtn', 'disclosure', 'takeForwardLabel']) {
    assert.match(hi[key], DEVANAGARI_RE, `translations.hi.mindJournal.${key} must contain Devanagari, got: ${hi[key]}`);
  }
  for (const [group, key] of [
    ['newReflection', 'cardTitle'], ['quickNote', 'saveBtn'], ['guided', 'whatHappened'],
    ['savedScreen', 'heading'], ['contextStatus', 'on'], ['contextScreen', 'heading'], ['safety', 'heading'],
  ]) {
    assert.match(hi[group][key], DEVANAGARI_RE, `translations.hi.mindJournal.${group}.${key} must contain Devanagari`);
  }
});

// ── Approved product copy ──────────────────────────────────────────────────

test('translations.js: the home description is the approved personal / score-free line', () => {
  assert.equal(
    translations.en.mindJournal.subtitle,
    'A personal, score-free place to notice what happened and what you want to carry forward.'
  );
});

test('translations.js: Mind Journal copy never makes the absolute claim "private"', () => {
  const walk = (node, trail) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        assert.doesNotMatch(value, /\bprivate\b/i, `${trail}.${key} must not claim the journal is "private": ${value}`);
        assert.doesNotMatch(value, /निजी/, `${trail}.${key} must not claim the journal is "private": ${value}`);
      } else if (value && typeof value === 'object') {
        walk(value, `${trail}.${key}`);
      }
    }
  };
  for (const lang of ['en', 'hi']) walk(translations[lang].mindJournal, `${lang}.mindJournal`);
});

test('no Mind Journal screen introduces scoring, ranking, streak or reward language', () => {
  for (const [name, source] of SCREENS) {
    assert.doesNotMatch(
      codeOnly(source),
      /chart|rating|streak|percentage|reward|confetti|xpEarned|fitnessLevel|avgPct|\d+\/100|score|badge|diagnos|profil|auto-prescri/i,
      `${name} must stay score-free and non-clinical`
    );
  }
});

// ── Screen 1: home ─────────────────────────────────────────────────────────

test('home: leads with the approved description and offers both ways in', () => {
  assert.match(home, /\{mj\.subtitle\}/);
  assert.match(home, /to="\/mind-journal\/new"/, 'the prominent New reflection card must open the guided flow');
  assert.match(home, /\{mj\.newReflection\.cardTitle\}/);
  assert.match(home, /to="\/mind-journal\/quick"/, 'the secondary Quick note action must open the quick-note screen');
  assert.match(home, /\{mj\.quickNote\.action\}/);
});

test('home: shows a compact Arjun-context status row linking to the context screen', () => {
  assert.match(home, /\{mj\.contextStatus\.label\}/);
  assert.match(home, /contextEnabled \? mj\.contextStatus\.on : mj\.contextStatus\.off/);
  assert.match(home, /to="\/mind-journal\/context"/);
});

test('home: renders loading, error, empty and populated states for recent reflections', () => {
  assert.match(home, /entries === null/, 'loading state');
  assert.match(home, /entries === false/, 'error state');
  assert.match(home, /entries\.length === 0/, 'empty state');
  assert.match(home, /entries\.map\(entry =>/, 'populated state');
  assert.match(home, /\{mj\.loadError\}/);
  assert.match(home, /\{mj\.emptyState\}/);
});

test('home: guided reflections show a translated context label, state tags, a preview and a distinct Take forward row', () => {
  const row = home.slice(home.indexOf('function EntryRow'), home.indexOf('export default function'));
  assert.match(row, /entry\.entryType === 'GUIDED_REFLECTION'/);
  assert.match(row, /mj\.contextTypes\[entry\.contextType\]/, 'the context type must be translated, never shown raw');
  assert.match(row, /entry\.states\.map\(k => mj\.states\[k\]\)/, 'state tags map through the translation table with no raw-key fallback');
  assert.match(row, /guidedPreview\(entry\)/, 'the preview must use the agreed field precedence');
  assert.match(row, /isGuided && entry\.takeForward/, 'Take forward gets its own row when present');
  assert.match(row, /\{mj\.takeForwardLabel\}/);
});

test('home: quick notes and legacy rows render as a quick note, with no empty guided sections', () => {
  const row = home.slice(home.indexOf('function EntryRow'), home.indexOf('export default function'));
  // Legacy rows have entryType null, so they take the same branch as an
  // explicit QUICK_NOTE — states, the note, and nothing guided.
  assert.match(row, /isGuided \? guidedPreview\(entry\) : entry\.note/);
  assert.match(row, /: mj\.quickNote\.tag/, 'a non-guided row is labelled as a quick note');
  // The guided sections are inside `isGuided` guards, so they cannot render
  // as empty scaffolding for a legacy row.
  assert.doesNotMatch(row, /\{mj\.guided\./, 'a list row must never surface guided prompt labels');
});

test('home: recent rows are inert — no chevron, overflow menu, edit or delete affordance', () => {
  const row = home.slice(home.indexOf('function EntryRow'), home.indexOf('export default function'));
  assert.doesNotMatch(row, /Chevron|MoreVertical|MoreHorizontal|Trash|Pencil|Edit/, 'rows must not imply an action that does not exist');
  assert.doesNotMatch(row, /<Link|onClick=/, 'rows must not look or behave as if they open a detail screen');
  assert.doesNotMatch(home, /mind-journal\/\$\{entry\.id\}/, 'the single-entry route does not exist yet');
});

test('home: never writes — it reads entries and reports the context flag only', () => {
  assert.doesNotMatch(home, /method: 'POST'/, 'creation happens on the dedicated screens');
  assert.doesNotMatch(home, /method: 'PATCH'/);
  assert.doesNotMatch(home, /method: 'DELETE'/);
  assert.doesNotMatch(home, /\/api\/mental-fitness/, 'must never call the legacy scored endpoint');
});

// ── Screen 2: quick note ───────────────────────────────────────────────────

test('quick note: posts the QUICK_NOTE shape with 1-2 states and an optional note', () => {
  const save = handlerBody(quick, 'handleSave');
  assert.match(save, /entryType: 'QUICK_NOTE'/);
  assert.match(save, /states: selected/);
  assert.match(save, /note: textOrUndefined\(note\)/, 'an empty note must be omitted, not sent as an empty string');
  assert.doesNotMatch(save, /contextType|whatHappened|whatNoticed|helpedOrGotInWay|takeForward/, 'guided fields are rejected on a quick note');
  assert.match(quick, /const canSave = selected\.length > 0 && !saving;/, 'at least one state, and no double submit');
  assert.match(quick, /disabled=\{!canSave\}/);
});

test('quick note: bounds the note at 500 characters and shows a live counter', () => {
  assert.match(quick, /maxLength=\{MAX_NOTE_LENGTH\}/);
  assert.match(quick, /e\.target\.value\.slice\(0, MAX_NOTE_LENGTH\)/);
  assert.match(quick, /\{note\.length\}\/\{MAX_NOTE_LENGTH\}/);
});

test('quick note: shows the approved prompt, the eight states, and the personal / score-free disclosure', () => {
  assert.match(quick, /\{qn\.prompt\}/);
  assert.match(quick, /<StateChips/);
  assert.match(quick, /\{mj\.pickHint\}/);
  assert.match(quick, /\{mj\.disclosure\}/);
});

// ── Screens 3 & 4: guided reflection ───────────────────────────────────────

test('guided step 1: context type is required and single-select; states stay optional', () => {
  assert.match(step1, /<ContextTypeCards value=\{contextType\} onChange=\{setContextType\}/);
  assert.match(shared, /CONTEXT_TYPE_KEYS\.map\(key =>/, 'context options render as structured cards');
  assert.match(shared, /onClick=\{\(\) => onChange\(key\)\}/, 'single-select, not a toggle list');
  assert.match(shared, /aria-pressed=\{isSelected\}/);
  assert.match(shared, /\{mj\.contextTypes\[key\]\}/, 'context labels must be translated');
  assert.match(shared, /\{mj\.contextTypeHints\[key\]\}/, 'each context card carries a one-line explanation');
  assert.match(step1, /disabled=\{!contextType\}/, 'Continue is blocked until a context type is picked');
  assert.match(step1, /\{g\.statesHint\}/, 'states are labelled optional here');
  assert.match(step1, /\{g\.switchToQuick\}/, 'athletes can switch to the quick-note path');
});

test('guided step 1: hands its answers to step 2 and writes nothing itself', () => {
  assert.match(step1, /navigate\('\/mind-journal\/new\/details', \{ state: \{ contextType, states: selected \} \}\)/);
  assert.doesNotMatch(step1, /apiFetch|method: 'POST'/, 'step 1 must not persist anything');
});

test('guided step 2: renders the four prompts at the server bounds', () => {
  for (const [label, bound] of [
    ['g.whatHappened', 'MAX_WHAT_HAPPENED_LENGTH'],
    ['g.whatNoticed', 'MAX_WHAT_NOTICED_LENGTH'],
    ['g.helpedOrGotInWay', 'MAX_HELPED_OR_GOT_IN_WAY_LENGTH'],
    ['g.takeForward', 'MAX_TAKE_FORWARD_LENGTH'],
  ]) {
    assert.ok(step2.includes(`label={${label}}`), `${label} prompt must be rendered`);
    assert.ok(step2.includes(`maxLength={${bound}}`), `${label} must be bounded by ${bound}`);
  }
  assert.match(step2, /\{value\.length\}\/\{maxLength\}/, 'each prompt shows a live counter');
});

test('guided step 2: posts the GUIDED_REFLECTION shape and never sends a note', () => {
  const save = handlerBody(step2, 'handleSave');
  assert.match(save, /entryType: 'GUIDED_REFLECTION'/);
  assert.match(save, /contextType,/);
  assert.match(save, /states,/);
  for (const field of ['whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'takeForward']) {
    assert.ok(save.includes(`${field}: textOrUndefined(${field})`), `${field} must be trimmed and omitted when empty`);
  }
  assert.doesNotMatch(save, /\bnote:/, 'the server rejects a note on a guided reflection');
});

test('guided step 2: mirrors the server rule that a reflection needs one state or one answer', () => {
  assert.match(step2, /const written = \[whatHappened, whatNoticed, helpedOrGotInWay, takeForward\]\.some\(v => v\.trim\(\)\.length > 0\);/);
  assert.match(step2, /const hasContent = states\.length > 0 \|\| written;/);
  assert.match(step2, /const canSave = hasContent && !saving;/);
  assert.match(step2, /\{g\.needSomething\}/, 'the rule is explained rather than left as a dead button');
});

test('guided step 2: recovers a direct hit, and preserves step 1 answers when going back', () => {
  assert.match(step2, /if \(!contextType\) return <Navigate to="\/mind-journal\/new" replace \/>;/);
  assert.match(step2, /navigate\('\/mind-journal\/new', \{ state: \{ contextType, states \}, replace: true \}\)/);
  assert.match(step1, /const draft = location\.state \|\| \{\};/, 'step 1 must re-seed from the handed-back state');
  assert.match(step1, /useState\(draft\.contextType \|\| null\)/);
  assert.match(step1, /useState\(draft\.states \|\| \[\]\)/);
});

test('guided step 2: only a real created entry advances to the saved screen', () => {
  assert.match(step2, /if \(entry\) navigate\(`\/mind-journal\/saved\/\$\{entry\.id\}`, \{ state: \{ entry \}, replace: true \}\)/);
});

// ── Safety ─────────────────────────────────────────────────────────────────

test('a safety-flagged submission replaces the form with guidance and helplines, never a save confirmation', () => {
  assert.match(shared, /data\?\.safetyFlag === 'needs_support'/);
  assert.match(shared, /setSafety\(\{ guidance: data\.guidance \|\| null \}\)/, 'wrapped so a flag with no guidance text still shows the screen');
  const flagIdx = shared.indexOf("data?.safetyFlag === 'needs_support'");
  const successIdx = shared.indexOf('return data?.entry');
  assert.ok(flagIdx !== -1 && successIdx !== -1 && flagIdx < successIdx, 'the safety branch must be checked before the success path');

  assert.match(shared, /import HelplineList from '\.\.\/\.\.\/components\/HelplineList'/);
  const card = shared.slice(shared.indexOf('export function SafetyGuidanceCard'), shared.indexOf('export function useMindJournalSave'));
  assert.match(card, /<HelplineList \/>/);
  assert.match(card, /\{mj\.safety\.heading\}/);
  assert.doesNotMatch(card, /\{mj\.saved\}/, 'the safety screen must never read as a successful save');

  for (const [name, source] of [['QuickNotePage', quick], ['GuidedReflectionDetailsPage', step2]]) {
    assert.match(source, /safety \? \(\s*<SafetyGuidanceCard/, `${name} must show guidance instead of the form when flagged`);
  }
});

test('both writing screens surface saving / failed states from translations, with retry', () => {
  for (const [name, source] of [['QuickNotePage', quick], ['GuidedReflectionDetailsPage', step2]]) {
    assert.match(source, /<SaveStatus/, `${name} must use the shared save indicator`);
    assert.match(source, /state=\{saving \? 'saving' : saveError \? 'error' : 'idle'\}/, `${name} save states`);
    assert.match(
      source,
      /labels=\{\{ saving: mj\.saving, saved: mj\.saved, saveFailed: saveError, retry: mj\.retry \}\}/,
      `${name} must keep the specific error rather than flattening it`
    );
  }
  assert.match(shared, /setSaveError\(data\?\.error \|\| mj\.errorGeneric\)/, 'server error');
  assert.match(shared, /setSaveError\(mj\.errorNetwork\)/, 'network error');
});

test('language never changes what is submitted — payloads carry internal keys only', () => {
  for (const [name, source] of [['QuickNotePage', quick], ['GuidedReflectionDetailsPage', step2]]) {
    const save = handlerBody(source, 'handleSave');
    assert.doesNotMatch(save, /mj\.states|mj\.contextTypes|translations/, `${name} must never send translated label text`);
  }
  assert.match(step1, /navigate\('\/mind-journal\/new\/details', \{ state: \{ contextType, states: selected \} \}\)/);
});

// ── Screen 5: reflection saved ─────────────────────────────────────────────

test('saved screen: quiet confirmation, showing Take forward when there is one', () => {
  assert.match(savedScreen, /\{saved\.heading\}/);
  assert.match(savedScreen, /\{saved\.body\}/);
  assert.match(savedScreen, /entry\.takeForward &&/);
  assert.match(savedScreen, /\{mj\.takeForwardLabel\}/);
  assert.match(savedScreen, /\{saved\.doneBtn\}/);
  assert.match(savedScreen, /\{saved\.viewBtn\}/);
  assert.match(savedScreen, /data-testid="mj-saved-summary"/);
  assert.match(savedScreen, /navigate\('\/mind-journal', \{ replace: true \}\)/);
});

test('saved screen: a direct hit with no saved entry returns to the journal instead of claiming a save', () => {
  assert.match(savedScreen, /const entry = location\.state\?\.entry;/);
  assert.match(savedScreen, /if \(!entry\) return <Navigate to="\/mind-journal" replace \/>;/);
  assert.doesNotMatch(savedScreen, /apiFetch/, 'there is no single-entry read on the server to call');
});

// ── Screen 6: Arjun context ────────────────────────────────────────────────

test('context screen: opt-in defaults to off, reflects the server value, and never uses localStorage', () => {
  assert.match(contextScreen, /const \[contextEnabled, setContextEnabled\] = useState\(false\);/);
  assert.match(contextScreen, /setContextEnabled\(!!data\.contextEnabled\)/);
  assert.match(contextScreen, /checked=\{contextEnabled\}/);
  assert.doesNotMatch(contextScreen, /localStorage/, 'the preference is server state, never local');
});

test('context screen: toggling PATCHes the context route and reverts on failure', () => {
  const toggle = contextScreen.slice(contextScreen.indexOf('async function handleContextToggle'));
  assert.match(toggle, /'\/api\/mind-journal\/context'/);
  assert.match(toggle, /method: 'PATCH'/);
  assert.match(toggle, /setContextEnabled\(previous\)/, 'must restore the previous value on failure');
  assert.match(toggle, /setContextError\(true\)/, 'must tell the athlete it did not save');
});

test('context screen: explains the restricted use, and states it is never used to score or prescribe', () => {
  assert.match(contextScreen, /\{cx\.body\}/);
  assert.match(contextScreen, /\{cx\.notUsed\}/);
  assert.match(translations.en.mindJournal.contextLabel, /latest 5 Mind Journal entries/);
  assert.match(contextScreen, /\{cx\.loadError\}/, 'the setting has its own load-error state');
});

// ── Routing ────────────────────────────────────────────────────────────────

test('App.jsx: all six Mind Journal routes exist and are onboarding-protected', () => {
  const ROUTES = [
    ['/mind-journal', 'MindJournalPage'],
    ['/mind-journal/quick', 'QuickNotePage'],
    ['/mind-journal/new', 'GuidedReflectionPage'],
    ['/mind-journal/new/details', 'GuidedReflectionDetailsPage'],
    ['/mind-journal/context', 'ArjunContextPage'],
    ['/mind-journal/saved/:id', 'ReflectionSavedPage'],
  ];
  for (const [routePath, component] of ROUTES) {
    const idx = app.indexOf(`path="${routePath}"`);
    assert.ok(idx !== -1, `route ${routePath} must be registered`);
    const block = app.slice(idx, idx + 260);
    assert.match(block, /<ProtectedRoute requireOnboarding=\{true\}>/, `${routePath} must stay behind onboarding`);
    assert.ok(block.includes(`<${component} />`), `${routePath} must render ${component}`);
  }
});

test('App.jsx: every literal Mind Journal segment is declared before the dynamic route', () => {
  const dynamicIdx = app.indexOf('path="/mind-journal/saved/:id"');
  for (const literal of ['/mind-journal/quick', '/mind-journal/new', '/mind-journal/new/details', '/mind-journal/context']) {
    assert.ok(app.indexOf(`path="${literal}"`) < dynamicIdx, `${literal} must be declared before the dynamic route`);
  }
});

test('App.jsx: the single-entry route is not added in this PR, and Mind Journal stays full screen', () => {
  assert.doesNotMatch(app, /path="\/mind-journal\/:id"/, 'the detail route belongs to a later change');
  // None of these routes are wrapped in the BottomNav layout — they are
  // declared as bare full-screen routes, matching the original.
  const idx = app.indexOf('path="/mind-journal"');
  const block = app.slice(idx, app.indexOf('path="/mental-fitness"'));
  assert.doesNotMatch(block, /BottomNav/, 'Mind Journal screens stay full screen');
});

test('App.jsx: /mental-fitness still redirects to /mind-journal, and the old scored page stays unreachable', () => {
  const idx = app.indexOf('path="/mental-fitness"');
  assert.match(app.slice(idx, idx + 150), /<Navigate to="\/mind-journal" replace \/>/);
  assert.doesNotMatch(app, /MentalFitnessCheckin/);
});

test('Dashboard.jsx: the visible check-in link still opens Mind Journal, unchanged by this PR', () => {
  assert.match(dashboard, /to="\/mind-journal"/);
  assert.doesNotMatch(dashboard, /to="\/mental-fitness"/);
});

// ── Visual structure (polish pass) ─────────────────────────────────────────

test('home: hero, quick-note, context row and recent reflection sections are present', () => {
  assert.match(home, /data-testid="mj-hero-new"/);
  assert.match(home, /variant="hero"/);
  assert.match(home, /data-testid="mj-quick-note"/);
  assert.match(home, /data-testid="mj-context-row"/);
  assert.match(home, /data-testid="mj-recent-section"/);
  assert.match(home, /data-testid="mj-reflection-card"/);
  assert.match(home, /elevation-card|elevation-hero|elevation-row/);
  assert.doesNotMatch(home, /BottomNav/);
});

test('guided step 2: exposes four distinct prompt sections with live counters', () => {
  assert.match(step2, /testId="mj-prompt-what-happened"/);
  assert.match(step2, /testId="mj-prompt-what-noticed"/);
  assert.match(step2, /testId="mj-prompt-helped"/);
  assert.match(step2, /testId="mj-prompt-take-forward"/);
  assert.match(step2, /data-testid="mj-summary-pills"/);
  assert.match(step2, /<StepProgress/);
});

test('Mind Journal screens use semantic light/dark tokens rather than hardcoded page whites', () => {
  for (const [name, source] of SCREENS) {
    assert.match(source, /bg-dark-900/, `${name} must use the page token`);
    assert.match(source, /text-ink|text-slt/, `${name} must use semantic text tokens`);
    assert.doesNotMatch(
      codeOnly(source),
      /min-h-screen\s+bg-white|min-h-screen\s+bg-\[#fff/i,
      `${name} must not hardcode a white page fill`
    );
  }
});

test('no Mind Journal screen mentions BottomNav, and copy stays free of streak/XP reward language', () => {
  for (const [name, source] of SCREENS) {
    assert.doesNotMatch(source, /BottomNav/, `${name} stays full-screen`);
    assert.doesNotMatch(
      codeOnly(source),
      /xp\b|streak|confetti|badge|level up/i,
      `${name} must not introduce reward language`
    );
  }
});
