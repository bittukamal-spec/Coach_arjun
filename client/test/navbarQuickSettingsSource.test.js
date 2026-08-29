// Home quick-settings discoverability — source-level checks: the avatar
// chevron indicator, the Notifications shortcut's structure/ordering, no
// duplicated permission/toggle logic, and EN/HI translation parity. Same
// source-text pattern used throughout this suite (node:test can't run JSX
// without a transform).

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
const accountPage = read('src/pages/AccountPage.jsx');

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

// ── 1. Avatar/menu discoverability ──────────────────────────────────────

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

test('the chevron never adds a text label like "Menu"', () => {
  assert.doesNotMatch(navbarCode, />\s*Menu\s*</i);
});

test('the avatar and chevron share one button — one tap target, not two separate controls', () => {
  const btnStart = navbar.indexOf('onClick={() => setMenuOpen(v => !v)}');
  assert.ok(btnStart !== -1);
  const btnOpenTag = navbar.lastIndexOf('<button', btnStart);
  const btnCloseTag = navbar.indexOf('</button>', btnStart);
  const buttonSource = navbar.slice(btnOpenTag, btnCloseTag);
  // Both the avatar circle span and the chevron live inside this ONE button.
  assert.match(buttonSource, /bg-brand-500/); // the avatar circle
  assert.match(buttonSource, /<ChevronDown/);
  assert.doesNotMatch(navbar.slice(0, btnOpenTag) + navbar.slice(btnCloseTag), /<ChevronDown/); // no second copy elsewhere
});

test('the button keeps a minimum 44px tap-target height', () => {
  const btnStart = navbar.indexOf('onClick={() => setMenuOpen(v => !v)}');
  const btnOpenTag = navbar.lastIndexOf('<button', btnStart);
  // Slice a fixed window rather than searching for the next '>' — the
  // arrow function in onClick contains its own '>' characters.
  const openingTagSource = navbar.slice(btnOpenTag, btnOpenTag + 400);
  assert.match(openingTagSource, /className="[^"]*\bh-11\b/); // 44px
});

// ── 2/5. Menu order and structure: Language, Theme, Notifications, Settings ──

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

test('the Notifications shortcut uses a Bell icon consistent with existing Arjun icons', () => {
  assert.match(navbar, /import\s*\{[^}]*Bell[^}]*\}\s*from\s*'lucide-react'/);
  const notificationsButtonStart = navbar.lastIndexOf('<button', navbar.indexOf('{t.notifications}'));
  const notificationsButtonEnd = navbar.indexOf('</button>', notificationsButtonStart);
  const buttonSource = navbar.slice(notificationsButtonStart, notificationsButtonEnd);
  assert.match(buttonSource, /<Bell/);
});

test('the Notifications shortcut shows On/Off status text, never color alone', () => {
  const notificationsButtonStart = navbar.lastIndexOf('<button', navbar.indexOf('{t.notifications}'));
  const notificationsButtonEnd = navbar.indexOf('</button>', notificationsButtonStart);
  const buttonSource = navbar.slice(notificationsButtonStart, notificationsButtonEnd);
  assert.match(buttonSource, /t\.notificationsOn/);
  assert.match(buttonSource, /t\.notificationsOff/);
});

test('the Notifications shortcut includes the optional supporting line', () => {
  assert.match(navbar, /\{t\.notificationsSub\}/);
});

// ── 3. Destination: /account#notifications, no new settings page ────────

test('the Notifications shortcut navigates to /account#notifications, not a new page', () => {
  const notificationsButtonStart = navbar.lastIndexOf('<button', navbar.indexOf('{t.notifications}'));
  const notificationsButtonEnd = navbar.indexOf('</button>', notificationsButtonStart);
  const buttonSource = navbar.slice(notificationsButtonStart, notificationsButtonEnd);
  assert.match(buttonSource, /navigate\(['"]\/account#notifications['"]\)/);
});

test('AccountPage exposes an id="notifications" anchor and scrolls/focuses it when the hash matches', () => {
  assert.match(accountPage, /id="notifications"/);
  assert.match(accountPage, /location\.hash === ['"]#notifications['"]/);
  assert.match(accountPage, /scrollIntoView/);
  assert.match(accountPage, /\.focus\(/);
});

// ── 4/no-duplication. Status source reused, never a second/duplicate flow ──

test('Navbar reuses the existing usePushNotifications hook — no second notification-state source', () => {
  assert.match(navbar, /import\s*\{\s*usePushNotifications\s*\}\s*from\s*'\.\.\/hooks\/usePushNotifications'/);
  assert.match(navbar, /push\.status === 'enabled'/);
});

test('Navbar never duplicates the permission/subscribe/toggle flow — that logic stays entirely in the hook + Account', () => {
  assert.doesNotMatch(navbarCode, /Notification\.requestPermission/);
  assert.doesNotMatch(navbarCode, /pushManager/);
  assert.doesNotMatch(navbarCode, /push\.enable\(/);
  assert.doesNotMatch(navbarCode, /push\.disable\(/);
  assert.doesNotMatch(navbarCode, /serviceWorker/);
});

test('Navbar never imports VAPID/service-worker/scheduler internals', () => {
  assert.doesNotMatch(navbar, /VAPID|pushScheduler|pushSend|sw\.js/i);
});

// ── EN/HI parity ─────────────────────────────────────────────────────────

function navNamespaceBlock(lang) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translations.indexOf('nav: {', langIdx);
  assert.ok(start !== -1, `missing nav namespace in ${lang}`);
  return translations.slice(start, translations.indexOf('\n    },', start));
}

test('nav namespace: the four new Notifications keys exist in both English and Hindi', () => {
  const required = ['notifications', 'notificationsSub', 'notificationsOn', 'notificationsOff'];
  for (const lang of ['en', 'hi']) {
    const block = navNamespaceBlock(lang);
    for (const key of required) {
      assert.match(block, new RegExp(`^\\s{6}${key}:`, 'm'), `${lang}.nav.${key} is missing`);
    }
  }
});

test('the Hindi side of the new nav keys is actually written in Hindi', () => {
  const block = navNamespaceBlock('hi');
  const keys = ['notifications', 'notificationsSub', 'notificationsOn', 'notificationsOff'];
  for (const key of keys) {
    const match = block.match(new RegExp(`^\\s{6}${key}:\\s*'([^']*)'`, 'm'));
    assert.ok(match, `${key} not found in hi.nav`);
    assert.match(match[1], /[ऀ-ॿ]/, `hi.nav.${key} ("${match[1]}") doesn't look like Hindi`);
  }
});

test('Navbar reads every new fixed string through translations.js — no inline hardcoded English/Hindi literal', () => {
  assert.doesNotMatch(navbarCode, />\s*Notifications\s*</);
  assert.doesNotMatch(navbarCode, />\s*Occasional reminders\s*</);
  assert.match(navbar, /\{t\.notifications\}/);
});
