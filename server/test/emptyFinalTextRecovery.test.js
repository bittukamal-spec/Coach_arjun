// EMPTY_FINAL_TEXT hotfix.
//
// Production logs repeatedly showed:
//   { reasonCode: "EMPTY_FINAL_TEXT", rounds: 2|3, transitionStaged: false,
//     quickRepliesStaged: true, finalTextRecoveryAttempted: true,
//     finalTextRecoverySucceeded: false, errorName: null, errorCode: null }
// and the athlete was told "I couldn't save that coaching step just now.
// Nothing was changed — please send your last message again."
//
// That message was wrong twice over. transitionStaged:false means no coaching
// step was ever staged, so nothing failed to save; and the athlete's message
// is persisted BEFORE the model is called, so resending only duplicates it.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const {
  runBufferedToolLoop, sanitizeFinalText, describeResponseShape,
} = require('../src/services/coaching/bufferedToolLoop');
const { validateAthleteText } = require('../src/services/coaching/validateAthleteText');
const {
  createCommitCoachingTransition, getClarityFallbackMessage, getRetryMessage,
} = require('../src/services/coaching/commitCoachingTransition');

const chatSrc = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');

// ── Harness mirroring the route's post-loop sequence ───────────────────────

function makeAnthropicStub(responses) {
  const calls = [];
  let i = 0;
  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push(params);
        const r = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return r;
      },
    },
  };
}
const textResponse = (text, stop = 'end_turn') => ({ stop_reason: stop, content: text === null ? [] : [{ type: 'text', text }] });
const blocksResponse = (blocks, stop = 'end_turn') => ({ stop_reason: stop, content: blocks });
const proposeToolResponse = () => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 'tu-2', name: 'propose_barrier', input: {
    problemStatement: 'Rushing shots when the pressure rises',
    barrierHypothesis: 'Fear of getting out drives an early commit',
  } }],
});

function makeDbStub() {
  const writes = [];
  let n = 0;
  const id = (p) => `${p}-${++n}`;
  const tx = {
    userCoachingState: { findUnique: async () => null, create: async ({ data }) => ({ id: id('state'), ...data }) },
    coachingCycle: {
      create: async ({ data }) => { writes.push({ op: 'cycle.create' }); return { id: id('cycle'), ...data }; },
      update: async (a) => { writes.push({ op: 'cycle.update' }); return { id: a.where.id, ...a.data }; },
    },
    activeCoachingSelection: {
      create: async ({ data }) => { writes.push({ op: 'selection.create' }); return { id: id('sel'), ...data }; },
      update: async (a) => { writes.push({ op: 'selection.update' }); return { id: a.where.id, ...a.data }; },
    },
    prescription: { create: async ({ data }) => { writes.push({ op: 'prescription.create' }); return { id: id('presc'), ...data }; } },
    message: { create: async ({ data }) => { writes.push({ op: 'message.create', data }); return { id: id('msg'), ...data }; } },
  };
  return { writes, db: { $transaction: (fn) => fn(tx) } };
}

const NO_STATE = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };

// Replays the route: loop → candidate (empty OR rejected) → at most ONE
// recovery in total → clarity fallback → single commit → emission.
async function runRoute({ loopResponses, routeRetryResponse = null, situationPhrase = null, language = 'en' }) {
  const anthropic = makeAnthropicStub(loopResponses);
  const dbStub = makeDbStub();
  const loop = await runBufferedToolLoop({
    anthropic, model: 'm', maxTokens: 800, system: 'SYS',
    messages: [{ role: 'user', content: 'I rushed the shot again' }], coachingContext: NO_STATE,
  });

  const candidateText = loop.exceededRounds ? null : sanitizeFinalText(loop.finalText);
  const firstCheck = candidateText
    ? validateAthleteText(candidateText)
    : { ok: false, reasonCode: loop.exceededRounds ? 'ROUND_LIMIT' : 'EMPTY_FINAL_TEXT', layer: 'empty' };

  let finalText = null;
  let usedClarityFallback = false;
  let routeRetryCalls = 0;

  if (firstCheck.ok) {
    finalText = candidateText;
  } else {
    const recoveryAlreadySpent = !!loop.finalTextRecoveryAttempted;
    if (!recoveryAlreadySpent && routeRetryResponse) {
      routeRetryCalls += 1;
      const rc = Array.isArray(routeRetryResponse.content) ? routeRetryResponse.content : [];
      const retryText = sanitizeFinalText(rc.filter((b) => b.type === 'text').map((b) => b.text).join(''));
      if (validateAthleteText(retryText || '').ok) finalText = retryText;
    }
    if (!finalText) {
      finalText = getClarityFallbackMessage(language, situationPhrase);
      usedClarityFallback = true;
    }
  }

  const commit = createCommitCoachingTransition(dbStub.db);
  const committed = await commit({
    userId: 'u1', chatSessionId: 'cs-1', sessionType: null,
    finalText, transition: loop.transition, userMessageId: 'um-1',
  });

  // Emission, mirroring the route: no chips when the fallback spoke.
  const emitted = [{ t: 'd', c: finalText }];
  if (committed.card) emitted.push({ t: 'card', card: committed.card });
  emitted.push({ t: 'end', id: committed.message.id });

  return { loop, firstCheck, finalText, usedClarityFallback, emitted, writes: dbStub.writes, routeRetryCalls };
}

