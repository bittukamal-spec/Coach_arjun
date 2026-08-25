// Source-text checks for the Communications panel (Pilot Communications
// v1). Same constraint/pattern as pilotPanel.test.js / founderClientContainment.test.js:
// no JSX transform is available under node:test here, so these assert
// against the raw source text rather than rendering components.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '../src');
const read = (f) => readFileSync(path.join(srcDir, f), 'utf8');
const panel = read('panels/CommunicationsPanel.jsx');

// ── Tab wiring ───────────────────────────────────────────────────────────

test('a Comms tab is registered in BottomNav', () => {
  const nav = read('components/BottomNav.jsx');
  assert.match(nav, /id:\s*'comms'/);
  assert.match(nav, /label:\s*'Comms'/);
});

test('the Comms tab is wired to CommunicationsPanel in App.jsx', () => {
  const app = read('App.jsx');
  assert.match(app, /import CommunicationsPanel\s+from\s+'\.\/panels\/CommunicationsPanel'/);
  assert.match(app, /comms:\s*CommunicationsPanel/);
});

// ── Auth reuse ───────────────────────────────────────────────────────────

test('CommunicationsPanel uses the existing authenticated founderFetch helper, not a raw fetch or a static token', () => {
  assert.match(panel, /import\s*\{\s*founderFetch\s*\}\s*from\s*'\.\.\/api'/);
  assert.doesNotMatch(panel, /FOUNDER_TOKEN/);
  assert.doesNotMatch(panel, /VITE_FOUNDER_PIN/);
});

test('CommunicationsPanel never calls fetch() directly (bypassing the authenticated helper)', () => {
  assert.doesNotMatch(panel, /\bfetch\(/);
});

// ── Endpoint wiring ──────────────────────────────────────────────────────

test('lists communications from the founder API', () => {
  assert.match(panel, /founderFetch\(['"]\/api\/founder\/pilot-communications['"]\)/);
});

test('fetches the pilot athlete checklist from its own dedicated endpoint', () => {
  assert.match(panel, /founderFetch\(['"]\/api\/founder\/pilot-communications\/athletes['"]\)/);
});

test('creates via POST then publishes via a separate POST /:id/publish call', () => {
  assert.match(panel, /founderFetch\(['"]\/api\/founder\/pilot-communications['"],\s*\{[\s\S]{0,80}method:\s*'POST'/);
  assert.match(panel, /founderFetch\(`\/api\/founder\/pilot-communications\/\$\{communication\.id\}\/publish`,\s*\{[\s\S]{0,40}method:\s*'POST'/);
});

test('deactivates via PATCH /:id/deactivate', () => {
  assert.match(panel, /\/deactivate`,\s*\{\s*method:\s*'PATCH'\s*\}/);
});

// ── Create form: server-side validation is never bypassed by trusting the client alone ──

test('title and body inputs are bounded client-side to the same limits the server enforces (100 / 500)', () => {
  assert.match(panel, /maxLength=\{100\}/);
  assert.match(panel, /maxLength=\{500\}/);
});

test('custom survey options are capped at 5 and each bounded to 40 chars, matching the server allowlist', () => {
  assert.match(panel, /customOptions\.length < 5/);
  assert.match(panel, /maxLength=\{40\}/);
  assert.match(panel, /customOptions\.length > 2/, 'cannot shrink below the 2-option minimum');
});

test('the CTA picker only offers routes from a fixed allowlist — no free-text URL field', () => {
  assert.match(panel, /const CTA_ROUTES = \[/);
  assert.doesNotMatch(panel, /type="url"/);
  assert.doesNotMatch(panel, /placeholder="https/i);
});

test('survey response format offers exactly the three approved structured shapes, never free text', () => {
  assert.match(panel, /YES_SOMEWHAT_NO/);
  assert.match(panel, /RATING_1_5/);
  assert.match(panel, /CUSTOM_SINGLE_CHOICE/);
  assert.doesNotMatch(panel, /FREE_TEXT/);
  assert.doesNotMatch(panel, /<textarea[^>]*response/i);
});

test('audience picker offers exactly ALL or SELECTED, never a free-text id list', () => {
  assert.match(panel, /audienceMode === 'ALL'/);
  assert.match(panel, /audienceMode === 'SELECTED'/);
  assert.doesNotMatch(panel, /userIds\.split/);
});

test('the create flow shows a confirmation step naming the selected audience before publishing', () => {
  assert.match(panel, /Ready to publish/);
  assert.match(panel, /selectedAthleteLabel/);
});

// ── Detail/results view ──────────────────────────────────────────────────

test('detail view shows targeted/seen/responded/dismissed counts and per-athlete status, no charts', () => {
  assert.match(panel, /StatChip label="Targeted"/);
  assert.match(panel, /StatChip label="Seen"/);
  assert.match(panel, /StatChip label="Dismissed"/);
  assert.match(panel, /athletes\.map/);
  assert.doesNotMatch(panel, /recharts|<svg.*chart/i);
});

test('a Deactivate action is offered only while the communication is active', () => {
  assert.match(panel, /c\.isActive && \(/);
  assert.match(panel, />\s*\{busy \? 'Deactivating…' : 'Deactivate'\}/);
});

// ── No athlete free-text content rendered ───────────────────────────────

test('CommunicationsPanel never renders chat/journal/prescription free-text fields', () => {
  assert.doesNotMatch(panel, /\.content\b/);
  assert.doesNotMatch(panel, /cardContent/);
  assert.doesNotMatch(panel, /outcomeLesson/);
  assert.doesNotMatch(panel, /arjunNote|arjunInsight|arjunResponse/);
});

test('CommunicationsPanel reads no raw guardian email or other unrelated private athlete field', () => {
  assert.doesNotMatch(panel, /guardianEmail/);
  assert.doesNotMatch(panel, /\bemail\b/i);
});

// ── No push / scheduling / external links slipped in ────────────────────

test('no push-notification, scheduling, or external-link affordance exists in this panel', () => {
  assert.doesNotMatch(panel, /Notification\.|serviceWorker|scheduledAt|scheduleFor/i);
  assert.doesNotMatch(panel, /https?:\/\//);
});
