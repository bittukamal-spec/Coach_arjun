// Arjun's Review for a unified Mind Journal reflection (PR 1).
//
// The athlete reports observations; Arjun interprets them. This module is the
// only place that interpretation happens, and it is deliberately narrow:
//   - "What I noticed"  — 2-3 sentences grounded ONLY in the answers given
//   - "Pattern noticed" — optional, and only with real prior evidence
//   - "Takeaway"        — one concise, useful interpretation
//
// It never recommends or prescribes a practice. Mind Journal is a journal.
//
// Non-streaming messages.create + markdown-fence stripping before JSON.parse,
// matching every other non-chat Anthropic call in this codebase. The model is
// the project-wide ANTHROPIC_MODEL override with the same default used by
// debrief.js / selfTalk.js / bodyReset.js.

const Anthropic = require('@anthropic-ai/sdk');
const {
  buildReflectionHistoryWindow,
  formatReflectionHistoryLine,
} = require('./buildReflectionHistoryWindow');

// A pattern is a claim about repetition. One entry can never support it, and
// two is still noise at this volume — the model is only ALLOWED to return a
// pattern once there are at least this many prior reflections to compare.
const MIN_PRIOR_ENTRIES_FOR_PATTERN = 3;
const MAX_NOTICED_LENGTH = 600;
const MAX_TAKEAWAY_LENGTH = 240;
const MAX_PATTERN_LENGTH = 240;

// Athlete-authored text is quoted verbatim into the prompt so Arjun can work
// from what was actually written, but it is never echoed into the recurring
// history window (see buildReflectionHistoryWindow).
function describeAnswers(entry) {
  const line = (label, values) => (values && values.length ? `${label}: ${values.join(', ')}` : null);
  const parts = [
    entry.contextType ? `Reflecting on: ${entry.contextType}` : null,
    entry.customContext ? `In their words, it was about: "${entry.customContext}"` : null,
    line('What happened', entry.eventTags),
    entry.customEvent ? `What happened, in their words: "${entry.customEvent}"` : null,
    line('How they felt', entry.states),
    entry.customState ? `How they felt, in their words: "${entry.customState}"` : null,
    line('What was going through their mind', entry.thoughtTags),
    entry.customThought ? `Their own words: "${entry.customThought}"` : null,
    line('What they did', entry.responseTags),
    entry.customResponse ? `Their own words: "${entry.customResponse}"` : null,
    line('What they noticed in their body', entry.bodyTags),
    entry.customBody ? `Their own words: "${entry.customBody}"` : null,
    entry.cueFeedback
      ? `Their focus word${entry.cueWordSnapshot ? ` ("${entry.cueWordSnapshot}")` : ''}: ${entry.cueFeedback}`
      : null,
  ];
  return parts.filter(Boolean).join('\n');
}