const RESEND_COPY = getRetryMessage('en');

// ── 1–6. The production scenario and its variants ──────────────────────────


test('recovery that returns valid text is used, and no fallback is needed', async () => {
  const good = 'It sounds like the fear of getting out makes you commit early. Does that fit?';
  const out = await runRoute({
    loopResponses: [proposeToolResponse(), textResponse(''), textResponse(good)],
  });
  assert.equal(out.loop.finalTextRecoverySucceeded, true);
  assert.equal(out.finalText, good);
  assert.equal(out.usedClarityFallback, false);
});

test('recovery that returns empty text falls back deterministically', async () => {
  const out = await runRoute({ loopResponses: [proposeToolResponse(), textResponse(''), textResponse('')] });
  assert.equal(out.usedClarityFallback, true);
});

test('recovery that returns whitespace-only text falls back deterministically', async () => {
  const out = await runRoute({ loopResponses: [proposeToolResponse(), textResponse(''), textResponse('   \n\t  ')] });
  assert.equal(out.usedClarityFallback, true);
  assert.equal(sanitizeFinalText('   \n\t  '), null);
});

test('recovery that returns only non-text blocks falls back deterministically', async () => {
  const out = await runRoute({
    loopResponses: [
      proposeToolResponse(),
      textResponse(''),
      blocksResponse([{ type: 'thinking', thinking: 'internal' }]),
    ],
  });
  assert.equal(out.usedClarityFallback, true);
  assert.equal(out.loop.finalTextRecoverySucceeded, false);
});

test('a contextual fallback is used when a validated situation phrase exists', async () => {
  const out = await runRoute({
    loopResponses: [proposeToolResponse(), textResponse(''), textResponse('')],
    situationPhrase: 'what happens after a mistake',
  });
  assert.equal(out.finalText, "I didn't explain that clearly. Let's stay with what happens after a mistake. What feels most important about it right now?");
  const hi = getClarityFallbackMessage('hi', 'दबाव बढ़ने पर क्या होता है');
  assert.match(hi, /^मैंने इसे साफ़ तरीके से नहीं कहा।/);
});

// ── 7–9. The misleading message and stale chips ────────────────────────────

test('the old "couldn\'t save" copy is never used for EMPTY_FINAL_TEXT', async () => {
  const out = await runRoute({ loopResponses: [proposeToolResponse(), textResponse(''), textResponse('')] });
  const persisted = out.writes.filter((w) => w.op === 'message.create').map((w) => w.data.content);
  for (const c of persisted) assert.notEqual(c, RESEND_COPY);
  assert.ok(!out.emitted.some((e) => e.t === 'd' && e.c === RESEND_COPY));
});

