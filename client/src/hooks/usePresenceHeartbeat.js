import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';

// Pilot Presence Tracking — the athlete-side half of the "Live now" /
// "Seen X ago" signal on the Founder Dashboard (server/src/routes/
// activity.js's POST /presence, server/src/services/presence.js's
// touchPresence(), User.lastSeenAt). Deliberately the OTHER signal from
// meaningful-activity tracking — this only ever says "Arjun was open", not
// "the athlete did something" — and it never touches that system.
//
// Mounted exactly once, at the app root (see App.jsx), not on individual
// pages — a single subscription for the whole authenticated session.
//
// Behaviour:
//   - touches presence once whenever an authenticated session becomes
//     available (first load with a cached token, a fresh login, or a
//     session restored later) — the effect re-runs on every `token`
//     transition, which covers all three the same way
//   - touches again whenever the tab returns to the foreground
//     (visibilitychange -> 'visible')
//   - while visible, a ~60s interval keeps touching; the interval is
//     started only when visible and stopped immediately on hide — no
//     heartbeat ever ticks while the tab is hidden/backgrounded
//   - a small minimum gap between touches absorbs a rapid background/
//     foreground flap so it can never turn into a write storm
//   - every request is fire-and-forget: a failure is caught and dropped,
//     never surfaced to the athlete, never retried aggressively
//
// Never reads or writes localStorage for any of this — the server's own
// stored timestamp is the only source of truth for "live".

const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const MIN_TOUCH_GAP_MS = 15 * 1000;

export function usePresenceHeartbeat() {
  const { token } = useAuth();
  const lastTouchAtRef = useRef(0);

  useEffect(() => {
    if (!token) return; // unauthenticated — no touch, no listener, no timer

    function touch() {
      const now = Date.now();
      if (now - lastTouchAtRef.current < MIN_TOUCH_GAP_MS) return;
      lastTouchAtRef.current = now;
      apiFetch('/api/activity/presence', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {
        // Silent — a presence-touch failure must never surface as an
        // athlete-facing error, and never blocks anything else in the app.
      });
    }

    let intervalId = null;
    function startHeartbeat() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') touch();
      }, HEARTBEAT_INTERVAL_MS);
    }
    function stopHeartbeat() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        touch();
        startHeartbeat();
      } else {
        stopHeartbeat();
      }
    }

    // Initial touch — covers first load and a session restored from auth,
    // both of which just mean "this effect is running with a real token".
    touch();
    if (document.visibilityState === 'visible') startHeartbeat();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token]);
}
