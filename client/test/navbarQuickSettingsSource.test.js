// Home quick-settings discoverability — source-level checks: the avatar
// chevron indicator, the Notifications row as a direct toggle (not a
// shortcut), no duplicated permission/toggle logic, and EN/HI translation
// parity. Same source-text pattern used throughout this suite (node:test
// can't run JSX without a transform).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const navbar = read('src/components/Navbar.jsx');
const translations = read('src/i18n/translations.js');

// Strips JSX `{/* … */}` blocks and `//` lines, so a "never duplicates
// this logic" assertion can't be satisfied or broken by explanatory prose
// in a comment — same technique used throughout this suite.
function stripComments(s) {
  return s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}
const navbarCode = stripComments(navbar);

// ── 1. Avatar/menu discoverability (unchanged by this follow-up) ───────

test('Navbar renders a chevron indicator beside the avatar trigger, using the existing icon library', () => {
  assert.match(navbar, /import\s*\{[^}]*ChevronDown[^}]*\}\s*from\s*'lucide-react'/);
  assert.match(navbar, /<ChevronDown/);
});

test('the chevron is decorative (aria-hidden) — aria-expanded on the button is the real accessibility signal, not the icon', () => {
  const chevronIdx = navbar.indexOf('<ChevronDown');
  const chevronTag = navbar.slice(chevronIdx, navbar.indexOf('/>', chevronIdx));
  assert.match(chevronTag, /aria-hidden="true"/);
  assert.match(navbar, /aria-expanded=\{menuOpen\}/);
});

test('the avatar and chevron share one button — one tap target, not two separate controls', () => {
  const btnStart = navbar.indexOf('onClick={() => setMenuOpen(v => !v)}');
  assert.ok(btnStart !== -1);
  const btnOpenTag = navbar.lastIndexOf('<button', btnStart);
  const btnCloseTag = navbar.indexOf('</button>', btnStart);
  const buttonSource = navbar.slice(btnOpenTag, btnCloseTag);
  assert.match(buttonSource, /bg-brand-500/); // the avatar circle
  assert.match(buttonSource, /<ChevronDown/);
});

// ── 2/5. Menu order: Language, Theme, Notifications, Settings ──────────

test('the quick-settings menu order is Language, Theme, Notifications, Settings', () => {
  const languageIdx = navbar.indexOf('{t.language}');
  const themeIdx = navbar.indexOf('{t.theme}');
  const notificationsIdx = navbar.indexOf('{t.notifications}');
  const settingsIdx = navbar.indexOf('{t.settings}');
  assert.ok(languageIdx !== -1 && themeIdx !== -1 && notificationsIdx !== -1 && settingsIdx !== -1);
  assert.ok(languageIdx < themeIdx, 'Language must come before Theme');
  assert.ok(themeIdx < notificationsIdx, 'Theme must come before Notifications');
  assert.ok(notificationsIdx < settingsIdx, 'Notifications must come before Settings');
});

// ── 3. Notifications row is now a direct toggle, not a shortcut ────────

test('the Notifications row is a switch, not a button that navigates', () => {
  const rowStart = navbar.lastIndexOf('<div', navbar.indexOf('{t.notifications}'));
  const rowEnd = navbar.indexOf('{push.error &&', rowStart);
  const rowSource = navbar.slice(rowStart, rowEnd);
  assert.match(rowSource, /type="checkbox"/);
  assert.match(rowSource, /role="switch"/);
  assert.match(rowSource, /checked=\{pushOn\}/);
});

test('the Notifications row never navigates anywhere — no /account#notifications, no navigate() call near it', () => {
  assert.doesNotMatch(navbar, /\/account#notifications/);
  const rowStart = navbar.lastIndexOf('<div', navbar.indexOf('{t.notifications}'));
  const rowEnd = navbar.indexOf('{push.error &&', rowStart);
  const rowSource = navbar.slice(rowStart, rowEnd);
  assert.doesNotMatch(rowSource, /navigate\(/);
});

test('the Bell icon is still used on the Notifications row', () => {
  assert.match(navbar, /import\s*\{[^}]*Bell[^}]*\}\s*from\s*'lucide-react'/);
  const rowStart = navbar.lastIndexOf('<div', navbar.indexOf('{t.notifications}'));
  const rowEnd = navbar.indexOf('{push.error &&', rowStart);
  const rowSource = navbar.slice(rowStart, rowEnd);
  assert.match(rowSource, /<Bell/);
});

