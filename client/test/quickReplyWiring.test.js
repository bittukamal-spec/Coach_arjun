// Source-text checks for structured coaching reply chips (`t: "quick_replies"`
// SSE event support in ChatPage). ChatPage.jsx contains JSX and cannot be
// imported directly by node:test without a transform, so — matching the
// pattern established by serverCardWiring.test.js — these are source-text
// assertions; the pure validate/parse logic itself is unit-tested for real
// in quickReplyEvent.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const chatPageSrc = readFileSync(path.join(root, 'src/pages/ChatPage.jsx'), 'utf8');
const translationsSrc = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

// ── 1. Structured event is wired in ──────────────────────────────────────────

test('ChatPage: imports the shared quick-reply parser, not ad-hoc parsing', () => {
  assert.match(chatPageSrc, /import\s*{\s*parseQuickRepliesEvent\s*}\s*from\s*'\.\.\/utils\/quickReplyEvent'/);
});

test('ChatPage: SSE loop handles t:"quick_replies" using the shared parser', () => {
  const idx = chatPageSrc.indexOf("data.t === 'quick_replies'");
  assert.ok(idx !== -1, 'expected a t:"quick_replies" branch in the SSE loop');
  const block = chatPageSrc.slice(idx, idx + 600);
  assert.match(block, /parseQuickRepliesEvent\(data\)/);
  assert.match(block, /setQuickReplies\(replies\)/);
});

test('ChatPage: a malformed quick_replies payload is ignored without crashing (shares the existing per-line try/catch)', () => {
  const tryIdx = chatPageSrc.indexOf('const data = JSON.parse(line.slice(6));');
  const catchIdx = chatPageSrc.indexOf('malformed chunk', tryIdx);
  const quickRepliesIdx = chatPageSrc.indexOf("data.t === 'quick_replies'");
  assert.ok(tryIdx < quickRepliesIdx && quickRepliesIdx < catchIdx, 'the quick_replies branch must be inside the guarded try/catch');
});

// ── 2. Stored separately from messages and cards ─────────────────────────────

test('ChatPage: quick replies live in their own state, not appended to messages or serverCards', () => {
  assert.match(chatPageSrc, /const \[quickReplies, setQuickReplies\]\s*=\s*useState\(null\)/);
});

test('ChatPage: a quick_replies event is never routed through setMessages or setServerCards', () => {
  const idx = chatPageSrc.indexOf("data.t === 'quick_replies'");
  const nextBranch = chatPageSrc.indexOf('} catch { /* malformed chunk */ }', idx);
  const block = chatPageSrc.slice(idx, nextBranch);
  assert.doesNotMatch(block, /setMessages|setServerCards/);
});

// ── 3. Rendering: up to 3 contextual chips + client "Write my own" ──────────

