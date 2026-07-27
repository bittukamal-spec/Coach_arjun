// Chat response hardening: internal-orchestration leakage, acknowledgement-only
// replies, and quick-reply duplication.
//
// Founder testing showed the buffered loop's own internal continuation
// instruction reaching an athlete as a coaching reply and being persisted as an
// assistant Message. The leaked text was a PARAPHRASE of the server constant,
// not a byte-for-byte copy — hence layer D.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const { validateAthleteText, isApprovedSafetyText } = require('../src/services/coaching/validateAthleteText');
const { filterQuickReplies } = require('../src/services/coaching/filterQuickReplies');
const { runBufferedToolLoop, sanitizeFinalText, buildQuickReplyPayload, buildRecoverySystem, FINAL_TEXT_RECOVERY_INSTRUCTION } = require('../src/services/coaching/bufferedToolLoop');
const { createCommitCoachingTransition, getClarityFallbackMessage, getRetryMessage } = require('../src/services/coaching/commitCoachingTransition');

const chatSrc = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');

// The exact text the founder saw. Note it is NOT identical to the server
// constant — "[APP:] or [SUGGEST:]" became "or [SUGGEST:]".
const FOUNDER_LEAKED_TEXT =
  'Your tool action has already been accepted. Produce the final athlete-facing response text now. Do not call another tool. Do not output JSON, tool syntax, or [SUGGEST:] markers.';

// ── 1–7. Internal content is rejected ───────────────────────────────────────

test('the exact recovery instruction is rejected', () => {
  const r = validateAthleteText(FINAL_TEXT_RECOVERY_INSTRUCTION);
  assert.equal(r.ok, false);
  assert.equal(r.reasonCode, 'INTERNAL_ORCHESTRATION_TEXT');
});

test("the founder's paraphrased leak is rejected even though it is not byte-identical to the constant", () => {
  assert.notEqual(FOUNDER_LEAKED_TEXT, FINAL_TEXT_RECOVERY_INSTRUCTION, 'fixture must differ from the constant');
  const r = validateAthleteText(FOUNDER_LEAKED_TEXT);
  assert.equal(r.ok, false);
});

test('a reworded orchestration instruction with no exact signature is still rejected by the paraphrase layer', () => {
  const reworded = 'Please write the final reply for the athlete now and do not output any JSON or tool syntax.';
  const r = validateAthleteText(reworded);
  assert.equal(r.ok, false);
  assert.equal(r.reasonCode, 'PARAPHRASED_ORCHESTRATION');
});

test('the adjacent tool_result note wording is rejected', () => {
  for (const note of [
    'Reply choices are already staged. Do not call offer_quick_replies again in this request. Produce the final response text now.',
    'Barrier hypothesis staged. Now write the athlete-facing reply.',
    'Prescription staged. Now write the athlete-facing reply.',
    'Outcome staged. Now write the athlete-facing reply.',
  ]) {
    assert.equal(validateAthleteText(note).ok, false, `not rejected: ${note.slice(0, 40)}`);
  }
});

test('JSON and tool-protocol payloads are rejected', () => {
  for (const payload of [
    '{"type":"tool_use","name":"propose_barrier","input":{"problemStatement":"x"}}',
    '{"tool_use_id":"abc","content":"{}"}',
    'tool_result: accepted',
    '<invoke name="prescribe_mental_rep">',
  ]) {
    const r = validateAthleteText(payload);
    assert.equal(r.ok, false, `not rejected: ${payload.slice(0, 30)}`);
  }
});

test('an empty [SUGGEST:] marker is caught — the old one-or-more pattern missed it', () => {
  assert.equal(validateAthleteText('Here is my reply. [SUGGEST:]').ok, false);
  assert.equal(validateAthleteText('Here is my reply. [APP:]').ok, false);
  // And the loop's cosmetic sanitiser now strips both forms.
  assert.equal(sanitizeFinalText('Real coaching text.\n[SUGGEST:]'), 'Real coaching text.');
  assert.equal(sanitizeFinalText('Real coaching text. [APP:]'), 'Real coaching text.');
});

test('a populated [SUGGEST: a | b] tag never survives to the athlete', () => {
  assert.equal(sanitizeFinalText('Real text.\n[SUGGEST: Yes | No]'), 'Real text.');
  assert.equal(validateAthleteText('Real text. [SUGGEST: Yes | No]').ok, false);
});

