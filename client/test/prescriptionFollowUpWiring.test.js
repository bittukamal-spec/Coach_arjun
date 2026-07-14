// Source-text checks for PR-11's deterministic prescription follow-up
// opener client wiring, amended so the claim only ever fires from an
// explicit "enter the main conversation" action (handleContinueMain) —
// never from passive session discovery on mount. ChatPage.jsx contains
// JSX and cannot be imported directly by node:test without a transform,
// so — matching the pattern established by serverCardWiring.test.js and
// quickReplyWiring.test.js — these are source-text assertions.

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

// ── 1. Mounting / discovering the ongoing session never claims ─────────────

test('ChatPage: opening/mounting the chat-entry screen sends no claim request — the init effect never calls claimFollowUpOpener', () => {
  const initStart = chatPageSrc.indexOf('async function init()');
  const initEnd = chatPageSrc.indexOf('\n    init();');
  const initBody = chatPageSrc.slice(initStart, initEnd);
  assert.doesNotMatch(initBody, /claimFollowUpOpener/, 'the mount/init effect must never call claimFollowUpOpener');
});

test('ChatPage: auto-loading the ongoing ChatSession (pending-session and most-recent-session branches) sends no claim request', () => {
  const initStart = chatPageSrc.indexOf('async function init()');
  const initEnd = chatPageSrc.indexOf('\n    init();');
  const initBody = chatPageSrc.slice(initStart, initEnd);

  const pendingIdx = initBody.indexOf('await fetchSessionMessages(pendingId);');
  assert.ok(pendingIdx !== -1);
  const pendingBlock = initBody.slice(pendingIdx, pendingIdx + 150);
  assert.doesNotMatch(pendingBlock, /claimFollowUpOpener/);

  const mainIdx = initBody.indexOf('await fetchSessionMessages(mainSession.id);');
  assert.ok(mainIdx !== -1);
  const mainBlock = initBody.slice(mainIdx, mainIdx + 150);
  assert.doesNotMatch(mainBlock, /claimFollowUpOpener/);
});

// ── 2. Explicit "Continue with Arjun" is the only claim trigger ─────────────

test('ChatPage: clicking Continue (handleContinueMain) triggers exactly one claim for either an existing session or a freshly created one', () => {
  const start = chatPageSrc.indexOf('async function handleContinueMain()');
  const end = chatPageSrc.indexOf('\n  }', start);
  const body = chatPageSrc.slice(start, end);

  const existingSessionMatches = body.match(/claimFollowUpOpener\(existingSession\.id\)/g) || [];
  assert.equal(existingSessionMatches.length, 1, 'exactly one claim call for the existing-session branch');
  assert.match(body, /await fetchSessionMessages\(existingSession\.id\);\s*\n\s*await claimFollowUpOpener\(existingSession\.id\);/);

  const newSessionMatches = body.match(/claimFollowUpOpener\(id\)/g) || [];
  assert.equal(newSessionMatches.length, 1, 'exactly one claim call for the freshly-created-session branch');
  assert.match(body, /const id = await createSession\('general', 'main'\);\s*\n\s*await claimFollowUpOpener\(id\);/);
});

test('ChatPage: claimFollowUpOpener is never referenced inside the entry-choice screen JSX render', () => {
  const idx = chatPageSrc.indexOf('{/* Entry choice screen');
  const end = chatPageSrc.indexOf('{/* Session summary', idx);
  const block = chatPageSrc.slice(idx, end);
  assert.doesNotMatch(block, /claimFollowUpOpener/, 'the entry screen must only ever call handleContinueMain on tap, never claim on render');
});

test('ChatPage: claimFollowUpOpener is not wired to any render-time effect', () => {
  assert.doesNotMatch(chatPageSrc, /useEffect\([^;]*claimFollowUpOpener/s);
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

// ── 6. Claim failure never blocks chat entry, and can retry later ──────────

test('ChatPage: a non-ok claim response clears the in-flight guard for that session (allows a later genuine entry to retry) without throwing', () => {
  const body = fnBody('claimFollowUpOpener');
  assert.match(
    body,
    /if \(!res\.ok\) \{\s*\n\s*followUpClaimedSessionsRef\.current\.delete\(sessionId\);\s*\n\s*return;\s*\n\s*\}/,
    'a non-ok response must clear the guard and return without throwing'
  );
});

test('ChatPage: a network/fetch failure clears the in-flight guard for that session and never re-throws', () => {
  const body = fnBody('claimFollowUpOpener');
  assert.match(
    body,
    /catch \{[^}]*followUpClaimedSessionsRef\.current\.delete\(sessionId\);[^}]*\}/s,
    'the catch block must clear the guard for this session'
  );
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

// ── 7. One claim per entry; a definitive answer does not retry ─────────────

test('ChatPage: a per-session ref guards against firing more than one claim request during the same entry', () => {
  assert.match(chatPageSrc, /const followUpClaimedSessionsRef\s*=\s*useRef\(new Set\(\)\);/);
  const body = fnBody('claimFollowUpOpener');
  assert.match(body, /if \(followUpClaimedSessionsRef\.current\.has\(sessionId\)\) return;/);
  assert.match(body, /followUpClaimedSessionsRef\.current\.add\(sessionId\);/);
});

test('ChatPage: a definitive server answer (ok response, claimed true or false) leaves the guard set rather than clearing it', () => {
  const body = fnBody('claimFollowUpOpener');
  // The only two `.delete(sessionId)` call sites are the !res.ok branch and
  // the catch block — the success path (res.ok, whether claimed true or
  // false) has no matching delete, so the guard stays set for this entry.
  const deleteCalls = body.match(/followUpClaimedSessionsRef\.current\.delete\(sessionId\)/g) || [];
  assert.equal(deleteCalls.length, 2, 'exactly two failure paths clear the guard — not the success path');
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
