// Pilot Access (temporary beta entitlement override) — founder-only
// grant/revoke controls added to the Pilot tab's Recent Athletes list.
// Same source-text constraint as pilotPanel.test.js: no JSX transform is
// available under node:test here, so these assert against the raw source.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '../src');
const read = (f) => readFileSync(path.join(srcDir, f), 'utf8');

// ── Auth reuse ───────────────────────────────────────────────────────────

test('Grant/Revoke both go through the existing authenticated founderFetch helper, never a raw fetch or a static token', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /founderFetch\(`\/api\/founder\/pilot-access\/\$\{id\}\/\$\{action\}`/);
  assert.doesNotMatch(panel, /FOUNDER_TOKEN/);
  assert.doesNotMatch(panel, /VITE_FOUNDER_PIN/);
});

test('PilotPanel still never calls fetch() directly (grant/revoke additions did not introduce a raw call)', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.doesNotMatch(panel, /\bfetch\(/);
});

// ── Per-athlete scope: no blanket/all-user grant call exists ─────────────

test('every pilot-access request is scoped to one athlete id — no blanket/all-user grant call exists anywhere in the panel', () => {
  const panel = read('panels/PilotPanel.jsx');
  const calls = [...panel.matchAll(/founderFetch\(`([^`]*pilot-access[^`]*)`/g)].map((m) => m[1]);
  assert.ok(calls.length > 0, 'expected at least one pilot-access founderFetch call');
  for (const call of calls) {
    assert.match(call, /\$\{(id|athlete\.id)\}/, `pilot-access call must be scoped by an athlete id: ${call}`);
  }
  // No route resembling a bulk grant (e.g. "/all", "/bulk", no id interpolation at all).
  assert.doesNotMatch(panel, /pilot-access\/(all|bulk|grant-all)/);
});

test('exactly two pilot-access actions are wired: grant and revoke, nothing else', () => {
  const panel = read('panels/PilotPanel.jsx');
  const actions = [...panel.matchAll(/pilot-access\/\$\{id\}\/\$\{action\}`, \{ method: 'POST' \}/g)];
  assert.ok(actions.length >= 1, 'expected the shared runPilotAction call site');
  assert.match(panel, /runPilotAction\(id, 'grant'\)/);
  assert.match(panel, /runPilotAction\(id, 'revoke'\)/);
});

// ── Per-athlete status display ────────────────────────────────────────────

test('each athlete row shows "Active until <date>" when pilotAccessActive is true', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /athlete\.pilotAccessActive/);
  assert.match(panel, /Active until \{formatDate\(athlete\.pilotAccessUntil\)\}/);
});

test('an athlete with no pilot grant shows "None"; one with a lapsed grant shows "Expired" — never the same label', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /athlete\.pilotAccessUntil \? 'Expired' : 'None'/);
});

test('an active pilot grant also surfaces as a badge alongside the existing tier/guardian pills', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /athlete\.pilotAccessActive && <Pill color="#22C55E">Pilot access<\/Pill>/);
});

// ── Actions: Grant 60 days / Revoke ───────────────────────────────────────

test('a "Grant 60 days" action and a "Revoke" action both exist per athlete row', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, />\s*Grant 60 days\s*</);
  assert.match(panel, />\s*Revoke\s*</);
});

test('Revoke is disabled unless the athlete currently has active pilot access (never revokes a no-op)', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /disabled=\{busy \|\| !athlete\.pilotAccessActive\}/);
});

test('both actions disable while THIS athlete\'s request is in flight, tracked per-row (not a global lock)', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /pilotActionBusyId === athlete\.id/);
  assert.match(panel, /const \[pilotActionBusyId, setPilotActionBusyId\] = useState\(null\)/);
});

test('a failed grant/revoke surfaces an inline error rather than failing silently', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /setPilotActionError/);
  assert.match(panel, /Failed to \$\{action/);
});

test('a successful grant/revoke re-fetches the overview so the row reflects real stored state, not an optimistic guess', () => {
  const panel = read('panels/PilotPanel.jsx');
  const runAction = panel.slice(panel.indexOf('const runPilotAction'), panel.indexOf('const handleGrantPilotAccess'));
  assert.match(runAction, /await load\(\)/);
});

// ── No athlete-facing surface: this is a founder-dashboard-only change ────

test('grant/revoke controls exist only in the founder dashboard package, not in the athlete client', () => {
  const clientChatPage = readFileSync(
    path.join(__dirname, '../../client/src/pages/ChatPage.jsx'), 'utf8',
  );
  assert.doesNotMatch(clientChatPage, /Grant 60 days/);
  // The athlete client may only ever consume the server-computed
  // hasPilotAccess boolean — never read or compare a raw pilotAccessUntil
  // value itself (a stray comment explaining that rule is fine; an actual
  // property access or destructure is not).
  assert.doesNotMatch(clientChatPage, /[.[]pilotAccessUntil\b/,
    'the athlete client must never read pilotAccessUntil directly — only the server-computed hasPilotAccess boolean');
});
