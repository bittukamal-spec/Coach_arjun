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
const { getRetryMessage, CoachingStateConflictError } = require('../src/services/coaching/commitCoachingTransition');

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

test('the retry text used here is the real, deterministic, fixed copy — not model-generated, and never claims nothing changed or asks for a resend', () => {
  const en1 = getRetryMessage('en');
  const en2 = getRetryMessage('en');
  assert.equal(en1, en2, 'must be deterministic across calls');
  // The athlete's own message is already persisted before this copy can ever
  // fire, so it must not claim nothing changed, and must not ask them to
  // resend a message that is already stored (production incident fix).
  assert.doesNotMatch(en1, /nothing was changed/i);
  assert.doesNotMatch(en1, /send.*(again|last message)/i);
  assert.match(en1, /message is safe/i);
});

// ── P2028 bounded commit-retry (confirmed production incident) ─────────────
//
// Railway production log: reasonCode COMMIT_FAILURE, transitionStaged:true,
// errorName PrismaClientKnownRequestError, errorCode P2028 — an interactive-
// transaction timeout. commitCoachingTransition() must be called at most
// twice: a retry is attempted ONLY when the FIRST error is exactly this
// Prisma code, and only once. A conflict raised by the retry itself is
// classified and handled exactly like a first-attempt conflict — never
// retried again. This is a line-for-line mirror of the new block in
// chat.js's /message handler, kept honest by the source-level assertions in
// chatBufferedWiring.test.js (which assert on the same literals this mirror
// reproduces: the retryable-error check, the two-attempt structure, and the
// reason-code classification).

class FakePrismaError extends Error {
  constructor(code) {
    super('simulated Prisma error');
    this.name = 'PrismaClientKnownRequestError';
    this.code = code;
  }
}

