// Client defensive filter for internal server-orchestration text.
//
// The server is the primary protection — validateAthleteText.js rejects this
// content before it can be persisted or streamed. This covers messages stored
// BEFORE that shipped, so an athlete scrolling back never sees one. Unit tests
// for the pure module plus source assertions for its wiring in ChatPage.jsx,
// matching the pattern in chatPageSource.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  isInternalContent,
  filterInternalMessages,
  INTERNAL_CONTENT_FILTERED,
} from '../src/utils/internalContentFilter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chatPageSrc = readFileSync(path.join(__dirname, '../src/pages/ChatPage.jsx'), 'utf8');

const LEAKED = 'Your tool action has already been accepted. Produce the final athlete-facing response text now. Do not call another tool. Do not output JSON, tool syntax, or [SUGGEST:] markers.';

test('the legacy leaked message is recognised as internal content', () => {
  assert.equal(isInternalContent(LEAKED), true);
  assert.equal(isInternalContent('Reply choices are already staged. Produce the final response text now.'), true);
});

test('real coaching messages are never treated as internal content', () => {
  for (const ok of [
    "That helps narrow it down. What changes first, your shot selection or your timing?",
    'Use the Pressure Reset tool before your next match.',
    'Stop playing immediately. Tell your coach or a trusted adult right now.',
    'हाँ, यही लगता है। सबसे पहले क्या बदलता है?',
    '',
    null,
  ]) {
    assert.equal(isInternalContent(ok), false, `wrongly filtered: ${String(ok).slice(0, 40)}`);
  }
});

test('a leaked assistant message is dropped from history and logs a fixed safe code', () => {
  const logged = [];
  const history = [
    { id: 'm1', role: 'user', content: 'I rushed the shot again' },
    { id: 'm2', role: 'assistant', content: LEAKED },
    { id: 'm3', role: 'assistant', content: 'What happens right before you commit?' },
  ];
  const kept = filterInternalMessages(history, (code) => logged.push(code));
  assert.deepEqual(kept.map((m) => m.id), ['m1', 'm3']);
  assert.deepEqual(logged, [INTERNAL_CONTENT_FILTERED]);
  assert.equal(INTERNAL_CONTENT_FILTERED, 'internal_content_filtered');
});

test('the athlete\'s own messages are never filtered, whatever they contain', () => {
  const history = [{ id: 'u1', role: 'user', content: LEAKED }];
  assert.deepEqual(filterInternalMessages(history).map((m) => m.id), ['u1']);
});

test('a hidden message cannot be the last visible Arjun message, so chips never attach to it', () => {
  const history = [
    { id: 'm1', role: 'assistant', content: 'What happens right before you commit?' },
    { id: 'm2', role: 'assistant', content: LEAKED },
  ];
  const kept = filterInternalMessages(history);
  const lastArjunIdx = kept.reduce((acc, m, i) => (m.role === 'assistant' ? i : acc), -1);
  assert.equal(kept[lastArjunIdx].id, 'm1', 'chips attach to the last VISIBLE Arjun message');
  assert.equal(kept.length, 1, 'no empty bubble is left behind');
});

test('filtering leaves no blank bubble and never returns a placeholder', () => {
  const kept = filterInternalMessages([{ id: 'm1', role: 'assistant', content: LEAKED }]);
  assert.deepEqual(kept, []);
  for (const m of kept) assert.ok(m.content && m.content.trim());
});

test('a non-array history is handled safely', () => {
  assert.deepEqual(filterInternalMessages(null), []);
  assert.deepEqual(filterInternalMessages(undefined), []);
});

// ── Wiring ──────────────────────────────────────────────────────────────────

