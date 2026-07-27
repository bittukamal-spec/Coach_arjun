// AI wording layer (PR 3). The AI may ONLY rephrase the deterministic rule
// sections for warmth/readability. It never chooses observations, pattern,
// strength, priority, or conclusion. Any parse / timeout / validation failure
// returns the deterministic drafts unchanged — the profile never fails to
// render because AI wording failed.
//
// Input is deliberately minimal (see buildWordingInput in profileService): no
// guardian email, DOB, user id, account metadata, Mind Journal, chat history,
// or unrelated memory. Custom text is safety-screened before it can reach here.

const Anthropic = require('@anthropic-ai/sdk');
const { hasProhibited, wordCount, isGrounded } = require('./ruleEngine');

const FIELDS = ['whatMatters', 'possiblePattern', 'whatHelps', 'whereWeBegin'];
const MAX_TOTAL_WORDS = 240;
const TIMEOUT_MS = 8000;
const DEVANAGARI = /[ऀ-ॿ]/;

function stripFences(s) {
  return String(s || '').replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
}

function buildPrompt(input) {
  const langName = input.language === 'hi' ? 'Hindi' : 'English';
  const drafts = JSON.stringify(input.drafts, null, 2);
  return `You are Arjun, a warm mental-performance coach for young Indian athletes. Below is a cautious STARTING profile already written for ${input.firstName}, a ${input.sport || 'sport'} athlete. Rewrite ONLY for warmth and natural readability in ${langName}.

STRICT RULES:
- Keep the exact meaning of each section. Do NOT add, remove, or strengthen any claim.
- KEEP EVERY SPECIFIC DETAIL the draft already contains: the sport and role, the exact situation being described, each reaction or effect listed, how long it lasts, what already helps, their strengths, and their goal. Generic encouragement that drops these details will be rejected.
- Never write vague filler such as "your sport means a lot to you", "the moments you mentioned", or "let's find which situation matters most" — the draft already names them.
- Never introduce a diagnosis, disorder, score, ranking, severity, personality type, "trait", "weakness", or any certainty the draft does not already state. Keep the tentative tone ("may", "one possible pattern", "starting understanding").
- Do NOT prescribe a practice or promise results.
- Keep each section short (max ~55 words, and under 240 words across all four) — but never drop a detail to save words. Write in ${langName} only.
- Return STRICT JSON only, no prose, with exactly these keys: whatMatters, possiblePattern, whatHelps, whereWeBegin.

DRAFT:
${drafts}`;
}

function validate(sections, language, anchors = []) {
  if (!sections || typeof sections !== 'object') return false;
  for (const f of FIELDS) {
    if (typeof sections[f] !== 'string' || !sections[f].trim()) return false;
    if (hasProhibited(sections[f])) return false;
  }
  if (wordCount(sections) > MAX_TOTAL_WORDS) return false;
  // Target language respected: Hindi output must contain Devanagari; English
  // output must not be predominantly Devanagari.
  const joined = FIELDS.map((f) => sections[f]).join(' ');
  if (language === 'hi' && !DEVANAGARI.test(joined)) return false;
  if (language === 'en' && DEVANAGARI.test(joined)) return false;
  // A rewrite that dropped the athlete's own specifics is not a rewrite — the
  // deterministic wording is more useful to them than warm generic text.
  if (!isGrounded(sections, anchors)) return false;
  return true;
}

// deps.createClient() → an object with messages.create(params, options).
// Injectable so tests never call the real API.
async function generateWording(input, deps = {}) {
  const drafts = input.drafts;
  const createClient = deps.createClient || (() => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

  const attempt = async () => {
    const client = createClient();
    const res = await client.messages.create(
      {
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: buildPrompt(input) }],
      },
      { timeout: TIMEOUT_MS }
    );
    const raw = res?.content?.[0]?.text;
    const parsed = JSON.parse(stripFences(raw));
    const sections = {};
    for (const f of FIELDS) sections[f] = typeof parsed[f] === 'string' ? parsed[f].trim() : '';
    if (!validate(sections, input.language, input.anchors)) return null;
    return sections;
  };

  // One retry maximum.
  for (let i = 0; i < 2; i += 1) {
    try {
      const sections = await attempt();
      if (sections) return { sections, wordingStatus: 'AI_OK', deterministicFallbackUsed: false };
    } catch {
      /* parse / timeout / model error → try again or fall back */
    }
  }
  return { sections: drafts, wordingStatus: 'FALLBACK_USED', deterministicFallbackUsed: true };
}

module.exports = { generateWording, validate, buildPrompt, MAX_TOTAL_WORDS };