test('ChatPage: QuickReplyChips renders the server-offered replies plus one client-added "Write my own" chip', () => {
  assert.match(chatPageSrc, /function QuickReplyChips/);
  const componentStart = chatPageSrc.indexOf('function QuickReplyChips');
  const componentEnd = chatPageSrc.indexOf('\n}', componentStart);
  const componentSrc = chatPageSrc.slice(componentStart, componentEnd);
  assert.match(componentSrc, /replies\.map\(reply =>/);
  assert.match(componentSrc, /t\.writeMyOwn/);
  // Exactly one "Write my own" button is rendered — not looped/duplicated.
  const writeMyOwnMatches = componentSrc.match(/t\.writeMyOwn/g) || [];
  assert.equal(writeMyOwnMatches.length, 1);
});

test('ChatPage: quick reply chips use accessible <button> elements', () => {
  const componentStart = chatPageSrc.indexOf('function QuickReplyChips');
  const componentEnd = chatPageSrc.indexOf('\n}', componentStart);
  const componentSrc = chatPageSrc.slice(componentStart, componentEnd);
  const buttonCount = (componentSrc.match(/<button/g) || []).length;
  assert.equal(buttonCount, 2, 'expected one contextual-chip <button> template and one Write-my-own <button>');
});

test('ChatPage: quick reply chips render only after streaming has fully finished, and the input box is never hidden by them', () => {
  const idx = chatPageSrc.indexOf('<QuickReplyChips');
  const guardSlice = chatPageSrc.slice(Math.max(0, idx - 250), idx);
  assert.match(guardSlice, /!streaming && !waitingForFirst && quickReplies/);
  // The input area's mount condition is untouched by this feature.
  assert.match(chatPageSrc, /\{chatSessionId && !showStartScreen && \(/);
});

// ── 4. Selection and clearing behavior ───────────────────────────────────────

test('ChatPage: tapping a contextual chip sends its label through the normal sendMessage path — only the label, never the id', () => {
  const idx = chatPageSrc.indexOf('<QuickReplyChips');
  const block = chatPageSrc.slice(idx, idx + 300);
  assert.match(block, /onSelect=\{\(label\) => sendMessage\(label\)\}/);
  assert.doesNotMatch(block, /reply\.id\)/, 'the reply id must never be passed to sendMessage');
});

test('ChatPage: chips are cleared immediately at the start of every sendMessage call (manual send or chip tap alike)', () => {
  const sendMessageIdx = chatPageSrc.indexOf('const sendMessage = useCallback(');
  const firstApiCallIdx = chatPageSrc.indexOf("apiFetch('/api/chat/message'", sendMessageIdx);
  const clearIdx = chatPageSrc.indexOf('setQuickReplies(null);', sendMessageIdx);
  assert.ok(clearIdx !== -1 && clearIdx < firstApiCallIdx, 'quick replies must be cleared before the request is even sent');
});

test('ChatPage: "Write my own" clears the chips and focuses the text input without sending a message', () => {
  const idx = chatPageSrc.indexOf('onWriteMyOwn=');
  const block = chatPageSrc.slice(idx, idx + 150);
  assert.match(block, /setQuickReplies\(null\)/);
  assert.match(block, /inputRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(block, /sendMessage/);
});

test('ChatPage: quick replies reset when chatSessionId changes (no leak across sessions)', () => {
  const idx = chatPageSrc.indexOf('Reset temporary server-issued card / quick-reply / outcome-choice');
  assert.ok(idx !== -1, 'expected a documented reset effect covering quick replies too');
  const block = chatPageSrc.slice(idx, idx + 500);
  assert.match(block, /setQuickReplies\(null\)/);
});

test('ChatPage: quick replies are cleared on a stream-level error event', () => {
  const idx = chatPageSrc.indexOf("data.t === 'error'");
  const block = chatPageSrc.slice(idx, idx + 200);
  assert.match(block, /setQuickReplies\(null\)/);
});

test('ChatPage: quick replies are cleared when the fetch/stream itself throws (network or parse failure)', () => {
  const catchIdx = chatPageSrc.indexOf('} catch (err) {\n      setWaitingForFirst(false);');
  assert.ok(catchIdx !== -1, 'expected the outer sendMessage catch block');
  const block = chatPageSrc.slice(catchIdx, catchIdx + 250);
  assert.match(block, /setQuickReplies\(null\)/);
});

test('ChatPage: quick replies are never sent back to the server (no apiFetch referencing quickReplies)', () => {
  const idx = chatPageSrc.indexOf('<QuickReplyChips');
  const block = chatPageSrc.slice(Math.max(0, idx - 100), idx + 300);
  assert.doesNotMatch(block, /apiFetch/);
});

test('ChatPage: quick replies are never added to assistant Message content (no state merge into messages)', () => {
  assert.doesNotMatch(chatPageSrc, /content:\s*.*quickReplies/);
});

// ── 5. Legacy compatibility ──────────────────────────────────────────────────

test('ChatPage: legacy [SUGGEST:...] historical parsing/rendering remains present (extractSuggestions, suggestions chips)', () => {
  assert.match(chatPageSrc, /function extractSuggestions/);
  assert.match(chatPageSrc, /msg\.suggestions\?\.length > 0/);
  assert.match(chatPageSrc, /msg\.suggestions\.map\(s =>/);
});

test('translations: writeMyOwn exists in both English and Hindi chat namespaces', () => {
  const enIdx = translationsSrc.indexOf("send: 'Send',");
  const hiIdx = translationsSrc.indexOf("send: 'भेजें',");
  assert.ok(enIdx !== -1 && hiIdx !== -1);
  assert.match(translationsSrc.slice(enIdx, enIdx + 100), /writeMyOwn:/);
  assert.match(translationsSrc.slice(hiIdx, hiIdx + 100), /writeMyOwn:/);
});
