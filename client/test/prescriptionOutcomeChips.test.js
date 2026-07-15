// Source-text checks for PR-13's deterministic prescription-outcome
// follow-up choices on the client. ChatPage.jsx contains JSX and cannot be
// imported directly by node:test without a transform, so — matching the
// established pattern (quickReplyWiring.test.js, prescriptionFollowUpWiring.test.js)
// — these are source-text assertions.

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

// ── 1. Separate state from offer_quick_replies ─────────────────────────────

test('ChatPage: outcome choices live in their own state, separate from quickReplies', () => {
  assert.match(chatPageSrc, /const \[outcomeChoices, setOutcomeChoices\]\s*=\s*useState\(null\)/);
});

test('ChatPage: the offer_quick_replies 2-3 reply contract is untouched — parseQuickRepliesEvent is still used only for the SSE t:"quick_replies" event', () => {
  const idx = chatPageSrc.indexOf("data.t === 'quick_replies'");
  const block = chatPageSrc.slice(idx, idx + 600);
  assert.match(block, /parseQuickRepliesEvent\(data\)/);
  assert.doesNotMatch(block, /outcomeChoices|setOutcomeChoices/, 'outcome choices must never come from the offer_quick_replies SSE event');
});

// ── 2. Populated from claim-opener's response, never model-generated ──────

test('ChatPage: claimFollowUpOpener sets outcomeChoices only when the server reports outcomePending, with the exact server-provided array', () => {
  const body = fnBody('claimFollowUpOpener');
  assert.match(body, /if \(data\.outcomePending && Array\.isArray\(data\.outcomeChoices\)\) \{/);
  assert.match(body, /setOutcomeChoices\(data\.outcomeChoices\);/);
});

// ── 3. Rendering: four deterministic chips + "Write my own" ────────────────

test('ChatPage: outcome choices render with the same QuickReplyChips component (four chips + "Write my own"), only once streaming has fully finished', () => {
  const idx = chatPageSrc.indexOf('outcomeChoices && (');
  assert.ok(idx !== -1, 'expected an outcomeChoices render guard');
  const guardSlice = chatPageSrc.slice(Math.max(0, idx - 100), idx);
  assert.match(guardSlice, /!showStartScreen && !streaming && !waitingForFirst && /);
  const block = chatPageSrc.slice(idx, idx + 300);
  assert.match(block, /<QuickReplyChips/);
  assert.match(block, /replies=\{outcomeChoices\}/);
});

// ── 4. Selecting a choice sends only its label through the normal chat path ─

test('ChatPage: tapping an outcome choice sends only its label through sendMessage — no direct outcome endpoint is ever called from a chip', () => {
  const idx = chatPageSrc.indexOf('replies={outcomeChoices}');
  const block = chatPageSrc.slice(idx, idx + 300);
  assert.match(block, /onSelect=\{\(label\) => sendMessage\(label\)\}/);
  assert.doesNotMatch(block, /apiFetch/, 'no direct outcome-recording request is ever made from the chip itself');
});

// ── 5. "Write my own" clears choices and focuses input; custom reply still possible ─

test('ChatPage: "Write my own" for outcome choices clears them and focuses the text input, without sending anything', () => {
  const idx = chatPageSrc.indexOf('replies={outcomeChoices}');
  const block = chatPageSrc.slice(idx, idx + 300);
  assert.match(block, /onWriteMyOwn=\{\(\) => \{ setOutcomeChoices\(null\); inputRef\.current\?\.focus\(\); \}\}/);
  assert.doesNotMatch(block, /onWriteMyOwn=\{\(\) => \{ setOutcomeChoices\(null\); inputRef\.current\?\.focus\(\); \}\}.*sendMessage/s);
});

test('ChatPage: the normal text input remains available alongside outcome choices — the input area\'s own mount condition is untouched', () => {
  assert.match(chatPageSrc, /\{chatSessionId && !showStartScreen && \(/);
});

// ── 6. Choices clear on submission, session change, error, and return to entry ─

test('ChatPage: outcome choices are cleared at the start of every sendMessage call (manual send, a quick-reply chip, or an outcome chip alike)', () => {
  const sendMessageIdx = chatPageSrc.indexOf('const sendMessage = useCallback(');
  const firstApiCallIdx = chatPageSrc.indexOf("apiFetch('/api/chat/message'", sendMessageIdx);
  const clearIdx = chatPageSrc.indexOf('setOutcomeChoices(null);', sendMessageIdx);
  assert.ok(clearIdx !== -1 && clearIdx < firstApiCallIdx, 'outcome choices must be cleared before the request is even sent');
});

test('ChatPage: outcome choices reset when chatSessionId changes (no leak across sessions)', () => {
  const idx = chatPageSrc.indexOf('Reset temporary server-issued card / quick-reply / outcome-choice');
  assert.ok(idx !== -1);
  const block = chatPageSrc.slice(idx, idx + 500);
  assert.match(block, /setOutcomeChoices\(null\)/);
});

test('ChatPage: outcome choices are cleared on a stream-level error event', () => {
  const idx = chatPageSrc.indexOf("data.t === 'error'");
  const block = chatPageSrc.slice(idx, idx + 250);
  assert.match(block, /setOutcomeChoices\(null\)/);
});

test('ChatPage: outcome choices are cleared when the fetch/stream itself throws (network or parse failure)', () => {
  const catchIdx = chatPageSrc.indexOf('} catch (err) {\n      setWaitingForFirst(false);');
  assert.ok(catchIdx !== -1);
  const block = chatPageSrc.slice(catchIdx, catchIdx + 300);
  assert.match(block, /setOutcomeChoices\(null\)/);
});

test('ChatPage: outcome choices are cleared when the UI genuinely returns to the chat-entry screen', () => {
  const idx = chatPageSrc.indexOf('followUpClaimedSessionsRef.current.clear()');
  assert.ok(idx !== -1);
  const block = chatPageSrc.slice(idx, idx + 200);
  assert.match(block, /setOutcomeChoices\(null\)/);
});

// ── 7. No local fake opener/outcome message ────────────────────────────────

test('ChatPage: claimFollowUpOpener never calls setMessages directly — the opener only ever arrives via a persisted-message reload', () => {
  const body = fnBody('claimFollowUpOpener');
  assert.doesNotMatch(body, /setMessages/);
});

test('ChatPage: outcome choices are never sent back to the server and never merged into assistant Message content', () => {
  const idx = chatPageSrc.indexOf('replies={outcomeChoices}');
  const block = chatPageSrc.slice(Math.max(0, idx - 100), idx + 300);
  assert.doesNotMatch(block, /apiFetch/);
  assert.doesNotMatch(chatPageSrc, /content:\s*.*outcomeChoices/);
});

// ── 8. No choices for Quick Chat or consent-pending users ──────────────────

test('ChatPage: claimFollowUpOpener (the only source of outcomeChoices) is guarded by consentPending and never called for Quick Chat', () => {
  const body = fnBody('claimFollowUpOpener');
  assert.match(body, /if \(!sessionId \|\| consentPending\) return;/);
});

test('ChatPage: the Quick Chat cleanup effect never references outcomeChoices', () => {
  const idx = chatPageSrc.indexOf('Quick chat cleanup: delete session on tab hide or unmount');
  assert.ok(idx !== -1);
  const end = chatPageSrc.indexOf('}, [chatMode, chatSessionId, token]);', idx);
  const block = chatPageSrc.slice(idx, end);
  assert.doesNotMatch(block, /outcomeChoices/);
});
