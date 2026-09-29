// Ritual rebuild (PR 2) — deterministic starting-routine suggestion.
//
// suggestRoutine(input) is a pure function: no database, no network, no AI,
// no randomness, no clock. The same input always returns the same output,
// and it never saves anything — the caller decides what, if anything, to
// store (through the normal validated routine API).
//
// Input uses the existing routine fields (validateRoutine.js):
//   category        required — one of the four existing categories
//   existingHabits  optional string[] — kept verbatim, in order, first
//   sport, role, moment, startTrigger, purpose
//                   accepted for forward compatibility; they never change
//                   the output (no sport-specific content yet, and purpose
//                   and timing are never inferred from free text)
// plus two optional, non-persisted hints the caller picks from fixed lists:
//   purposeKey      one of suggestionRules.PURPOSE_KEYS, or 'not_sure'
//   timeWindow      one of suggestionRules.TIME_WINDOWS
//
// Output (steps are the shape validateCreateRoutine accepts; the server
// assigns step ids on save, so none are generated here):
//   { valid: true, suggestion: { category, timeWindow, purposeKey, matchType,
//     templateKey, templateVersion, steps, reasons } }
// or { valid: false, error } for input the engine cannot use.

const { CATEGORIES, LIMITS } = require('./validateRoutine');
const {
  PURPOSE_KEYS, NO_PURPOSE_KEYS, TIME_WINDOWS, DEFAULT_TIME_WINDOW, OWN_SITUATION_FALLBACK_WINDOW,
  WINDOW_STEP_LIMIT, BLOCKS, RULES, FALLBACK, TEMPLATE_VERSION,
} = require('./suggestionRules');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateInput(input) {
  if (!isPlainObject(input)) return 'invalid_input';
  if (!CATEGORIES.includes(input.category)) return 'invalid_category';

  const { purposeKey, timeWindow, existingHabits } = input;
  if (purposeKey !== undefined && purposeKey !== null
    && !PURPOSE_KEYS.includes(purposeKey) && !NO_PURPOSE_KEYS.includes(purposeKey)) {
    return 'invalid_purpose_key';
  }
  if (timeWindow !== undefined && timeWindow !== null && !TIME_WINDOWS.includes(timeWindow)) {
    return 'invalid_time_window';
  }
  if (existingHabits !== undefined && existingHabits !== null) {
    if (!Array.isArray(existingHabits) || existingHabits.length > LIMITS.MAX_HABITS) return 'invalid_existing_habits';
    for (const h of existingHabits) {
      if (typeof h !== 'string' || !h.trim()) return 'invalid_existing_habits';
      if (h.trim().length > LIMITS.HABIT) return 'existing_habit_too_long';
    }
  }
  return null;
}

// Case- and whitespace-insensitive comparison, used only to avoid adding a
// suggestion whose text is exactly one of the athlete's habits.
function sameText(a, b) {
  const norm = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(a) === norm(b);
}

// Chooses the rule. Returns the window, the resolved purpose (or null) and
// the ordered block names, plus whether a purpose-specific rule matched.
function selectRule({ category, purposeKey, timeWindow }) {
  const purpose = PURPOSE_KEYS.includes(purposeKey) ? purposeKey : null;
  const explicitWindow = TIME_WINDOWS.includes(timeWindow) ? timeWindow : null;
  const window = explicitWindow || DEFAULT_TIME_WINDOW[category];

  // own_situation has no known timing. Without an explicit window the rules
  // do not pretend to know the moment: conservative fallback.
  if (!window) {
    // Any supplied purposeKey is deliberately ignored here, so none is
    // reported as applied.
    return { window: OWN_SITUATION_FALLBACK_WINDOW, purpose: null, blocks: FALLBACK[OWN_SITUATION_FALLBACK_WINDOW], specific: false, reason: 'fallback_unknown_timing' };
  }
  if (!purpose) {
    return { window, purpose: null, blocks: FALLBACK[window], specific: false, reason: 'fallback_no_purpose' };
  }
  return { window, purpose, blocks: RULES[window][purpose], specific: true, reason: null };
}

function suggestRoutine(input) {
  const error = validateInput(input);
  if (error) return { valid: false, error };

  const habits = Array.isArray(input.existingHabits) ? input.existingHabits : [];
  const rule = selectRule(input);
  const limit = WINDOW_STEP_LIMIT[rule.window];
  const reasons = [];
  if (rule.reason) reasons.push(rule.reason);

  // 1. The athlete's habits: every one, verbatim, in their order, first.
  //    Never dropped or reworded — even past the window's preferred length
  //    (the global maximum of 5 is already enforced by MAX_HABITS).
  const steps = habits.map(h => ({ kind: 'custom', instruction: h, cue: null, origin: 'existing' }));
  if (habits.length > 0) reasons.push('habits_kept');

  // 2. Suggestions fill only the remaining room in the window, in rule
  //    order, skipping any whose text the athlete already has.
  if (habits.length > limit) {
    reasons.push('habits_exceed_window');
  } else if (habits.length === limit) {
    reasons.push('habits_fill_window');
  } else {
    for (const name of rule.blocks) {
      if (steps.length >= limit) break;
      const block = BLOCKS[name];
      if (habits.some(h => sameText(h, block.instruction))) {
        if (!reasons.includes('duplicate_skipped')) reasons.push('duplicate_skipped');
        continue;
      }
      steps.push({ kind: block.kind, instruction: block.instruction, cue: null, origin: 'suggested' });
    }
  }

  if (steps.some(s => s.origin === 'suggested' && s.kind === 'breathe')) reasons.push('regulation_included');

  return {
    valid: true,
    suggestion: {
      category: input.category,
      timeWindow: rule.window,
      purposeKey: rule.purpose,
      matchType: rule.specific ? 'specific' : 'fallback',
      templateKey: `${input.category}.${rule.window}.${rule.specific ? rule.purpose : 'fallback'}`,
      templateVersion: TEMPLATE_VERSION,
      steps,
      reasons,
    },
  };
}

module.exports = { suggestRoutine };
