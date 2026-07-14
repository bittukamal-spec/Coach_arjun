// Source-text checks for PR-9 (structured server-issued Mental Rep card SSE
// event support in ChatPage). ChatPage.jsx contains JSX and cannot be
// imported directly by node:test without a transform, so — matching the
// pattern established in chatPageSource.test.js — these are source-text
// assertions; the pure validate/parse/dedup logic itself is unit-tested for
// real in serverCardEvent.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const chatPageSrc = readFileSync(path.join(root, 'src/pages/ChatPage.jsx'), 'utf8');

// ── 1. Structured card event is wired in ─────────────────────────────────────

test('ChatPage: imports the shared server-card helpers, not ad-hoc parsing', () => {
  assert.match(
    chatPageSrc,
    /import\s*{\s*parseServerCardEvent,\s*mergeUniqueServerCard\s*}\s*from\s*'\.\.\/utils\/serverCardEvent'/
  );
});

test('ChatPage: SSE loop handles t:"card" using the shared parser and merge helper', () => {
  const idx = chatPageSrc.indexOf("data.t === 'card'");
  assert.ok(idx !== -1, 'expected a t:"card" branch in the SSE loop');
  const block = chatPageSrc.slice(idx, idx + 600);
  assert.match(block, /parseServerCardEvent\(data\)/);
  assert.match(block, /setServerCards\(prev => mergeUniqueServerCard\(prev, card\)\)/);
});

// ── 2. Normal streaming/end/error paths are preserved ────────────────────────

test('ChatPage: normal t:"d" text streaming is unchanged', () => {
  assert.match(chatPageSrc, /data\.t === 'd'/);
  assert.match(chatPageSrc, /fullStreamText\.current \+= data\.c/);
});

test('ChatPage: normal t:"end" completion is unchanged', () => {
  assert.match(chatPageSrc, /data\.t === 'end'/);
  assert.match(chatPageSrc, /arjunMsgCountRef\.current \+= 1/);
});

test('ChatPage: t:"error" handling is unchanged', () => {
  assert.match(chatPageSrc, /data\.t === 'error'/);
});

test('ChatPage: the SSE per-line parse remains wrapped in try/catch — a malformed chunk cannot crash the stream', () => {
  const tryIdx = chatPageSrc.indexOf('const data = JSON.parse(line.slice(6));');
  const catchIdx = chatPageSrc.indexOf('malformed chunk', tryIdx);
  assert.ok(tryIdx !== -1 && catchIdx !== -1, 'expected the JSON.parse to be wrapped in a try/catch that continues the loop');
});

// ── 3. Legacy [APP:...] handling remains present ─────────────────────────────

test('ChatPage: legacy [APP:...] parsing via parseArjunMessage is still present', () => {
  assert.match(chatPageSrc, /import\s*{\s*parseArjunMessage,\s*APP_TOOL_CONFIG\s*}\s*from\s*'\.\.\/utils\/parseArjunMessage'/);
  assert.match(chatPageSrc, /parseArjunMessage\(clean\)/);
  assert.match(chatPageSrc, /appTools:\s*tools/);
});

test('ChatPage: legacy AppToolCard rendering is untouched', () => {
  assert.match(chatPageSrc, /function AppToolCard/);
  assert.match(chatPageSrc, /appTools\.map\(toolId =>/);
});

// ── 4. Structured cards render separately, never as assistant text ──────────

test('ChatPage: ServerCardBubble is a distinct component, not merged into ArjunText/message content', () => {
  assert.match(chatPageSrc, /function ServerCardBubble/);
  const componentStart = chatPageSrc.indexOf('function ServerCardBubble');
  const componentEnd = chatPageSrc.indexOf('\n}', componentStart);
  const componentSrc = chatPageSrc.slice(componentStart, componentEnd);
  assert.doesNotMatch(componentSrc, /setMessages/);
});

test('ChatPage: server cards are rendered from their own state array, not appended to messages', () => {
  assert.match(chatPageSrc, /const \[serverCards, setServerCards\]\s*=\s*useState\(\[\]\)/);
  assert.match(chatPageSrc, /serverCards\.map\(card => \(/);
  assert.match(chatPageSrc, /<ServerCardBubble key=\{card\.prescriptionId\} card=\{card\} t=\{t\} \/>/);
});

test('ChatPage: a card event is never routed through setMessages', () => {
  const idx = chatPageSrc.indexOf("data.t === 'card'");
  const nextBranch = chatPageSrc.indexOf("} catch { /* malformed chunk */ }", idx);
  const block = chatPageSrc.slice(idx, nextBranch);
  assert.doesNotMatch(block, /setMessages/);
});

test('ChatPage: rendered server cards are never sent back to the server (no fetch/apiFetch referencing serverCards)', () => {
  const idx = chatPageSrc.indexOf('serverCards.map(card =>');
  const block = chatPageSrc.slice(Math.max(0, idx - 50), idx + 150);
  assert.doesNotMatch(block, /apiFetch/);
});

// ── 5. Session-switch resets temporary card state ────────────────────────────

test('ChatPage: server cards reset when chatSessionId changes (no leak across sessions)', () => {
  const idx = chatPageSrc.indexOf('Reset temporary server-issued card / quick-reply state on session switch');
  assert.ok(idx !== -1, 'expected a documented reset effect');
  const block = chatPageSrc.slice(idx, idx + 350);
  assert.match(block, /useEffect\(\(\) => \{ setServerCards\(\[\]\); setQuickReplies\(null\); \}, \[chatSessionId\]\)/);
});