test('no "Occasional reminders" subtext and no separate On/Off status text remain', () => {
  assert.doesNotMatch(navbarCode, /notificationsSub/);
  assert.doesNotMatch(navbarCode, /notificationsOn\b/);
  assert.doesNotMatch(navbarCode, /notificationsOff\b/);
  assert.doesNotMatch(navbarCode, />\s*Occasional reminders\s*</);
});

test('the switch is disabled whenever the push status is not directly actionable, and while a request is pending', () => {
  assert.match(navbarCode, /pushActionable\s*=\s*push\.status === 'default' \|\| push\.status === 'enabled'/);
  assert.match(navbarCode, /pushToggleDisabled\s*=\s*!pushActionable \|\| push\.busy/);
  assert.match(navbarCode, /disabled=\{pushToggleDisabled\}/);
});

// ── 4/no-duplication. Reuses Account's own enable/disable flow exactly ──

test('Navbar reuses the existing usePushNotifications hook — no second notification-state source', () => {
  assert.match(navbar, /import\s*\{\s*usePushNotifications\s*\}\s*from\s*'\.\.\/hooks\/usePushNotifications'/);
  assert.match(navbar, /push\.status === 'enabled'/);
});

test('the toggle handler calls the hook\'s real enable()/disable() — the same flow Account uses, not a reimplementation', () => {
  assert.match(navbarCode, /function handleTogglePush\(\)\s*\{[\s\S]*?push\.busy[\s\S]*?push\.disable\(\)[\s\S]*?push\.enable\(\)[\s\S]*?\}/);
});

test('Navbar never talks to Notification.requestPermission, pushManager, or serviceWorker directly — that stays inside the shared hook', () => {
  assert.doesNotMatch(navbarCode, /Notification\.requestPermission/);
  assert.doesNotMatch(navbarCode, /pushManager/);
  assert.doesNotMatch(navbarCode, /serviceWorker/);
});

test('Navbar never imports VAPID/service-worker/scheduler internals', () => {
  assert.doesNotMatch(navbar, /VAPID|pushScheduler|pushSend|sw\.js/i);
});

test('a busy/pending toggle reuses push.busy from the shared hook rather than tracking its own pending flag', () => {
  assert.doesNotMatch(navbarCode, /\[busy, setBusy\]/);
  assert.match(navbarCode, /push\.busy/);
});

test('a subtle error, when shown, reuses the existing account.pushNotifications.error string rather than a new one', () => {
  assert.match(navbar, /translations\[language\]\.account\.pushNotifications/);
  assert.match(navbar, /\{push\.error &&[\s\S]{0,120}tPush\.error/);
});

// ── EN/HI parity ─────────────────────────────────────────────────────────

function navNamespaceBlock(lang) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translations.indexOf('nav: {', langIdx);
  assert.ok(start !== -1, `missing nav namespace in ${lang}`);
  return translations.slice(start, translations.indexOf('\n    },', start));
}

test('nav namespace: notifications key exists in both English and Hindi, and the now-unused quick-menu keys are gone', () => {
  for (const lang of ['en', 'hi']) {
    const block = navNamespaceBlock(lang);
    assert.match(block, /^\s{6}notifications:/m, `${lang}.nav.notifications is missing`);
    assert.doesNotMatch(block, /notificationsSub/, `${lang}.nav.notificationsSub should be removed`);
    assert.doesNotMatch(block, /notificationsOn:/, `${lang}.nav.notificationsOn should be removed`);
    assert.doesNotMatch(block, /notificationsOff:/, `${lang}.nav.notificationsOff should be removed`);
  }
});

test('the Hindi nav.notifications value is actually written in Hindi', () => {
  const block = navNamespaceBlock('hi');
  const match = block.match(/^\s{6}notifications:\s*'([^']*)'/m);
  assert.ok(match, 'notifications not found in hi.nav');
  assert.match(match[1], /[ऀ-ॿ]/, `hi.nav.notifications ("${match[1]}") doesn't look like Hindi`);
});

test('the retired notificationsSub/On/Off keys no longer appear anywhere in translations.js', () => {
  assert.doesNotMatch(translations, /notificationsSub/);
  assert.doesNotMatch(translations, /notificationsOn:/);
  assert.doesNotMatch(translations, /notificationsOff:/);
});

test('Navbar reads the Notifications label through translations.js — no inline hardcoded English/Hindi literal', () => {
  assert.doesNotMatch(navbarCode, />\s*Notifications\s*</);
  assert.match(navbar, /\{t\.notifications\}/);
});
