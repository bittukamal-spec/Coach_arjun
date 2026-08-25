// App Update Prompt (PWA) — tells the athlete a newer deployed build is
// available and lets them refresh into it on their own terms.
//
// Mounted ONCE at the app root (App.jsx), not gated by auth or route — a
// stale client is a concern regardless of what screen the athlete is on.
// Do not mount a second instance anywhere else.
//
// Detection is entirely client-side: `registerType: 'prompt'` (vite.config.js)
// means a new service worker installs and stays WAITING instead of
// silently self-activating. `useRegisterSW` (virtual:pwa-register/react)
// surfaces that exact moment as `needRefresh` — never a version string,
// never a timer, never a backend call. See node_modules/vite-plugin-pwa's
// own client/build/register.js: `updateServiceWorker(true)` only sends
// the skip-waiting message; the library itself already wires a one-shot
// "controlling" listener (armed once, when the waiting worker was first
// detected) that reloads the page exactly once when the new worker
// actually takes control. This component never hand-rolls that reload —
// doing so would risk exactly the double-reload/loop this pattern avoids.
//
// Priority over Pilot Communication is enforced by hooks/useOverlayPriority.js
// — a tiny domain-neutral shared LATCH, not a live mirror of this
// component's own visibility: once needRefresh is ever true, Pilot
// Communication stays suppressed for the rest of this app load, even
// after the athlete taps Later here. This file never imports anything
// from components/pilotCommunications/*, and never touches its API/state.

import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { markUpdateDetected } from '../hooks/useOverlayPriority';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';
// Don't re-check on every rapid app-switch/tab-focus flap — once a minute
// is frequent enough to catch a foreground return promptly without
// hammering the network on every visibility blip.
const MIN_CHECK_INTERVAL_MS = 60 * 1000;

export default function AppUpdatePrompt() {
  const { language } = useAuth();
  const t = (translations[language] || translations.en).appUpdate;

  const [refreshing, setRefreshing] = useState(false);
  const panelRef = useRef(null);
  const headingRef = useRef(null);
  const registrationRef = useRef(null);
  const lastCheckRef = useRef(0);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swScriptUrl, registration) {
      registrationRef.current = registration || null;
    },
  });

  // Foreground-return check (exactly one listener, added once, cleaned up
  // on unmount — this component only ever mounts once at the app root).
  // `registration.update()` re-fetches this app's OWN /sw.js and compares
  // bytes — the same native mechanism the browser already runs on
  // navigation, just triggered explicitly so a long-backgrounded tab
  // doesn't have to wait for the browser's own lazy background timer. No
  // backend endpoint is involved.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      const registration = registrationRef.current;
      if (!registration) return;
      const now = Date.now();
      if (now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;
      lastCheckRef.current = now;
      registration.update().catch(() => {});
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // The one line that talks to the outside world: latch the shared
  // overlay-priority flag (hooks/useOverlayPriority.js) the first time a
  // genuine update is detected. Deliberately one-directional — this is
  // never called with `false`, and Later (below) never undoes it, so
  // Pilot Communication stays suppressed for the rest of this app load
  // even once this prompt itself has closed.
  useEffect(() => {
    if (needRefresh) markUpdateDetected();
  }, [needRefresh]);

  useEffect(() => {
    if (!needRefresh) return undefined;
    headingRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); handleLater(); return; }
      if (e.key !== 'Tab') return;
      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!nodes || !nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh]);

  if (!needRefresh) return null;

  // In-memory only, current app load only — never persisted. Does NOT
  // activate the waiting worker, so it stays armed: a later full app
  // reopen re-registers, re-discovers the still-waiting worker, and
  // needRefresh flips true again on its own.
  function handleLater() {
    if (refreshing) return; // a refresh is already committed — nothing to dismiss
    setNeedRefresh(false);
  }

  async function handleRefresh() {
    if (refreshing) return; // guards rapid double taps / duplicate activation
    setRefreshing(true);
    try {
      // Sends the skip-waiting message only. The actual, exactly-once
      // reload is handled internally by vite-plugin-pwa's own pre-wired
      // "controlling" listener (see file header) once the new worker
      // actually takes control — never triggered manually here.
      await updateServiceWorker(true);
      // No further action: navigation is pending. Deliberately NOT
      // resetting `refreshing` on success — the button should stay
      // disabled/busy for the rest of this page's short remaining life.
    } catch {
      setRefreshing(false); // only the message itself failed to send — safe to retry
    }
  }

  return (
    // Same centered-modal pattern as PilotCommunicationPopup, z-[70] —
    // strictly above its z-[60] — as a defense-in-depth second guarantee
    // on top of the overlay-priority flag that already prevents both from
    // rendering at once.
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleLater}
        aria-hidden="true"
        data-testid="app-update-backdrop"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-heading"
        aria-describedby="app-update-body"
        data-testid="app-update-popup"
        className="relative w-full max-w-[340px] max-h-[85vh] overflow-y-auto bg-dark-400 border border-dark-600 rounded-3xl p-5"
      >
        <h2
          id="app-update-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-heading font-bold text-ink outline-none break-words mb-2"
        >
          {t.title}
        </h2>
        <p id="app-update-body" className="text-caption text-slt leading-relaxed mb-5 break-words">
          {t.body}
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
            data-testid="app-update-refresh"
            className="btn-primary w-full justify-center disabled:opacity-50"
          >
            {refreshing ? t.refreshing : t.refreshNow}
          </button>
          <button
            type="button"
            onClick={handleLater}
            disabled={refreshing}
            aria-label={t.closeAria}
            data-testid="app-update-later"
            className="w-full text-center text-caption font-semibold text-slt py-3 min-h-[44px] disabled:opacity-50"
          >
            {t.later}
          </button>
        </div>
      </div>
    </div>
  );
}
