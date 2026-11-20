// Source + asset checks for the Arjun logo rollback + colour refinement.
//
// This restores the pre-refresh Arjun symbol (bow-and-arrow / brain-arc,
// same path/line/polygon geometry as the historic component) in place of
// the PR that briefly replaced it with an external raster asset set and a
// separate "Coach avatar" image. Only the colour treatment is new: one
// consistent Arjun-blue family everywhere (in-app mark, favicon, PWA/
// install icons, Apple touch icon) instead of the old blue-in-app /
// purple-favicon split, and a solid light-blue accent stroke in place of
// the old translucent one.
//
// These checks guard: the restored geometry is intact and unmodified, the
// new colour treatment is applied consistently, every call site still
// carries the mark, the favicon/PWA/Apple-touch wiring still resolves to
// real files on disk, the raster asset set introduced by the (now
// reverted) refresh is gone, and PWA/install + auth behaviour are
// untouched throughout.
//
// Dependency-free, run by `npm run test:source`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => existsSync(path.join(root, rel));

const indexHtml = read('index.html');
const viteConfig = read('vite.config.js');
const arjunLogo = read('src/components/ArjunLogo.jsx');
const indexCss = read('src/index.css');
const landing = read('src/pages/LandingPage.jsx');
const auth = read('src/pages/AuthPage.jsx');
const startingProfile = read('src/pages/StartingProfilePage.jsx');
const chatPage = read('src/pages/ChatPage.jsx');
const navbar = read('src/components/Navbar.jsx');
const resetPassword = read('src/pages/ResetPasswordPage.jsx');

// Every .jsx/.js/.css/.html file under src, read once, for the "no stale
// reference" sweep — cheap enough at this codebase's size and avoids
// maintaining a hand-picked file list that silently goes stale.
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
const allSourceText = collectSourceFiles(path.join(root, 'src'))
  .concat([path.join(root, 'index.html'), path.join(root, 'vite.config.js')])
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

// Forbidden-term checks below run against actual code, not against the
// comments that explain what used to be true and why it changed.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const arjunLogoCode = stripComments(arjunLogo);

// ── 1. Favicon ───────────────────────────────────────────────────────────

test('the browser favicon references the recoloured mark at the same established paths', () => {
  assert.match(indexHtml, /<link rel="icon" href="\/favicon\.ico" sizes="any" \/>/);
  assert.match(indexHtml, /<link rel="icon" type="image\/png" sizes="16x16" href="\/brand\/arjun\/favicon-16\.png" \/>/);
  assert.match(indexHtml, /<link rel="icon" type="image\/png" sizes="32x32" href="\/brand\/arjun\/favicon-32\.png" \/>/);
  assert.match(indexHtml, /<link rel="icon" type="image\/png" sizes="48x48" href="\/brand\/arjun\/favicon-48\.png" \/>/);
  assert.doesNotMatch(indexHtml, /arjun-source\.svg/, 'the old purple SVG icon reference must stay gone');
  for (const rel of ['public/favicon.ico', 'public/brand/arjun/favicon-16.png', 'public/brand/arjun/favicon-32.png', 'public/brand/arjun/favicon-48.png']) {
    assert.ok(exists(rel), `missing favicon asset on disk: ${rel}`);
  }
});

// ── 2 & 3. PWA icons ─────────────────────────────────────────────────────

test('the PWA manifest points at the 192 and 512 icons, wiring unchanged by the colour refresh', () => {
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
  const maskableLine = viteConfig.split('\n').find((l) => l.includes("purpose: 'maskable'"));
  assert.ok(maskableLine.includes('pwa-icon-maskable-512.png'));
  assert.ok(exists('public/brand/arjun/pwa-icon-maskable-512.png'), 'missing pwa-icon-maskable-512.png on disk');
});

// ── 5. Apple touch icon ──────────────────────────────────────────────────

test('the apple touch icon uses the 180px asset at the same established path', () => {
  assert.match(indexHtml, /<link rel="apple-touch-icon" href="\/brand\/arjun\/apple-touch-icon-180\.png" \/>/);
  assert.match(viteConfig, /'brand\/arjun\/apple-touch-icon-180\.png'/);
  assert.ok(exists('public/brand/arjun/apple-touch-icon-180.png'), 'missing apple-touch-icon-180.png on disk');
});

// ── 6. The mark is Teer's head (founder pick "Calm smile", Nov 2026) ─────

