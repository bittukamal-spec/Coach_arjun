import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// One place that decides where the window is scrolled after a navigation
// (founder request, Nov 2026):
//   - opening a page (link, button, redirect) → start at the top;
//   - going back / forward to a page → return to where you were on it.
// Positions are remembered per history entry (location.key) for this tab.
// Pages that load their content after a request get a short window to grow
// tall enough before the saved position is applied.

const positions = new Map();
const RESTORE_WINDOW_MS = 1200;

export default function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  // Keep the current entry's position up to date while the athlete scrolls.
  useEffect(() => {
    const key = location.key;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => positions.set(key, window.scrollY));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    const saved = positions.get(location.key);
    if (navigationType !== 'POP' || saved == null) {
      window.scrollTo(0, 0);
      return undefined;
    }
    // Back/forward: apply the saved position, retrying while the page is
    // still too short to reach it (content arriving from the server).
    let cancelled = false;
    const started = Date.now();
    const tryRestore = () => {
      if (cancelled) return;
      window.scrollTo(0, saved);
      const reached = Math.abs(window.scrollY - saved) < 2;
      if (!reached && Date.now() - started < RESTORE_WINDOW_MS) requestAnimationFrame(tryRestore);
    };
    tryRestore();
    // Any deliberate scroll by the athlete stops further restoring.
    const stop = () => { cancelled = true; };
    window.addEventListener('touchstart', stop, { passive: true, once: true });
    window.addEventListener('wheel', stop, { passive: true, once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('wheel', stop);
    };
  }, [location.key, navigationType]);

  return null;
}