test('ordinary coaching text that merely mentions a tool or JSON is NOT rejected', () => {
  for (const ok of [
    'Use the Pressure Reset tool before your next match — two minutes is enough.',
    'That helps narrow it down. What changes first, your shot selection or your timing?',
    'After a mistake your attention stays on it. Try one reset breath before the next ball.',
    'Your cue when pressure hits: Spot',
  ]) {
    assert.equal(validateAthleteText(ok).ok, true, `wrongly rejected: ${ok.slice(0, 40)}`);
  }
});

// ── 15–17. Acknowledgement-only ─────────────────────────────────────────────

test('acknowledgement-only English replies are rejected', () => {
  for (const ack of ["Yes, that's it.", 'Exactly.', 'Perfect!', 'Got it.', 'Right.', 'Yes.']) {
    const r = validateAthleteText(ack);
    assert.equal(r.ok, false, `not rejected: ${ack}`);
    assert.equal(r.reasonCode, 'ACKNOWLEDGEMENT_ONLY');
  }
});

test('acknowledgement-only Hindi and Hinglish replies are rejected', () => {
  for (const ack of ['हाँ, यही है।', 'बिल्कुल सही।', 'समझ गया।', 'Haan bilkul sahi.', 'Theek hai.']) {
    const r = validateAthleteText(ack);
    assert.equal(r.ok, false, `not rejected: ${ack}`);
    assert.equal(r.reasonCode, 'ACKNOWLEDGEMENT_ONLY');
  }
});

test('a meaningful short response is still allowed', () => {
  for (const good of [
    'That helps narrow it down. What changes first?',
    'Yes — and that tells me the fear shows up before the ball, not after. What do your feet do then?',
    'यह मदद करता है। सबसे पहले क्या बदलता है?',
  ]) {
    assert.equal(validateAthleteText(good).ok, true, `wrongly rejected: ${good}`);
  }
});

test('a natural closing acknowledgement is allowed', () => {
  assert.equal(validateAthleteText('Good luck tomorrow.').ok, true);
  assert.equal(validateAthleteText('Got it. Good luck tomorrow.').ok, true);
});

test('the acknowledgement layer can be switched off for callers where it does not apply', () => {
  assert.equal(validateAthleteText('Exactly.', { checkAcknowledgement: false }).ok, true);
});

// ── 26. Safety can never be suppressed ──────────────────────────────────────

test('approved safety responses are never rejected, by bypass flag or by recognised copy', () => {
  const injury = 'Stop playing immediately. Tell your coach or a trusted adult right now. If you have a head injury, chest pain, can\'t breathe, or feel seriously hurt — call 112 or go to a doctor now. Do not play on. Arjun cannot assess injuries.';
  const crisis = 'Please talk to someone right now. iCall: 9152987821. KIRAN: 1800-599-0019.';
  assert.equal(validateAthleteText(injury).ok, true);
  assert.equal(validateAthleteText(crisis).ok, true);
  assert.equal(isApprovedSafetyText(injury), true);
  assert.equal(isApprovedSafetyText(crisis), true);
  // Even a short one, and even one that would otherwise trip a layer.
  assert.equal(validateAthleteText('Yes.', { safetyBypass: true }).ok, true);
  assert.equal(validateAthleteText('Do not output JSON or tool markers. Call 112.', { safetyBypass: true }).ok, true);
});

// ── 18–23. Quick-reply filtering ────────────────────────────────────────────

test('exact duplicate chips are removed', () => {
  const kept = filterQuickReplies(['Mostly in matches', 'Mostly in matches', 'Mostly in training'], { finalText: 'Which is it?' });
  assert.deepEqual(kept, ['Mostly in matches', 'Mostly in training']);
});

test('case- and punctuation-normalised duplicates are removed', () => {
  const kept = filterQuickReplies(['Yes, that feels right', 'yes that feels right!', 'Not quite'], { finalText: 'Does that fit?' });
  assert.deepEqual(kept, ['Yes, that feels right', 'Not quite']);
});

test('a chip that repeats the assistant\'s final sentence is removed', () => {
  const kept = filterQuickReplies(
    ['Does this happen more in matches?', 'Mostly in training', 'Both'],
    { finalText: 'I hear you. Does this happen more in matches?' }
  );
  assert.deepEqual(kept, ['Mostly in training', 'Both']);
});

test('a chip that repeats the athlete\'s previous message is removed', () => {
  const kept = filterQuickReplies(
    ['I keep thinking about it', 'It passes quickly', 'Both happen'],
    { finalText: 'Which is closer?', athleteMessage: 'I keep thinking about it' }
  );
  assert.deepEqual(kept, ['It passes quickly', 'Both happen']);
});

test('bare agreement chips are removed — tapping them adds nothing', () => {
  assert.deepEqual(filterQuickReplies(['Yes', 'No', 'Exactly'], { finalText: 'Does that fit?' }), []);
});

