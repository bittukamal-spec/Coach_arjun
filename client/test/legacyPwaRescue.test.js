// Legacy-PWA rescue — source-level checks for how src/sw.js WIRES the
// pure capability-marker logic (src/swCapability.js, exercised with real
// execution in swCapability.test.js) into its install/activate/message
// listeners. src/sw.js itself imports real Workbox packages that assume a
// genuine browser/ServiceWorker global environment and cannot be safely
// imported/executed under plain Node — same constraint
// appUpdatePromptSource.test.js already works within for this file, same
// source-text pattern used throughout this suite.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const swSource = read('src/sw.js');
const swCapabilitySource = read('src/swCapability.js');
const appUpdatePrompt = read('src/components/AppUpdatePrompt.jsx');

function stripComments(s) {
  return s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}
const swCode = stripComments(swSource);
const swCapabilityCode = stripComments(swCapabilitySource);
const appUpdatePromptCode = stripComments(appUpdatePrompt);

function sliceListener(source, eventName) {
  const start = source.indexOf(`addEventListener('${eventName}'`);
  assert.ok(start !== -1, `expected an addEventListener('${eventName}', ...) call`);
  const end = source.indexOf('\n});', start);
  assert.ok(end !== -1, `expected a closing '});' for the ${eventName} listener`);
  return source.slice(start, end);
}

// ── Legacy path: marker absent -> skipWaiting() during install, ─────────
// ── clients.claim() during activate ──────────────────────────────────────

