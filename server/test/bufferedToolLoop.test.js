// Behavioral tests for the buffered Anthropic tool loop (PR-10), using a
// stubbed Anthropic client — no network, no real API.

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBufferedToolLoop, sanitizeFinalText, buildRecoverySystem, MAX_ROUNDS, FINAL_TEXT_RECOVERY_INSTRUCTION } = require('../src/services/coaching/bufferedToolLoop');

const NO_STATE = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };
const PENDING_STATE = { hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'PENDING', hasPrescription: false };

// Returns queued responses in order, recording every request it receives.
function makeAnthropicStub(responses) {
  const calls = [];
  let i = 0;
  return {
    calls,
    client: {
      messages: {
        create: async (req) => {
          calls.push(req);
          const response = responses[Math.min(i, responses.length - 1)];
          i += 1;
          return response;
        },
      },
    },
  };
}

function textResponse(text) {
  return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
}

function toolResponse(draftText, name, input, id = 'tu-1') {
  return {
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: draftText },
      { type: 'tool_use', id, name, input },
    ],
  };
}

const PROPOSE_INPUT = { problemStatement: 'Freezes on penalties', barrierHypothesis: 'Fear of failure' };
const PRESCRIBE_INPUT = {
  barrierConfirmationStatus: 'CONFIRMED',
  finalBarrierHypothesis: 'Fear of failure',
  practiceKey: 'pre_performance_routine',
  situation: 'Penalty kicks in league matches',
  cardContent: 'Design a 20-second routine: breath, spot, cue word, strike.',
  cueWord: 'Spot',
};

async function run(stub, coachingContext, maxRounds = MAX_ROUNDS) {
  return runBufferedToolLoop({
    anthropic: stub.client,
    model: 'test-model',
    maxTokens: 800,
    system: 'system prompt',
    messages: [{ role: 'user', content: 'my message' }],
    coachingContext,
    maxRounds,
  });
}

// ── 1. Buffering ─────────────────────────────────────────────────────────────

test('a plain text response completes in one round with no transition', async () => {
  const stub = makeAnthropicStub([textResponse('Just coaching text.')]);
  const result = await run(stub, NO_STATE);
  assert.equal(result.finalText, 'Just coaching text.');
  assert.equal(result.transition, null);
  assert.equal(result.rounds, 1);
  assert.equal(result.exceededRounds, false);
  assert.equal(stub.calls.length, 1);
});

test('draft text accompanying a tool call is discarded — only the final end_turn text is returned', async () => {
  const stub = makeAnthropicStub([
    toolResponse('DRAFT: internal reasoning that must never be shown', 'propose_barrier', PROPOSE_INPUT),
    textResponse('Sounds like fear of failure might be in play — does that fit?'),
  ]);
  const result = await run(stub, NO_STATE);
  assert.equal(result.finalText, 'Sounds like fear of failure might be in play — does that fit?');
  assert.ok(!result.finalText.includes('DRAFT'), 'intermediate draft text must never surface');
  assert.equal(result.exceededRounds, false);
});

// ── 2. Complete tool loop ────────────────────────────────────────────────────

test('a tool call receives a tool_result and Anthropic is called again with it', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'propose_barrier', PROPOSE_INPUT, 'tu-42'),
    textResponse('Final reply.'),
  ]);
  const result = await run(stub, NO_STATE);
  assert.equal(stub.calls.length, 2);

  const secondCallMessages = stub.calls[1].messages;
  const assistantTurn = secondCallMessages[secondCallMessages.length - 2];
  const toolResultTurn = secondCallMessages[secondCallMessages.length - 1];
  assert.equal(assistantTurn.role, 'assistant');
  assert.equal(toolResultTurn.role, 'user');
  assert.equal(toolResultTurn.content[0].type, 'tool_result');
  assert.equal(toolResultTurn.content[0].tool_use_id, 'tu-42');
  assert.equal(toolResultTurn.content[0].is_error, false);
  assert.equal(JSON.parse(toolResultTurn.content[0].content).accepted, true);

  assert.equal(result.transition.type, 'propose_barrier');
});

