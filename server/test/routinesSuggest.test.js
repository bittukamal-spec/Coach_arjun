// Ritual rebuild PR 2 — unit tests for the deterministic routine-suggestion
// rules. Pure: no database, no network, no AI. Targeted assertions only.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const { suggestRoutine } = require('../src/services/routines/suggestRoutine');
const rules = require('../src/services/routines/suggestionRules');
const { validateCreateRoutine, LIMITS, CATEGORIES, STEP_KINDS } = require('../src/services/routines/validateRoutine');

function suggest(input) {
  const result = suggestRoutine(input);
  assert.equal(result.valid, true, `unexpected error: ${result.error}`);
  return result.suggestion;
}
const kinds = s => s.steps.map(x => x.kind);
const suggested = s => s.steps.filter(x => x.origin === 'suggested');

// ── Existing habits ─────────────────────────────────────────────────────

test('existing habits are kept verbatim, in their original order, before any suggestion', () => {
  const habits = ['Fix my strings', '  bounce the ball TWICE ', 'Look at the racket'];
  const s = suggest({ category: 'session_preparation', purposeKey: 'focus', existingHabits: habits });
  assert.deepEqual(s.steps.slice(0, 3).map(x => x.instruction), habits);
  assert.ok(s.steps.slice(0, 3).every(x => x.origin === 'existing' && x.kind === 'custom' && x.cue === null));
  assert.ok(s.steps.slice(3).every(x => x.origin === 'suggested'));
  assert.ok(s.reasons.includes('habits_kept'));
});

test('habits are never dropped for exceeding the window preference, up to the global maximum', () => {
  const habits = ['One', 'Two', 'Three', 'Four', 'Five']; // LIMITS.MAX_HABITS === LIMITS.MAX_STEPS
  assert.equal(habits.length, LIMITS.MAX_STEPS);
  for (const category of CATEGORIES) {
    const s = suggest({ category, purposeKey: 'reset', existingHabits: habits });
    assert.deepEqual(s.steps.map(x => x.instruction), habits, category);
    assert.equal(suggested(s).length, 0, category);
    assert.ok(s.reasons.includes('habits_exceed_window'), category);
    assert.ok(!s.reasons.includes('habits_fill_window'), category);
  }
  // A seconds-long moment prefers 2 steps; 3 habits are all still kept.
  const three = suggest({ category: 'repeated_moment', purposeKey: 'focus', existingHabits: habits.slice(0, 3) });
  assert.deepEqual(three.steps.map(x => x.instruction), habits.slice(0, 3));
  assert.ok(three.reasons.includes('habits_exceed_window'));
});

test('habits exactly filling the window report habits_fill_window; fewer report neither', () => {
  const two = suggest({ category: 'repeated_moment', purposeKey: 'reset', existingHabits: ['Towel off', 'Tap the line'] });
  assert.deepEqual(two.steps.map(x => x.instruction), ['Towel off', 'Tap the line']);
  assert.ok(two.reasons.includes('habits_fill_window'));
  assert.ok(!two.reasons.includes('habits_exceed_window'));

  const one = suggest({ category: 'repeated_moment', purposeKey: 'reset', existingHabits: ['Towel off'] });
  assert.equal(one.steps.length, 2);
  assert.ok(!one.reasons.some(r => r.startsWith('habits_') && r !== 'habits_kept'));
});

test('suggestions complement habits and skip exact-text duplicates of a habit', () => {
  const s = suggest({
    category: 'pressure_moment', purposeKey: 'focus',
    existingHabits: ['  choose one thing to FOCUS on for the next   action '],
  });
  assert.equal(s.steps.length, 3);
  assert.equal(s.steps.filter(x => /focus on for the next/i.test(x.instruction)).length, 1);
  assert.ok(s.reasons.includes('duplicate_skipped'));
});

// ── Breathing / regulation ──────────────────────────────────────────────

test('breathing is not added to focus, confidence, activate or prepare routines in any window', () => {
  for (const window of rules.TIME_WINDOWS) {
    for (const purposeKey of ['focus', 'confidence', 'activate', 'prepare']) {
      const s = suggest({ category: 'pressure_moment', purposeKey, timeWindow: window });
      assert.ok(!kinds(s).includes('breathe'), `${window}.${purposeKey}`);
      assert.ok(!s.reasons.includes('regulation_included'));
    }
  }
  for (const category of CATEGORIES) {
    assert.ok(!kinds(suggest({ category })).includes('breathe'), `${category} fallback`);
  }
});