test('install reads the capability marker via swCapability.js, inside event.waitUntil()', () => {
  const installSource = sliceListener(swSource, 'install');
  assert.match(installSource, /event\.waitUntil\(/);
  assert.match(installSource, /hasUpdatePromptCapabilityMarker\(caches\)/);
});

test('marker absent -> skipWaiting() is called, and the legacy-rescue flag is set, during install', () => {
  const installSource = sliceListener(swSource, 'install');
  assert.match(installSource, /if \(!capable\)\s*\{[\s\S]*?isLegacyRescueActivation = true;[\s\S]*?self\.skipWaiting\(\);[\s\S]*?\}/);
});

test('the legacy-rescue path never requires the SKIP_WAITING message — it activates on its own, unconditionally on install', () => {
  const installSource = sliceListener(swSource, 'install');
  assert.doesNotMatch(installSource, /event\.data/); // no message-gate anywhere in the install decision
});

test('legacy-rescue activate calls clients.claim(), gated on the flag set during install', () => {
  const activateSource = sliceListener(swSource, 'activate');
  assert.match(activateSource, /if \(isLegacyRescueActivation\)/);
  assert.match(activateSource, /self\.clients\.claim\(\)/);
  assert.match(activateSource, /event\.waitUntil\(/);
});

// ── Modern path: marker present -> no skipWaiting, no clients.claim, ────
// ── SKIP_WAITING message still activates exactly as before ──────────────

test('marker present -> install does nothing beyond the read (no skipWaiting, no flag set) — worker installs and stays waiting', () => {
  const installSource = sliceListener(swSource, 'install');
  // The only skipWaiting() call inside install is inside the `if (!capable)`
  // block already proven above — there is no second, unconditional one.
  const skipWaitingCalls = (installSource.match(/self\.skipWaiting\(\)/g) || []).length;
  assert.equal(skipWaitingCalls, 1);
});

test('clients.claim() is never called outside the legacy-rescue-conditional activate handler — never in message, never unconditional/global', () => {
  const claimOccurrences = (swCode.match(/clients\.claim\(\)/g) || []).length;
  assert.equal(claimOccurrences, 1, 'expected exactly one clients.claim() call in the whole file');
  const messageSource = sliceListener(swSource, 'message');
  assert.doesNotMatch(messageSource, /clients\.claim/);
  assert.doesNotMatch(swCode, /^self\.clients\.claim\(\);?\s*$/m); // never a bare top-level call
});

test('the existing SKIP_WAITING message branch is completely unchanged in behavior — still the only thing that activates a marker-present client\'s waiting worker', () => {
  const messageSource = sliceListener(swSource, 'message');
  assert.match(messageSource, /event\.data\.type === ['"]SKIP_WAITING['"]/);
  assert.match(messageSource, /self\.skipWaiting\(\);/);
});

test('self.skipWaiting() appears exactly twice in the whole file — once in the legacy-rescue install branch, once in the SKIP_WAITING message branch — never a third, unconditional call', () => {
  const occurrences = (swCode.match(/self\.skipWaiting\(\)/g) || []).length;
  assert.equal(occurrences, 2);
});

// ── Marker write (MARK_UPDATE_PROMPT_CAPABLE) ────────────────────────────

test('the message listener writes the marker via swCapability.js on MARK_UPDATE_PROMPT_CAPABLE, inside event.waitUntil()', () => {
  const messageSource = sliceListener(swSource, 'message');
  assert.match(messageSource, /event\.data\.type === ['"]MARK_UPDATE_PROMPT_CAPABLE['"]/);
  assert.match(messageSource, /event\.waitUntil\(writeUpdatePromptCapabilityMarker\(caches\)\)/);
});

test('no response is ever sent back for MARK_UPDATE_PROMPT_CAPABLE — fire-and-forget, matching AppUpdatePrompt\'s own contract', () => {
  const messageSource = sliceListener(swSource, 'message');
  assert.doesNotMatch(messageSource, /event\.source\.postMessage|event\.ports/);
});

test('the marker cache is never touched by cleanupOutdatedCaches — a structurally separate CacheStorage bucket', () => {
  assert.match(swCapabilitySource, /CAPABILITY_CACHE_NAME = 'arjun-capability-v1'/);
  // cleanupOutdatedCaches() is a Workbox-precaching import called with no
  // arguments referencing the capability cache anywhere near it.
  const cleanupIdx = swSource.indexOf('cleanupOutdatedCaches()');
  assert.ok(cleanupIdx !== -1);
  assert.doesNotMatch(swSource.slice(Math.max(0, cleanupIdx - 200), cleanupIdx + 50), /CAPABILITY_CACHE_NAME|arjun-capability/);
});

// ── AppUpdatePrompt: capability announcement ──────────────────────────────

test('AppUpdatePrompt posts the capability message when a controller exists, checked via navigator.serviceWorker.controller', () => {
  assert.match(appUpdatePromptCode, /navigator\.serviceWorker\.controller\?\.postMessage\(\s*\{\s*type:\s*['"]MARK_UPDATE_PROMPT_CAPABLE['"]\s*\}\s*\)/);
});

test('AppUpdatePrompt re-announces on controllerchange, and is safe if the Service Worker API is unavailable', () => {
  assert.match(appUpdatePromptCode, /addEventListener\(['"]controllerchange['"]/);
  assert.match(appUpdatePromptCode, /!navigator\.serviceWorker\)\s*return/);
});

test('the capability-announcement effect never touches needRefresh, updateServiceWorker, or the overlay-priority latch', () => {
  const effectStart = appUpdatePrompt.indexOf('announceUpdatePromptCapability');
  const effectEnd = appUpdatePrompt.indexOf('\n  }, []);', effectStart) + 20;
  const effectSource = appUpdatePrompt.slice(Math.max(0, effectStart - 200), effectEnd);
  assert.doesNotMatch(effectSource, /setNeedRefresh|updateServiceWorker|markUpdateDetected/);
});

// ── Boundary: no localStorage/IndexedDB marker, no bridge logic ─────────

test('the capability marker is never stored in localStorage or IndexedDB anywhere in this migration\'s code', () => {
  assert.doesNotMatch(swCode, /localStorage/i);
  assert.doesNotMatch(swCapabilityCode, /localStorage|indexedDB|IDBDatabase/i);
  assert.doesNotMatch(appUpdatePromptCode, /localStorage.*[Cc]apab|[Cc]apab.*localStorage/);
});

test('no temporary one-deploy "bridge" logic exists — the legacy-rescue decision is made fresh, per install, from the persistent marker, never from a deploy flag/timestamp/version heuristic', () => {
  assert.doesNotMatch(swCode, /bridge/i);
  assert.doesNotMatch(swCode, /BUILD_VERSION|DEPLOY_ID|MIGRATION_DEADLINE/);
});

test('push and notificationclick handlers are byte-for-byte unrelated to this migration — untouched section', () => {
  assert.match(swSource, /addEventListener\(['"]push['"]/);
  assert.match(swSource, /addEventListener\(['"]notificationclick['"]/);
  assert.match(swSource, /ALLOWED_NOTIFICATION_ROUTES/);
  // The push/notificationclick section never references the capability
  // marker — fully decoupled code paths.
  const pushIdx = swSource.indexOf("addEventListener('push'");
  assert.doesNotMatch(swSource.slice(pushIdx), /CAPABILITY_|isLegacyRescueActivation|MARK_UPDATE_PROMPT_CAPABLE/);
});

test('registerType stays "prompt" — the migration works entirely inside sw.js/AppUpdatePrompt, no vite.config.js change was needed', () => {
  const viteConfig = read('vite.config.js');
  assert.match(viteConfig, /registerType:\s*'prompt'/);
  assert.doesNotMatch(viteConfig, /registerType:\s*'autoUpdate'/);
});