test('chips carrying internal markers or tool syntax are removed', () => {
  const kept = filterQuickReplies(['[SUGGEST: a]', 'Mostly in matches', 'Mostly in training'], { finalText: 'x' });
  assert.deepEqual(kept, ['Mostly in matches', 'Mostly in training']);
});

test('fewer than two surviving chips emits no chip event at all — and nothing is invented to reach the minimum', () => {
  const kept = filterQuickReplies(['Yes', 'Mostly in matches'], { finalText: 'x' });
  assert.deepEqual(kept, []);
  assert.equal(buildQuickReplyPayload(kept), null, 'no payload means no quick_replies SSE event');
});

test('two or three valid chips are still emitted, capped at three', () => {
  const two = filterQuickReplies(['Mostly in matches', 'Mostly in training'], { finalText: 'Which?' });
  assert.equal(two.length, 2);
  assert.equal(buildQuickReplyPayload(two).length, 2);
  const three = filterQuickReplies(['The bowler', 'The result', 'Both'], { finalText: 'Which?' });
  assert.equal(three.length, 3);
  assert.equal(buildQuickReplyPayload(three).length, 3);
});

test('the maximum stays at three — the tool contract is unchanged', () => {
  const { QUICK_REPLY_LIMITS } = require('../src/services/coaching/coachingTools');
  assert.equal(QUICK_REPLY_LIMITS.min, 2);
  assert.equal(QUICK_REPLY_LIMITS.max, 3);
  assert.equal(filterQuickReplies(['a', 'b', 'c', 'd'], { finalText: 'x' }).length, 3);
});

// ── 8–14. Accepted tool + retry + fallback, exactly once ────────────────────
// Mirrors chat.js's sequence with stubs, in the established integration style.

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
const textResponse = (text) => ({ content: text === null ? [] : [{ type: 'text', text }] });
const toolResponse = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu-1', name, input }] });