test('breathing appears in exactly seconds/settle, short/settle, short/reset and longer/settle', () => {
  const withBreath = [];
  for (const window of rules.TIME_WINDOWS) {
    for (const purposeKey of rules.PURPOSE_KEYS) {
      if (kinds(suggest({ category: 'pressure_moment', purposeKey, timeWindow: window })).includes('breathe')) {
        withBreath.push(`${window}/${purposeKey}`);
      }
    }
  }
  assert.deepEqual(withBreath.sort(), ['longer/settle', 'seconds/settle', 'short/reset', 'short/settle']);
  assert.ok(!kinds(suggest({ category: 'pressure_moment', purposeKey: 'reset', timeWindow: 'longer' })).includes('breathe'));
});

test('a seconds-long reset is a release action plus the next action, with no breathing', () => {
  const s = suggest({ category: 'repeated_moment', purposeKey: 'reset' });
  assert.equal(s.timeWindow, 'seconds');
  assert.deepEqual(kinds(s), ['reset', 'prepare']);
});

test('regulation is suggested for settle, and one quick breath for a short reset', () => {
  const settle = suggest({ category: 'pressure_moment', purposeKey: 'settle' });
  assert.equal(settle.steps[0].kind, 'breathe');
  assert.ok(settle.reasons.includes('regulation_included'));

  const seconds = suggest({ category: 'repeated_moment', purposeKey: 'settle' });
  assert.deepEqual(kinds(seconds), ['breathe', 'prepare']);
  assert.equal(seconds.steps[0].instruction, 'Take one slow breath with a longer exhale');

  const shortReset = suggest({ category: 'pressure_moment', purposeKey: 'reset' });
  assert.equal(kinds(shortReset).filter(k => k === 'breathe').length, 1);
});

// ── Preparation vs brief in-performance moments ─────────────────────────

test('seconds-long moments stay genuinely short: at most 2 steps, no visualisation, one breath at most', () => {
  for (const purposeKey of [...rules.PURPOSE_KEYS, undefined]) {
    const s = suggest({ category: 'repeated_moment', purposeKey });
    assert.ok(s.steps.length <= 2, `${purposeKey}: ${s.steps.length}`);
    assert.ok(!kinds(s).includes('visualize'), String(purposeKey));
    assert.ok(kinds(s).filter(k => k === 'breathe').length <= 1);
  }
  assert.equal(suggest({ category: 'repeated_moment', purposeKey: 'focus', existingHabits: ['Towel off'] }).steps.length, 2);
});

test('session preparation allows a fuller sequence without inventing a physical warm-up', () => {
  const s = suggest({ category: 'session_preparation', purposeKey: 'prepare' });
  assert.equal(s.timeWindow, 'longer');
  assert.deepEqual(s.steps.map(x => x.instruction), [
    'Choose one thing to focus on for what comes next',
    'Choose your plan for your first action',
    'Picture yourself carrying out your first action clearly',
    'Say one short cue for the next action',
  ]);
  for (const purposeKey of rules.PURPOSE_KEYS) {
    for (const category of CATEGORIES) {
      for (const timeWindow of rules.TIME_WINDOWS) {
        assert.ok(!kinds(suggest({ category, purposeKey, timeWindow })).includes('physical'));
      }
    }
  }
  // The athlete's own physical habits are still kept, verbatim and first.
  const withHabit = suggest({ category: 'session_preparation', purposeKey: 'prepare', existingHabits: ['Ten skips'] });
  assert.equal(withHabit.steps[0].instruction, 'Ten skips');
  assert.equal(withHabit.steps.length, 4);
});

test('category defaults and explicit timeWindow override', () => {
  assert.equal(suggest({ category: 'repeated_moment', purposeKey: 'focus' }).timeWindow, 'seconds');
  assert.equal(suggest({ category: 'pressure_moment', purposeKey: 'focus' }).timeWindow, 'short');
  assert.equal(suggest({ category: 'session_preparation', purposeKey: 'focus' }).timeWindow, 'longer');
  const overridden = suggest({ category: 'pressure_moment', purposeKey: 'settle', timeWindow: 'longer' });
  assert.equal(overridden.timeWindow, 'longer');
  assert.equal(overridden.templateKey, 'pressure_moment.longer.settle');
});

