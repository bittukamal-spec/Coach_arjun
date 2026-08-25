// Pilot Communications v1 — EN/HI parity for the fixed athlete-facing UI
// strings (Not now / Submit / Dismiss-Close / Thanks / response-control
// labels). Same namespaceBlock/keysOf technique as
// stageIQualitySweep.test.js's own key-parity checks.
//
// Founder-authored communication title/body/CTA-label/survey-option text is
// deliberately NOT covered here — it is displayed exactly as entered, in
// every language, by design (see PilotCommunicationPopup.jsx).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const translations = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');
const popup = readFileSync(path.join(root, 'src/components/pilotCommunications/PilotCommunicationPopup.jsx'), 'utf8');
const dashboard = readFileSync(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8');

function namespaceBlock(lang) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translations.indexOf('pilotCommunications: {', langIdx);
  assert.ok(start !== -1, `missing pilotCommunications namespace in ${lang}`);
  return translations.slice(start, translations.indexOf('\n    },', start));
}
const keysOf = (block) => [...block.matchAll(/^\s{6}([a-zA-Z]+):/gm)].map((m) => m[1]).sort();

test('pilotCommunications namespace has identical keys in English and Hindi', () => {
  assert.deepEqual(keysOf(namespaceBlock('en')), keysOf(namespaceBlock('hi')));
});

test('every required athlete-facing control string is present: close, notNow, submit, done, thanks, yes/somewhat/no, ratingAria', () => {
  const required = ['close', 'notNow', 'submit', 'done', 'thanks', 'submitError', 'yes', 'somewhat', 'no', 'ratingAria'];
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang);
    for (const key of required) {
      assert.match(block, new RegExp(`^\\s{6}${key}:`, 'm'), `${lang}.pilotCommunications.${key} is missing`);
    }
  }
});

test('the Hindi side is actually written in Hindi (carries Devanagari copy)', () => {
  assert.match(namespaceBlock('hi'), /[ऀ-ॿ]/);
});

test('the English side carries no Devanagari (no accidental copy-paste from the Hindi block)', () => {
  assert.doesNotMatch(namespaceBlock('en'), /[ऀ-ॿ]/);
});

test('PilotCommunicationPopup reads every fixed string through translations.js — no inline bilingual literal', () => {
  assert.doesNotMatch(popup, /language === 'hi' \? ['"]/, 'no inline bilingual ternary for copy');
  assert.match(popup, /translations\[language\]/);
});

test('Dashboard mounts the popup once, without altering its own no-skeleton contract', () => {
  assert.match(dashboard, /<PilotCommunicationPopup\s*\/>/);
  assert.equal((dashboard.match(/<PilotCommunicationPopup/g) || []).length, 1);
});
