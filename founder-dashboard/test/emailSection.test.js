// Founder Email Center v1 — source-text checks for EmailSection.jsx and its
// wiring into CommunicationsPanel.jsx. Same constraint as the rest of this
// suite: no JSX transform under node:test, so these assert against raw
// source text rather than rendering components.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '../src');
const read = (f) => readFileSync(path.join(srcDir, f), 'utf8');
const email = read('panels/EmailSection.jsx');
const commsPanel = read('panels/CommunicationsPanel.jsx');

function stripComments(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}
const emailCode = stripComments(email);

// ── Location: inside the existing Comms tab, no new bottom-nav tab ──────

test('Email lives inside the existing Comms tab — no new bottom-nav entry is added', () => {
  const nav = read('components/BottomNav.jsx');
  assert.doesNotMatch(nav, /id:\s*'email'/);
  assert.match(nav, /id:\s*'comms'/); // still exactly the one existing Comms tab
});

test('CommunicationsPanel imports and mounts EmailSection via a small in-tab switcher, not a redesign', () => {
  assert.match(commsPanel, /import EmailSection,\s*\{\s*ToolSwitcher\s*\}\s*from\s*'\.\/EmailSection'/);
  assert.match(commsPanel, /tool === 'email'/);
  assert.match(commsPanel, /<EmailSection onSwitchTool=\{setTool\}\s*\/>/);
});

// ── Auth reuse — same session-token helper, never a second auth path ────

test('EmailSection uses the existing authenticated founderFetch helper, not a raw fetch or a static token', () => {
  assert.match(email, /import\s*\{\s*founderFetch\s*\}\s*from\s*'\.\.\/api'/);
  assert.doesNotMatch(emailCode, /FOUNDER_TOKEN/);
  assert.doesNotMatch(emailCode, /VITE_FOUNDER_PIN/);
});

