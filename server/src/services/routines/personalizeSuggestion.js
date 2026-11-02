// Ritual PR 5 — Arjun-written ("personalised") routine suggestions.
//
// The deterministic rules (suggestRoutine) still decide the shape: the time
// window, how much room is left after the athlete's own steps, and which
// kinds of step fit the purpose. Arjun only writes the wording, using what
// the app already knows about the athlete that is relevant to this routine.
//
// Every failure falls back to the rule-based suggestion: personalize()
// resolves to null and the caller keeps the rules' steps. That covers: no
// room left, no AI access (trial/pilot/premium), guardian consent missing,
// athlete text that trips the safety screen (nothing is sent to the model),
// a model error or timeout, unparseable or invalid output, and model output
// that itself trips the safety screen.
//
// Context, all optional, each used only where relevant:
//   sport, position, cue word · active Focus Cards (focus/reset words, the
//   situation they wrote) · current coaching focus · the confirmed starting
//   profile · Coach memories · recent Mind Journal reflections, ONLY when the
//   athlete has turned on mindJournalContextEnabled ("use my reflections to
//   personalise coaching"). Nothing here is persisted or logged.
//
// `loadContext` and `callModel` are injectable so tests run without a
// database or network.

const { STEP_KINDS, LIMITS } = require('./validateRoutine');
const { WINDOW_STEP_LIMIT } = require('./suggestionRules');
const { screenSafetyFields } = require('../safety');

const MAX_CONTEXT_FIELD = 300;
const MAX_MEMORIES = 10;
const MAX_REFLECTIONS = 5;
const MAX_FOCUS_CARDS = 3;
const MODEL_TIMEOUT_MS = 15000;

const PURPOSE_TEXT = {
  settle: 'calm down / settle nerves',
  reset: 'let go of a mistake and reset',
  focus: 'focus on the next action',
  confidence: 'feel confident',
  activate: 'switch on / raise energy',
  prepare: 'get ready for what comes next',
};

const WINDOW_TEXT = {
  seconds: 'a few seconds (between balls, points or shots); each step must be doable in 1-3 seconds',
  short: 'under a minute, just before a pressure moment',
  longer: 'a few minutes before playing or training',
};

const CATEGORY_TEXT = {
  session_preparation: 'before playing or training',
  repeated_moment: 'a moment that repeats during play',
  pressure_moment: 'a single pressure moment',
  own_situation: 'a situation the athlete chose',
};

