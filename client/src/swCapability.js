// Legacy-PWA rescue — pure capability-marker logic, deliberately factored
// out of src/sw.js. src/sw.js imports real Workbox packages that assume a
// genuine browser/ServiceWorker global environment (self, registration,
// clients) and cannot be safely imported/executed under plain Node for
// testing — same reason this codebase's server side always factors pure
// logic into its own services/*.js file, tested directly with real
// execution, separate from the thin route/handler that wires it up (see
// e.g. server/src/services/pilotCommunications.js vs
// routes/founderPilotCommunications.js). This module has ZERO imports and
// touches no ambient/global state — every function takes the CacheStorage
// API it needs as a plain parameter (the real global `caches` in a real
// service worker; a trivial fake in tests), so it can be exercised with
// genuine execution and assertions in a real Node test, not just
// source-text pattern matching.
//
// The marker means: "current Arjun page JS has successfully run on this
// origin and therefore knows how to handle a waiting worker through
// AppUpdatePrompt.jsx." AppUpdatePrompt.jsx writes it (by posting
// {type:'MARK_UPDATE_PROMPT_CAPABLE'} to whichever worker currently
// controls the page — see its own effect, and src/sw.js's message
// listener) every time it mounts and every time the controller changes —
// cheap and idempotent, so there is no "write exactly once" coordination
// to get wrong. Every NEW worker reads it, once, during its own install
// (src/sw.js), before deciding whether to skip the wait.

// A dedicated CacheStorage bucket — never a normal app route, never
// touched by Workbox's own precache. cleanupOutdatedCaches() (src/sw.js)
// only ever inspects and prunes entries inside Workbox's OWN precache
// cache (matched by its own internal naming/manifest-revision scheme); it
// never opens or enumerates this separate cache, so it structurally
// cannot delete this marker. CacheStorage over IndexedDB: this app
// already uses CacheStorage as its one client-side storage primitive
// (Workbox itself is built on it) — a single durable boolean doesn't need
// IndexedDB's extra schema/versioning machinery, and neither storage is
// meaningfully more resistant to the eviction/multi-tab edge cases this
// design already accepts, so the simpler primitive wins.
export const CAPABILITY_CACHE_NAME = 'arjun-capability-v1';
export const CAPABILITY_MARKER_KEY = '/__arjun_update_prompt_capable__';

// Never throws — a read failure (e.g. storage pressure) is
// indistinguishable from "marker absent" and fails toward the SAME safe
// direction as a genuinely absent marker: at worst one extra silent
// auto-activation for an otherwise-modern client, never a client stuck
// waiting forever.
export async function hasUpdatePromptCapabilityMarker(cachesApi) {
  try {
    const cache = await cachesApi.open(CAPABILITY_CACHE_NAME);
    const match = await cache.match(CAPABILITY_MARKER_KEY);
    return !!match;
  } catch {
    return false;
  }
}

// Never throws — a failed write just means the NEXT worker install also
// (safely) treats this client as unproven; never surfaced to the page,
// never retried aggressively (the page will simply call this again on its
// next mount/controllerchange).
export async function writeUpdatePromptCapabilityMarker(cachesApi) {
  try {
    const cache = await cachesApi.open(CAPABILITY_CACHE_NAME);
    await cache.put(CAPABILITY_MARKER_KEY, new Response('1'));
  } catch {
    // best-effort only
  }
}