// ── Fallback ────────────────────────────────────────────────────────────

test('without a purpose rule the output is a conservative fallback, labelled as such', () => {
  for (const purposeKey of [undefined, null, 'not_sure']) {
    const s = suggest({ category: 'pressure_moment', purposeKey });
    assert.equal(s.matchType, 'fallback');
    assert.equal(s.purposeKey, null);
    assert.equal(s.templateKey, 'pressure_moment.short.fallback');
    assert.deepEqual(kinds(s), ['prepare', 'cue']);
    assert.ok(s.reasons.includes('fallback_no_purpose'));
  }
  assert.equal(suggest({ category: 'repeated_moment' }).steps.length, 1);
});

test('own_situation without a stated time window falls back even with a purpose; with one it can match', () => {
  const unknown = suggest({ category: 'own_situation', purposeKey: 'settle' });
  assert.equal(unknown.matchType, 'fallback');
  assert.equal(unknown.templateKey, 'own_situation.short.fallback');
  assert.ok(unknown.reasons.includes('fallback_unknown_timing'));
  assert.equal(unknown.purposeKey, null, 'an ignored purposeKey is not reported as applied');
  assert.ok(!kinds(unknown).includes('breathe'));

  const stated = suggest({ category: 'own_situation', purposeKey: 'settle', timeWindow: 'seconds' });
  assert.equal(stated.matchType, 'specific');
  assert.equal(stated.templateKey, 'own_situation.seconds.settle');
});

test('free text never changes the output (no keyword inference); sport and role are sport-neutral', () => {
  const base = suggest({ category: 'pressure_moment' });
  const worded = suggest({
    category: 'pressure_moment', sport: 'cricket', role: 'Bowler',
    purpose: 'I need to calm down and breathe, saans lena hai', moment: 'Last over, very nervous',
    startTrigger: 'Walking back to my mark',
  });
  assert.deepEqual(worded, base);
});

// ── Output contract, determinism, input errors ──────────────────────────

test('output is identical for identical input and never shares mutable state', () => {
  const input = { category: 'session_preparation', purposeKey: 'confidence', existingHabits: ['Tape my grip'] };
  const a = suggest(input);
  const b = suggest(structuredClone(input));
  assert.deepEqual(a, b);
  a.steps[0].instruction = 'changed';
  a.steps.push({});
  assert.deepEqual(suggest(input), b);
  assert.deepEqual(input, { category: 'session_preparation', purposeKey: 'confidence', existingHabits: ['Tape my grip'] });
});

test('every rule produces steps and metadata that the existing routine validator accepts', () => {
  for (const category of CATEGORIES) {
    for (const timeWindow of [undefined, ...rules.TIME_WINDOWS]) {
      for (const purposeKey of [undefined, ...rules.PURPOSE_KEYS]) {
        const s = suggest({ category, purposeKey, timeWindow, existingHabits: ['My own habit'] });
        assert.ok(s.steps.every(x => STEP_KINDS.includes(x.kind) && !('id' in x)));
        assert.ok(s.steps.length <= LIMITS.MAX_STEPS);
        const check = validateCreateRoutine({
          name: 'Suggested', category, existingHabits: ['My own habit'],
          steps: s.steps, templateKey: s.templateKey, templateVersion: s.templateVersion,
        });
        assert.equal(check.valid, true, `${s.templateKey}: ${check.error}`);
        assert.equal(s.templateVersion, 1);
      }
    }
  }
});

