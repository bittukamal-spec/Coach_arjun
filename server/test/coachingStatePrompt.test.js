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

test('no-active-selection: asks open questions and never offers a menu of options', () => {
  const section = buildCoachingStateSection(NO_STATE);
  assert.match(section, /Ask your questions as open questions in plain language/i);
  assert.match(section, /never offer the athlete a numbered list, a lettered menu, or a set of options to pick from/i);
});

test('no-active-selection: the removed reply-chip tool is never mentioned', () => {
  assert.doesNotMatch(buildCoachingStateSection(NO_STATE), /offer_quick_replies/);
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


test('pending-barrier: confirmation is asked as an open question, and a bare rejection is never confirmation/CORRECTED', () => {
  const section = buildCoachingStateSection(PENDING_STATE);
  assert.doesNotMatch(section, /offer_quick_replies/);
  assert.match(section, /ask for that confirmation in your own words as an open question/i);
  assert.match(section, /do not list options for the athlete to pick from/i);
  assert.match(section, /A bare rejection is only a rejection, never a correction and never CONFIRMED\/CORRECTED by itself/i);
  assert.match(section, /the athlete must still explain or accept a revised barrier before prescribe_mental_rep may be called/i);
});

// ── Active prescription ──────────────────────────────────────────────────────

test('active-prescription: forbids another prescription and forbids starting a new cycle', () => {
  const section = buildCoachingStateSection(ACTIVE_PRESCRIPTION_STATE);
  assert.match(section, /Prescription Already Active/);
  assert.match(section, /Do NOT create or suggest another prescription/i);
  assert.match(section, /do not call prescribe_mental_rep again/i);
  assert.match(section, /Do NOT start a new coaching cycle or propose a new barrier/i);
});

test('active-prescription: instructs record_prescription_outcome for a reported result, requires the lesson verbatim, and forbids a new prescription in the same reply (PR-13)', () => {
  const section = buildCoachingStateSection(ACTIVE_PRESCRIPTION_STATE);
  assert.match(section, /call record_prescription_outcome with the matching outcomeStatus/i);
  assert.match(section, /Your visible reply must include that exact lessonText verbatim/i);
  assert.match(section, /Never diagnose, score, or profile the athlete in the lesson/i);
  assert.match(section, /never claim the practice is clinically effective/i);
  assert.match(section, /Do NOT prescribe a new practice in the same reply as record_prescription_outcome/i);
});

// ── Continuing after DID_NOT_HELP (PR-13) ─────────────────────────────────

const POST_DID_NOT_HELP_STATE = { hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'CONFIRMED', hasPrescription: false };

test('continuing-after-did-not-help: a confirmed/corrected barrier with no current prescription gets its own distinct coaching state', () => {
  const section = buildCoachingStateSection(POST_DID_NOT_HELP_STATE);
  assert.match(section, /Continuing After a Practice That Did Not Help/);
  assert.doesNotMatch(section, /Barrier Awaiting Confirmation/, 'must not be confused with the pristine pending-barrier state');
});

test('continuing-after-did-not-help: does not re-prescribe immediately, asks at most 1-2 focused questions first, then allows exactly one new prescription', () => {
  const section = buildCoachingStateSection(POST_DID_NOT_HELP_STATE);
  assert.match(section, /Do NOT prescribe another practice immediately/i);
  assert.match(section, /at most 1–2 focused questions/i);
  assert.match(section, /you may call prescribe_mental_rep again for this same barrier/i);
  assert.match(section, /never open a new cycle, never propose a new barrier/i);
  assert.match(section, /never offer a menu of practices/i);
});

test('a CORRECTED barrier with no prescription also lands in the continuing-after-did-not-help state (not just CONFIRMED)', () => {
  const section = buildCoachingStateSection({ ...POST_DID_NOT_HELP_STATE, barrierConfirmationStatus: 'CORRECTED' });
  assert.match(section, /Continuing After a Practice That Did Not Help/);
});

test('a truly PENDING barrier with no prescription still gets the original Barrier Awaiting Confirmation state, not the DID_NOT_HELP continuation', () => {
  const section = buildCoachingStateSection(PENDING_STATE);
  assert.match(section, /Barrier Awaiting Confirmation/);
  assert.doesNotMatch(section, /Continuing After a Practice That Did Not Help/);
});

// ── Quick Reply Chips general guidance ───────────────────────────────────────






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

test('buildSystemPrompt: Quick Chat no longer asks for legacy [SUGGEST:...] tags either — no surface generates reply chips', () => {
  const quick = buildSystemPrompt(baseUser(), [], [], null, { isQuickChat: true });
  assert.doesNotMatch(quick, /End each reply with a new line containing exactly \[SUGGEST:/);
  assert.match(quick, /Never write \[SUGGEST:\.\.\.\] or \[APP:\.\.\.\] tags/);
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