function clip(value, max = MAX_CONTEXT_FIELD) {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// The JSON object in a model reply, tolerating code fences and any prose
// the model puts before or after it. Null when there is none.
function extractJson(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are Arjun, a mental performance coach for young Indian athletes. You write the steps of a short personal routine the athlete will use in a real moment of their sport.

Rules for every step:
- One short imperative sentence the athlete can actually do in that moment (aim for under 12 words; never more than 120 characters).
- Use the athlete's real sport words (ball, over, serve, point, shot…) and their own focus, reset or cue words where they fit naturally.
- Focus on process and the next action, never on outcomes ("score a century", "win the point").
- No slogans, explanations, journaling, long exercises or warm-up drills. Simple in-sport actions are fine (tap the bat, walk back to the mark, bounce the ball).
- At most one breathing step, and only if it fits the purpose; keep it simple (one or a few slow breaths).
- Nothing medical: no injuries, pain, medication, diet or diagnosis.
- Use only the background that is relevant to THIS routine. Never quote or mention private details, memories or journal entries; never say how you know something. Never invent facts about the athlete.
- Do not repeat the athlete's own steps; yours come after them.

Reply with JSON only, no prose: {"steps":[{"kind":"<kind>","instruction":"<text>"}]}
Allowed kinds: ${STEP_KINDS.join(', ')}.`;

function buildUserPrompt({ input, window, room, ruleKinds, context, language }) {
  const lines = [];
  lines.push('## The routine');
  if (input.name) lines.push(`- Name: ${clip(input.name, LIMITS.NAME)}`);
  lines.push(`- When: ${CATEGORY_TEXT[input.category] || input.category}`);
  lines.push(`- Time available: ${WINDOW_TEXT[window] || window}`);
  lines.push(`- It should help the athlete: ${PURPOSE_TEXT[input.purposeKey] || 'not specified — choose a sensible plan for the next action'}`);
  const habits = Array.isArray(input.existingHabits) ? input.existingHabits : [];
  if (habits.length) lines.push(`- The athlete's own steps (kept first, unchanged): ${habits.map(h => `"${clip(h, LIMITS.HABIT)}"`).join('; ')}`);
  lines.push(`- Write exactly ${room} step${room === 1 ? '' : 's'}. A good shape for this purpose is: ${ruleKinds.join(' → ') || 'prepare'}.`);
  lines.push(language === 'hi'
    ? '- Language: simple everyday Hindi in Devanagari script, addressing the athlete as "तुम". Sport terms may stay in English written in Devanagari (e.g. बॉल, शॉट).'
    : '- Language: simple English.');

  const c = context || {};
  const about = [];
  if (c.sport) about.push(`- Sport: ${clip(c.sport, 120)}`);
  if (c.position) about.push(`- Position/role: ${clip(c.position, 120)}`);
  if (c.cueWord) about.push(`- Their cue word: "${clip(c.cueWord, 60)}"`);
  for (const card of (c.focusCards || []).slice(0, MAX_FOCUS_CARDS)) {
    const parts = [
      card.focusWord && `focus word "${clip(card.focusWord, 60)}"`,
      card.resetWord && `reset word "${clip(card.resetWord, 60)}"`,
      card.situation && `for: ${clip(card.situation, 200)}`,
    ].filter(Boolean);
    if (parts.length) about.push(`- Focus Card: ${parts.join(', ')}`);
  }
  if (c.currentFocus) about.push(`- What they are working on now: ${clip(c.currentFocus, 200)}`);
  if (c.profile) {
    const p = c.profile;
    if (p.whatMatters) about.push(`- What matters to them: ${clip(p.whatMatters)}`);
    if (p.possiblePattern) about.push(`- A pattern they recognised (tentative): ${clip(p.possiblePattern)}`);
    if (p.whatHelps) about.push(`- What already helps them: ${clip(p.whatHelps)}`);
  }
  for (const m of (c.memories || []).slice(0, MAX_MEMORIES)) {
    const v = clip(m.value, 200);
    if (v) about.push(`- Coach note: ${v}`);
  }
  const reflections = (c.reflections || []).slice(0, MAX_REFLECTIONS).map(r => clip(r, 300)).filter(Boolean);
  if (reflections.length) {
    about.push('- Recent reflections (background only, never quote):');
    for (const r of reflections) about.push(`  ${r}`);
  }
  if (about.length) {
    lines.push('', '## About the athlete (use only what is relevant)');
    lines.push(...about);
  }
  return lines.join('\n');
}

// Validates a model reply. Returns { steps } or { reason } — the reason is a
// fixed code for the fallback log, never model or athlete text. A single
// unusable step (too long, wrong script, duplicate) is skipped rather than
// discarding the whole reply. Never throws.
function parseStepsDetailed(text, { room, language, habits }) {
  const parsed = extractJson(text);
  if (!parsed) return { reason: 'invalid_json' };
  const raw = Array.isArray(parsed.steps) ? parsed.steps : null;
  if (!raw || raw.length === 0) return { reason: 'no_steps' };
  const norm = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const seen = new Set((habits || []).map(norm));
  const out = [];
  let skipped = null;
  for (const step of raw) {
    if (out.length >= room) break;
    const instruction = step && typeof step.instruction === 'string' ? step.instruction.replace(/\s+/g, ' ').trim() : '';
    if (instruction.length < 2) { skipped = 'empty_step'; continue; }
    if (instruction.length > LIMITS.INSTRUCTION) { skipped = 'step_too_long'; continue; }
    if (language === 'hi' && !/[ऀ-ॿ]/.test(instruction)) { skipped = 'not_devanagari'; continue; }
    if (seen.has(norm(instruction))) { skipped = 'duplicate_step'; continue; }
    seen.add(norm(instruction));
    const kind = STEP_KINDS.includes(step.kind) ? step.kind : 'custom';
    out.push({ kind, instruction, cue: null, origin: 'suggested' });
  }
  return out.length ? { steps: out } : { reason: skipped || 'no_steps' };
}

function parseSteps(text, opts) {
  return parseStepsDetailed(text, opts).steps || null;
}

// One structured line per fallback, so Railway logs show WHY the rules'
// wording was used. Codes only: no athlete or model text is ever logged.
function logFallback(reason, extra = {}) {
  console.log(JSON.stringify({ event: 'routine_suggest_fallback', reason, ...extra }));
}

async function defaultCallModel({ system, user }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: MODEL_TIMEOUT_MS, maxRetries: 1 });
  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return message.content?.[0]?.text || '';
}

