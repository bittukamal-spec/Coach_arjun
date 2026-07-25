// Source-text guarantees for the Starting Performance Profile screen (PR 3):
// translation parity, no hardcoded athlete-facing copy, and the retirement of
// the old profile-intro experience on the client.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = (p) => readFileSync(path.join(__dirname, '../src', p), 'utf8');
const page = src('pages/StartingProfilePage.jsx');
const hook = src('hooks/useStartingProfile.js');
const translations = src('i18n/translations.js');

function namespaceBlock(lang) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translations.indexOf('startingProfile: {', langIdx);
  assert.ok(start !== -1, `missing startingProfile namespace in ${lang}`);
  return translations.slice(start, translations.indexOf('\n    },', start));
}
const keysOf = (block) => [...block.matchAll(/^\s{6}([a-zA-Z]+):/gm)].map((m) => m[1]);

test('the startingProfile namespace exists in both languages with identical keys', () => {
  const en = keysOf(namespaceBlock('en'));
  const hi = keysOf(namespaceBlock('hi'));
  assert.ok(en.length > 20, 'expected the full namespace');
  assert.deepEqual([...en].sort(), [...hi].sort());
});

test('the Hindi namespace is actually written in Hindi', () => {
  assert.match(namespaceBlock('hi'), /[ऀ-ॿ]/);
});

test('every athlete-facing string on the page comes from translations, not hardcoded JSX', () => {
  // No bare sentence-like text nodes between tags.
  const textNodes = [...page.matchAll(/>\s*([A-Z][a-z]+ [a-z][^<{}]{8,})</g)].map((m) => m[1]);
  assert.deepEqual(textNodes, [], `hardcoded copy found: ${textNodes.join(' | ')}`);
});

test('the page renders exactly the four profile sections the server sends', () => {
  for (const k of ['whatMatters', 'possiblePattern', 'whatHelps', 'whereWeBegin']) {
    assert.match(page, new RegExp(`s\\.${k}`), `missing section ${k}`);
  }
});

test('the page never invents an interpretation of its own — it only renders server sections', () => {
  assert.doesNotMatch(page, /anthropic|messages\.create/i);
  assert.match(page, /profile\.sections/);
});

test('the three fit answers are the only fit values sent to the server', () => {
  const fits = [...page.matchAll(/setFit\('([A-Z_]+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(fits, ['CONFIRMED', 'NOT_REALLY', 'PARTLY']);
});

test('corrections are limited to the athlete\'s own options plus their own words, with the shared text limit', () => {
  assert.match(page, /profile\?\.priorityOptions/);
  assert.match(page, /const CORRECTION_MAX = 120;/);
  assert.match(page, /isValidCustomText\(correctionText, CORRECTION_MAX\)/);
});

test('the hook talks to the three profile endpoints and nothing else', () => {
  const paths = [...hook.matchAll(/apiFetch\('([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(paths, ['/api/profile/confirm', '/api/profile/start-chat', '/api/profile/starting']);
});

test('the retired mental-game profile page is gone from the client', () => {
  assert.equal(existsSync(path.join(__dirname, '../src/pages/MentalGameProfilePage.jsx')), false);
  assert.doesNotMatch(src('App.jsx'), /MentalGameProfilePage/);
  assert.doesNotMatch(src('pages/AccountPage.jsx'), /to="\/mental-game-profile"/);
});
