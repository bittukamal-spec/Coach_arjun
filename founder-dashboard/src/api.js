const base = import.meta.env.VITE_ARJUN_API_URL ?? '';

// Short-lived founder session token — kept only in sessionStorage (cleared
// when the tab closes), never localStorage, never a URL, never logged.
const SESSION_KEY = 'fd_session_token';

let onUnauthorized = null;
// Registered once by App.jsx so any 401 anywhere (not just from one panel)
// can drop the app back to the login screen.
export function setOnUnauthorized(fn) {
  onUnauthorized = fn;
}

export function getFounderSession() {
  return sessionStorage.getItem(SESSION_KEY) || '';
}

export function setFounderSession(token) {
  sessionStorage.setItem(SESSION_KEY, token);
}

export function clearFounderSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// POST /api/founder/auth/login — exchanges the PIN for a short-lived
// session token. Never distinguishes wrong-PIN from missing server config;
// the server already collapses both into the same response.
export async function founderLogin(pin) {
  const r = await fetch(`${base}/api/founder/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });

  if (r.status === 429) {
    throw new Error('Too many attempts. Please wait a few minutes and try again.');
  }
  if (!r.ok) {
    throw new Error('Incorrect PIN.');
  }

  const data = await r.json();
  setFounderSession(data.token);
  return data;
}

// GET /api/founder/auth/session — used on startup to check whether a
// stored token is still valid before showing the dashboard.
export async function founderValidateSession() {
  const token = getFounderSession();
  if (!token) return false;
  try {
    const r = await founderFetch('/api/founder/auth/session');
    return r.ok;
  } catch {
    return false;
  }
}

// Authenticated fetch for every protected founder endpoint. Any 401 clears
// the stored session and notifies the app to return to login.
export async function founderFetch(path, init = {}) {
  const token = getFounderSession();
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (r.status === 401) {
    clearFounderSession();
    onUnauthorized?.();
  }

  return r;
}