function makeDbStub(state) {
  const writes = [];
  let n = 0;
  const id = (p) => `${p}-${++n}`;
  const tx = {
    userCoachingState: { findUnique: async () => state, create: async ({ data }) => { writes.push({ op: 'state.create' }); return { id: id('state'), ...data }; } },
    coachingCycle: {
      create: async ({ data }) => { writes.push({ op: 'cycle.create', data }); return { id: id('cycle'), ...data }; },
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

const PROPOSE_INPUT = {
  problemStatement: 'Rushing shots when the pressure rises',
  barrierHypothesis: 'Fear of getting out drives an early commit',
};
const NO_STATE = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };

// Replays chat.js's post-loop sequence: validate → one retry → fallback,
// then exactly one commit.
async function runRouteLikeSequence({ anthropic, dbStub, retryText, language = 'en', situationPhrase = null }) {
  const loop = await runBufferedToolLoop({
    anthropic, model: 'm', maxTokens: 800, system: 'SYS', messages: [{ role: 'user', content: 'hi' }], coachingContext: NO_STATE,
  });
  const candidateText = loop.exceededRounds ? null : sanitizeFinalText(loop.finalText);
  let finalText = null;
  let usedClarityFallback = false;
  const rejections = [];

  if (candidateText) {
    const first = validateAthleteText(candidateText);
    if (first.ok) finalText = candidateText;
    else {
      rejections.push(first.reasonCode);
      const retry = sanitizeFinalText(retryText);
      const check = validateAthleteText(retry || '');
      if (check.ok) finalText = retry;
      else rejections.push(check.reasonCode);
      if (!finalText) {
        finalText = getClarityFallbackMessage(language, situationPhrase);
        usedClarityFallback = true;
      }
    }
  }

  const commit = createCommitCoachingTransition(dbStub.db);
  const committed = await commit({
    userId: 'user-1', chatSessionId: 'cs-1', sessionType: null,
    finalText, transition: loop.transition, userMessageId: 'um-1',
  });
  return { loop, candidateText, finalText, usedClarityFallback, rejections, committed };
}

test('an accepted tool followed by a VALID retry: the retry text is what gets persisted, and the tool commits once', async () => {
  const anthropic = makeAnthropicStub([
    toolResponse('propose_barrier', PROPOSE_INPUT),
    textResponse(FOUNDER_LEAKED_TEXT),
  ]);
  const dbStub = makeDbStub(null);
  const good = 'It sounds like the fear of getting out makes you commit early. Does that fit what happens?';
  const out = await runRouteLikeSequence({ anthropic, dbStub, retryText: good });

  assert.equal(out.rejections[0], 'INTERNAL_ORCHESTRATION_TEXT');
  assert.equal(out.finalText, good);
  assert.equal(out.usedClarityFallback, false);
  assert.equal(dbStub.writes.filter((w) => w.op === 'message.create').length, 1, 'exactly one assistant Message');
  assert.equal(dbStub.writes.filter((w) => w.op === 'cycle.create').length, 1, 'coaching state advances exactly once');
});

test('an accepted tool followed by a FAILED retry: the deterministic fallback is persisted and the tool still commits exactly once', async () => {
  const anthropic = makeAnthropicStub([
    toolResponse('propose_barrier', PROPOSE_INPUT),
    textResponse(FOUNDER_LEAKED_TEXT),
  ]);
  const dbStub = makeDbStub(null);
  const out = await runRouteLikeSequence({
    anthropic, dbStub,
    retryText: 'Produce the final athlete-facing response text now.', // still internal
    situationPhrase: 'what happens after a mistake',
  });

  assert.equal(out.usedClarityFallback, true);
  assert.equal(out.finalText, "I didn't explain that clearly. Let's stay with what happens after a mistake. What feels most important about it right now?");
  assert.equal(dbStub.writes.filter((w) => w.op === 'message.create').length, 1);
  assert.equal(dbStub.writes.filter((w) => w.op === 'cycle.create').length, 1, 'the accepted action is not lost, and not repeated');
  assert.equal(dbStub.writes.filter((w) => w.op === 'prescription.create').length, 0, 'no unrelated records');
});

test('rejected internal text is never persisted, in either outcome', async () => {
  for (const retryText of ['A good, specific coaching reply about your next ball.', 'Do not call another tool.']) {
    const anthropic = makeAnthropicStub([
      toolResponse('propose_barrier', PROPOSE_INPUT),
      textResponse(FOUNDER_LEAKED_TEXT),
    ]);
    const dbStub = makeDbStub(null);
    await runRouteLikeSequence({ anthropic, dbStub, retryText });
    const persisted = dbStub.writes.filter((w) => w.op === 'message.create').map((w) => w.data.content);
    assert.equal(persisted.length, 1);
    for (const content of persisted) {
      assert.ok(!content.includes('tool action has already been accepted'), 'leaked text was persisted');
      assert.equal(validateAthleteText(content).ok, true, 'persisted text must itself be valid');
    }
  }
});

test('the tool executes exactly once across the reject → retry → fallback path', async () => {
  const anthropic = makeAnthropicStub([
    toolResponse('propose_barrier', PROPOSE_INPUT),
    textResponse(FOUNDER_LEAKED_TEXT),
  ]);
  const dbStub = makeDbStub(null);
  const out = await runRouteLikeSequence({ anthropic, dbStub, retryText: FOUNDER_LEAKED_TEXT });
  // The loop staged one transition; the commit wrote one cycle+selection.
  assert.equal(out.loop.transition.type, 'propose_barrier');
  assert.equal(dbStub.writes.filter((w) => w.op === 'cycle.create').length, 1);
  assert.equal(dbStub.writes.filter((w) => w.op === 'selection.create').length, 1);
});

test('the generic fallback is used when no validated situation phrase exists, and never says "nothing was changed"', () => {
  const en = getClarityFallbackMessage('en', null);
  const hi = getClarityFallbackMessage('hi', null);
  assert.equal(en, "I didn't explain that clearly. What part of this situation feels most important right now?");
  assert.equal(hi, 'मैंने इसे साफ़ तरीके से नहीं कहा। अभी इस स्थिति में सबसे ज़रूरी बात क्या लग रही है?');
  assert.ok(!en.includes('Nothing was changed'), 'must not reuse the "nothing changed" retry copy');
  assert.notEqual(en, getRetryMessage('en'));
  // Hindi contextual form.
  assert.equal(
    getClarityFallbackMessage('hi', 'दबाव बढ़ने पर क्या होता है'),
    'मैंने इसे साफ़ तरीके से नहीं कहा। चलिए दबाव बढ़ने पर क्या होता है पर ही रहते हैं। अभी इसमें सबसे ज़रूरी बात क्या लग रही है?'
  );
  // The fallback itself must pass validation — otherwise it could loop.
  assert.equal(validateAthleteText(en).ok, true);
  assert.equal(validateAthleteText(hi).ok, true);
  assert.equal(validateAthleteText(getClarityFallbackMessage('en', 'what happens after a mistake')).ok, true);
});

// ── Route wiring ────────────────────────────────────────────────────────────

test('the route validates before any persistence, and only ever commits validated or fallback text', () => {
  const validateIdx = chatSrc.indexOf('const firstCheck = candidateText');
  const commitIdx = chatSrc.indexOf('committed = await commitCoachingTransition(');
  const streamIdx = chatSrc.indexOf("{ t: 'd', c: finalText }");
  assert.ok(validateIdx !== -1, 'candidate validation must exist');
  assert.ok(validateIdx < commitIdx, 'validation must run before the commit');
  assert.ok(commitIdx < streamIdx, 'nothing is streamed before the commit');
  assert.match(chatSrc, /finalText = getClarityFallbackMessage\(user\?\.language, situationPhrase\)/);
});

test('the controlled retry has no tools and carries its instruction in the system prompt', () => {
  const idx = chatSrc.indexOf('const retryResponse = await anthropic.messages.create({');
  assert.ok(idx !== -1, 'a single controlled retry must exist');
  const block = chatSrc.slice(idx, idx + 400);
  assert.match(block, /system: buildRecoverySystem\(systemPrompt\)/);
  assert.doesNotMatch(block, /tools:/, 'the retry must not expose tools');
});

test('rejected text is never logged — only fixed reason codes and structural facts', () => {
  const idx = chatSrc.indexOf('const logResponseValidation =');
  assert.ok(idx !== -1);
  const block = chatSrc.slice(idx, chatSrc.indexOf('};', idx));
  assert.match(block, /reasonCode: result\.reasonCode/);
  // Word-boundaried, so the safe recovery BOOLEANS (finalTextRecoveryAttempted
  // / finalTextRecoverySucceeded) are not mistaken for a text reference —
  // same convention as chatBufferedWiring.test.js.
  assert.doesNotMatch(block, /\bcandidateText\b|\bfinalText\b|\bretryText\b|\bcontent\b/, 'no message text may be logged');
  // The structural shape it does log is types/counts/lengths only.
  assert.match(block, /responseShape: responseShape \|\| loop\.responseShape/);
});

test('the recovery system builder appends to the existing prompt rather than replacing it', () => {
  const out = buildRecoverySystem('ORIGINAL PROMPT');
  assert.ok(out.startsWith('ORIGINAL PROMPT'));
  assert.ok(out.includes(FINAL_TEXT_RECOVERY_INSTRUCTION));
});

// ── 24–25, 27–28. Prompt rules and untouched behaviour ─────────────────────

test('the contextual typo rule appears exactly once in the prompt', () => {
  const matches = chatSrc.match(/Athletes may use spelling mistakes, voice-transcription errors/g) || [];
  assert.equal(matches.length, 1);
  assert.match(chatSrc, /silently use the corrected meaning/i);
  assert.match(chatSrc, /Ask one brief clarification only when multiple plausible meanings would materially change/);
  assert.match(chatSrc, /do not quote an obvious misspelling back to them/i);
});

test('specialist sports vocabulary is explicitly protected from being "corrected"', () => {
  for (const term of ['yorker', 'outswinger', 'inswinger', 'bouncer', 'crease']) {
    assert.ok(chatSrc.includes(term), `${term} must be named as a real term, not a typo`);
  }
  assert.match(chatSrc, /never "correct" real sport terminology you recognise/);
});

test('the acknowledgement rule is in the coaching response loop, exactly once', () => {
  const matches = chatSrc.match(/A reply that is only acknowledgement/g) || [];
  assert.equal(matches.length, 1);
  const loopIdx = chatSrc.indexOf('## Coaching Response Loop');
  const ruleIdx = chatSrc.indexOf('A reply that is only acknowledgement');
  assert.ok(loopIdx !== -1 && ruleIdx > loopIdx && ruleIdx - loopIdx < 1500, 'rule must sit inside the response loop section');
});

test('the exact-quoting rule is scoped to saved Focus Card text only', () => {
  assert.match(chatSrc, /Quote THESE SAVED CARD WORDS exactly/);
  assert.match(chatSrc, /This exact-quoting rule applies only to the saved card text above/);
  assert.doesNotMatch(chatSrc, /Quote their words exactly — never rewrite them\./, 'the unscoped rule must be gone');
});

test('load-bearing verbatim requirements are preserved', () => {
  assert.match(chatSrc, /must include that exact lessonText verbatim/, 'lessonText still requires exact preservation');
});

test('safety blocks, consent gating and the deterministic follow-up path are untouched', () => {
  assert.match(chatSrc, /Stop playing immediately/);
  assert.match(chatSrc, /9152987821/);
  assert.match(chatSrc, /router\.post\('\/message', authenticate, aiLimiter, requireGuardianConsent, checkFr/);
  assert.match(chatSrc, /const emitDeterministicRetry = async \(reasonCode, err\) => \{/);
  assert.match(chatSrc, /getRetryMessage\(user\?\.language\)/);
});
