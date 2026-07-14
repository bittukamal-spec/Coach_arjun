// Behavioral tests for the deterministic-retry emission sequence used by
// chat.js's buffered main-chat route (correction: a commit failure for a
// NORMAL response with no staged transition must route through the same
// deterministic retry as round-limit/empty-text/transition-conflict
// failures — never the outer generic error handler).
//
// chat.js's /message handler is not independently invokable outside a real
// HTTP request (route logic, not an injected service), so this drives a
// line-for-line mirror of `emitDeterministicRetry` — kept honest by the
// source-level assertions in chatBufferedWiring.test.js, which assert on
// the exact same literals this mirror reproduces (the retry-text variable
// reuse, the `saved.id` reference, the inner catch's exact error payload,
// and the absence of a fabricated fallback id) — against a controllable
// stub message-create function and a recording SSE sink. getRetryMessage
// itself is the real, exported implementation.

const test = require('node:test');
const assert = require('node:assert/strict');
const { getRetryMessage } = require('../src/services/coaching/commitCoachingTransition');

function makeSink() {
  const writes = [];
  let ended = false;
  return {
    writes,
    isEnded: () => ended,
    res: {
      write: (chunk) => writes.push(JSON.parse(chunk.slice('data: '.length, chunk.length - 2))),
      end: () => { ended = true; },
    },
  };
}

// Mirror of chat.js's emitDeterministicRetry.
function makeEmitDeterministicRetry({ res, messageCreate, userId, chatSessionId = null, sessionType = null, language }) {
  return async function emitDeterministicRetry() {
    const retryText = getRetryMessage(language);
    let saved;
    try {
      saved = await messageCreate({
        data: { userId, role: 'assistant', content: retryText, sessionType: sessionType || null, chatSessionId: chatSessionId || null },
      });
    } catch (retryPersistErr) {
      res.write(`data: ${JSON.stringify({ t: 'error', message: 'AI response failed. Please try again.' })}\n\n`);
      return res.end();
    }
    res.write(`data: ${JSON.stringify({ t: 'd', c: retryText })}\n\n`);
    res.write(`data: ${JSON.stringify({ t: 'end', id: saved.id })}\n\n`);
    res.end();
  };
}

// ── 1 & 3. Successful retry (round-limit / empty-text / commit-failure — the
// function itself is identical regardless of which trigger called it) ──────

test('successful retry: persists the retry message BEFORE emitting, then emits d (retry text) then end (real saved id), then closes cleanly', async () => {
  const sink = makeSink();
  const order = [];
  const emit = makeEmitDeterministicRetry({
    res: sink.res,
    messageCreate: async (args) => { order.push('persist'); return { id: 'msg-retry-1', ...args.data }; },
    userId: 'user-1',
    chatSessionId: 'cs-1',
    language: 'en',
  });

  await emit();

  assert.deepEqual(sink.writes.map((w) => w.t), ['d', 'end']);
  assert.equal(sink.writes[0].c, getRetryMessage('en'));
  assert.equal(sink.writes[1].id, 'msg-retry-1');
  assert.ok(sink.isEnded(), 'the stream must end cleanly');
});

test('successful retry: persisted text is byte-for-byte identical to the emitted retry text', async () => {
  const sink = makeSink();
  let persistedContent = null;
  const emit = makeEmitDeterministicRetry({
    res: sink.res,
    messageCreate: async (args) => { persistedContent = args.data.content; return { id: 'msg-1' }; },
    userId: 'user-1',
    language: 'hi',
  });

  await emit();

  const emittedText = sink.writes.find((w) => w.t === 'd').c;
  assert.equal(persistedContent, emittedText);
  assert.equal(emittedText, getRetryMessage('hi'));
});

test('successful retry: never emits a card', async () => {
  const sink = makeSink();
  const emit = makeEmitDeterministicRetry({
    res: sink.res,
    messageCreate: async () => ({ id: 'msg-1' }),
    userId: 'user-1',
    language: 'en',
  });
  await emit();
  assert.ok(!sink.writes.some((w) => w.t === 'card'));
});

// ── 2. Retry-message persistence ALSO fails ─────────────────────────────────

test('retry persistence also fails: no model text, no card, safe generic error + end, no fabricated id, no recursive retry', async () => {
  const sink = makeSink();
  let createCallCount = 0;
  const emit = makeEmitDeterministicRetry({
    res: sink.res,
    messageCreate: async () => { createCallCount += 1; throw new Error('db unavailable'); },
    userId: 'user-1',
    language: 'en',
  });

  await emit();

  assert.equal(createCallCount, 1, 'the write must not be recursively retried');
  assert.deepEqual(sink.writes.map((w) => w.t), ['error']);
  assert.equal(sink.writes[0].message, 'AI response failed. Please try again.');
  assert.ok(sink.isEnded(), 'the stream must still close cleanly');
  assert.ok(!sink.writes.some((w) => w.t === 'd'), 'no retry (or model) text may be emitted');
  assert.ok(!sink.writes.some((w) => w.t === 'card'), 'no card may be emitted');
  assert.ok(!sink.writes.some((w) => w.id), 'no id is emitted — the retry was never claimed to be persisted');
});

test('retry persistence also fails: the failure is not silently absorbed into a false-success end event', async () => {
  const sink = makeSink();
  const emit = makeEmitDeterministicRetry({
    res: sink.res,
    messageCreate: async () => { throw new Error('db unavailable'); },
    userId: 'user-1',
    language: 'en',
  });
  await emit();
  assert.ok(!sink.writes.some((w) => w.t === 'end'), 'must not emit a normal end event when nothing was persisted');
});

// ── 4. getRetryMessage sanity (already covered in coachingCommit.test.js; a
// quick regression check that this test's mirror is using the real export) ──

test('the retry text used here is the real, deterministic, fixed copy — not model-generated', () => {
  const en1 = getRetryMessage('en');
  const en2 = getRetryMessage('en');
  assert.equal(en1, en2, 'must be deterministic across calls');
  assert.match(en1, /Nothing was changed/i);
});