test('every tool-loop Anthropic call carries the coaching tools', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'propose_barrier', PROPOSE_INPUT),
    textResponse('Final.'),
  ]);
  await run(stub, NO_STATE);
  for (const call of stub.calls) {
    assert.deepEqual(call.tools.map((t) => t.name), ['propose_barrier', 'prescribe_mental_rep', 'record_prescription_outcome']);
  }
});

test('the hard round limit is enforced: a model that never stops calling tools is cut off with everything discarded', async () => {
  const stub = makeAnthropicStub([toolResponse('draft', 'propose_barrier', PROPOSE_INPUT)]); // repeats forever
  const result = await run(stub, NO_STATE);
  assert.equal(stub.calls.length, MAX_ROUNDS);
  assert.equal(result.exceededRounds, true);
  assert.equal(result.finalText, null);
  assert.equal(result.transition, null, 'a staged transition must be discarded when the round cap is hit');
});

// ── 3. Barrier proposal ──────────────────────────────────────────────────────

test('an accepted barrier proposal stages a trimmed propose_barrier transition', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'propose_barrier', { problemStatement: '  Freezes on penalties  ', barrierHypothesis: ' Fear of failure ' }),
    textResponse('Does that fit?'),
  ]);
  const result = await run(stub, NO_STATE);
  assert.deepEqual(result.transition, {
    type: 'propose_barrier',
    problemStatement: 'Freezes on penalties',
    barrierHypothesis: 'Fear of failure',
  });
});

test('a barrier proposal while a cycle is already open is rejected as an error tool_result and stages nothing', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'propose_barrier', PROPOSE_INPUT),
    textResponse('Corrected final reply staying in the current cycle.'),
  ]);
  const result = await run(stub, PENDING_STATE);
  const toolResultTurn = stub.calls[1].messages[stub.calls[1].messages.length - 1];
  assert.equal(toolResultTurn.content[0].is_error, true);
  assert.equal(result.transition, null);
  assert.equal(result.finalText, 'Corrected final reply staying in the current cycle.');
});

// ── 4. Prescription ──────────────────────────────────────────────────────────

test('an accepted prescription stages the full prescribe transition with normalized cueWord', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'prescribe_mental_rep', { ...PRESCRIBE_INPUT, cueWord: '  Spot  ' }),
    textResponse('Here is your one practice for the week.'),
  ]);
  const result = await run(stub, PENDING_STATE);
  assert.deepEqual(result.transition, {
    type: 'prescribe_mental_rep',
    barrierConfirmationStatus: 'CONFIRMED',
    finalBarrierHypothesis: 'Fear of failure',
    practiceKey: 'pre_performance_routine',
    situation: 'Penalty kicks in league matches',
    cardContent: 'Design a 20-second routine: breath, spot, cue word, strike.',
    cueWord: 'Spot',
  });
});

test('an empty-string cueWord is normalized to null', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'prescribe_mental_rep', { ...PRESCRIBE_INPUT, cueWord: '  ' }),
    textResponse('Final.'),
  ]);
  const result = await run(stub, PENDING_STATE);
  assert.equal(result.transition.cueWord, null);
});

// ── 5. Rejections ────────────────────────────────────────────────────────────

test('an unknown tool is rejected but the loop continues to the corrected final reply', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'delete_all_data', { anything: true }),
    textResponse('Recovered final reply.'),
  ]);
  const result = await run(stub, NO_STATE);
  const toolResultTurn = stub.calls[1].messages[stub.calls[1].messages.length - 1];
  assert.equal(toolResultTurn.content[0].is_error, true);
  assert.match(JSON.parse(toolResultTurn.content[0].content).error, /Unknown tool/);
  assert.equal(result.transition, null);
  assert.equal(result.finalText, 'Recovered final reply.');
});

test('a malformed payload is rejected and stages nothing', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'prescribe_mental_rep', { practiceKey: 'pressure_reset' }), // incomplete
    textResponse('Recovered.'),
  ]);
  const result = await run(stub, PENDING_STATE);
  const toolResultTurn = stub.calls[1].messages[stub.calls[1].messages.length - 1];
  assert.equal(toolResultTurn.content[0].is_error, true);
  assert.equal(result.transition, null);
});

