import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('the public website is always light, separate from the app theme', () => {
  const comp = read('components/WebsiteLightTheme.jsx');
  for (const path of ["'/'", "'/auth'", "'/premium'", "'/plans'", "'/contact'", "'/privacy'"]) {
    assert.ok(comp.includes(path), `${path} is a website page`);
  }
  assert.match(comp, /setAttribute\('data-theme', 'light'\)/);
  assert.match(comp, /return restoreAppTheme/);
  assert.match(read('App.jsx'), /<WebsiteLightTheme \/>/);
});

test('every tool shows a filled-in example', () => {
  assert.match(read('components/practice/PracticeShell.jsx'), /<ExampleCard example=\{example\}/);
  assert.match(read('pages/SelfTalkPage.jsx'), /examples\.selfTalk/);
  assert.match(read('pages/MentalRepPage.jsx'), /examples\.warmUp/);
  assert.match(read('pages/BodyResetPage.jsx'), /examples\.reset/);
  assert.match(read('pages/RitualPage.jsx'), /examples\.routine/);
  assert.match(read('pages/MindJournalPage.jsx'), /examples\.journal/);
});
