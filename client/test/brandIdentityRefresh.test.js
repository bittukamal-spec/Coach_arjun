// Source + asset checks for the Arjun brand identity refresh.
//
// The approved production brand asset set (favicon, PWA/install icons, the
// brand mark, the Coach avatar) replaces the old purple inline-SVG mark.
// These checks guard: the new assets are wired in at every required spot,
// the PWA/install and auth behaviour they sit inside is untouched, and no
// reference to the retired purple assets survives anywhere in source.
//
// Dependency-free, run by `npm run test:source`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => existsSync(path.join(root, rel));

const indexHtml = read('index.html');
const viteConfig = read('vite.config.js');
const arjunLogo = read('src/components/ArjunLogo.jsx');
const landing = read('src/pages/LandingPage.jsx');
const auth = read('src/pages/AuthPage.jsx');
const startingProfile = read('src/pages/StartingProfilePage.jsx');
const chatPage = read('src/pages/ChatPage.jsx');
const navbar = read('src/components/Navbar.jsx');
const resetPassword = read('src/pages/ResetPasswordPage.jsx');

const ALL_JSX_GLOB_DIRS = ['src'];

// Every .jsx/.js file under src, read once, for the "no stale reference"
// sweep — cheap enough at this codebase's size and avoids maintaining a
// hand-picked file list that silently goes stale.
import { readdirSync, statSync } from 'node:fs';
function collectSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...collectSourceFiles(full));
    else if (/\.(jsx?|css|html)$/.test(entry)) out.push(full);
  }
  return out;
}
const allSourceText = ALL_JSX_GLOB_DIRS
  .flatMap((d) => collectSourceFiles(path.join(root, d)))
  .concat([path.join(root, 'index.html'), path.join(root, 'vite.config.js')])
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

// ── 1. Favicon ───────────────────────────────────────────────────────────

test('the browser favicon references the approved assets, not the old purple SVG', () => {
  assert.match(indexHtml, /<link rel="icon" href="\/favicon\.ico" sizes="any" \/>/);
  assert.match(indexHtml, /<link rel="icon" type="image\/png" sizes="16x16" href="\/brand\/arjun\/favicon-16\.png" \/>/);
  assert.match(indexHtml, /<link rel="icon" type="image\/png" sizes="32x32" href="\/brand\/arjun\/favicon-32\.png" \/>/);
  assert.match(indexHtml, /<link rel="icon" type="image\/png" sizes="48x48" href="\/brand\/arjun\/favicon-48\.png" \/>/);
  assert.doesNotMatch(indexHtml, /arjun-source\.svg/, 'the old purple SVG icon reference must be gone');
  for (const rel of ['public/favicon.ico', 'public/brand/arjun/favicon-16.png', 'public/brand/arjun/favicon-32.png', 'public/brand/arjun/favicon-48.png']) {
    assert.ok(exists(rel), `missing favicon asset on disk: ${rel}`);
  }
});

// ── 2 & 3. PWA icons ─────────────────────────────────────────────────────

test('the PWA manifest points at the approved 192 and 512 icons', () => {
  assert.match(viteConfig, /src: 'brand\/arjun\/pwa-icon-192\.png',\s*sizes: '192x192', type: 'image\/png'/);
  assert.match(viteConfig, /src: 'brand\/arjun\/pwa-icon-512\.png',\s*sizes: '512x512', type: 'image\/png'/);
  assert.ok(exists('public/brand/arjun/pwa-icon-192.png'), 'missing pwa-icon-192.png on disk');
  assert.ok(exists('public/brand/arjun/pwa-icon-512.png'), 'missing pwa-icon-512.png on disk');
});

// ── 4. Maskable icon ─────────────────────────────────────────────────────

test('the maskable icon is its own dedicated asset with purpose: maskable', () => {
  assert.match(
    viteConfig,
    /src: 'brand\/arjun\/pwa-icon-maskable-512\.png',\s*sizes: '512x512', type: 'image\/png', purpose: 'maskable'/,
  );
  // The maskable icon must NOT reuse the plain 512 icon file.
  const maskableLine = viteConfig.split('\n').find((l) => l.includes("purpose: 'maskable'"));
  assert.ok(maskableLine.includes('pwa-icon-maskable-512.png'));
  assert.ok(exists('public/brand/arjun/pwa-icon-maskable-512.png'), 'missing pwa-icon-maskable-512.png on disk');
});

// ── 5. Apple touch icon ──────────────────────────────────────────────────

test('the apple touch icon uses the approved 180px asset', () => {
  assert.match(indexHtml, /<link rel="apple-touch-icon" href="\/brand\/arjun\/apple-touch-icon-180\.png" \/>/);
  assert.match(viteConfig, /'brand\/arjun\/apple-touch-icon-180\.png'/);
  assert.ok(exists('public/brand/arjun/apple-touch-icon-180.png'), 'missing apple-touch-icon-180.png on disk');
});

// ── 6, 7, 8. Homepage / auth / onboarding brand mark ─────────────────────

