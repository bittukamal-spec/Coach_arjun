// Unit tests for the coaching-state system-prompt instructions (PR-10
// correction 1). buildSystemPrompt/buildCoachingStateSection are exported
// from chat.js specifically for this — pure string-building functions, no
// Anthropic, no database.

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSystemPrompt, buildCoachingStateSection } = require('../src/routes/chat');

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

// ── Active prescription ──────────────────────────────────────────────────────

test('active-prescription: forbids another prescription and forbids starting a new cycle', () => {
  const section = buildCoachingStateSection(ACTIVE_PRESCRIPTION_STATE);
  assert.match(section, /Prescription Already Active/);
  assert.match(section, /Do NOT create or suggest another prescription/i);
  assert.match(section, /do not call prescribe_mental_rep again/i);
  assert.match(section, /Do NOT start a new coaching cycle or propose a new barrier/i);
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

test('buildSystemPrompt: omits the coaching-state section entirely when coachingContext is absent', () => {
  const prompt = buildSystemPrompt(baseUser(), [], [], null, {});
  assert.doesNotMatch(prompt, /## Coaching State:/);
});

test('buildSystemPrompt: the dormant quick-chat prompt is unaffected even if coachingContext is passed', () => {
  const prompt = buildSystemPrompt(baseUser(), [], [], null, { isQuickChat: true, coachingContext: PENDING_STATE });
  assert.doesNotMatch(prompt, /Coaching State:/);
  assert.match(prompt, /This is a quick chat/);
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