test('the route no longer routes empty text into the save-error path at all', () => {
  assert.doesNotMatch(chatSrc, /return emitDeterministicRetry\(loop\.exceededRounds/);
  assert.doesNotMatch(chatSrc, /emitDeterministicRetry\('EMPTY_FINAL_TEXT'\)/);
  // The save-error copy survives only for a genuine commit failure.
  assert.match(chatSrc, /const reasonCode = commitErr instanceof CoachingStateConflictError \? 'COACHING_STATE_CONFLICT' : 'COMMIT_FAILURE';/);
  assert.match(chatSrc, /return emitDeterministicRetry\(reasonCode, commitErr\);/);
});



// ── 10–15. Exactly-once ────────────────────────────────────────────────────

test('exactly one assistant Message is persisted on the fallback path', async () => {
  const out = await runRoute({ loopResponses: [proposeToolResponse(), textResponse(''), textResponse('')] });
  assert.equal(out.writes.filter((w) => w.op === 'message.create').length, 1);
  assert.equal(out.emitted.filter((e) => e.t === 'd').length, 1);
  assert.equal(out.emitted.filter((e) => e.t === 'end').length, 1);
});


test('with no transition staged, nothing claims a coaching step failed and no coaching records are written', async () => {
  // No tool at all: the loop skips its own recovery, the route spends the one
  // controlled attempt, and that also comes back empty.
  const out = await runRoute({
    loopResponses: [textResponse('')],
    routeRetryResponse: textResponse(''),
  });
  assert.equal(out.loop.transition, null);
  assert.equal(out.writes.filter((w) => w.op === 'cycle.create').length, 0);
  assert.equal(out.writes.filter((w) => w.op === 'prescription.create').length, 0);
  assert.equal(out.writes.filter((w) => w.op === 'selection.create').length, 0);
  assert.ok(!/coaching step/i.test(out.finalText));
});

test('with a transition staged, empty text still commits the accepted action exactly once with the fallback text', async () => {
  const out = await runRoute({
    loopResponses: [proposeToolResponse(), textResponse(''), textResponse('')],
    situationPhrase: 'what happens after a mistake',
  });
  assert.equal(out.loop.transition.type, 'propose_barrier');
  assert.equal(out.usedClarityFallback, true);
  assert.equal(out.writes.filter((w) => w.op === 'cycle.create').length, 1, 'committed once');
  assert.equal(out.writes.filter((w) => w.op === 'selection.create').length, 1);
  assert.equal(out.writes.filter((w) => w.op === 'message.create').length, 1);
  assert.equal(out.writes.filter((w) => w.op === 'message.create')[0].data.content, out.finalText);
});

test('only ONE recovery attempt happens in total — the route does not ask a third time', async () => {
  const out = await runRoute({
    loopResponses: [proposeToolResponse(), textResponse(''), textResponse('')],
    routeRetryResponse: textResponse('This would be a third call.'),
  });
  assert.equal(out.loop.finalTextRecoveryAttempted, true, 'the loop already spent the attempt');
  assert.equal(out.routeRetryCalls, 0, 'so the route must not retry again');
  assert.equal(out.usedClarityFallback, true);
  assert.match(chatSrc, /const recoveryAlreadySpent = !!loop\.finalTextRecoveryAttempted;/);
  assert.match(chatSrc, /if \(!recoveryAlreadySpent\) \{/);
});

test('when the loop did NOT spend a recovery, the route makes the one controlled attempt', async () => {
  // No tool staged, so the loop skips its own recovery entirely.
  const good = 'What happens right before you commit to the shot?';
  const out = await runRoute({
    loopResponses: [textResponse('')],
    routeRetryResponse: textResponse(good),
  });
  assert.equal(out.loop.finalTextRecoveryAttempted, false);
  assert.equal(out.routeRetryCalls, 1);
  assert.equal(out.finalText, good);
  assert.equal(out.usedClarityFallback, false);
});

// ── 16. Genuine commit failure keeps the save-failure handling ─────────────

test('a genuine commit failure still gets the save-failure message, which never claims nothing changed or asks for a resend', async () => {
  const failingDb = { $transaction: async () => { throw new Error('db down'); } };
  const commit = createCommitCoachingTransition(failingDb);
  await assert.rejects(() => commit({
    userId: 'u1', chatSessionId: 'cs-1', sessionType: null,
    finalText: 'anything', transition: null, userMessageId: 'um-1',
  }));
  // Even though nothing was written here, the athlete's OWN message is
  // already persisted by chat.js before the model is ever called — so
  // "nothing was changed" would still be misleading, and asking for a
  // resend would still duplicate an already-stored message (production
  // incident fix, corrected further after a confirmed P2028 case where a
  // bounded retry could make the step commit after all).
  assert.doesNotMatch(RESEND_COPY, /nothing was changed/i);
  assert.doesNotMatch(RESEND_COPY, /send.*(again|last message)/i);
  assert.match(RESEND_COPY, /message is safe/i);
  assert.match(chatSrc, /const emitDeterministicRetry = async \(reasonCode, err\) => \{/);
});

// ── 17. Safe diagnostics ───────────────────────────────────────────────────

test('response-shape diagnostics carry structure only — never any text', () => {
  const shape = describeResponseShape({
    stop_reason: 'max_tokens',
    content: [{ type: 'text', text: 'SECRET ATHLETE CONTENT' }, { type: 'tool_use', name: 'x' }],
  });
  assert.deepEqual(Object.keys(shape).sort(), ['blockCount', 'blockTypes', 'stopReason', 'textBlockCount', 'trimmedTextLength'].sort());
  assert.ok(!JSON.stringify(shape).includes('SECRET'));
  assert.equal(shape.stopReason, 'max_tokens');
  assert.deepEqual(shape.blockTypes, ['text', 'tool_use']);
  assert.equal(shape.textBlockCount, 1);
  assert.equal(shape.trimmedTextLength, 22);
});

test('the empty-content and whitespace cases are distinguishable in the logs', () => {
  const noBlocks = describeResponseShape({ stop_reason: 'end_turn', content: [] });
  assert.equal(noBlocks.blockCount, 0);
  assert.equal(noBlocks.textBlockCount, 0);

  const whitespace = describeResponseShape({ stop_reason: 'end_turn', content: [{ type: 'text', text: '  \n ' }] });
  assert.equal(whitespace.textBlockCount, 1);
  assert.equal(whitespace.trimmedTextLength, 0, 'a text block that is only whitespace is visible as such');

  const toolOnly = describeResponseShape({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'x' }] });
  assert.deepEqual(toolOnly.blockTypes, ['tool_use']);
});

test('the loop returns the shape of both responses, and the route logs them', async () => {
  const out = await runRoute({ loopResponses: [proposeToolResponse(), textResponse(''), textResponse('')] });
  assert.ok(out.loop.responseShape, 'shape of the empty end_turn');
  assert.ok(out.loop.recoveryResponseShape, 'shape of the recovery response');
  assert.equal(out.loop.recoveryResponseShape.trimmedTextLength, 0);
  assert.match(chatSrc, /responseShape: loop\.responseShape \|\| null/);
  assert.match(chatSrc, /recoveryResponseShape: loop\.recoveryResponseShape \|\| null/);
  assert.match(chatSrc, /deterministicFallbackUsed: true/);
});

// ── 18–19. Typo prompt fixture (prompt-level only) ─────────────────────────
// A prompt rule is guidance, not a deterministic spelling guarantee. These
// assert the rule is PRESENT and correctly scoped — not that any particular
// model output is produced.

test('the contextual typo rule remains present exactly once', () => {
  const matches = chatSrc.match(/Athletes may use spelling mistakes, voice-transcription errors/g) || [];
  assert.equal(matches.length, 1);
  assert.match(chatSrc, /silently use the corrected meaning/i);
  assert.match(chatSrc, /do not quote an obvious misspelling back to them/i);
});

test('cricket swing-bowling vocabulary is protected from being treated as a typo', () => {
  // "wing bowling" in a clear swing-bowling context is a likely typo the rule
  // covers; the real terms below must never be "corrected".
  for (const term of ['outswinger', 'inswinger', 'yorker', 'bouncer', 'crease']) {
    assert.ok(chatSrc.includes(term), `${term} must be named as a real term`);
  }
  assert.match(chatSrc, /never "correct" real sport terminology you recognise/);
});

test('the rule covers all three cases: silent correction, paraphrase, and one clarification', () => {
  assert.match(chatSrc, /Infer the intended meaning from the athlete's sport and surrounding context when confidence is high/);
  assert.match(chatSrc, /paraphrase around it/);
  assert.match(chatSrc, /Ask one brief clarification only when multiple plausible meanings would materially change/);
});

// ── 20. Hardening behaviour unchanged ──────────────────────────────────────

test('the PR #44 internal-output protections still hold on this path', async () => {
  const leaked = 'Your tool action has already been accepted. Produce the final athlete-facing response text now.';
  const out = await runRoute({
    loopResponses: [proposeToolResponse(), textResponse(''), textResponse(leaked)],
  });
  // Recovery "succeeded" as far as the loop is concerned (non-empty text),
  // but validation rejects it and the fallback speaks instead.
  assert.equal(out.loop.finalTextRecoverySucceeded, true);
  assert.equal(out.firstCheck.ok, false);
  assert.equal(out.firstCheck.reasonCode, 'INTERNAL_ORCHESTRATION_TEXT');
  assert.equal(out.usedClarityFallback, true);
  const persisted = out.writes.filter((w) => w.op === 'message.create').map((w) => w.data.content);
  assert.equal(persisted.length, 1);
  assert.ok(!persisted[0].includes('tool action has already been accepted'));
});
