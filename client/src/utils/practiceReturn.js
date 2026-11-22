// Where a practice goes back to when it ends (founder feedback, Nov 2026):
// a step opened from the path returns to the path on Train, so the athlete
// never loses the flow; otherwise it returns to Tools. sessionStorage, so it
// survives the practice's own inner screens and ends with the tab.
const KEY = 'arjun_practice_from_path';

export function markFromPath() {
  try { sessionStorage.setItem(KEY, '1'); } catch { /* storage blocked */ }
}

export function clearFromPath() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

export function fromPath() {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function practiceHome(fallback = '/tools') {
  return fromPath() ? '/train' : fallback;
}
