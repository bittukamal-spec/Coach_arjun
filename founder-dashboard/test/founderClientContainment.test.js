// Source-text checks for the founder-dashboard security containment (PR-7).
// No JSX transform is available under node:test here (same constraint as
// client/test/*.test.js in the main app), so these assert against the raw
// source text rather than rendering components — the established pattern
// for this repo's client-side tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '../src');
const read = (f) => readFileSync(path.join(srcDir, f), 'utf8');

const ALL_SRC_FILES = [
  'App.jsx',
  'api.js',
  'main.jsx',
  'panels/PulsePanel.jsx',
  'panels/SafetyPanel.jsx',
  'panels/PromptPanel.jsx',
  'panels/CoachPanel.jsx',
  'panels/BuildPanel.jsx',
  'components/BottomNav.jsx',
  'components/StatCard.jsx',
];

test('no VITE_FOUNDER_PIN reference remains anywhere in the dashboard source', () => {
  for (const f of ALL_SRC_FILES) {
    assert.doesNotMatch(read(f), /VITE_FOUNDER_PIN/, `${f} still references VITE_FOUNDER_PIN`);
  }
});

test('no VITE_FOUNDER_TOKEN reference remains anywhere in the dashboard source', () => {
  for (const f of ALL_SRC_FILES) {
    assert.doesNotMatch(read(f), /VITE_FOUNDER_TOKEN/, `${f} still references VITE_FOUNDER_TOKEN`);
  }
});

test('the unrelated API-base variable is untouched', () => {
  assert.match(read('api.js'), /VITE_ARJUN_API_URL/);
});

test('no auto-authentication when a PIN variable is missing (no "if (!PIN) return" bypass)', () => {
  const app = read('App.jsx');
  assert.doesNotMatch(app, /if\s*\(\s*!PIN\s*\)/);
});

test('the founder session is never stored in localStorage', () => {
  // Scoped to the files that manage the founder session — CoachPanel.jsx
  // and BuildPanel.jsx legitimately use localStorage for their own
  // unrelated local scratch data (pre-existing, out of scope here).
  for (const f of ['api.js', 'App.jsx']) {
    // Comments legitimately *explain* that sessionStorage (not localStorage)
    // is used — strip them before asserting no actual localStorage API call
    // exists in code.
    const codeOnly = read(f).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(codeOnly, /localStorage\./, `${f} must not use localStorage for the founder session`);
  }
});

test('the founder session is stored in sessionStorage only, under a dedicated key', () => {
  const api = read('api.js');
  assert.match(api, /sessionStorage\.(setItem|getItem|removeItem)\(SESSION_KEY/);
});

test('login calls the secure server endpoint, not a client-side PIN comparison', () => {
  const api = read('api.js');
  assert.match(api, /\/api\/founder\/auth\/login/);
  assert.match(api, /method:\s*'POST'/);
  // No client-side PIN equality check anywhere in the login flow.
  assert.doesNotMatch(api, /pin\s*===\s*PIN|value\s*===\s*PIN/);
});

test('startup session validation calls the secure server session-check endpoint', () => {
  const api = read('api.js');
  assert.match(api, /\/api\/founder\/auth\/session/);
});

test('protected requests use Bearer authentication with the session token, not a static token', () => {
  const api = read('api.js');
  assert.match(api, /Authorization.*Bearer \$\{token\}/);
  assert.doesNotMatch(api, /Bearer \$\{.*[Ss]tatic/);
});

test('a 401 response clears the stored founder session', () => {
  const api = read('api.js');
  const idx = api.indexOf('r.status === 401');
  assert.ok(idx !== -1, 'expected a 401 check in founderFetch');
  const block = api.slice(idx, idx + 200);
  assert.match(block, /clearFounderSession\(\)/);
});

test('the PIN and session token are never logged', () => {
  for (const f of ALL_SRC_FILES) {
    const src = read(f);
    assert.doesNotMatch(src, /console\.(log|error|warn|info|debug)\([^)]*\b(pin|token)\b/i, `${f} appears to log a PIN or token value`);
  }
});

test('the PIN and session token are never placed in a URL', () => {
  const api = read('api.js');
  // The only interpolations into a URL template are `base` and `path` —
  // never `token` or `pin`.
  assert.doesNotMatch(api, /`\$\{base\}[^`]*\$\{(pin|token)\}/);
});

test('SafetyEvent review payload contains only reviewStatus/reviewOutcome — no free-text note field', () => {
  const panel = read('panels/SafetyPanel.jsx');
  const idx = panel.indexOf('/review');
  assert.ok(idx !== -1, 'expected a review request in SafetyPanel');
  const block = panel.slice(idx, idx + 300);
  assert.match(block, /reviewStatus:\s*'REVIEWED'/);
  assert.match(block, /reviewOutcome/);
  assert.doesNotMatch(block, /note\s*:/i);
});

test('SafetyPanel never fetches raw chat messages', () => {
  const panel = read('panels/SafetyPanel.jsx');
  assert.doesNotMatch(panel, /\/api\/chat\/messages/);
  assert.doesNotMatch(panel, /ChatMessage/);
});

test('the affected legacy panel (Pulse) no longer calls founderFetch and shows a temporarily-unavailable state instead of restoring the static token', () => {
  const pulse = read('panels/PulsePanel.jsx');
  assert.doesNotMatch(pulse, /founderFetch/);
  assert.match(pulse, /Temporarily unavailable/i);
});
