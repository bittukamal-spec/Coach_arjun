// Source-text checks for PR-11's deterministic prescription follow-up
// opener client wiring. ChatPage.jsx contains JSX and cannot be imported
// directly by node:test without a transform, so — matching the pattern
// established by serverCardWiring.test.js and quickReplyWiring.test.js —
// these are source-text assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const chatPageSrc = readFileSync(path.join(root, 'src/pages/ChatPage.jsx'), 'utf8');

function fnBody(name) {
  const start = chatPageSrc.indexOf(`async function ${name}(`);
  assert.ok(start !== -1, `expected an async function named ${name}`);
  const end = chatPageSrc.indexOf('\n  }', start);
  return chatPageSrc.slice(start, end);
}

// ── 1. Claim happens when continuing/entering the main chat ────────────────

test('ChatPage: the mount auto-load path claims the follow-up opener for both the pending-session and most-recent-session branches', () => {
  const initStart = chatPageSrc.indexOf('async function init()');
  const initEnd = chatPageSrc.indexOf('\n    init();');
  const initBody = chatPageSrc.slice(initStart, initEnd);

  const pendingIdx = initBody.indexOf('await fetchSessionMessages(pendingId);');
  const pendingBlock = initBody.slice(pendingIdx, pendingIdx + 150);
  assert.match(pendingBlock, /await claimFollowUpOpener\(pendingId\);/);

  const mainIdx = initBody.indexOf('await fetchSessionMessages(mainSession.id);');
  const mainBlock = initBody.slice(mainIdx, mainIdx + 150);
  assert.match(mainBlock, /await claimFollowUpOpener\(mainSession\.id\);/);
});

test('ChatPage: handleContinueMain claims the follow-up opener for both an existing session and a freshly created one', () => {
  const start = chatPageSrc.indexOf('async function handleContinueMain()');
  const end = chatPageSrc.indexOf('\n  }', start);
  const body = chatPageSrc.slice(start, end);
  assert.match(body, /await fetchSessionMessages\(existingSession\.id\);\s*\n\s*await claimFollowUpOpener\(existingSession\.id\);/);
  assert.match(body, /const id = await createSession\('general', 'main'\);\s*\n\s*await claimFollowUpOpener\(id\);/);
});

// ── 2. Not called merely for viewing the entry screen ───────────────────────

test('ChatPage: claimFollowUpOpener is never referenced inside the entry-choice screen JSX render', () => {
  const idx = chatPageSrc.indexOf('{/* Entry choice screen');
  const end = chatPageSrc.indexOf('{/* Session summary', idx);
  const block = chatPageSrc.slice(idx, end);
  assert.doesNotMatch(block, /claimFollowUpOpener/, 'the entry screen must only ever call handleContinueMain on tap, never claim on render');
});

test('ChatPage: claimFollowUpOpener is not wired to a showStartScreen-keyed effect', () => {
  assert.doesNotMatch(chatPageSrc, /useEffect\([^;]*claimFollowUpOpener[^;]*\[showStartScreen\]/s);
});

// ── 3. Consent gate ──────────────────────────────────────────────────────────

test('ChatPage: claimFollowUpOpener skips the request entirely when guardian consent is pending', () => {
  const body = fnBody('claimFollowUpOpener');
  assert.match(body, /if \(!sessionId \|\| consentPending\) return;/);
});

// ── 4. Request shape ─────────────────────────────────────────────────────────

test('ChatPage: the claim request posts to /api/prescriptions/claim-opener with the active chatSessionId', () => {
  const body = fnBody('claimFollowUpOpener');
  assert.match(body, /apiFetch\('\/api\/prescriptions\/claim-opener'/);
  assert.match(body, /method: 'POST'/);
  assert.match(body, /body: JSON\.stringify\(\{ chatSessionId: sessionId \}\)/);
});

// ── 5. Refresh from persisted history, never a local duplicate ─────────────

test('ChatPage: a successful claim refreshes messages from the server instead of appending locally', () => {
  const body = fnBody('claimFollowUpOpener');
  assert.match(body, /if \(data\.claimed\) await fetchSessionMessages\(sessionId\);/);
  assert.doesNotMatch(body, /setMessages/, 'the opener must only ever arrive via a persisted-message reload, never a direct setMessages call');
});

// ── 6. Claim failure never blocks chat entry ────────────────────────────────

test('ChatPage: a claim failure is swallowed and never re-thrown, never blocking chat entry', () => {
  const body = fnBody('claimFollowUpOpener');
  assert.match(body, /catch \{ \/\* a claim failure must never block chat entry \*\/ \}/);
});

test('ChatPage: handleContinueMain reveals the chat regardless of what claimFollowUpOpener does', () => {
  const start = chatPageSrc.indexOf('async function handleContinueMain()');
  const end = chatPageSrc.indexOf('\n  }', start);
  const body = chatPageSrc.slice(start, end);
  // setShowStartScreen(false) runs unconditionally after the claim attempt —
  // claimFollowUpOpener never throws (guarded by its own try/catch above),
  // so entry is never gated on the claim outcome.
  assert.match(body, /await claimFollowUpOpener\(existingSession\.id\);\s*\n\s*setShowStartScreen\(false\);/);
});

// ── 7. Idempotent per session per mount ─────────────────────────────────────

test('ChatPage: a per-session ref guards against firing the claim request more than once per mount', () => {
  assert.match(chatPageSrc, /const followUpClaimedSessionsRef\s*=\s*useRef\(new Set\(\)\);/);
  const body = fnBody('claimFollowUpOpener');
  assert.match(body, /if \(followUpClaimedSessionsRef\.current\.has\(sessionId\)\) return;/);
  assert.match(body, /followUpClaimedSessionsRef\.current\.add\(sessionId\);/);
});

// ── 8. Quick Chat is unaffected ──────────────────────────────────────────────

test('ChatPage: the Quick Chat cleanup effect never references claimFollowUpOpener', () => {
  const idx = chatPageSrc.indexOf('Quick chat cleanup: delete session on tab hide or unmount');
  assert.ok(idx !== -1);
  const end = chatPageSrc.indexOf("}, [chatMode, chatSessionId, token]);", idx);
  const block = chatPageSrc.slice(idx, end);
  assert.doesNotMatch(block, /claimFollowUpOpener/);
});

test('ChatPage: createSession is only ever called in a main-mode context, so the follow-up claim never reaches Quick Chat', () => {
  const matches = [...chatPageSrc.matchAll(/(?:await )?createSession\(([^)]*)\)/g)]
    .map((m) => m[1])
    .filter((args) => !args.startsWith('type ')); // excludes the `function createSession(type = ..., mode = ...)` definition itself
  assert.ok(matches.length > 0, 'expected at least one createSession(...) call site');
  for (const args of matches) {
    assert.match(args, /'main'/, `createSession call "${args}" must be main-mode only`);
  }
});