test('ChatPage filters loaded history and the streamed reply through the module', () => {
  assert.match(chatPageSrc, /import \{ filterInternalMessages, isInternalContent, INTERNAL_CONTENT_FILTERED \} from '\.\.\/utils\/internalContentFilter'/);
  assert.match(chatPageSrc, /const visible = filterInternalMessages\(msgs, \(code\) => console\.warn\(`\[chat\] \$\{code\}`\)\)/);
  assert.match(chatPageSrc, /if \(isInternalContent\(cleanText\)\) \{/);
});

test('only the fixed code is logged — never message or athlete content', () => {
  const idx = chatPageSrc.indexOf('if (isInternalContent(cleanText)) {');
  const block = chatPageSrc.slice(idx, idx + 400);
  assert.match(block, /console\.warn\(`\[chat\] \$\{INTERNAL_CONTENT_FILTERED\}`\)/);
  assert.doesNotMatch(block, /console\.warn\([^)]*cleanText/, 'message text must never be logged');
});

test('the client filter stays narrower than the server validator — signatures only, no paraphrase heuristic', () => {
  const filterSrc = readFileSync(path.join(__dirname, '../src/utils/internalContentFilter.js'), 'utf8');
  assert.doesNotMatch(filterSrc, /PROHIBITION_RE|MACHINE_NOUN_RE|families/, 'no co-occurrence heuristic on the client');
  // A paraphrase the server rejects is deliberately NOT hidden client-side:
  // hiding real coaching is worse than showing an odd sentence.
  assert.equal(isInternalContent('Please write the final reply and do not output any JSON.'), false);
});

test('the composer is not gated on message count, so it stays usable when everything is filtered', () => {
  // The send control is disabled only while streaming or when input is empty —
  // never because the visible history is empty.
  assert.doesNotMatch(chatPageSrc, /disabled=\{[^}]*messages\.length === 0/);
});

// ── Coach is free-text: no AI-generated reply chips ────────────────────────
// Removed because chips cost an extra model round that regularly ended with no
// athlete-facing text at all, and made the conversation read as a form.
// Deterministic controls elsewhere are untouched — see the last test here.

test('ChatPage renders no AI quick-reply chips and holds no state for them', () => {
  assert.doesNotMatch(chatPageSrc, /quickReplies/, 'no AI quick-reply state remains');
  assert.doesNotMatch(chatPageSrc, /parseQuickRepliesEvent/, 'the SSE chip parser is gone');
  assert.doesNotMatch(chatPageSrc, /msg\.suggestions/, 'no per-message chip row remains');
});

test('a quick_replies event from an older server build is ignored, never rendered', () => {
  const idx = chatPageSrc.indexOf("data.t === 'quick_replies'");
  assert.ok(idx !== -1, 'the branch remains so the event cannot fall through to an error');
  const block = chatPageSrc.slice(idx, idx + 300);
  assert.doesNotMatch(block, /setQuickReplies|setMessages/, 'nothing is rendered from it');
});

test('legacy [SUGGEST:] metadata in stored history is stripped, not rendered', () => {
  assert.match(chatPageSrc, /function stripSuggestTag\(text\)/);
  // Zero-or-more inside the tag, so an empty [SUGGEST:] is stripped too.
  assert.match(chatPageSrc, /\\\[SUGGEST:\[\^\\\]\]\*\\\]/);
  assert.match(chatPageSrc, /parseArjunMessage\(stripSuggestTag\(msg\.content\)\)/);
  assert.match(chatPageSrc, /parseArjunMessage\(stripSuggestTag\(fullStreamText\.current\)\)/);
});

test('the free-text composer and its send control are untouched', () => {
  assert.match(chatPageSrc, /inputRef/);
  assert.match(chatPageSrc, /onChange=\{e => setInput\(e\.target\.value\)\}/);
  assert.doesNotMatch(chatPageSrc, /disabled=\{[^}]*messages\.length === 0/);
});

test('deterministic structured controls outside Coach chat are NOT removed', () => {
  // PR-13 prescription-outcome choices still render through the shared chip
  // component; only the AI-generated suggestions were removed.
  assert.match(chatPageSrc, /outcomeChoices/);
  assert.match(chatPageSrc, /replies=\{outcomeChoices\}/);
  assert.match(chatPageSrc, /function QuickReplyChips\(/);
});
