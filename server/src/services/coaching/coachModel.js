// Which Claude model the main Coach chat uses, and the request settings that
// go with it (Nov 2026). Coach-only: every other AI feature keeps reading
// ANTHROPIC_MODEL directly.
//
// Railway settings (all optional — with none set, Coach behaves exactly as
// before on ANTHROPIC_MODEL / Haiku 4.5):
//   COACH_MODEL              e.g. claude-sonnet-5-5 or claude-haiku-5-5
//   COACH_EFFORT             low | medium | high | xhigh | max | none
//                            (default "low" on models that take effort —
//                            quick chat replies; "none" sends nothing)
//   COACH_REFUSAL_FALLBACK   "off" disables the server-side refusal fallback
//                            on models that support it (default on)
//
// Newer models think before answering by default. Thinking tokens count
// toward max_tokens, so those models get more room; effort keeps the
// thinking short. The system prompt is sent as blocks so the large, stable
// part is prompt-cached and the per-message notes (language hints,
// clarification) ride after the cache breakpoint.

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

// Model families that accept output_config.effort (and think adaptively).
// Haiku 4.5 and older reject effort, so nothing is sent for them.
const EFFORT_MODEL_RE = /^claude-(?:fable-5|mythos-5|opus-5|sonnet-5|haiku-5|opus-4-[678]|sonnet-4-6)/;
// Models that accept the server-side refusal fallback ("default" form).
const FALLBACK_MODEL_RE = /^claude-(?:fable-5-1|opus-5-5|opus-5(?![-\d])|sonnet-5-5)/;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const LEGACY_MAX_TOKENS = 800;
const THINKING_MAX_TOKENS = 2500;

function resolveCoachModel(env = process.env) {
  return env.COACH_MODEL || env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

// { model, maxTokens, body, options } — `body` is merged into every
// messages.create body and `options` is the SDK request-options argument.
function coachRequestSettings(env = process.env) {
  const model = resolveCoachModel(env);
  const takesEffort = EFFORT_MODEL_RE.test(model);
  const body = {};
  let options;

  if (takesEffort) {
    const wanted = String(env.COACH_EFFORT || 'low').toLowerCase();
    if (EFFORT_LEVELS.includes(wanted)) body.output_config = { effort: wanted };
  }
  if (FALLBACK_MODEL_RE.test(model) && String(env.COACH_REFUSAL_FALLBACK || '').toLowerCase() !== 'off') {
    body.fallbacks = 'default';
    options = { headers: { 'anthropic-beta': FALLBACK_BETA } };
  }

  return {
    model,
    maxTokens: takesEffort ? THINKING_MAX_TOKENS : LEGACY_MAX_TOKENS,
    body,
    options,
  };
}

// The Coach system prompt as content blocks: the stable prompt is cached;
// per-message notes follow uncached so they never break the cache.
function buildCoachSystem(stablePrompt, volatileNotes = '') {
  const blocks = [{ type: 'text', text: stablePrompt, cache_control: { type: 'ephemeral' } }];
  const notes = String(volatileNotes || '').trim();
  if (notes) blocks.push({ type: 'text', text: notes });
  return blocks;
}

module.exports = {
  resolveCoachModel,
  coachRequestSettings,
  buildCoachSystem,
  DEFAULT_MODEL,
  FALLBACK_BETA,
  LEGACY_MAX_TOKENS,
  THINKING_MAX_TOKENS,
};
