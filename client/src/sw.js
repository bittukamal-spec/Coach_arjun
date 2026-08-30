// Arjun's custom service worker (injectManifest strategy).
//
// Replaces the previously fully-generated (generateSW) service worker.
// The switch was required for Push Notifications v1: generateSW has no
// seam for arbitrary custom code — only its own structured `workbox`
// config options — and a `push`/`notificationclick` handler is exactly
// that: arbitrary custom code. injectManifest is the standard, documented
// way to get one: this file is built by its own separate Vite/Rollup
// pass, with `self.__WB_MANIFEST` replaced by the real precache manifest
// at build time (see vite.config.js's `injectManifest.globPatterns` —
// same file types the old `workbox.globPatterns` precached).
//
// Everything below the precache/routing block is a byte-for-byte
// behavioral replica of what generateSW + registerType:'prompt' used to
// generate automatically (verified against a real generateSW build's
// output before this migration — see PR history): same message-gated
// skipWaiting for clients that already support it, same NavigationRoute
// SPA fallback, same google-fonts CacheFirst rule. AppUpdatePrompt.jsx's
// own contract (needRefresh / updateServiceWorker(true) / Later / the
// overlay-priority latch) lives entirely in that component and in
// vite-plugin-pwa's client-side `virtual:pwa-register/react` glue — ALL
// of it is registerType-driven, not strategy-driven, so none of it
// needed to change for that migration. This file only had to reproduce
// the one thing generateSW used to auto-generate FOR the worker side:
// the SKIP_WAITING message listener below.
//
// Legacy-PWA rescue (added later, see the capability-marker section
// below): a client that installed before AppUpdatePrompt existed has no
// code anywhere that could ever send that SKIP_WAITING message — a new
// worker for that client would otherwise sit WAITING forever, no matter
// how many times the athlete reopens the app. clientsClaim() is now
// called, but ONLY for that one rescue path — never for a client that has
// already proven (via the marker) it can handle the normal prompt flow.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { hasUpdatePromptCapabilityMarker, writeUpdatePromptCapabilityMarker } from './swCapability.js';

// ── Legacy-PWA rescue: persistent update-prompt capability marker ───────
//
// The read/write logic itself (cache name/key, fail-safe behavior) lives
// in ./swCapability.js — a small, dependency-free module kept separate
// from this file precisely so it can be exercised with real execution in
// a plain Node test, unlike this file, which imports real Workbox
// packages that assume a genuine browser/ServiceWorker global environment
// (self, registration, clients). See that file's own header comment for
// the full rationale (marker semantics, CacheStorage-over-IndexedDB
// choice, why cleanupOutdatedCaches() below can never touch it).

// Set (or left false) once, during THIS worker instance's own `install`
// event, and read during this SAME instance's own later `activate` event.
// Safe as plain worker-instance (module-scope) state, not "global state
// that can become inconsistent": every deployed version of this script
// gets its own fresh, isolated global scope — a different worker instance
// (an older or a future one) never shares this variable, and the platform
// runs one instance's `install` through to that SAME instance's `activate`
// in one continuous lifecycle without tearing that scope down in between.
// This is the standard, documented way a service worker carries a
// decision from install through to its own activate; it is never read by,
// or written from, any other event or any other worker instance.
let isLegacyRescueActivation = false;

// The install-time migration decision. Marker present -> do nothing here;
// this worker installs and stays WAITING exactly as registerType:'prompt'
// already intends, and only the SKIP_WAITING message below can ever
// activate it — identical to today's behavior for any client that has
// already proven it can handle that flow. Marker absent -> this client is
// legacy-or-unproven; skip the wait automatically so it can never get
// stuck the way a pre-AppUpdatePrompt client otherwise would.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const capable = await hasUpdatePromptCapabilityMarker(caches);
      if (!capable) {
        isLegacyRescueActivation = true;
        self.skipWaiting();
      }
    })()
  );
});

// clientsClaim() only ever runs for the legacy-rescue path decided above
// — never unconditionally, never for the marker-present/modern path. An
// already-open modern tab keeps its OLD controller (and therefore old JS)
// until the athlete's own Refresh Now tap, exactly as before this change;
// only a truly legacy/unproven client gets claimed automatically, so its
// very next navigation or relaunch — no reload is forced on an
// already-open tab — is served current Arjun.
self.addEventListener('activate', (event) => {
  if (isLegacyRescueActivation) {
    event.waitUntil(self.clients.claim());
  }
});

// registerType: 'prompt' semantics — replicated manually. SKIP_WAITING is
// deliberately gated behind the exact message vite-plugin-pwa's own
// `updateServiceWorker(true)` sends (`wb.messageSkipWaiting()` ->
// `{type:'SKIP_WAITING'}`) — never unconditional for a marker-present
// client. A new worker for such a client installs and stays WAITING until
// AppUpdatePrompt's own Refresh Now tap sends this. Changing this would
// silently regress PR #99's entire update-prompt contract back toward
// autoUpdate-style silent self-activation for every client, not just
// legacy ones. MARK_UPDATE_PROMPT_CAPABLE is the other half of the
// rescue above: sent by AppUpdatePrompt.jsx once current page JS is
// actually running; writes the marker; no response is ever sent back.
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'MARK_UPDATE_PROMPT_CAPABLE') {
    event.waitUntil(writeUpdatePromptCapabilityMarker(caches));
  }
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigation fallback — every navigation request is served index.html
// from the precache, same as generateSW's own default NavigationRoute.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Identical to the old workbox.runtimeCaching google-fonts rule.
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ── Push Notifications v1 ───────────────────────────────────────────────
//
// Payload is entirely server-controlled (server/src/services/pushSend.js)
// but is still treated as untrusted input here — the push service, or a
// malformed/old payload, could deliver anything. Fails safe: a malformed
// payload is silently dropped, never throws, never crashes the worker.
//
// The destination route is validated against a small fixed allowlist
// local to this file — deliberately NOT imported from Pilot
// Communications' own CTA allowlist (services/pilotCommunications.js).
// Same pattern, intentionally un-shared code, so the two systems stay
// fully decoupled per product decision.
const ALLOWED_NOTIFICATION_ROUTES = ['/mental-rep', '/dashboard'];
const DEFAULT_NOTIFICATION_ROUTE = '/dashboard';

function safeRoute(route) {
  return ALLOWED_NOTIFICATION_ROUTES.includes(route) ? route : DEFAULT_NOTIFICATION_ROUTE;
}

self.addEventListener('push', (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null; // not valid JSON — fail safe, show nothing
  }

  if (!payload || typeof payload.title !== 'string' || typeof payload.body !== 'string' || !payload.title || !payload.body) {
    return; // malformed — never crash, never show a broken notification
  }

  const title = payload.title.slice(0, 120);
  const body = payload.body.slice(0, 300);
  const route = safeRoute(payload.route);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/brand/arjun/pwa-icon-192.png',
      data: { url: route },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeRoute(event.notification.data && event.notification.data.url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            return client.navigate(url).then((c) => (c || client).focus());
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