test('ArjunLogo renders the approved production brand mark and Coach avatar crops, not inline SVG', () => {
  assert.doesNotMatch(arjunLogo, /<svg|<path|<rect|<polygon/, 'the logo must not be an inline SVG drawing');
  assert.match(arjunLogo, /arjun-brand-mark-384\.png/);
  assert.match(arjunLogo, /arjun-coach-avatar-256\.png/);
  assert.ok(exists('public/brand/arjun/arjun-brand-mark-384.png'), 'missing arjun-brand-mark-384.png on disk');
  assert.ok(exists('public/brand/arjun/arjun-coach-avatar-256.png'), 'missing arjun-coach-avatar-256.png on disk');
});

test('the public homepage header, final CTA and footer use the ArjunLogo brand mark', () => {
  assert.match(landing, /import \{ ArjunLogo \} from '\.\.\/components\/ArjunLogo';/);
  assert.equal((landing.match(/<ArjunLogo /g) || []).length, 3, 'header, final CTA and footer');
});

test('auth (sign in / create account) uses the ArjunLogo brand mark', () => {
  assert.match(auth, /import \{ ArjunLogo \} from '\.\.\/components\/ArjunLogo';/);
  assert.match(auth, /<ArjunLogo size=\{32\}/);
});

test('the password reset flow uses the ArjunLogo brand mark', () => {
  assert.match(resetPassword, /import \{ ArjunLogo \} from '\.\.\/components\/ArjunLogo';/);
  assert.equal((resetPassword.match(/<ArjunLogo /g) || []).length, 2);
});

test('the Starting Profile (onboarding) header uses the ArjunLogo brand mark', () => {
  assert.match(startingProfile, /import \{ ArjunLogo \} from '\.\.\/components\/ArjunLogo';/);
  assert.match(startingProfile, /<ArjunLogo size=\{30\}/);
});

test('the authenticated app header (Navbar) uses the ArjunLogo brand mark', () => {
  assert.match(navbar, /import \{ ArjunLogo \} from '\.\/ArjunLogo';/);
  assert.match(navbar, /<ArjunLogo size=\{26\}/);
});

// ── 9. Coach avatar ──────────────────────────────────────────────────────

test('the Coach chat header uses the approved Coach avatar, not the generic brand mark', () => {
  assert.match(chatPage, /import \{ ArjunLogo \} from '\.\.\/components\/ArjunLogo';/);
  assert.match(chatPage, /<ArjunLogo size=\{26\} variant="coach" ariaLabel="Arjun logo" \/>/);
});

// ── 10. Obsolete purple assets are gone ──────────────────────────────────

test('no source file references an obsolete purple Arjun brand asset', () => {
  const forbidden = [
    'arjun-source.svg',
    'apple-touch-icon-180x180',
    'maskable-icon-512x512',
    'pwa-192x192.png',
    'pwa-512x512.png',
    'pwa-64x64.png',
  ];
  for (const needle of forbidden) {
    assert.ok(!allSourceText.includes(needle), `stale reference to obsolete asset: ${needle}`);
  }
  // The old purple fill and the old hand-drawn bow/arrow path data are gone.
  assert.doesNotMatch(allSourceText, /#7C3AED/i);
});

test('the obsolete purple asset files were deleted from public/', () => {
  for (const rel of [
    'public/arjun-source.svg',
    'public/apple-touch-icon-180x180.png',
    'public/maskable-icon-512x512.png',
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'public/pwa-64x64.png',
  ]) {
    assert.ok(!exists(rel), `obsolete asset still present on disk: ${rel}`);
  }
});

// ── 11. PWA / install behaviour unchanged ────────────────────────────────

test('PWA registration, install behaviour and app identity are untouched', () => {
  assert.match(viteConfig, /VitePWA\(\{/);
  assert.match(viteConfig, /registerType: 'autoUpdate'/);
  assert.match(viteConfig, /short_name: 'Arjun'/);
  assert.match(viteConfig, /display: 'standalone'/);
  assert.match(viteConfig, /scope: '\/'/);
  assert.match(viteConfig, /start_url: '\/'/);
  assert.match(viteConfig, /theme_color: '#185FA5'/);
  // Still exactly 3 manifest icons — no size was silently added or dropped.
  const iconsBlock = viteConfig.slice(viteConfig.indexOf('icons: ['), viteConfig.indexOf('],', viteConfig.indexOf('icons: [')));
  assert.equal((iconsBlock.match(/src:/g) || []).length, 3);
});

// ── 12. Auth behaviour unchanged ─────────────────────────────────────────

test('auth endpoints, payload and redirect are unchanged by the brand swap', () => {
  assert.match(auth, /const endpoint = tab === 'signup' \? '\/api\/auth\/register' : '\/api\/auth\/login';/);
  assert.match(auth, /loginWithUser\(data\.token, data\.user\);/);
  assert.match(auth, /navigate\(data\.user\.onboardingDone \? '\/dashboard' : '\/onboarding', \{ replace: true \}\);/);
});
