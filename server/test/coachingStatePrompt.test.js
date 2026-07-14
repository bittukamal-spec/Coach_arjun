// Unit tests for the coaching-state system-prompt instructions (PR-10
// correction 1). buildSystemPrompt/buildCoachingStateSection are exported
// from chat.js specifically for this — pure string-building functions, no
// Anthropic, no database.

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSystemPrompt, buildCoachingStateSection, buildQuickReplySection } = require('../src/routes/chat');

function baseUser(overrides = {}) {
  return {
    name: 'Test Athlete',
    sport: 'badminton',
    experienceLevel: 'competitive',
    goals: '[]',
    language: 'en',
    competitionLevel: 'state',
    primaryChallenge: 'nerves',
    pressureResponse: 'has_routine',
    ritualName: null,
    ritualSteps: '[]',
    xp: 0,
    age: 16,
    ...overrides,
  };
}

const NO_STATE = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };
const PENDING_STATE = { hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'PENDING', hasPrescription: false };
const ACTIVE_PRESCRIPTION_STATE = { hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'CONFIRMED', hasPrescription: true };

// ── No active selection ──────────────────────────────────────────────────────

test('no-active-selection: instructs question-first behavior before any barrier is proposed', () => {
  const section = buildCoachingStateSection(NO_STATE);
  assert.match(section, /No Active Coaching Cycle/);
  assert.match(section, /Ask focused, targeted questions before proposing anything/);
  assert.match(section, /2–4 focused questions/);
  assert.match(section, /Do not immediately advise, coach a fix, or prescribe/i);
});

test('no-active-selection: propose_barrier yields exactly one tentative barrier framed as a hypothesis, no card', () => {
  const section = buildCoachingStateSection(NO_STATE);
  assert.match(section, /call the propose_barrier tool with exactly ONE tentative barrier/i);
  assert.match(section, /frame that barrier as a hypothesis/i);
  assert.match(section, /ask the athlete to confirm or correct it/i);
  assert.match(section, /Do NOT prescribe a practice, mention a specific tool, or offer any menu/i);
});

test('no-active-selection: may mention offer_quick_replies for one focused question', () => {
  const section = buildCoachingStateSection(NO_STATE);
  assert.match(section, /offer_quick_replies/);
});

// ── Pending barrier ──────────────────────────────────────────────────────────

test('pending-barrier: requires explicit acceptance before prescribe_mental_rep may be called', () => {
  const section = buildCoachingStateSection(PENDING_STATE);
  assert.match(section, /Barrier Awaiting Confirmation/);
  assert.match(section, /Call prescribe_mental_rep only after the athlete has explicitly accepted/i);
});

test('pending-barrier: a bare rejection of the hypothesis is not CORRECTED and does not license a prescription', () => {
  const section = buildCoachingStateSection(PENDING_STATE);
  assert.match(section, /rejection alone is not a correction and is not grounds to prescribe anything/i);
  assert.match(section, /CORRECTED means a revised barrier was proposed and accepted/i);
  assert.match(section, /never merely that the original was rejected/i);
  assert.match(section, /no more than two more useful follow-up questions/i);
  assert.match(section, /present exactly ONE revised hypothesis/i);
});

test('pending-barrier: forbids opening a second cycle and forbids unapproved/game practice keys', () => {
  const section = buildCoachingStateSection(PENDING_STATE);
  assert.match(section, /Do not open a second cycle or drift to a new problem/i);
  assert.match(section, /never a game \(Focus Lock, Reset Rally\), a Skill Path, or any invented practice/i);
});

test('pending-barrier: the prescription reply must not use legacy card/chip syntax and must not offer a menu', () => {
  const section = buildCoachingStateSection(PENDING_STATE);
  assert.match(section, /never offer a menu, a second practice, or alternatives/i);
  assert.match(section, /do not write \[APP:\.\.\.\] or \[SUGGEST:\.\.\.\] tags/i);
});

test('pending-barrier: may offer confirm/correct quick replies after presenting the hypothesis, but never alongside prescribe_mental_rep', () => {
  const section = buildCoachingStateSection(PENDING_STATE);
  assert.match(section, /offer_quick_replies with confirm\/correct choices/i);
  assert.match(section, /Yes, that feels right/i);
  assert.match(section, /Not quite/i);
  assert.match(section, /do not call offer_quick_replies in that same reply/i);
});

// ── Active prescription ──────────────────────────────────────────────────────

test('active-prescription: forbids another prescription and forbids starting a new cycle', () => {
  const section = buildCoachingStateSection(ACTIVE_PRESCRIPTION_STATE);
  assert.match(section, /Prescription Already Active/);
  assert.match(section, /Do NOT create or suggest another prescription/i);
  assert.match(section, /do not call prescribe_mental_rep again/i);
  assert.match(section, /Do NOT start a new coaching cycle or propose a new barrier/i);
});

// ── Quick Reply Chips general guidance ───────────────────────────────────────

