// Modernization pass: Mind Journal's entry point on Mental Playbook was
// removed entirely — Mind Journal remains reachable from Home only. This
// file is the focused, single-purpose guarantee for that removal; the
// broader Playbook redesign guarantees (section order, per-section
// behaviour) live in playbookHierarchy.test.js / playbookOutcomes.test.js,
// and Mind Journal's own routes/functionality are covered by
// mindJournalLinks.test.js, mindJournalPage.test.js and the
// mindJournal*.dom.test.jsx suites — none of which this pass touches.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const playbook = read('src/pages/PlaybookPage.jsx');
const app = read('src/App.jsx');
const dashboard = read('src/pages/Dashboard.jsx');
const mindJournal = read('src/pages/MindJournalPage.jsx');
const translations = read('src/i18n/translations.js');

function playbookNamespace(lang) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translations.indexOf('playbook: {', langIdx);
  assert.ok(start !== -1, `missing playbook namespace in ${lang}`);
  return translations.slice(start, translations.indexOf('\n    },', start));
}

// ── 1. No Mind Journal entry point anywhere in Playbook's source ───────────

test('PlaybookPage: carries no separate Mind Journal card — its only Mind Journal link is the Reflections action', () => {
  // Mind Journal keeps ONE prominent entry point, on Home. Playbook must not
  // grow a second Mind Journal card of its own.
  assert.doesNotMatch(playbook, /journalTitle|journalDesc/);
  // PR 2 cutover: Reflections is a Mind Journal action now, not a /debrief
  // one — that single navigation is the only Mind Journal route here.
  assert.doesNotMatch(playbook, /\/debrief/);
  const journalLinks = playbook.match(/navigate\('\/mind-journal[^']*'\)/g) || [];
  assert.equal(journalLinks.length, 1, 'exactly one Mind Journal navigation — the Reflections action');
  assert.equal(journalLinks[0], "navigate('/mind-journal/new')");
});

// ── 2. The now-unused playbook.journalTitle/journalDesc copy is gone ───────

test('the `playbook` translation namespace no longer carries journalTitle/journalDesc in either language', () => {
  for (const lang of ['en', 'hi']) {
    const ns = playbookNamespace(lang);
    assert.doesNotMatch(ns, /journalTitle:|journalDesc:/, `${lang}.playbook must not carry the removed Mind Journal copy`);
  }
});

// ── 3. Mind Journal itself is untouched: still routed, still on Home ───────

test('Mind Journal keeps its own route and Home entry point — only the Playbook entry point was removed', () => {
  assert.match(app, /path="\/mind-journal"/, 'the /mind-journal route must still exist in App.jsx');
  // Homepage-priority pass: Home's card now opens Mind Journal via the
  // shared TrainGradientCard's onClick + navigate(), not a <Link to>.
  assert.match(dashboard, /to="\/mind-journal"|navigate\('\/mind-journal'\)/, 'Home must still link to Mind Journal');
  // Home's OWN journalTitle/journalHeading/journalValue live in the
  // separate `home` namespace and are untouched by removing Playbook's
  // journalTitle/journalDesc from the `playbook` namespace.
  assert.match(dashboard, /journalTitle/);
  assert.match(dashboard, /journalHeading/);
});

test('MindJournalPage itself is functionally untouched by the Playbook redesign', () => {
  // A light smoke check that the page still renders its own title through
  // its own namespace — the real behavioural coverage lives in the
  // dedicated mindJournal* test files, which this pass does not modify.
  assert.match(mindJournal, /mj\.title/);
});
