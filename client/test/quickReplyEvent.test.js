// Real behavioral tests for the pure, framework-free quick-reply-chip
// helpers (structured `{ t: "quick_replies", replies: [...] }` SSE event).
// No JSX involved, so these run as genuine unit tests via Node's built-in
// test runner — not just source-text assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickRepliesEvent, MIN_REPLIES, MAX_REPLIES, MAX_LABEL_LENGTH } from '../src/utils/quickReplyEvent.js';

function validEvent(overrides = {}) {
  return {
    t: 'quick_replies',
    replies: [
      { id: 'reply_1', label: "I'm going to get out" },
      { id: 'reply_2', label: "I can't bat today" },
    ],
    ...overrides,
  };
}

test('accepts a valid 2-item event', () => {
  const result = parseQuickRepliesEvent(validEvent());
  assert.deepEqual(result, [
    { id: 'reply_1', label: "I'm going to get out" },
    { id: 'reply_2', label: "I can't bat today" },
  ]);
});

test('accepts a valid 3-item event', () => {
  const result = parseQuickRepliesEvent(validEvent({
    replies: [
      { id: 'reply_1', label: 'Yes, that feels right' },
      { id: 'reply_2', label: 'Not quite' },
      { id: 'reply_3', label: 'It happens before every match' },
    ],
  }));
  assert.equal(result.length, 3);
});

test('rejects a non-"quick_replies" event type', () => {
  assert.equal(parseQuickRepliesEvent({ t: 'd', c: 'hello' }), null);
  assert.equal(parseQuickRepliesEvent({ t: 'card', card: {} }), null);
  assert.equal(parseQuickRepliesEvent({ t: 'end' }), null);
});

test('rejects malformed or incomplete payloads, never throws', () => {
  const malformed = [
    null,
    undefined,
    {},
    { t: 'quick_replies' },
    { t: 'quick_replies', replies: null },
    { t: 'quick_replies', replies: 'not an array' },
    { t: 'quick_replies', replies: [{ id: 'reply_1' }] }, // missing label
    { t: 'quick_replies', replies: [{ label: 'no id' }] }, // missing id
    { t: 'quick_replies', replies: [{ id: '', label: 'empty id' }] },
    { t: 'quick_replies', replies: [{ id: 'reply_1', label: '' }] },
    { t: 'quick_replies', replies: [{ id: 'reply_1', label: '   ' }] },
    { t: 'quick_replies', replies: [{ id: 'reply_1', label: 42 }] },
  ];
  for (const event of malformed) {
    assert.doesNotThrow(() => parseQuickRepliesEvent(event));
    assert.equal(parseQuickRepliesEvent(event), null);
  }
});

test('rejects fewer than 2 or more than 3 replies', () => {
  assert.equal(parseQuickRepliesEvent(validEvent({ replies: [] })), null);
  assert.equal(parseQuickRepliesEvent(validEvent({ replies: [{ id: 'reply_1', label: 'Only one' }] })), null);
  assert.equal(
    parseQuickRepliesEvent(validEvent({
      replies: [
        { id: 'reply_1', label: 'One' },
        { id: 'reply_2', label: 'Two' },
        { id: 'reply_3', label: 'Three' },
        { id: 'reply_4', label: 'Four' },
      ],
    })),
    null
  );
  assert.equal(MIN_REPLIES, 2);
  assert.equal(MAX_REPLIES, 3);
});

test('rejects duplicate ids rather than silently deduping', () => {
  const result = parseQuickRepliesEvent(validEvent({
    replies: [
      { id: 'reply_1', label: 'First' },
      { id: 'reply_1', label: 'Second' },
    ],
  }));
  assert.equal(result, null);
});

test('rejects a label over the maximum length, accepts one exactly at the limit', () => {
  const long = 'a'.repeat(MAX_LABEL_LENGTH + 1);
  assert.equal(
    parseQuickRepliesEvent(validEvent({ replies: [{ id: 'reply_1', label: long }, { id: 'reply_2', label: 'Not quite' }] })),
    null
  );
  const atLimit = 'a'.repeat(MAX_LABEL_LENGTH);
  const result = parseQuickRepliesEvent(validEvent({ replies: [{ id: 'reply_1', label: atLimit }, { id: 'reply_2', label: 'Not quite' }] }));
  assert.ok(result);
});