test('an unapproved practice key is rejected and stages nothing', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'prescribe_mental_rep', { ...PRESCRIBE_INPUT, practiceKey: 'focus_lock' }),
    textResponse('Recovered.'),
  ]);
  const result = await run(stub, PENDING_STATE);
  const toolResultTurn = stub.calls[1].messages[stub.calls[1].messages.length - 1];
  assert.equal(toolResultTurn.content[0].is_error, true);
  assert.equal(result.transition, null);
});

test('two transition tool calls in one response: the first is staged, the second rejected', async () => {
  const stub = makeAnthropicStub([
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'draft' },
        { type: 'tool_use', id: 'tu-1', name: 'propose_barrier', input: PROPOSE_INPUT },
        { type: 'tool_use', id: 'tu-2', name: 'prescribe_mental_rep', input: PRESCRIBE_INPUT },
      ],
    },
    textResponse('Final.'),
  ]);
  const result = await run(stub, NO_STATE);
  const toolResults = stub.calls[1].messages[stub.calls[1].messages.length - 1].content;
  assert.equal(toolResults.length, 2, 'every tool_use block must receive a tool_result');
  assert.equal(toolResults[0].is_error, false);
  assert.equal(toolResults[1].is_error, true);
  assert.match(JSON.parse(toolResults[1].content).error, /one coaching-state transition/i);
  assert.equal(result.transition.type, 'propose_barrier');
});

test('a transition tool call in a later round is rejected when one is already staged', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft 1', 'propose_barrier', PROPOSE_INPUT, 'tu-1'),
    toolResponse('draft 2', 'propose_barrier', PROPOSE_INPUT, 'tu-2'),
    textResponse('Final.'),
  ]);
  const result = await run(stub, NO_STATE);
  assert.equal(stub.calls.length, 3);
  const secondRoundResults = stub.calls[2].messages[stub.calls[2].messages.length - 1].content;
  assert.equal(secondRoundResults[0].is_error, true);
  assert.equal(result.transition.type, 'propose_barrier');
});

// ── 6. record_prescription_outcome (PR-13) ───────────────────────────────────

const ACTIVE_PRESCRIPTION_OUTCOME_STATE = {
  hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'CONFIRMED', hasPrescription: true,
  prescriptionStatus: 'ACTIVE', prescriptionOutcomeStatus: null,
};
const OUTCOME_INPUT = { outcomeStatus: 'HELPED', lessonText: '  Resetting to the next ball helped you regain your attention.  ' };

test('an accepted record_prescription_outcome call stages the trimmed transition and discards its draft text', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft, never shown', 'record_prescription_outcome', OUTCOME_INPUT),
    textResponse('That\'s great — resetting to the next ball helped you regain your attention.'),
  ]);
  const result = await run(stub, ACTIVE_PRESCRIPTION_OUTCOME_STATE);
  assert.deepEqual(result.transition, {
    type: 'record_prescription_outcome',
    outcomeStatus: 'HELPED',
    lessonText: 'Resetting to the next ball helped you regain your attention.',
  });
  assert.equal(result.finalText, 'That\'s great — resetting to the next ball helped you regain your attention.');
});

test('record_prescription_outcome receives a normal (non-error) tool_result', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'record_prescription_outcome', OUTCOME_INPUT, 'tu-outcome'),
    textResponse('Final.'),
  ]);
  await run(stub, ACTIVE_PRESCRIPTION_OUTCOME_STATE);
  const toolResultTurn = stub.calls[1].messages[stub.calls[1].messages.length - 1];
  assert.equal(toolResultTurn.content[0].tool_use_id, 'tu-outcome');
  assert.equal(toolResultTurn.content[0].is_error, false);
  assert.equal(JSON.parse(toolResultTurn.content[0].content).accepted, true);
});

test('a malformed record_prescription_outcome payload is rejected and stages nothing', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'record_prescription_outcome', { outcomeStatus: 'MAYBE', lessonText: 'x' }),
    textResponse('Recovered.'),
  ]);
  const result = await run(stub, ACTIVE_PRESCRIPTION_OUTCOME_STATE);
  const toolResultTurn = stub.calls[1].messages[stub.calls[1].messages.length - 1];
  assert.equal(toolResultTurn.content[0].is_error, true);
  assert.equal(result.transition, null);
});

