// Fully buffered Anthropic tool loop for the main coaching chat (PR-10).
//
// Nothing here writes to the SSE stream or the database. The loop:
//   1. calls Anthropic with the coaching tools (non-streaming, buffered);
//   2. validates each tool call against a read-only coaching-context
//      snapshot and stages AT MOST ONE state transition in memory;
//   3. answers every tool_use block with a structured tool_result
//      (rejections included, so Claude can produce a corrected reply);
//   4. repeats until a response arrives with no tool calls, or the hard
//      round cap is hit.
//
// Text that accompanies a tool call is a draft by definition — it is never
// read, concatenated, or returned. Only the final tool-free response's text
// blocks become finalText. If the round cap is hit, BOTH the text and the
// staged transition are discarded (the caller falls back to a deterministic
// retry message), so a runaway loop can never commit anything.

const {
  COACHING_TOOLS,
  PROPOSE_BARRIER,
  PRESCRIBE_MENTAL_REP,
  validateProposeBarrier,
  validatePrescribeMentalRep,
} = require('./coachingTools');

const MAX_ROUNDS = 4;
const MAX_FINAL_TEXT_LENGTH = 6000;

// Internal/tool markup that must never reach the athlete. Anthropic returns
// tool calls as separate content blocks (never inline text), so in practice
// this only fires if the model echoes marker syntax into its prose.
const INTERNAL_MARKER_RE = /<\/?(?:tool_use|tool_result|function_calls?|invoke|antml:[a-z_]+)\b[^>]*>/gi;

// Legacy card/chip markers must never appear in a NEW buffered coaching-loop
// response — this loop uses only the structured t:"card" SSE event
// (client/src/utils/serverCardEvent.js). Historical stored messages still
// use these tags and the client still renders them as-is (parseArjunMessage.js,
// ChatPage.jsx's extractSuggestions) — that path is untouched; this only
// strips the tags from brand-new buffered text before it is ever emitted or
// persisted. The patterns intentionally mirror the client's own tag grammar
// exactly, so only a COMPLETE, well-formed tag is removed — never a
// partial bracket fragment or unrelated athlete-visible bracket text (e.g.
// "(see you [next week])" is left alone).
const LEGACY_APP_TAG_RE = /\[APP:[a-z-]+\]/g;         // mirrors parseArjunMessage.js
const LEGACY_SUGGEST_TAG_RE = /\n?\[SUGGEST:\s*[^\]]+\]/; // mirrors ChatPage.jsx's extractSuggestions

function sanitizeFinalText(raw) {
  if (typeof raw !== 'string') return null;
  let text = raw.replace(INTERNAL_MARKER_RE, '');
  text = text.replace(LEGACY_APP_TAG_RE, '').replace(LEGACY_SUGGEST_TAG_RE, '');
  text = text.trim();
  if (!text) return null;
  if (text.length > MAX_FINAL_TEXT_LENGTH) text = text.slice(0, MAX_FINAL_TEXT_LENGTH).trimEnd();
  return text;
}

function handleToolUse(block, context, heldTransition) {
  if (block.name !== PROPOSE_BARRIER && block.name !== PRESCRIBE_MENTAL_REP) {
    return { accepted: false, result: { accepted: false, error: `Unknown tool: ${block.name}.` } };
  }
  if (heldTransition) {
    return {
      accepted: false,
      result: {
        accepted: false,
        error: 'Only one coaching-state transition is allowed per athlete message, and one is already staged. Write your final athlete-facing reply now.',
      },
    };
  }

  if (block.name === PROPOSE_BARRIER) {
    const v = validateProposeBarrier(block.input, context);
    if (!v.ok) return { accepted: false, result: { accepted: false, error: v.error } };
    return {
      accepted: true,
      transition: {
        type: PROPOSE_BARRIER,
        problemStatement: block.input.problemStatement.trim(),
        barrierHypothesis: block.input.barrierHypothesis.trim(),
      },
      result: {
        accepted: true,
        note: 'Barrier hypothesis staged. Now write the athlete-facing reply: name the barrier plainly as a hypothesis and ask the athlete to confirm or correct it. Do not prescribe any practice yet.',
      },
    };
  }

  const v = validatePrescribeMentalRep(block.input, context);
  if (!v.ok) return { accepted: false, result: { accepted: false, error: v.error } };
  return {
    accepted: true,
    transition: {
      type: PRESCRIBE_MENTAL_REP,
      barrierConfirmationStatus: block.input.barrierConfirmationStatus,
      finalBarrierHypothesis: block.input.finalBarrierHypothesis.trim(),
      practiceKey: block.input.practiceKey,
      situation: block.input.situation.trim(),
      cardContent: block.input.cardContent.trim(),
      cueWord: typeof block.input.cueWord === 'string' && block.input.cueWord.trim() ? block.input.cueWord.trim() : null,
    },
    result: {
      accepted: true,
      note: 'Prescription staged. Now write the athlete-facing reply: deliver the practice with a one-line why and the follow-up contract. The practice card itself is shown to the athlete automatically — do not repeat the full card text.',
    },
  };
}

// anthropic is injected (real client in production, a stub in tests).
// Returns { finalText, transition, rounds, exceededRounds }.
async function runBufferedToolLoop({
  anthropic,
  model,
  maxTokens,
  system,
  messages,
  coachingContext,
  maxRounds = MAX_ROUNDS,
}) {
  const working = [...messages];
  let transition = null;

  for (let round = 1; round <= maxRounds; round++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools: COACHING_TOOLS,
      messages: working,
    });

    const content = Array.isArray(response.content) ? response.content : [];
    const toolUses = content.filter((b) => b.type === 'tool_use');

    if (toolUses.length === 0) {
      // Final response — the only text that may ever reach the athlete.
      const finalText = content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { finalText, transition, rounds: round, exceededRounds: false };
    }

    // Intermediate response: its text blocks are drafts and are never read.
    working.push({ role: 'assistant', content });

    const toolResults = toolUses.map((block) => {
      const outcome = handleToolUse(block, coachingContext, transition);
      if (outcome.accepted) transition = outcome.transition;
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(outcome.result),
        is_error: !outcome.accepted,
      };
    });
    working.push({ role: 'user', content: toolResults });
  }

  // Round cap hit while the model was still calling tools: discard
  // everything — the caller emits the deterministic retry message.
  return { finalText: null, transition: null, rounds: maxRounds, exceededRounds: true };
}

module.exports = { runBufferedToolLoop, sanitizeFinalText, MAX_ROUNDS, MAX_FINAL_TEXT_LENGTH };