test('every rule list fits its window and every block is sport-neutral, short, English text', () => {
  for (const [window, byPurpose] of Object.entries(rules.RULES)) {
    for (const [purpose, blocks] of Object.entries(byPurpose)) {
      assert.ok(blocks.length <= rules.WINDOW_STEP_LIMIT[window], `${window}.${purpose}`);
      assert.ok(blocks.every(b => rules.BLOCKS[b]), `${window}.${purpose}`);
    }
  }
  for (const block of Object.values(rules.BLOCKS)) {
    assert.ok(block.instruction.length <= LIMITS.INSTRUCTION);
    assert.match(block.instruction, /^[A-Za-z0-9 ,.'-]+$/);
    assert.doesNotMatch(block.instruction, /cricket|football|tennis|badminton|hockey|ball\b|serve|wicket|goal/i);
    // Category-neutral: rules can be reached from any category via timeWindow.
    assert.doesNotMatch(block.instruction, /\btoday\b|session|\bplay\b|\bmatch\b|\bgame starts|decide exactly|eyes on/i);
  }
});

test('a longer override outside session_preparation produces no session-specific wording', () => {
  for (const category of ['repeated_moment', 'pressure_moment', 'own_situation']) {
    for (const purposeKey of [undefined, ...rules.PURPOSE_KEYS]) {
      const s = suggest({ category, purposeKey, timeWindow: 'longer' });
      assert.equal(s.timeWindow, 'longer');
      assert.ok(s.templateKey.startsWith(`${category}.longer.`));
      for (const step of s.steps) {
        assert.doesNotMatch(step.instruction, /\btoday\b|session|\bplay\b/i, `${s.templateKey}: ${step.instruction}`);
      }
    }
  }
});

test('visualisation is generated only for short/prepare and longer/prepare, as process imagery', () => {
  const withImagery = [];
  for (const window of rules.TIME_WINDOWS) {
    for (const purposeKey of rules.PURPOSE_KEYS) {
      const s = suggest({ category: 'pressure_moment', purposeKey, timeWindow: window });
      const imagery = s.steps.filter(x => x.kind === 'visualize');
      if (imagery.length) withImagery.push(`${window}/${purposeKey}`);
      for (const step of imagery) assert.match(step.instruction, /^Picture yourself carrying out your (next|first) action clearly$/);
    }
  }
  assert.deepEqual(withImagery.sort(), ['longer/prepare', 'short/prepare']);
});

test('reviewed copy: plan, focus, cue, confidence and activation wording', () => {
  const texts = new Set(Object.values(rules.BLOCKS).map(b => b.instruction));
  for (const expected of [
    'Choose your plan for the next action',
    'Choose one thing to focus on for the next action',
    'Choose one thing to focus on for what comes next',
    'Choose your plan for your first action',
    'Say one short cue for the next action',
    'Remind yourself of one thing you trust in your game',
    'Use one energy word to switch on',
    'Let the last action go and shift attention to the next one',
    'Take one slow breath with a longer exhale',
  ]) assert.ok(texts.has(expected), expected);
  // Cue steps never rely on a stored cue.
  for (const category of CATEGORIES) {
    for (const purposeKey of rules.PURPOSE_KEYS) {
      assert.ok(suggest({ category, purposeKey }).steps.every(x => x.cue === null));
    }
  }
});

test('invalid input is rejected rather than guessed', () => {
  const cases = [
    [null, 'invalid_input'],
    [{ category: 'match_day' }, 'invalid_category'],
    [{ category: 'pressure_moment', purposeKey: 'calm down' }, 'invalid_purpose_key'],
    [{ category: 'pressure_moment', timeWindow: 'minutes' }, 'invalid_time_window'],
    [{ category: 'pressure_moment', existingHabits: 'bounce ball' }, 'invalid_existing_habits'],
    [{ category: 'pressure_moment', existingHabits: [{ text: 'x', kind: 'breathe' }] }, 'invalid_existing_habits'],
    [{ category: 'pressure_moment', existingHabits: Array(LIMITS.MAX_HABITS + 1).fill('x') }, 'invalid_existing_habits'],
    [{ category: 'pressure_moment', existingHabits: ['h'.repeat(LIMITS.HABIT + 1)] }, 'existing_habit_too_long'],
  ];
  for (const [input, error] of cases) assert.deepEqual(suggestRoutine(input), { valid: false, error });
});

test('the suggestion engine has no database, network or AI dependency', () => {
  for (const f of ['suggestRoutine.js', 'suggestionRules.js']) {
    const src = readFileSync(path.join(__dirname, '../src/services/routines', f), 'utf8');
    const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
    assert.ok(requires.every(r => r === './validateRoutine' || r === './suggestionRules'), `${f}: ${requires}`);
    assert.doesNotMatch(src, /\bfetch\(|https?:\/\/|prisma|anthropic|Math\.random|Date\.now|new Date/i, f);
  }
});