test('record_prescription_outcome and prescribe_mental_rep in the SAME response: the first is staged, the second rejected — never both a new outcome and a new prescription in one athlete request', async () => {
  const stub = makeAnthropicStub([
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'draft' },
        { type: 'tool_use', id: 'tu-1', name: 'record_prescription_outcome', input: OUTCOME_INPUT },
        { type: 'tool_use', id: 'tu-2', name: 'prescribe_mental_rep', input: PRESCRIBE_INPUT },
      ],
    },
    textResponse('Final.'),
  ]);
  const result = await run(stub, ACTIVE_PRESCRIPTION_OUTCOME_STATE);
  const toolResults = stub.calls[1].messages[stub.calls[1].messages.length - 1].content;
  assert.equal(toolResults[0].is_error, false);
  assert.equal(toolResults[1].is_error, true);
  assert.match(JSON.parse(toolResults[1].content).error, /one coaching-state transition/i);
  assert.equal(result.transition.type, 'record_prescription_outcome');
});


// ── 7. Bounded final-text recovery (production EMPTY_FINAL_TEXT fix) ────────
// Reproduces the exact confirmed production sequence: a tool call is
// accepted in round 1, then round 2 returns end_turn with no usable text.
// Rather than exhaust the round cap and fall back to the deterministic
// retry, the loop asks once more (with no tools) for the missing text.



// The recovery instruction used to be appended as a synthetic USER turn.
// Delivered that way it reads as something the athlete asked for, and in
// production the model echoed it back (paraphrased) as its coaching reply,
// which was then persisted and shown. It now rides in the system prompt.
test('the recovery instruction is carried in the system prompt, never as a synthetic user turn', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'propose_barrier', PROPOSE_INPUT),
    textResponse(''),
    textResponse('Final recovered text.'),
  ]);
  await run(stub, NO_STATE);
  const recoveryCall = stub.calls[2];

  assert.ok(recoveryCall.system.includes(FINAL_TEXT_RECOVERY_INSTRUCTION), 'instruction must be in system');
  assert.equal(recoveryCall.system, buildRecoverySystem(stub.calls[0].system), 'system is the original prompt plus the instruction');

  // No message carries it, and no synthetic user prose turn was appended:
  // the last message is still the protocol-required tool_result.
  for (const m of recoveryCall.messages) {
    assert.ok(!(typeof m.content === 'string' && m.content.includes(FINAL_TEXT_RECOVERY_INSTRUCTION)), 'no message may carry the instruction');
  }
  const lastMessage = recoveryCall.messages[recoveryCall.messages.length - 1];
  assert.equal(lastMessage.role, 'user');
  assert.ok(Array.isArray(lastMessage.content), 'last message is the tool_result block, not prose');
  assert.equal(lastMessage.content[0].type, 'tool_result');
});

test('a staged barrier proposal survives empty-text recovery and is returned only alongside valid recovered final text', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'propose_barrier', PROPOSE_INPUT),
    textResponse(''),
    textResponse('Sounds like fear of failure — does that fit?'),
  ]);
  const result = await run(stub, NO_STATE);
  assert.equal(result.transition.type, 'propose_barrier');
  assert.equal(result.finalText, 'Sounds like fear of failure — does that fit?');
  assert.equal(result.finalTextRecoverySucceeded, true);
});

test('a staged prescription survives recovery — the transition is still returned, ready for exactly one real card on commit', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'prescribe_mental_rep', PRESCRIBE_INPUT),
    textResponse(''),
    textResponse('Here is your one practice for the week.'),
  ]);
  const result = await run(stub, PENDING_STATE);
  assert.equal(result.transition.type, 'prescribe_mental_rep');
  assert.equal(result.finalText, 'Here is your one practice for the week.');
});

test('a second empty recovery response leaves finalText empty — the caller\'s existing EMPTY_FINAL_TEXT retry still fires, recovery is not retried again', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'propose_barrier', PROPOSE_INPUT),
    textResponse(''),
    textResponse('   '), // recovery also comes back empty
  ]);
  const result = await run(stub, NO_STATE);
  assert.equal(stub.calls.length, 3, 'no third Anthropic call — recovery is attempted at most once');
  assert.equal(sanitizeFinalText(result.finalText), null);
  assert.equal(result.finalTextRecoveryAttempted, true);
  assert.equal(result.finalTextRecoverySucceeded, false);
});

