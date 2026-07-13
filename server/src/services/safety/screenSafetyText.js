// Deterministic pre-LLM safety classification.
// Pure function: no I/O, no persistence, no randomness. Returns only the
// category and risk level — never the matched phrase or any excerpt of the
// athlete's text, so nothing sensitive can leak into logs or the database
// through this return value.

const { normalizeSafetyText } = require('./normalizeSafetyText');
const { RULES, CONTEXTUAL_RULES, matchesAnyOf } = require('./safetyRules');

// Category priority when multiple rules match: crisis outranks abuse
// outranks injury (rules are already grouped in that order).
const NOT_FLAGGED = Object.freeze({ flagged: false, category: null, riskLevel: null });

function screenSafetyText(input) {
  const text = normalizeSafetyText(input);
  if (!text) return NOT_FLAGGED;

  for (const rule of RULES) {
    const hit = rule.script === 'devanagari'
      ? text.includes(rule.pattern)
      : rule.pattern.test(text);
    if (hit) {
      return { flagged: true, category: rule.category, riskLevel: rule.riskLevel };
    }
  }

  // Contextual rules: fire only when BOTH groups match (e.g. a breathing-
  // distress phrase together with an immediacy/danger-context phrase) —
  // never on a single isolated token.
  for (const rule of CONTEXTUAL_RULES) {
    if (matchesAnyOf(text, rule.anyOf) && matchesAnyOf(text, rule.withAnyOf)) {
      return { flagged: true, category: rule.category, riskLevel: rule.riskLevel };
    }
  }

  return NOT_FLAGGED;
}

// Convenience for surfaces with several athlete-authored fields: screens
// them as one text so phrases split across a single field still match, and
// missing/null fields are ignored.
function screenSafetyFields(...fields) {
  return screenSafetyText(fields.filter(f => typeof f === 'string' && f).join('\n'));
}

module.exports = { screenSafetyText, screenSafetyFields };