test('EmailSection never calls fetch() directly (bypassing the authenticated helper)', () => {
  assert.doesNotMatch(emailCode, /\bfetch\(/);
});

test('the Resend API key is never referenced anywhere in this frontend package', () => {
  assert.doesNotMatch(email, /RESEND_API_KEY|re_[A-Za-z0-9]{10,}/);
});

// ── Endpoint wiring ──────────────────────────────────────────────────────

test('fetches the audience picker from its own dedicated endpoint (name + email + sport)', () => {
  assert.match(email, /founderFetch\(['"]\/api\/founder\/email\/athletes['"]\)/);
});

test('sends a test email via the dedicated test endpoint', () => {
  assert.match(email, /founderFetch\(['"]\/api\/founder\/email\/test['"],\s*\{[\s\S]{0,60}method:\s*'POST'/);
});

test('sends the real send via a separate dedicated endpoint, not the test one', () => {
  assert.match(email, /founderFetch\(['"]\/api\/founder\/email\/send['"],\s*\{[\s\S]{0,60}method:\s*'POST'/);
});

test('lists sent history and loads per-campaign detail from the founder API', () => {
  assert.match(email, /founderFetch\(['"]\/api\/founder\/email['"]\)/);
  assert.match(email, /founderFetch\(`\/api\/founder\/email\/\$\{id\}`\)/);
});

// ── Compose form — required fields ───────────────────────────────────────

test('the compose form has From name, Subject, Preview text, Body, CTA label, CTA route fields', () => {
  assert.match(email, /From name/);
  assert.match(email, /Subject/);
  assert.match(email, /Preview text/);
  assert.match(email, />Body/);
  assert.match(email, /CTA \(optional/);
});

test('content fields are bounded client-side to the same limits the server enforces', () => {
  assert.match(email, /maxLength=\{40\}/); // fromName
  assert.match(email, /maxLength=\{150\}/); // subject / previewText
  assert.match(email, /maxLength=\{4000\}/); // body
  assert.match(email, /maxLength=\{30\}/); // ctaLabel
});

test('body is a plain textarea — never a rich-HTML editor (no WYSIWYG/contentEditable/dangerouslySetInnerHTML)', () => {
  assert.match(email, /<textarea/);
  assert.doesNotMatch(email, /contentEditable/);
  assert.doesNotMatch(email, /dangerouslySetInnerHTML/);
});

// ── CTA safety — internal allowlist only, server builds the full URL ────

test('the CTA picker only offers routes from a fixed allowlist — no free-text URL field', () => {
  assert.match(email, /const CTA_ROUTES = \[/);
  assert.doesNotMatch(email, /type="url"/);
  assert.doesNotMatch(emailCode, /placeholder="https/i);
});

test('the minimum required routes from the task spec are all offered in the CTA picker', () => {
  for (const route of ['/dashboard', '/mind-journal', '/train', '/coaching', '/account']) {
    assert.match(email, new RegExp(`route:\\s*'${route.replace('/', '\\/')}'`));
  }
});

test('the frontend never constructs or sends a full external CTA URL — only an internal route string', () => {
  assert.doesNotMatch(emailCode, /https?:\/\/(?!.*CTA_ROUTES)/); // no hardcoded external URL literal anywhere
});

// ── Audience selection ───────────────────────────────────────────────────

test('audience offers exactly One athlete, Selected athletes, and All pilot athletes', () => {
  assert.match(email, /'ONE'/);
  assert.match(email, /'SELECTED'/);
  assert.match(email, /'ALL'/);
  assert.match(email, /One athlete/);
  assert.match(email, /All pilot/);
});

test('One-athlete mode is single-select (replaces the previous choice), Selected mode is multi-select (toggles)', () => {
  const fnStart = email.indexOf('function selectAthlete');
  const fnEnd = email.indexOf('\n}', fnStart);
  const fnSource = email.slice(fnStart, fnEnd);
  assert.match(fnSource, /prev\[0\] === id \? \[\] : \[id\]/); // ONE: replace, cap at 1
  assert.match(fnSource, /prev\.includes\(id\) \? prev\.filter/); // SELECTED: toggle
});

test('the send payload sends only a mode + userIds — never a raw recipient email address', () => {
  const match = email.match(/audience = audienceUiMode === 'ALL'[\s\S]{0,120}/);
  assert.ok(match, 'expected to find the audience payload construction');
  assert.doesNotMatch(match[0], /email:/);
});

// ── Confirmation before real send ────────────────────────────────────────

test('a confirmation step shows subject, audience, and CTA before the real send fires', () => {
  assert.match(email, /Ready to send/);
  assert.match(email, /draft\.subject/);
  assert.match(email, /audienceLabel/);
  assert.match(email, /ctaRoute && <p/);
});

test('the compose button only opens confirmation — it does not call POST /send directly', () => {
  const composeButtonMatch = email.match(/onClick=\{\(\) => setConfirming\(true\)\}[\s\S]{0,120}/);
  assert.ok(composeButtonMatch, 'expected the "Review & send" button to only set confirming state');
  assert.doesNotMatch(composeButtonMatch[0], /founderFetch/);
});

test('only the confirmation view\'s "Send email" button calls the real send endpoint', () => {
  const sendRealStart = email.indexOf('async function sendReal');
  const sendRealEnd = email.indexOf('\n  }', sendRealStart);
  const sendRealSource = email.slice(sendRealStart, sendRealEnd);
  assert.match(sendRealSource, /\/api\/founder\/email\/send/);
});

// ── Test send never touches a pilot athlete ──────────────────────────────

test('the test-send action never includes an audience field, and is described as going only to the founder\'s own inbox', () => {
  const testFnStart = email.indexOf('async function sendTest');
  const testFnEnd = email.indexOf('\n  }', testFnStart);
  const testFnSource = email.slice(testFnStart, testFnEnd);
  assert.doesNotMatch(testFnSource, /audience/i);
  assert.match(email, /never a pilot athlete/);
});

test('Send test to myself renders both "Test sent" and "Test failed" outcomes', () => {
  assert.match(email, /'Test sent'/);
  assert.match(email, /'Test failed'/);
});

// ── Sent-history UI: no charts, no inbox, no reply UI ─────────────────────

test('sent history shows Sent/Failed counts, no charts', () => {
  assert.match(email, /StatChip label="Sent"/);
  assert.match(email, /StatChip label="Failed"/);
  assert.doesNotMatch(email, /recharts|<svg.*chart/i);
});

test('detail view shows recipient name, email, status, and sent time — no reply UI, no thread UI', () => {
  assert.match(email, /d\.name/);
  assert.match(email, /d\.email/);
  assert.match(email, /STATUS_LABELS\[d\.status\]/);
  // Targets actual reply/thread AFFORDANCES, not incidental prose — the
  // compose form legitimately describes "Send test to myself" as going to
  // the founder's own configured test address/inbox, which is not a reply
  // or thread feature.
  assert.doesNotMatch(emailCode, /onReply|reply to this|ReplyThread|MessageThread|<Thread\b/i);
});

test('no attachment or search affordance exists anywhere in this file', () => {
  assert.doesNotMatch(emailCode, /attachment/i);
  assert.doesNotMatch(emailCode, /<input[^>]*type="search"/);
});

test('no folder/label organizational UI (Gmail-style) exists — only the plain sent-history list', () => {
  assert.doesNotMatch(emailCode, /\bfolder\b/i);
  assert.doesNotMatch(emailCode, /moveToLabel|applyLabel|labelColor/i);
});

test('no scheduling or drip-campaign affordance exists — every send is immediate, once confirmed', () => {
  assert.doesNotMatch(emailCode, /scheduledAt|scheduleFor|drip/i);
});

// ── Beta Update template ─────────────────────────────────────────────────

test('a Beta Update template is offered and is never auto-sent — it only fills the compose form', () => {
  assert.match(email, /const BETA_UPDATE_TEMPLATE = /);
  assert.match(email, /Load Beta Update template/);
  const loadFnStart = email.indexOf('function loadTemplate');
  const loadFnEnd = email.indexOf('\n  }', loadFnStart);
  const loadFnSource = email.slice(loadFnStart, loadFnEnd);
  assert.doesNotMatch(loadFnSource, /founderFetch/); // fills local state only, no network call
});

test('the Beta Update template body covers reactivation, notifications, and in-app feedback, and thanks the athlete', () => {
  assert.match(email, /notifications/i);
  assert.match(email, /in-app questions|feedback/i);
  assert.match(email, /Thanks for helping us build this properly/);
});

test('the Beta Update template uses the new subject and preview text', () => {
  assert.match(email, /subject:\s*'Arjun Beta Update — help us test the new version'/);
  assert.match(email, /previewText:\s*'Use Arjun naturally for 7 days and help us decide what we improve next\.'/);
});

test('the Beta Update template includes a "BETA UPDATE" label and the "What we need from you this week" / "What\'s changed" sections', () => {
  assert.match(email, /\*\*BETA UPDATE\*\*/);
  assert.match(email, /\*\*What we need from you this week\*\*/);
  assert.match(email, /\*\*What's changed\*\*/);
});

test('the Beta Update template CTA is still exactly /dashboard, using the same allowlisted-route field as before', () => {
  assert.match(email, /ctaRoute:\s*'\/dashboard'/);
});

test('the old "We miss you" retention copy is gone', () => {
  assert.doesNotMatch(email, /We miss you/i);
});

// ── No Coach / Mind Journal / Pilot Communication content ────────────────

test('EmailSection never reads Coach/Mind Journal/safety content — audience identity is name/email/sport only', () => {
  assert.doesNotMatch(emailCode, /mindJournal|safetyEvent|chatSession|\.content\b/i);
});