function makeCountingCommit(outcomes) {
  // outcomes: an Error to throw, or a value to resolve, consumed strictly in
  // call order — never wraps around, so a third call is a test bug, not a
  // silently repeated outcome.
  let calls = 0;
  const fn = async () => {
    const outcome = outcomes[calls];
    calls += 1;
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  fn.callCount = () => calls;
  return fn;
}

// Mirror of chat.js's commit-retry block.
async function runCommitRetry(commitCoachingTransition) {
  const RETRYABLE_COMMIT_ERROR_CODE = 'P2028';
  const isRetryableCommitError = (e) => e?.name === 'PrismaClientKnownRequestError' && e?.code === RETRYABLE_COMMIT_ERROR_CODE;

  let committed;
  let commitAttemptCount = 1;
  let commitRetryAttempted = false;
  let commitRetrySucceeded = false;
  let firstCommitErrorCode = null;

  try {
    committed = await commitCoachingTransition();
  } catch (firstCommitErr) {
    firstCommitErrorCode = firstCommitErr?.code || null;
    if (!isRetryableCommitError(firstCommitErr)) {
      const reasonCode = firstCommitErr instanceof CoachingStateConflictError ? 'COACHING_STATE_CONFLICT' : 'COMMIT_FAILURE';
      return { ok: false, reasonCode, err: firstCommitErr, commitAttemptCount, commitRetryAttempted, commitRetrySucceeded, firstCommitErrorCode };
    }
    commitRetryAttempted = true;
    commitAttemptCount = 2;
    try {
      committed = await commitCoachingTransition();
      commitRetrySucceeded = true;
    } catch (commitErr) {
      const reasonCode = commitErr instanceof CoachingStateConflictError ? 'COACHING_STATE_CONFLICT' : 'COMMIT_FAILURE';
      return { ok: false, reasonCode, err: commitErr, commitAttemptCount, commitRetryAttempted, commitRetrySucceeded, firstCommitErrorCode };
    }
  }

  return { ok: true, committed, commitAttemptCount, commitRetryAttempted, commitRetrySucceeded, firstCommitErrorCode };
}

test('P2028 then success: commitCoachingTransition is called exactly twice, and the real reply is emitted — never the fallback', async () => {
  const finalText = 'Sounds like the pressure spikes right before the routine — does that fit?';
  const committedResult = { message: { id: 'msg-real-1' }, card: null };
  const commit = makeCountingCommit([new FakePrismaError('P2028'), committedResult]);

  const out = await runCommitRetry(commit);

  assert.equal(commit.callCount(), 2, 'commitCoachingTransition must be called exactly twice');
  assert.equal(out.ok, true);
  assert.equal(out.committed, committedResult, 'the real committed result from the successful retry is used');
  assert.equal(out.commitAttemptCount, 2);
  assert.equal(out.commitRetryAttempted, true);
  assert.equal(out.commitRetrySucceeded, true);
  assert.equal(out.firstCommitErrorCode, 'P2028');

  // Mirrors chat.js's emission immediately after a successful commit.
  const sink = makeSink();
  sink.res.write(`data: ${JSON.stringify({ t: 'd', c: finalText })}\n\n`);
  if (out.committed.card) sink.res.write(`data: ${JSON.stringify({ t: 'card', card: out.committed.card })}\n\n`);
  sink.res.write(`data: ${JSON.stringify({ t: 'end', id: out.committed.message.id })}\n\n`);
  sink.res.end();

  assert.deepEqual(sink.writes.map((w) => w.t), ['d', 'end'], 'the real reply is emitted, never the fallback');
  assert.equal(sink.writes[0].c, finalText);
  assert.equal(sink.writes[1].id, 'msg-real-1');
  assert.ok(sink.isEnded());
});

test('P2028 then success, with a real committed prescription: the card is emitted alongside the reply', async () => {
  const finalText = 'Try this before your next set — quick why, then the follow-up.';
  const card = { prescriptionId: 'presc-1', practiceKey: 'pre_performance_routine', situation: 'Free throws', cardContent: 'Breathe, cue, shoot.', cueWord: 'Breathe' };
  const committedResult = { message: { id: 'msg-real-2' }, card };
  const commit = makeCountingCommit([new FakePrismaError('P2028'), committedResult]);

  const out = await runCommitRetry(commit);
  assert.equal(commit.callCount(), 2);
  assert.equal(out.ok, true);

  const sink = makeSink();
  sink.res.write(`data: ${JSON.stringify({ t: 'd', c: finalText })}\n\n`);
  if (out.committed.card) sink.res.write(`data: ${JSON.stringify({ t: 'card', card: out.committed.card })}\n\n`);
  sink.res.write(`data: ${JSON.stringify({ t: 'end', id: out.committed.message.id })}\n\n`);
  sink.res.end();

  assert.deepEqual(sink.writes.map((w) => w.t), ['d', 'card', 'end']);
  assert.deepEqual(sink.writes[1].card, card);
});

test('P2028 on both attempts: exactly two attempts, classified COMMIT_FAILURE, and the resulting fallback never asks for a resend', async () => {
  const commit = makeCountingCommit([new FakePrismaError('P2028'), new FakePrismaError('P2028')]);

  const out = await runCommitRetry(commit);

  assert.equal(commit.callCount(), 2, 'exactly two attempts — never a third');
  assert.equal(out.ok, false);
  assert.equal(out.reasonCode, 'COMMIT_FAILURE');
  assert.equal(out.commitAttemptCount, 2);
  assert.equal(out.commitRetryAttempted, true);
  assert.equal(out.commitRetrySucceeded, false);

  // Feed the failure through the real emitDeterministicRetry mirror: no
  // model reply or card — the fallback text is used exactly once, and it
  // never asks the athlete to resend.
  const sink = makeSink();
  const emit = makeEmitDeterministicRetry({
    res: sink.res,
    messageCreate: async () => ({ id: 'msg-fallback-1' }),
    userId: 'user-1',
    language: 'en',
  });
  await emit();

  assert.deepEqual(sink.writes.map((w) => w.t), ['d', 'end'], 'exactly one fallback emission — no card, no model reply');
  assert.doesNotMatch(sink.writes[0].c, /nothing was changed/i);
  assert.doesNotMatch(sink.writes[0].c, /send.*(again|last message)/i);
});

test('CoachingStateConflictError on the first attempt: exactly one attempt — never enters the P2028 retry path', async () => {
  const commit = makeCountingCommit([new CoachingStateConflictError('an active coaching selection already exists')]);

  const out = await runCommitRetry(commit);

  assert.equal(commit.callCount(), 1, 'a conflict must never be retried');
  assert.equal(out.ok, false);
  assert.equal(out.reasonCode, 'COACHING_STATE_CONFLICT');
  assert.equal(out.commitAttemptCount, 1);
  assert.equal(out.commitRetryAttempted, false);
});

test('P2028 then a conflict on the retry: exactly two attempts total, no third attempt, final classification is COACHING_STATE_CONFLICT', async () => {
  const commit = makeCountingCommit([
    new FakePrismaError('P2028'),
    new CoachingStateConflictError('no matching active pending coaching cycle'),
  ]);

  const out = await runCommitRetry(commit);

  assert.equal(commit.callCount(), 2, 'the retry itself runs once, but its own conflict is not retried again');
  assert.equal(out.ok, false);
  assert.equal(out.reasonCode, 'COACHING_STATE_CONFLICT');
  assert.equal(out.commitAttemptCount, 2);
  assert.equal(out.commitRetryAttempted, true);
  assert.equal(out.commitRetrySucceeded, false);
});

test('a non-P2028 Prisma error is never automatically retried', async () => {
  const commit = makeCountingCommit([new FakePrismaError('P2024'), { message: { id: 'unreachable' }, card: null }]);

  const out = await runCommitRetry(commit);

  assert.equal(commit.callCount(), 1, 'only the confirmed-transient P2028 code is retried');
  assert.equal(out.ok, false);
  assert.equal(out.reasonCode, 'COMMIT_FAILURE');
  assert.equal(out.commitAttemptCount, 1);
  assert.equal(out.commitRetryAttempted, false);
});

test('an ordinary (non-Prisma) error is never automatically retried', async () => {
  const commit = makeCountingCommit([new Error('unexpected'), { message: { id: 'unreachable' }, card: null }]);

  const out = await runCommitRetry(commit);

  assert.equal(commit.callCount(), 1);
  assert.equal(out.ok, false);
  assert.equal(out.reasonCode, 'COMMIT_FAILURE');
  assert.equal(out.commitRetryAttempted, false);
});
