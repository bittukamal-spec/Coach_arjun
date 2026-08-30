// App Update Prompt (PWA) — source-level checks: config, translations,
// domain-boundary. Same source-text pattern used throughout this suite
// (node:test can't run JSX without a transform).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const viteConfig = read('vite.config.js');
const appUpdatePrompt = read('src/components/AppUpdatePrompt.jsx');
const overlayPriority = read('src/hooks/useOverlayPriority.js');
const pilotPopup = read('src/components/pilotCommunications/PilotCommunicationPopup.jsx');
const app = read('src/App.jsx');
const translations = read('src/i18n/translations.js');
const vercelJson = read('vercel.json');
const swSource = read('src/sw.js');
const usePushNotifications = read('src/hooks/usePushNotifications.js');

// Strips JSX `{/* … */}` blocks, JS `/* … */` blocks and `//` lines, so a
// boundary assertion about actual CODE coupling can never be satisfied —
// or broken — by explanatory prose in a comment (same technique as
// dashboardHierarchy.test.js / ctaAlignment.test.js).
function stripComments(s) {
  return s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}
const appUpdatePromptCode = stripComments(appUpdatePrompt);
const overlayPriorityCode = stripComments(overlayPriority);
const pilotPopupCode = stripComments(pilotPopup);
const swCode = stripComments(swSource);

// ── 1. registerType is 'prompt', not 'autoUpdate' ───────────────────────────

test('vite.config.js: VitePWA registerType is "prompt"', () => {
  assert.match(viteConfig, /registerType:\s*'prompt'/);
});

test('vite.config.js: no accidental "autoUpdate" registerType remains', () => {
  assert.doesNotMatch(viteConfig, /registerType:\s*'autoUpdate'/);
});

