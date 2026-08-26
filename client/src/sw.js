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
// skipWaiting, same absence of clientsClaim(), same NavigationRoute SPA
// fallback, same google-fonts CacheFirst rule. AppUpdatePrompt.jsx's own
// contract (needRefresh / updateServiceWorker(true) / Later / the
// overlay-priority latch) lives entirely in that component and in
// vite-plugin-pwa's client-side `virtual:pwa-register/react` glue — ALL
// of it is registerType-driven, not strategy-driven, so none of it
// needed to change. This file only had to reproduce the one thing
// generateSW used to auto-generate FOR the worker side: the SKIP_WAITING
// message listener below.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// registerType: 'prompt' semantics — replicated manually. Deliberately
// gated behind the exact message vite-plugin-pwa's own
// `updateServiceWorker(true)` sends (`wb.messageSkipWaiting()` ->
// `{type:'SKIP_WAITING'}`) — never unconditional. A new worker installs
// and stays WAITING until AppUpdatePrompt's own Refresh Now tap sends
// this; only then does it activate. No clientsClaim() either — an
// already-open tab must keep running the OLD worker (and therefore old
// JS) until the library's own one-shot "controlling" listener reloads it
// exactly once. Changing either of these two lines would silently
// regress PR #99's entire update-prompt contract back toward
// autoUpdate-style silent self-activation.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
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
