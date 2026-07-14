// Behavioral tests for the buffered Anthropic tool loop (PR-10), using a
// stubbed Anthropic client — no network, no real API.

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBufferedToolLoop, sanitizeFinalText, MAX_ROUNDS } = require('../src/services/coaching/bufferedToolLoop');

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

test('every Anthropic call carries the coaching tools', async () => {
  const stub = makeAnthropicStub([
    toolResponse('draft', 'propose_barrier', PROPOSE_INPUT),
    textResponse('Final.'),
  ]);
  await run(stub, NO_STATE);
  for (const call of stub.calls) {
    assert.deepEqual(call.tools.map((t) => t.name), ['propose_barrier', 'prescribe_mental_rep', 'offer_quick_replies']);
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

// ── 6. Quick reply chips (offer_quick_replies) ───────────────────────────────

const QUICK_REPLIES_INPUT = { replies: ["I'm going to get out", "I can't bat today"] };

function quickRepliesToolResponse(draftText, replies, id = 'tu-qr') {
  return toolResponse(draftText, 'offer_quick_replies', { replies }, id);
}

test('an accepted offer_quick_replies call stages the trimmed labels and discards its draft text', async () => {
  const stub = makeAnthropicStub([
    quickRepliesToolResponse('draft, never shown', ["  I'm going to get out  ", " I can't bat today "]),
    textResponse('What happened out there?'),
  ]);
  const result = await run(stub, NO_STATE);
  assert.equal(result.finalText, 'What happened out there?');
  assert.deepEqual(result.quickReplies, ["I'm going to get out", "I can't bat today"]);
  assert.equal(result.transition, null, 'offer_quick_replies must never stage a coaching-state transition');
});

test('offer_quick_replies receives a normal tool_result and the loop continues to end_turn', async () => {
  const stub = makeAnthropicStub([
    quickRepliesToolResponse('draft', QUICK_REPLIES_INPUT.replies, 'tu-99'),
    textResponse('Final.'),
  ]);
  await run(stub, NO_STATE);
  assert.equal(stub.calls.length, 2);
  const toolResultTurn = stub.calls[1].messages[stub.calls[1].messages.length - 1];
  assert.equal(toolResultTurn.content[0].tool_use_id, 'tu-99');
  assert.equal(toolResultTurn.content[0].is_error, false);
  assert.equal(JSON.parse(toolResultTurn.content[0].content).accepted, true);
});

test('at most one offer_quick_replies call is accepted per request — a second call in a later round is rejected', async () => {
  const stub = makeAnthropicStub([
    quickRepliesToolResponse('draft 1', ['Yes, that feels right', 'Not quite'], 'tu-1'),
    quickRepliesToolResponse('draft 2', ['Different set', 'Another one'], 'tu-2'),
    textResponse('Final.'),
  ]);
  const result = await run(stub, NO_STATE);
  assert.equal(stub.calls.length, 3);
  const secondRoundResult = stub.calls[2].messages[stub.calls[2].messages.length - 1].content[0];
  assert.equal(secondRoundResult.is_error, true);
  assert.match(JSON.parse(secondRoundResult.content).error, /Only one offer_quick_replies call/i);
  // The FIRST staged set is retained — never overwritten by the rejected second call.
  assert.deepEqual(result.quickReplies, ['Yes, that feels right', 'Not quite']);
});

test('a transition tool and one offer_quick_replies call in the SAME response both stage successfully', async () => {
  const stub = makeAnthropicStub([
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'draft' },
        { type: 'tool_use', id: 'tu-1', name: 'propose_barrier', input: PROPOSE_INPUT },
        { type: 'tool_use', id: 'tu-2', name: 'offer_quick_replies', input: { replies: ['Yes, that feels right', 'Not quite'] } },
      ],
    },
    textResponse('Does that sound right?'),
  ]);
  const result = await run(stub, NO_STATE);
  const toolResults = stub.calls[1].messages[stub.calls[1].messages.length - 1].content;
  assert.equal(toolResults.length, 2);
  assert.equal(toolResults[0].is_error, false);
  assert.equal(toolResults[1].is_error, false);
  assert.equal(result.transition.type, 'propose_barrier');
  assert.deepEqual(result.quickReplies, ['Yes, that feels right', 'Not quite']);
});

test('an invalid offer_quick_replies payload is rejected and stages nothing, while a valid transition in the same round still stages', async () => {
  const stub = makeAnthropicStub([
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'draft' },
        { type: 'tool_use', id: 'tu-1', name: 'propose_barrier', input: PROPOSE_INPUT },
        { type: 'tool_use', id: 'tu-2', name: 'offer_quick_replies', input: { replies: ['Only one'] } }, // invalid: <2
      ],
    },
    textResponse('Final.'),
  ]);
  const result = await run(stub, NO_STATE);
  const toolResults = stub.calls[1].messages[stub.calls[1].messages.length - 1].content;
  assert.equal(toolResults[1].is_error, true);
  assert.equal(result.transition.type, 'propose_barrier');
  assert.equal(result.quickReplies, null);
});

test('the round cap discards staged quick replies along with everything else', async () => {
  const stub = makeAnthropicStub([quickRepliesToolResponse('draft', QUICK_REPLIES_INPUT.replies)]); // repeats forever
  const result = await run(stub, NO_STATE);
  assert.equal(result.exceededRounds, true);
  assert.equal(result.quickReplies, null);
  assert.equal(result.finalText, null);
});

test('a normal response with no tool calls at all has quickReplies null (nothing staged)', async () => {
  const stub = makeAnthropicStub([textResponse('Just coaching text.')]);
  const result = await run(stub, NO_STATE);
  assert.equal(result.quickReplies, null);
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
