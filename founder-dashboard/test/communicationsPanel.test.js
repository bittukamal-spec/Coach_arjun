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

// ── No scheduling / external links / raw browser Notification API ───────

test('no scheduling engine or arbitrary-external-link affordance exists in this panel', () => {
  assert.doesNotMatch(panel, /scheduledAt|scheduleFor/i);
  assert.doesNotMatch(panel, /https?:\/\//);
  // The panel never touches the browser Notification/serviceWorker APIs
  // directly — those are athlete-side only (client/src/hooks/
  // usePushNotifications.js). The one push affordance here is a founder-
  // triggered SERVER call, tested in its own section below.
  assert.doesNotMatch(panel, /Notification\.|navigator\.serviceWorker/);
});

// ── Push Notifications v1: founder "Send test notification" utility ─────
// Operational testing utility only — see server/src/routes/founderPushTest.js.
// Never a broadcast: exactly one founder-selected athlete, the approved
// curated copy library only, no free-text push content, no external URL.

test('Send test notification calls the dedicated founder-only test-push endpoint via founderFetch', () => {
  assert.match(panel, /founderFetch\(['"]\/api\/founder\/push-test['"],\s*\{/);
  assert.match(panel, /method:\s*'POST'/);
});

test('the test-push call sends only userId — no title/body/message content of any kind', () => {
  const match = panel.match(/founderFetch\(['"]\/api\/founder\/push-test['"],\s*\{[\s\S]{0,200}?\}\);/);
  assert.ok(match, 'expected to find the push-test founderFetch call');
  const call = match[0];
  assert.match(call, /body:\s*JSON\.stringify\(\{\s*userId:\s*selectedId\s*\}\)/);
  assert.doesNotMatch(call, /title/i); // no free-text fields riding along
});

test('no free-text input exists anywhere near the test-push affordance — athlete selection is a picker, not typed text', () => {
  const senderStart = panel.indexOf('function TestPushSender');
  assert.ok(senderStart !== -1, 'expected a TestPushSender component');
  const senderEnd = panel.indexOf('\n// ── Panel root', senderStart);
  const senderSource = panel.slice(senderStart, senderEnd === -1 ? undefined : senderEnd);
  assert.doesNotMatch(senderSource, /<textarea/);
  assert.doesNotMatch(senderSource, /<input/);
  assert.match(senderSource, /<select/);
});

test('the test-push result renders only the three approved outcomes — no custom/error-detail leakage', () => {
  assert.match(panel, /sent:\s*'Sent'/);
  assert.match(panel, /no_subscription:\s*'No active notification subscription'/);
  assert.match(panel, /failed:\s*'Delivery failed'/);
});

test('the test-push affordance never lets the founder pick "all athletes" — single-select only, reusing the existing athlete list endpoint', () => {
  assert.match(panel, /founderFetch\(['"]\/api\/founder\/pilot-communications\/athletes['"]\)/);
  const senderStart = panel.indexOf('function TestPushSender');
  const senderEnd = panel.indexOf('\n// ── Panel root', senderStart);
  const senderSource = panel.slice(senderStart, senderEnd === -1 ? undefined : senderEnd);
  assert.doesNotMatch(senderSource, /audienceMode|'ALL'/);
  assert.doesNotMatch(senderSource, /multiple/); // <select> is single-value, not a multi-select
});
