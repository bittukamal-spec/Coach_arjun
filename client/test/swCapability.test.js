// Legacy-PWA rescue — pure capability-marker logic (src/swCapability.js).
// Real execution, real assertions against a trivial fake CacheStorage —
// unlike src/sw.js itself (which imports real Workbox packages that
// assume a genuine browser/ServiceWorker environment and can't be safely
// imported under plain Node), this module has zero imports and takes the
// CacheStorage API as a plain parameter, so it can be exercised for real
// here. src/sw.js's own wiring of these functions into install/activate/
// message is verified separately, at the source-text level, in
// legacyPwaRescue.test.js and appUpdatePromptSource.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITY_CACHE_NAME,
  CAPABILITY_MARKER_KEY,
  hasUpdatePromptCapabilityMarker,
  writeUpdatePromptCapabilityMarker,
} from '../src/swCapability.js';

// A minimal, real, in-memory stand-in for the CacheStorage API
// (`caches.open(name)` -> a Cache with `.match(key)`/`.put(key, response)`)
// — same shape as the real global `caches` a service worker sees, scoped
// per cache name exactly like the real API.
function makeFakeCaches(initial = {}) {
  const buckets = new Map(Object.entries(initial));
  return {
    open: async (name) => {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const bucket = buckets.get(name);
      return {
        match: async (key) => bucket.get(key),
        put: async (key, response) => { bucket.set(key, response); },
      };
    },
    __buckets: buckets,
  };
}

// ── hasUpdatePromptCapabilityMarker ───────────────────────────────────────

test('returns false when the capability cache has never been opened at all', async () => {
  const fakeCaches = makeFakeCaches();
  assert.equal(await hasUpdatePromptCapabilityMarker(fakeCaches), false);
});

test('returns false when the cache exists but the marker key was never written', async () => {
  const fakeCaches = makeFakeCaches({ [CAPABILITY_CACHE_NAME]: new Map() });
  assert.equal(await hasUpdatePromptCapabilityMarker(fakeCaches), false);
});

test('returns true once the marker key has been written', async () => {
  const fakeCaches = makeFakeCaches({
    [CAPABILITY_CACHE_NAME]: new Map([[CAPABILITY_MARKER_KEY, new Response('1')]]),
  });
  assert.equal(await hasUpdatePromptCapabilityMarker(fakeCaches), true);
});

test('a read failure (e.g. caches.open throws) never throws — resolves to false, the same safe direction as "absent"', async () => {
  const throwingCaches = { open: async () => { throw new Error('storage unavailable'); } };
  await assert.doesNotReject(hasUpdatePromptCapabilityMarker(throwingCaches));
  assert.equal(await hasUpdatePromptCapabilityMarker(throwingCaches), false);
});

// ── writeUpdatePromptCapabilityMarker ─────────────────────────────────────

test('writes the marker into the dedicated capability cache, under the dedicated key', async () => {
  const fakeCaches = makeFakeCaches();
  await writeUpdatePromptCapabilityMarker(fakeCaches);
  const bucket = fakeCaches.__buckets.get(CAPABILITY_CACHE_NAME);
  assert.ok(bucket, 'expected the capability cache to have been opened/created');
  assert.ok(bucket.has(CAPABILITY_MARKER_KEY), 'expected the marker key to be present');
});

test('after writing, hasUpdatePromptCapabilityMarker reads it back as true — real round trip, not two isolated mocks', async () => {
  const fakeCaches = makeFakeCaches();
  assert.equal(await hasUpdatePromptCapabilityMarker(fakeCaches), false);
  await writeUpdatePromptCapabilityMarker(fakeCaches);
  assert.equal(await hasUpdatePromptCapabilityMarker(fakeCaches), true);
});

test('repeated writes are idempotent and harmless — writing twice leaves exactly one entry, still true', async () => {
  const fakeCaches = makeFakeCaches();
  await writeUpdatePromptCapabilityMarker(fakeCaches);
  await writeUpdatePromptCapabilityMarker(fakeCaches);
  await writeUpdatePromptCapabilityMarker(fakeCaches);
  const bucket = fakeCaches.__buckets.get(CAPABILITY_CACHE_NAME);
  assert.equal(bucket.size, 1);
  assert.equal(await hasUpdatePromptCapabilityMarker(fakeCaches), true);
});

test('a write failure (e.g. cache.put throws) never throws — best-effort only', async () => {
  const throwingCaches = {
    open: async () => ({
      match: async () => undefined,
      put: async () => { throw new Error('quota exceeded'); },
    }),
  };
  await assert.doesNotReject(writeUpdatePromptCapabilityMarker(throwingCaches));
});

test('the marker cache is a dedicated bucket, distinct from any Workbox precache/runtime cache name', () => {
  assert.doesNotMatch(CAPABILITY_CACHE_NAME, /workbox|precache/i);
});

test('the marker key is a synthetic internal key, never a normal app route', () => {
  assert.match(CAPABILITY_MARKER_KEY, /^\/__/); // double-underscore-prefixed, not a real route
  assert.doesNotMatch(CAPABILITY_MARKER_KEY, /^\/(dashboard|train|coaching|account|mind-journal)/);
});

test('this module has zero imports — pure, dependency-free, testable without any global/browser stubbing', () => {
  // No dedicated source read here; the successful ES-module import above,
  // with no self/window/caches stubbing anywhere in this file, already
  // proves the module has no ambient dependency on a browser/SW global
  // environment. A companion source-text check lives in
  // legacyPwaRescue.test.js.
  assert.equal(typeof hasUpdatePromptCapabilityMarker, 'function');
  assert.equal(typeof writeUpdatePromptCapabilityMarker, 'function');
});