function buildReviewPrompt({ entry, priorEntries, firstName, sport, language }) {
  const lang = language === 'hi'
    ? 'Hindi (Hinglish-friendly — mix Hindi with the common English sports words Indian athletes actually use)'
    : 'English';
  const name = firstName || 'the athlete';
  const sportLine = sport ? ` They play ${sport}.` : '';

  const patternAllowed = priorEntries.length >= MIN_PRIOR_ENTRIES_FOR_PATTERN;
  const historyBlock = patternAllowed
    ? `\nTheir previous reflections (most recent first), for pattern checking only:\n${
      buildReflectionHistoryWindow(priorEntries).map(formatReflectionHistoryLine).join('\n')
    }\n`
    : '';

  const patternInstruction = patternAllowed
    ? `"pattern": "<One sentence naming something that genuinely repeats across the previous reflections listed above AND today's. Only if it is clearly there in the data. If you are reaching, or it rests on one or two entries, return null instead. Describe the repetition, do not explain what causes it.>" or null`
    : `"pattern": null`;

  return `You are Arjun, a mental performance coach for young Indian athletes. ${name} just wrote a journal reflection.${sportLine} Write a short review of it in ${lang}.

They answered by picking from fixed options, so these are their own reported observations — not test results, not scores, and not a diagnosis.

Today's reflection:
${describeAnswers(entry)}
${historyBlock}
Return JSON with exactly these keys:
{
  "noticed": "<2-3 short sentences. Reflect back what they actually reported and how the pieces sit together. Only use what is in their answers above.>",
  ${patternInstruction},
  "takeaway": "<One short sentence they can carry forward. An interpretation, not an instruction.>"
}

Hard rules — these override everything else:
- Only use what ${name} actually reported above. Never add an event, feeling, thought or action they did not select.
- Keep observation and interpretation clearly separate. Say what they reported, then what it might suggest.
- Use tentative language whenever you are not certain — "it looks like", "that might be", "it could be". Never state an uncertain cause as fact.
- Never claim one answer CAUSED another. Two things happening together is not a cause.
- Never diagnose anything, and never use clinical or disorder language.
- Never describe their personality or what kind of person they are. Describe this one situation only.
- Never invent a weakness, a problem, or something to fix. If nothing looks like a problem, do not go looking for one.
- If the reflection is positive, keep it positive. Do not add a "but" to balance it out.
- Never recommend, prescribe, suggest or hint at a Mental Rep, practice, drill, exercise or tool. Not once, in any field.
- Never tell them what to work on next, what their training priority should be, or what to change.
- Never score, rank, grade or compare them to anyone.
- Talk to them directly using "you". Sound like a coach who is actually listening, not an app.

Return ONLY valid JSON. No markdown, no code fences, no preamble.`;
}

function boundedString(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

// Parses and hard-bounds the model's JSON. A pattern is dropped outright when
// the evidence floor was not met — the prompt asks for null, this guarantees
// it regardless of what came back.
function normalizeReviewPayload(raw, { priorCount }) {
  const cleaned = String(raw || '{}').replace(/^```(?:json)?\s*\n?|\n?```\s*$/gm, '').trim();
  const parsed = JSON.parse(cleaned);
  const patternAllowed = priorCount >= MIN_PRIOR_ENTRIES_FOR_PATTERN;
  return {
    noticed: boundedString(parsed.noticed, MAX_NOTICED_LENGTH),
    takeaway: boundedString(parsed.takeaway, MAX_TAKEAWAY_LENGTH),
    pattern: patternAllowed ? boundedString(parsed.pattern, MAX_PATTERN_LENGTH) : null,
  };
}

const EMPTY_REVIEW = Object.freeze({ noticed: null, takeaway: null, pattern: null });

// `anthropicFactory` is injectable so tests can exercise the contract without
// a network call — the default builds the real client per request, matching
// the convention used elsewhere in this codebase.
function createGenerateReflectionReview(anthropicFactory = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })) {
  return async function generateReflectionReview({ entry, priorEntries = [], user = {} }) {
    try {
      const prompt = buildReviewPrompt({
        entry,
        priorEntries,
        firstName: (user.name || '').split(' ')[0] || null,
        sport: user.sport || null,
        language: user.language || 'en',
      });
      const anthropic = anthropicFactory();
      const msg = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      });
      return normalizeReviewPayload(msg.content?.[0]?.text, { priorCount: priorEntries.length });
    } catch (err) {
      // A failed review must never cost the athlete their reflection. The
      // caller persists the entry either way; these nulls simply mean the
      // completion screen renders without a review.
      console.error('[mindJournal] review generation failed:', err?.message);
      return { ...EMPTY_REVIEW };
    }
  };
}

module.exports = createGenerateReflectionReview();
module.exports.createGenerateReflectionReview = createGenerateReflectionReview;
module.exports.buildReviewPrompt = buildReviewPrompt;
module.exports.normalizeReviewPayload = normalizeReviewPayload;
module.exports.describeAnswers = describeAnswers;
module.exports.MIN_PRIOR_ENTRIES_FOR_PATTERN = MIN_PRIOR_ENTRIES_FOR_PATTERN;
module.exports.EMPTY_REVIEW = EMPTY_REVIEW;
