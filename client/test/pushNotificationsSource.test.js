// Push Notifications v1 — source-level checks: translations parity,
// AccountPage wiring, Privacy page disclosure, forbidden-language
// boundary, and env-var scaffolding. Same source-text pattern used
// throughout this suite (node:test can't run JSX without a transform).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const translations = read('src/i18n/translations.js');
const accountPage = read('src/pages/AccountPage.jsx');
const privacyPage = read('src/pages/PrivacyPage.jsx');
const authContext = read('src/contexts/AuthContext.jsx');
const usePushNotifications = read('src/hooks/usePushNotifications.js');
const clientEnvExample = read('.env.example');

// ── EN/HI parity for the pushNotifications namespace (account.pushNotifications) ──

function namespaceBlock(lang, name) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const accountIdx = translations.indexOf('account: {', langIdx);
  const start = translations.indexOf(`${name}: {`, accountIdx);
  assert.ok(start !== -1, `missing ${name} namespace nested in ${lang}.account`);
  return translations.slice(start, translations.indexOf('\n      },', start));
}
const keysOf = (block) => [...block.matchAll(/^\s{8}([a-zA-Z]+):/gm)].map((m) => m[1]).sort();

test('account.pushNotifications namespace has identical keys in English and Hindi', () => {
  assert.deepEqual(
    keysOf(namespaceBlock('en', 'pushNotifications')),
    keysOf(namespaceBlock('hi', 'pushNotifications'))
  );
});

test('every required pushNotifications string is present in both languages', () => {
  const required = [
    'title', 'unsupported', 'iosUnsupported',
    'consentRequiredTitle', 'consentRequiredBody',
    'promptTitle', 'promptBody', 'enableBtn', 'enabling',
    'deniedTitle', 'deniedBody',
    'onLabel', 'reminderTimeLabel', 'timezoneNote',
    'turnOffBtn', 'turningOff', 'savedTime', 'error',
  ];
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang, 'pushNotifications');
    for (const key of required) {
      assert.match(block, new RegExp(`^\\s{8}${key}:`, 'm'), `${lang}.account.pushNotifications.${key} is missing`);
    }
  }
});

test('the Hindi side of pushNotifications is actually written in Hindi', () => {
  assert.match(namespaceBlock('hi', 'pushNotifications'), /[ऀ-ॿ]/);
});

// ── Forbidden-language boundary (no guilt/streak/shame framing anywhere in the copy) ──

const FORBIDDEN_PHRASES = [
  /haven'?t trained/i,
  /lose your streak/i,
  /you seem nervous/i,
  /miss(ed)? (a )?day/i,
  /don'?t break/i,
];

test('pushNotifications copy (EN + HI) never uses guilt/streak/shame framing', () => {
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang, 'pushNotifications');
    for (const re of FORBIDDEN_PHRASES) {
      assert.doesNotMatch(block, re, `found forbidden phrasing (${re}) in ${lang}.account.pushNotifications`);
    }
  }
});

// ── AccountPage wiring ──────────────────────────────────────────────────

test('AccountPage imports and renders the Notifications section via usePushNotifications', () => {
  assert.match(accountPage, /import\s*\{\s*usePushNotifications/);
  assert.match(accountPage, /usePushNotifications\(\)/);
  assert.match(accountPage, /tpush\.title/);
});

test('AccountPage renders all required Notifications states', () => {
  for (const status of ["'unsupported'", "'ios-unsupported'", "'consent-required'", "'denied'", "'enabled'"]) {
    assert.match(accountPage, new RegExp(`push\\.status === ${status}`));
  }
});

test('AccountPage never requests browser notification permission itself — only the hook, only from an explicit tap', () => {
  assert.doesNotMatch(accountPage, /Notification\.requestPermission/);
  assert.match(accountPage, /onClick=\{\(\) => push\.enable\(/);
});

// ── Privacy page disclosure ─────────────────────────────────────────────

test('Privacy page discloses push notifications: optional, performance-focused, no journal/reflection content, disable anytime', () => {
  assert.match(privacyPage, /Push notifications/i);
  assert.match(privacyPage, /optional/i);
  assert.match(privacyPage, /never contains your journal entries, coaching conversations, reflections/i);
  assert.match(privacyPage, /turn (notifications )?off/i);
});

// ── AuthContext logout: current-device subscription disable ─────────────

test('logout() disables THIS device\'s push subscription server-side, never revokes browser permission, before clearing the token', () => {
  const logoutStart = authContext.indexOf('async function logout()');
  assert.ok(logoutStart !== -1, 'logout must be async to await the best-effort unsubscribe call before token clearing');
  const clearIdx = authContext.indexOf("localStorage.removeItem('mg_token')", logoutStart);
  const unsubIdx = authContext.indexOf('/api/push-notifications/unsubscribe', logoutStart);
  assert.ok(unsubIdx !== -1 && unsubIdx < clearIdx, 'the unsubscribe call must happen before the token is cleared');
  assert.doesNotMatch(authContext, /Notification\.requestPermission|Notification\.permission\s*=/);
});

// ── Service worker domain / env scaffolding ──────────────────────────────

test('usePushNotifications never hand-registers a service worker — it only uses the existing registration', () => {
  assert.doesNotMatch(usePushNotifications, /navigator\.serviceWorker\.register\(/);
  assert.match(usePushNotifications, /navigator\.serviceWorker\.ready/);
});

test('client/.env.example documents VITE_VAPID_PUBLIC_KEY with no real secret value', () => {
  assert.match(clientEnvExample, /VITE_VAPID_PUBLIC_KEY=/);
  assert.doesNotMatch(clientEnvExample, /VITE_VAPID_PUBLIC_KEY=BE[A-Za-z0-9_-]{40,}/); // not a real-looking key
});
