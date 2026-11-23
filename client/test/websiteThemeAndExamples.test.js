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

test('every tool shows a filled-in example for the athlete\'s sport', () => {
  assert.match(read('components/practice/PracticeShell.jsx'), /<ExampleCard example=\{example\}/);
  assert.match(read('pages/SelfTalkPage.jsx'), /toolExamples\(user\?\.sport\)\.selfTalk/);
  assert.match(read('pages/MentalRepPage.jsx'), /toolExamples\(user\?\.sport\)\.warmUp/);
  assert.match(read('pages/BodyResetPage.jsx'), /toolExamples\(user\?\.sport\)\.reset/);
  assert.match(read('pages/RitualPage.jsx'), /toolExamples\(user\?\.sport\)\.routine/);
  assert.match(read('pages/MindJournalPage.jsx'), /toolExamples\(user\?\.sport\)\.journal/);
});

test('chat openers and the Home journal line follow the sport', () => {
  assert.match(read('pages/ChatPage.jsx'), /chatExamples\(user\?\.sport\)/);
  assert.match(read('pages/Dashboard.jsx'), /journalLines\(user\?\.sport\)/);
});

test('no "Continue with Arjun" step when there is no chat yet', () => {
  const chat = read('pages/ChatPage.jsx');
  assert.match(chat, /if \(sessionsOk && !consentPending && !limitReached\)/);
  assert.match(chat, /await handleContinueMain\(\);/);
});