test('vite.config.js: manifest/icons configuration is preserved', () => {
  assert.match(viteConfig, /manifest:\s*\{/);
  assert.match(viteConfig, /name:\s*'Arjun/);
  assert.match(viteConfig, /icons:\s*\[/);
});

// ── 1b. injectManifest migration (Push Notifications v1) ───────────────────
// Push Notifications needs a `push` + `notificationclick` handler inside
// the service worker — generateSW has no seam for custom code, so this
// moved to injectManifest with a developer-owned src/sw.js. Everything
// generateSW used to auto-generate (precache, cleanup, SPA navigation
// fallback, the google-fonts runtime-caching rule) must still exist,
// verbatim in behavior, just written explicitly in src/sw.js instead of
// config. See src/sw.js's own header comment for the full migration proof.

test('vite.config.js: strategy is injectManifest, pointed at src/sw.js — not generateSW', () => {
  assert.match(viteConfig, /strategies:\s*'injectManifest'/);
  assert.match(viteConfig, /srcDir:\s*'src'/);
  assert.match(viteConfig, /filename:\s*'sw\.js'/);
  assert.doesNotMatch(viteConfig, /strategies:\s*'generateSW'/);
});

test('vite.config.js: the old generateSW-only `workbox` runtimeCaching block is gone (injectManifest ignores it) — replaced by an explicit rule in src/sw.js', () => {
  assert.doesNotMatch(viteConfig, /\bworkbox:\s*\{/);
  assert.doesNotMatch(viteConfig, /runtimeCaching:/);
});

test('src/sw.js: precaches via the injected manifest and cleans up outdated caches', () => {
  assert.match(swSource, /precacheAndRoute\(self\.__WB_MANIFEST\)/);
  assert.match(swSource, /cleanupOutdatedCaches\(\)/);
});

test('src/sw.js: SPA navigation fallback is preserved', () => {
  assert.match(swSource, /NavigationRoute\(createHandlerBoundToURL\(['"]index\.html['"]\)\)/);
});

test('src/sw.js: the google-fonts CacheFirst runtime-caching rule is preserved with the same cache name and policy', () => {
  assert.match(swSource, /google-fonts-cache/);
  assert.match(swSource, /CacheFirst/);
  assert.match(swSource, /ExpirationPlugin/);
  assert.match(swSource, /CacheableResponsePlugin/);
});

test('src/sw.js: replicates the SKIP_WAITING message listener (the one thing injectManifest can\'t auto-generate)', () => {
  assert.match(swSource, /type === ['"]SKIP_WAITING['"]/);
  assert.match(swSource, /self\.skipWaiting\(\)/);
});

// Legacy-PWA rescue (see legacyPwaRescue.test.js for the full, dedicated
// coverage): src/sw.js now calls clients.claim(), but this test re-proves
// the one invariant that must never regress — it is conditional on the
// legacy-rescue flag, never unconditional/global, and never lives inside
// the SKIP_WAITING message branch (which stays exactly as before: message-
// gated, no auto-claim riding along with it).
test('src/sw.js: clients.claim() is never unconditional — it only ever runs inside the legacy-rescue-conditional activate handler', () => {
  assert.doesNotMatch(swCode, /^self\.clients\.claim\(\);?\s*$/m); // never a bare top-level call
  const activateStart = swSource.indexOf("addEventListener('activate'");
  const activateEnd = swSource.indexOf('\n});', activateStart);
  const activateSource = swSource.slice(activateStart, activateEnd);
  assert.match(activateSource, /if \(isLegacyRescueActivation\)/);
  assert.match(activateSource, /self\.clients\.claim\(\)/);

  const messageStart = swSource.indexOf("addEventListener('message'");
  const messageEnd = swSource.indexOf('\n});', messageStart);
  const messageSource = swSource.slice(messageStart, messageEnd);
  assert.doesNotMatch(messageSource, /clients\.claim/);
});

test('no manual/duplicate service-worker registration exists outside the plugin\'s own registration path', () => {
  // AppUpdatePrompt's useRegisterSW() (virtual:pwa-register/react) is the
  // ONE registration path in this app — a hand-rolled
  // navigator.serviceWorker.register() call anywhere else would register
  // a second, competing service worker.
  assert.match(appUpdatePrompt, /useRegisterSW/);
  assert.doesNotMatch(appUpdatePrompt, /navigator\.serviceWorker\.register/);
  assert.doesNotMatch(usePushNotifications, /navigator\.serviceWorker\.register\(/);
});

// ── 1c. Push Notifications v1 handlers inside the service worker ──────────

test('src/sw.js: has a defensive push handler — malformed/missing payloads never crash it', () => {
  assert.match(swSource, /addEventListener\(['"]push['"]/);
  assert.match(swSource, /event\.data\s*\?\s*event\.data\.json\(\)/);
  assert.match(swSource, /catch/);
  assert.match(swSource, /showNotification/);
});

test('src/sw.js: has a notificationclick handler that closes the notification and focuses/navigates an existing window', () => {
  assert.match(swSource, /addEventListener\(['"]notificationclick['"]/);
  assert.match(swSource, /event\.notification\.close\(\)/);
  assert.match(swSource, /clients\.matchAll/);
  assert.match(swSource, /clients\.openWindow/);
});

test('src/sw.js: notification destinations are restricted to a small internal allowlist with a safe fallback — never an arbitrary external URL', () => {
  assert.match(swSource, /ALLOWED_NOTIFICATION_ROUTES/);
  assert.match(swSource, /\/mental-rep/);
  assert.match(swSource, /DEFAULT_NOTIFICATION_ROUTE/);
  assert.match(swSource, /\/dashboard/);
  // Never navigates to a payload-supplied absolute/external URL.
  assert.doesNotMatch(swSource, /client\.navigate\(\s*(payload|event\.notification\.data)\.url\s*\)/);
});

test('src/sw.js\'s push feature stays inside its own domain — it never imports/reuses the Pilot Communications CTA allowlist', () => {
  assert.doesNotMatch(swCode, /pilotCommunications|PilotCommunication|CTA_ROUTE_ALLOWLIST/i);
});

// ── 2. Domain boundary: AppUpdatePrompt never touches Pilot Communication ──

test('AppUpdatePrompt never imports PilotCommunicationPopup or any pilotCommunications path (code, not comments)', () => {
  assert.doesNotMatch(appUpdatePromptCode, /pilotCommunications/i);
  assert.doesNotMatch(appUpdatePromptCode, /PilotCommunicationPopup/);
});

test('AppUpdatePrompt never calls a pilot-communications API endpoint', () => {
  assert.doesNotMatch(appUpdatePrompt, /\/api\/pilot-communications/);
});

test('the shared overlay-priority module\'s CODE is domain-neutral — it never references either domain by name (comments may explain its purpose in prose)', () => {
  assert.doesNotMatch(overlayPriorityCode, /pilotCommunications|PilotCommunication/i);
  assert.doesNotMatch(overlayPriorityCode, /serviceWorker|useRegisterSW|virtual:pwa-register/i);
});

test('the overlay latch is one-way — markUpdateDetected takes no parameter to unset it', () => {
  assert.match(overlayPriorityCode, /export function markUpdateDetected\(\)\s*\{/);
});

test('AppUpdatePrompt never re-arms/unsets the shared latch — Later, close, or unmount never call it with false or reset it', () => {
  assert.doesNotMatch(appUpdatePromptCode, /markUpdateDetected\(\s*false\s*\)/);
  // The old live-mirror pattern this replaced always synced on every
  // needRefresh change and reset on unmount — neither exists any more.
  assert.doesNotMatch(appUpdatePromptCode, /setUpdatePromptActive/);
  assert.match(appUpdatePromptCode, /if \(needRefresh\) markUpdateDetected\(\);?/);
});

test('PilotCommunicationPopup reads the shared overlay latch but its CODE does not import AppUpdatePrompt or PWA/service-worker code', () => {
  assert.match(pilotPopup, /useIsUpdateDetected/);
  assert.doesNotMatch(pilotPopupCode, /AppUpdatePrompt/);
  assert.doesNotMatch(pilotPopupCode, /virtual:pwa-register|useRegisterSW|serviceWorker/i);
});

// ── 3. Global mount, exactly once ───────────────────────────────────────────

test('AppUpdatePrompt is wired into App.jsx exactly once, not inside a specific page', () => {
  const uses = app.match(/<AppUpdatePrompt\s*\/>/g) || [];
  assert.equal(uses.length, 1, `expected exactly one <AppUpdatePrompt /> mount, found ${uses.length}`);
});

test('AppUpdatePrompt is not gated behind ProtectedRoute or a single route — it is rendered before the loading branch and before <Routes>', () => {
  const constIdx = app.indexOf('const updatePrompt = <AppUpdatePrompt />;');
  const loadingIdx = app.indexOf('if (loading)');
  const routesIdx = app.indexOf('<Routes>');
  assert.ok(constIdx !== -1, 'AppUpdatePrompt must be captured before both branches');
  assert.ok(constIdx < loadingIdx, 'must be defined before the loading branch');
  assert.ok(constIdx < routesIdx, 'must be defined before <Routes>');
});

// ── 4. No push notifications / backend polling / manual skip-waiting message path ──

test('AppUpdatePrompt never touches Notification/push APIs', () => {
  assert.doesNotMatch(appUpdatePrompt, /Notification\.|PushManager|pushManager|permission/i);
});

test('AppUpdatePrompt never polls a backend endpoint for version/update info', () => {
  assert.doesNotMatch(appUpdatePrompt, /\/api\//);
  assert.doesNotMatch(appUpdatePrompt, /apiFetch/);
});

// AppUpdatePrompt now legitimately calls postMessage() once — for the
// Legacy-PWA rescue's capability announcement (MARK_UPDATE_PROMPT_CAPABLE),
// an entirely different, unrelated purpose from activating a worker. The
// guarantee this test actually protects — SKIP_WAITING itself is never
// hand-rolled, only ever sent via the plugin's own updateServiceWorker —
// is unchanged and still checked directly below.
test('AppUpdatePrompt never hand-rolls a SKIP_WAITING activation path — it only calls the plugin-provided updateServiceWorker', () => {
  assert.doesNotMatch(appUpdatePrompt, /postMessage\(\s*\{\s*type:\s*['"]SKIP_WAITING['"]/);
  assert.doesNotMatch(appUpdatePrompt, /SKIP_WAITING/);
  assert.match(appUpdatePrompt, /updateServiceWorker\(true\)/);
});

test('the one postMessage AppUpdatePrompt does send is the unrelated Legacy-PWA rescue capability announcement, not a SKIP_WAITING send', () => {
  assert.match(appUpdatePrompt, /postMessage\(\s*\{\s*type:\s*['"]MARK_UPDATE_PROMPT_CAPABLE['"]\s*\}\s*\)/);
});

test('AppUpdatePrompt never calls window.location.reload itself — the plugin\'s own one-shot controlling listener owns the reload', () => {
  assert.doesNotMatch(appUpdatePrompt, /location\.reload/);
});

// ── 5. EN/HI parity for the new namespace ───────────────────────────────────

function namespaceBlock(lang, name) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translations.indexOf(`${name}: {`, langIdx);
  assert.ok(start !== -1, `missing ${name} namespace in ${lang}`);
  return translations.slice(start, translations.indexOf('\n    },', start));
}
const keysOf = (block) => [...block.matchAll(/^\s{6}([a-zA-Z]+):/gm)].map((m) => m[1]).sort();

test('appUpdate namespace has identical keys in English and Hindi', () => {
  assert.deepEqual(keysOf(namespaceBlock('en', 'appUpdate')), keysOf(namespaceBlock('hi', 'appUpdate')));
});

test('every required appUpdate string is present in both languages', () => {
  const required = ['title', 'body', 'refreshNow', 'later', 'refreshing', 'closeAria'];
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang, 'appUpdate');
    for (const key of required) {
      assert.match(block, new RegExp(`^\\s{6}${key}:`, 'm'), `${lang}.appUpdate.${key} is missing`);
    }
  }
});

test('the Hindi side of appUpdate is actually written in Hindi', () => {
  assert.match(namespaceBlock('hi', 'appUpdate'), /[ऀ-ॿ]/);
});

test('AppUpdatePrompt reads every fixed string through translations.js — no inline bilingual literal, no hardcoded English UI copy', () => {
  assert.doesNotMatch(appUpdatePrompt, /language === 'hi' \? ['"]/);
  assert.match(appUpdatePrompt, /translations\[language\]/);
  assert.doesNotMatch(appUpdatePrompt, />\s*Arjun has an update\s*</);
  assert.doesNotMatch(appUpdatePrompt, />\s*Refresh now\s*</);
});

// ── 6. Centered-modal contract (same pattern as PilotCommunicationPopup) ──

test('AppUpdatePrompt wrapper centers unconditionally — no bottom-sheet items-end branch', () => {
  assert.match(appUpdatePrompt, /flex items-center justify-center/);
  assert.doesNotMatch(appUpdatePrompt, /items-end/);
});

test('AppUpdatePrompt panel has no bottom-sheet corner treatment and is capped to mobile width', () => {
  assert.doesNotMatch(appUpdatePrompt, /rounded-t-/);
  assert.match(appUpdatePrompt, /rounded-3xl/);
  assert.match(appUpdatePrompt, /max-w-\[340px\]/);
});

test('AppUpdatePrompt sits above BottomNav (z-50) AND above the Pilot Communication popup (z-[60])', () => {
  assert.match(appUpdatePrompt, /z-\[70\]/);
});

// ── 7. Vercel headers ────────────────────────────────────────────────────

test('vercel.json adds narrow no-cache headers for the four update-critical files only', () => {
  const parsed = JSON.parse(vercelJson);
  assert.ok(Array.isArray(parsed.headers), 'expected a headers array');
  const sources = parsed.headers.map((h) => h.source).sort();
  assert.deepEqual(sources, ['/index.html', '/manifest.webmanifest', '/registerSW.js', '/sw.js']);
  for (const rule of parsed.headers) {
    const cc = rule.headers.find((h) => h.key === 'Cache-Control');
    assert.ok(cc, `${rule.source} must set Cache-Control`);
    assert.equal(cc.value, 'no-cache');
  }
});

test('vercel.json does not broaden caching rules to hashed /assets/*', () => {
  const parsed = JSON.parse(vercelJson);
  const sources = parsed.headers.map((h) => h.source);
  assert.ok(!sources.some((s) => s.includes('assets')), 'hashed assets must be left to their default immutable caching');
});

test('the existing SPA rewrite is untouched', () => {
  const parsed = JSON.parse(vercelJson);
  assert.deepEqual(parsed.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
});