test('buildQuickReplySection: covers good uses, forbidden uses, and the client-owned "Write my own" rule', () => {
  const section = buildQuickReplySection();
  assert.match(section, /offer_quick_replies/);
  assert.match(section, /identifying the athlete's immediate thought/i);
  assert.match(section, /choosing between a couple of simple situations/i);
  assert.match(section, /confirming or rejecting a barrier hypothesis/i);
  assert.match(section, /on every message — most replies need none/i);
  assert.match(section, /crisis, abuse, injury, or immediate-danger/i);
  assert.match(section, /detailed personal explanation is needed/i);
  assert.match(section, /lead or diagnose the athlete/i);
  assert.match(section, /same reply as a new prescription/i);
  assert.match(section, /never include "Other", "Something else", or "Write my own"/i);
  assert.match(section, /follow the current conversation language/i);
});

// ── No context (quick chat / not wired) ──────────────────────────────────────

test('no coachingContext supplied: section is empty (no accidental instructions leak into other callers)', () => {
  assert.equal(buildCoachingStateSection(null), '');
  assert.equal(buildCoachingStateSection(undefined), '');
});

// ── Integration into the full system prompt ──────────────────────────────────

test('buildSystemPrompt: includes the coaching-state section when coachingContext is supplied', () => {
  const prompt = buildSystemPrompt(baseUser(), [], [], null, { coachingContext: NO_STATE });
  assert.match(prompt, /## Coaching State: No Active Coaching Cycle/);
});

test('buildSystemPrompt: includes the structured reply-chip tool guidance whenever coachingContext is supplied', () => {
  const prompt = buildSystemPrompt(baseUser(), [], [], null, { coachingContext: NO_STATE });
  assert.match(prompt, /## Structured Reply-Chip Tool \(offer_quick_replies\)/);
});

test('buildSystemPrompt: the main (non-quick-chat) prompt contains offer_quick_replies guidance and NO instruction to generate legacy [SUGGEST:...] tags', () => {
  const prompt = buildSystemPrompt(baseUser(), [], [], null, { coachingContext: NO_STATE });
  assert.match(prompt, /## Structured Reply-Chip Tool \(offer_quick_replies\)/, 'the new tool section must be present');
  // The legacy "## Quick Reply Chips" generation section has been removed
  // from the main template entirely — offer_quick_replies is now the only
  // mechanism for new main-chat reply chips.
  assert.doesNotMatch(prompt, /## Quick Reply Chips\n/, 'the legacy SUGGEST-tag generation section must not exist in the main prompt');
  assert.doesNotMatch(prompt, /\[SUGGEST:\s*option1/i, 'the main prompt must never instruct the model to write a [SUGGEST:...] tag');
});

test('buildSystemPrompt: omits the coaching-state AND structured reply-chip sections entirely when coachingContext is absent', () => {
  const prompt = buildSystemPrompt(baseUser(), [], [], null, {});
  assert.doesNotMatch(prompt, /## Coaching State:/);
  assert.doesNotMatch(prompt, /## Structured Reply-Chip Tool/);
});

test('buildSystemPrompt: the dormant quick-chat prompt is unaffected even if coachingContext is passed', () => {
  const prompt = buildSystemPrompt(baseUser(), [], [], null, { isQuickChat: true, coachingContext: PENDING_STATE });
  assert.doesNotMatch(prompt, /Coaching State:/);
  assert.doesNotMatch(prompt, /Structured Reply-Chip Tool/);
  assert.match(prompt, /This is a quick chat/);
});

test('buildSystemPrompt: Quick Chat keeps its own legacy [SUGGEST:...] generation instruction unchanged — only the main prompt had it removed', () => {
  const quickPrompt = buildSystemPrompt(baseUser(), [], [], null, { isQuickChat: true });
  assert.match(quickPrompt, /\[SUGGEST: option1 \| option2 \| option3\]/, 'Quick Chat must still instruct the model to emit its own [SUGGEST:...] tag');
  assert.doesNotMatch(quickPrompt, /offer_quick_replies/, 'Quick Chat does not use the new structured tool');

  const mainPrompt = buildSystemPrompt(baseUser(), [], [], null, { coachingContext: NO_STATE });
  assert.doesNotMatch(mainPrompt, /\[SUGGEST: option1 \| option2 \| option3\]/, 'the main prompt must not carry the quick-chat-style SUGGEST instruction');
});

test('buildSystemPrompt: existing profile context, language rules, and safety blocks are preserved alongside the new section', () => {
  const prompt = buildSystemPrompt(baseUser(), [], [], null, { coachingContext: PENDING_STATE });
  assert.match(prompt, /\*\*Name:\*\* Test Athlete/);
  assert.match(prompt, /CRITICAL: Respond ONLY in English/);
  assert.match(prompt, /## Crisis detection and emotional safety/);
  assert.match(prompt, /## Injury and physical safety/);
  assert.match(prompt, /Safety overrides everything/);
});

test('buildSystemPrompt: guardian-consent-relevant profile fields (age) still render unchanged', () => {
  const prompt = buildSystemPrompt(baseUser({ age: 15 }), [], [], null, { coachingContext: NO_STATE });
  assert.match(prompt, /\*\*Age:\*\* 15 years/);
});