test('recovery is never attempted when no tool was staged at all — a genuinely empty first response returns immediately with no extra call', async () => {
  const stub = makeAnthropicStub([textResponse('')]);
  const result = await run(stub, NO_STATE);
  assert.equal(stub.calls.length, 1);
  assert.equal(result.finalTextRecoveryAttempted, false);
  assert.equal(sanitizeFinalText(result.finalText), null);
});

test('a normal response with valid text and a staged tool makes no additional (recovery) Anthropic call', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'propose_barrier', PROPOSE_INPUT, 'tu-normal'),
    textResponse('Here is the real reply.'),
  ]);
  const result = await run(stub, NO_STATE);
  assert.equal(stub.calls.length, 2, 'only the tool round and the final round — no recovery call needed');
  assert.equal(result.finalTextRecoveryAttempted, false);
  assert.equal(result.finalText, 'Here is the real reply.');
});

test('the true round-limit path is unaffected by recovery — a model that never stops calling tools is still cut off at the hard cap', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft 1', 'propose_barrier', PROPOSE_INPUT, 'tu-1'),
    toolResponse('draft 2', 'propose_barrier', PROPOSE_INPUT, 'tu-2'),
    toolResponse('draft 3', 'propose_barrier', PROPOSE_INPUT, 'tu-3'),
    toolResponse('draft 4', 'propose_barrier', PROPOSE_INPUT, 'tu-4'),
  ]);
  const result = await run(stub, NO_STATE, 4);
  assert.equal(result.exceededRounds, true);
  assert.equal(result.finalText, null);
  assert.equal(result.finalTextRecoveryAttempted, false);
  assert.equal(stub.calls.length, 4, 'exactly maxRounds calls — recovery never applies when every round called a tool');
});

// ── sanitizeFinalText ────────────────────────────────────────────────────────

test('sanitizeFinalText: requires non-empty text', () => {
  assert.equal(sanitizeFinalText(''), null);
  assert.equal(sanitizeFinalText('   \n '), null);
  assert.equal(sanitizeFinalText(null), null);
  assert.equal(sanitizeFinalText(undefined), null);
});

test('sanitizeFinalText: strips tool/internal marker syntax', () => {
  const dirty = 'Real reply. <tool_use id="x"> leftover </tool_use><function_calls>junk</function_calls>';
  const clean = sanitizeFinalText(dirty);
  assert.ok(!clean.includes('<tool_use'));
  assert.ok(!clean.includes('function_calls'));
  assert.ok(clean.startsWith('Real reply.'));
});

test('sanitizeFinalText: enforces the maximum length', () => {
  const long = 'a'.repeat(10000);
  assert.ok(sanitizeFinalText(long).length <= 6000);
});

test('sanitizeFinalText: leaves normal coaching text untouched', () => {
  const text = 'Try this before the match.';
  assert.equal(sanitizeFinalText(text), text);
});

test('sanitizeFinalText: strips complete legacy [APP:...] and [SUGGEST:...] markers from new buffered text, preserving surrounding prose', () => {
  const text = 'Try this before the match. [APP:body-reset]\n[SUGGEST: Yes | Tell me more]';
  const clean = sanitizeFinalText(text);
  assert.equal(clean, 'Try this before the match.');
  assert.ok(!clean.includes('[APP:'));
  assert.ok(!clean.includes('[SUGGEST:'));
});

test('sanitizeFinalText: strips multiple [APP:...] tags', () => {
  const text = 'Two options here. [APP:body-reset] [APP:self-talk]';
  const clean = sanitizeFinalText(text);
  assert.ok(!clean.includes('[APP:'));
  assert.equal(clean, 'Two options here.');
});

test('sanitizeFinalText: does not touch unrelated bracket text that is not a well-formed tag', () => {
  const text = 'See you [next week] and keep at it.';
  assert.equal(sanitizeFinalText(text), text);
});

test('sanitizeFinalText: a marker-like but malformed fragment (no closing bracket) is left alone, not broadly deleted', () => {
  const text = 'This mentions [APP: without a proper close and continues normally.';
  assert.equal(sanitizeFinalText(text), text);
});