function createPersonalizeSuggestion({ loadContext, callModel = defaultCallModel } = {}) {
  // input: the validated /suggest body (+ optional name); rule: the rules'
  // suggestion for the same input. Resolves to a suggestion or null.
  return async function personalize({ userId, input, rule, language }) {
    try {
      const habits = Array.isArray(input.existingHabits) ? input.existingHabits : [];
      const room = (WINDOW_STEP_LIMIT[rule.timeWindow] || 0) - habits.length;
      if (room <= 0) { logFallback('no_room'); return null; }

      // Athlete-written text is screened before anything reaches the model.
      if (screenSafetyFields(input.name || null, ...habits).flagged) { logFallback('input_flagged'); return null; }

      const context = loadContext ? await loadContext(userId, language) : null;
      if (!context) { logFallback('no_context'); return null; }
      if (!context.aiAllowed) { logFallback('ai_not_allowed'); return null; }

      const ruleKinds = rule.steps.filter(s => s.origin === 'suggested').map(s => s.kind);
      const user = buildUserPrompt({ input, window: rule.timeWindow, room, ruleKinds, context, language });
      const text = await callModel({ system: SYSTEM_PROMPT, user });
      const parsed = parseStepsDetailed(text, { room, language, habits });
      if (!parsed.steps) { logFallback(parsed.reason, { replyLength: String(text || '').length }); return null; }
      const { steps } = parsed;

      // The model's own words are screened too.
      if (screenSafetyFields(...steps.map(s => s.instruction)).flagged) { logFallback('output_flagged'); return null; }

      const ownSteps = rule.steps.filter(s => s.origin === 'existing');
      console.log(JSON.stringify({ event: 'routine_suggest_personalized', steps: steps.length }));
      return {
        ...rule,
        matchType: 'personalized',
        templateKey: `${rule.templateKey}.ai`.slice(0, LIMITS.TEMPLATE_KEY),
        steps: [...ownSteps, ...steps],
        reasons: [...rule.reasons, 'personalized'],
      };
    } catch (err) {
      logFallback('error', { name: err?.name || null, status: err?.status || null });
      console.error('[routines] personalize failed, using rules:', err?.message);
      return null;
    }
  };
}

// ── Default context loader (real database) ──────────────────────────────

function isUnderAgeWithoutConsent(user) {
  if (!user?.dateOfBirth || user.guardianConsentAt) return false;
  const birth = new Date(user.dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years -= 1;
  return years < 18;
}

function createLoadAthleteContext(client) {
  // Lazily required: these modules open their own Prisma clients.
  const { isEntitled } = require('../../routes/chat');
  const { loadConfirmedProfile } = require('../../profile/loadConfirmedProfile');
  const { loadCurrentFocusContext } = require('../../profile/loadCurrentFocusContext');
  const loadReflectionContext = require('../mindJournal/loadReflectionContext');
  const { formatReflectionLine } = loadReflectionContext;

  return async function loadAthleteContext(userId, language) {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: {
        sport: true, position: true, cueWord: true, tier: true, trialStarted: true, createdAt: true,
        pilotAccessUntil: true, dateOfBirth: true, guardianConsentAt: true,
      },
    });
    if (!user) return null;
    const aiAllowed = isEntitled(user) && !isUnderAgeWithoutConsent(user);
    if (!aiAllowed) return { aiAllowed: false };

    const [cards, memories, profile, focus, reflections] = await Promise.all([
      client.selfTalkCard.findMany({
        where: { userId, isActive: true, isArchived: false },
        orderBy: { updatedAt: 'desc' },
        take: MAX_FOCUS_CARDS,
        select: { focusWord: true, resetWord: true, situationText: true, performanceMoment: true },
      }).catch(() => []),
      client.userMemory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: MAX_MEMORIES,
        select: { memKey: true, value: true },
      }).catch(() => []),
      loadConfirmedProfile(userId, language).catch(() => null),
      loadCurrentFocusContext(userId, language).catch(() => null),
      loadReflectionContext(userId).catch(() => null), // null unless the athlete opted in
    ]);

    return {
      aiAllowed: true,
      sport: user.sport,
      position: user.position,
      cueWord: user.cueWord,
      focusCards: cards.map(c => ({
        focusWord: c.focusWord, resetWord: c.resetWord, situation: c.situationText || c.performanceMoment,
      })),
      currentFocus: focus?.phrase || null,
      profile: profile?.sections || null,
      memories,
      reflections: (reflections || []).map(formatReflectionLine),
    };
  };
}

module.exports = {
  createPersonalizeSuggestion,
  createLoadAthleteContext,
  buildUserPrompt,
  parseSteps,
  parseStepsDetailed,
  isUnderAgeWithoutConsent,
  SYSTEM_PROMPT,
};