test('ArjunLogo is the flat Teer head — the same drawing as the icon files', () => {
  assert.match(arjunLogo, /<svg/);
  assert.match(arjunLogo, /viewBox="2 4 96 96"/);
  assert.match(arjunLogo, /<circle cx="50" cy="60" r="36" fill=\{c\.blue\} \/>/, 'round blue head');
  assert.match(arjunLogo, /M12 51 Q14 33 50 30 Q86 33 88 51/, 'sweatband');
  assert.match(arjunLogo, /M42 41 h15/, 'arrow on the band');
  assert.match(arjunLogo, /M44 78 q6 5 12 0/, 'calm smile');
  // The icon files are drawn from the same geometry.
  const mark = read('public/brand/arjun/teer-mark.svg');
  for (const part of ['M12 51 Q14 33 50 30 Q86 33 88 51', 'M42 41 h15', 'M44 78 q6 5 12 0']) {
    assert.ok(mark.includes(part), `teer-mark.svg has ${part}`);
  }
  assert.match(read('public/brand/arjun/arjun-mark.svg'), /M44 78 q6 5 12 0/);
  assert.match(read('public/brand/arjun/arjun-mark-maskable.svg'), /M44 78 q6 5 12 0/);
});

test('the mark uses the brand palette — Arjun blue + sun, no purple', () => {
  assert.match(arjunLogoCode, /blue: '#1B4DFF'/);
  assert.match(arjunLogoCode, /sun: '#FFC629'/);
  assert.match(indexCss, /--brand-logo:\s*#1B4DFF;/, 'the reserved logo-only token stays #1B4DFF');
  assert.doesNotMatch(arjunLogoCode, /#7C3AED|#8B5CF6|purple/i);
  // No ids (clip paths, gradients): several logos on one page can never clash,
  // and the markup is identical on every render.
  assert.doesNotMatch(arjunLogoCode, /\bid=|useId/);
});

// ── 7. Every call site still carries the mark ─────────────────────────────

test('ArjunWordmark is a single central lockup, composing ArjunLogo rather than drawing its own art', () => {
  assert.equal((allSourceText.match(/export function ArjunWordmark/g) || []).length, 1);
  const wordmarkBlock = arjunLogo.slice(arjunLogo.indexOf('export function ArjunWordmark'));
  assert.doesNotMatch(wordmarkBlock, /<svg|<path|<rect/, 'the wordmark composes <ArjunLogo />, it does not draw its own art');
  assert.match(wordmarkBlock, /<ArjunLogo/);
});

test('the wordmark size presets are unchanged by the logo swap — same deterministic icon:text:gap ratios', () => {
  const presetsBlock = arjunLogo.slice(arjunLogo.indexOf('const LOCKUP_PRESETS'), arjunLogo.indexOf('\n};', arjunLogo.indexOf('const LOCKUP_PRESETS')));
  for (const preset of ['hero', 'header', 'medium', 'compact']) {
    assert.match(presetsBlock, new RegExp(`${preset}: \\{`), `missing wordmark preset: ${preset}`);
  }
  for (const preset of ['hero', 'medium', 'compact']) {
    const block = presetsBlock.slice(presetsBlock.indexOf(`${preset}: {`), presetsBlock.indexOf('},', presetsBlock.indexOf(`${preset}: {`)));
    assert.match(block, /icon: \d+,/);
  }
  assert.match(arjunLogo, /wordmark = 'Arjun'/);
  // The "coach vs brand artwork" concept is gone — there is only one mark
  // now, so neither component still accepts/forwards a `variant` prop.
  assert.doesNotMatch(arjunLogoCode, /\bvariant\b/);
});

test('the public website header carries the Arjun mark next to the name', () => {
  assert.match(landing, /import \{ ArjunLogo \} from '\.\.\/components\/ArjunLogo';/);
  assert.match(landing, /<ArjunLogo size=\{28\} \/>/);
  assert.doesNotMatch(landing, /ArjunLogo[^/]*rounded-/s);
});

test('the homepage header wordmark still grows in a verified-safe second step, not forced to one size', () => {
  const presetsBlock = arjunLogo.slice(arjunLogo.indexOf('header: {'), arjunLogo.indexOf('},', arjunLogo.indexOf('header: {')));
  assert.match(presetsBlock, /w-8 h-8/, 'unprefixed (mobile-first) icon size is unchanged from before');
  assert.match(presetsBlock, /text-\[19px\]/, 'unprefixed (mobile-first) text size is unchanged from before');
  assert.match(presetsBlock, /min-\[360px\]:w-10 min-\[360px\]:h-10/);
  assert.match(presetsBlock, /min-\[360px\]:text-\[26px\]/);
  assert.match(presetsBlock, /min-\[360px\]:text-\[#1B4DFF\]/, 'the brand-navy colour is reserved for the grown-in state');
});

test('auth (sign in / create account) opens with the centred Arjun mark', () => {
  assert.match(auth, /import \{ ArjunLogo \} from '\.\.\/components\/ArjunLogo';/);
  assert.match(auth, /<ArjunLogo size=\{56\} \/>/);
});

test('the password reset screen opens with the centred Arjun mark', () => {
  assert.match(resetPassword, /import \{ ArjunLogo \} from '\.\.\/components\/ArjunLogo';/);
  assert.match(resetPassword, /<ArjunLogo size=\{56\} \/>/);
});

test('the Starting Profile (onboarding) header uses the canonical hero lockup', () => {
  assert.match(startingProfile, /import \{ ArjunWordmark \} from '\.\.\/components\/ArjunLogo';/);
  assert.match(startingProfile, /<ArjunWordmark size="hero" \/>/);
});

test('the authenticated app header (Navbar) uses the compact lockup — it sits in a fixed h-12 bar', () => {
  assert.match(navbar, /import \{ ArjunWordmark \} from '\.\/ArjunLogo';/);
  assert.match(navbar, /<ArjunWordmark size="compact" \/>/);
});

test('the Coach chat header uses the same restored mark, sized compact — no separate Coach avatar image', () => {
  assert.match(chatPage, /import \{ ArjunLogo \} from '\.\.\/components\/ArjunLogo';/);
  assert.match(chatPage, /<ArjunLogo size=\{34\} ariaLabel="Arjun logo" className="shrink-0" \/>/);
  assert.doesNotMatch(chatPage, /variant="coach"|variant=\{.*coach/i);
  // Its "Arjun" label stays a real <h1> (accessibility contract). Smaller
  // since Nov 2026 (founder: keep the logo in Coach but make it smaller).
  assert.match(chatPage, /<h1 className="text-\[17px\] font-extrabold leading-none tracking-\[-0\.01em\] text-ink">\{t\.title\}<\/h1>/);
});

// ── 8. The reverted PR's raster asset set is gone ─────────────────────────

test('no source file references the raster brand-mark/logo-clean/Coach-avatar assets the rollback removed', () => {
  const removed = [
    'arjun-brand-mark-384.png',
    'arjun-coach-avatar-256.png',
    'arjun-logo-clean-512.png',
    'arjun-logo-clean-1024.png',
  ];
  for (const needle of removed) {
    assert.ok(!allSourceText.includes(needle), `stale reference to a removed raster asset: ${needle}`);
  }
});

test('the removed raster asset files no longer exist on disk', () => {
  for (const rel of [
    'public/brand/arjun/arjun-brand-mark-384.png',
    'public/brand/arjun/arjun-coach-avatar-256.png',
    'public/brand/arjun/arjun-logo-clean-512.png',
    'public/brand/arjun/arjun-logo-clean-1024.png',
  ]) {
    assert.ok(!exists(rel), `removed asset still present on disk: ${rel}`);
  }
});

test('no source file references an obsolete purple Arjun brand asset (from before the original refresh either)', () => {
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
});

test('the obsolete purple asset files stay deleted from public/', () => {
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

// ── 9. PWA / install behaviour unchanged ──────────────────────────────────

test('PWA registration, install behaviour and app identity are untouched', () => {
  assert.match(viteConfig, /VitePWA\(\{/);
  // registerType intentionally flipped 'autoUpdate' -> 'prompt' by the
  // dedicated App Update Prompt PR (see appUpdatePromptSource.test.js,
  // which pins this exact value going forward) — every other PWA/app-
  // identity field below is still asserted unchanged.
  assert.match(viteConfig, /registerType: 'prompt'/);
  assert.match(viteConfig, /short_name: 'Arjun'/);
  assert.match(viteConfig, /display: 'standalone'/);
  assert.match(viteConfig, /scope: '\/'/);
  assert.match(viteConfig, /start_url: '\/'/);
  assert.match(viteConfig, /theme_color: '#1B4DFF'/);
  // Still exactly 3 manifest icons — no size was silently added or dropped.
  const iconsBlock = viteConfig.slice(viteConfig.indexOf('icons: ['), viteConfig.indexOf('],', viteConfig.indexOf('icons: [')));
  assert.equal((iconsBlock.match(/src:/g) || []).length, 3);
});

// ── 10. Auth behaviour unchanged ──────────────────────────────────────────

test('auth endpoints, payload and redirect are unchanged by the logo rollback', () => {
  assert.match(auth, /const endpoint = tab === 'signup' \? '\/api\/auth\/register' : '\/api\/auth\/login';/);
  assert.match(auth, /loginWithUser\(data\.token, data\.user\);/);
  assert.match(auth, /navigate\(data\.user\.onboardingDone \? '\/dashboard' : '\/onboarding', \{ replace: true \}\);/);
});
