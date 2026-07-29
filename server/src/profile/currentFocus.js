// The athlete's CURRENT coaching focus — the one mutable part of the
// Performance Profile.
//
// The Starting Performance Profile is the frozen onboarding baseline:
// ruleOutput, suggestedPriorityId, agreedPriorityId, fitResponse and the
// correction history are never rewritten by anything in this file. Changing
// focus writes only the CurrentCoachingFocus row.
//
// Existing athletes have no row at all. Rather than backfill, the displayed
// focus falls back to the confirmed agreedPriorityId, marked
// source: 'STARTING_PROFILE'. A row is created the first time the athlete
// actually changes focus.
//
// Pure resolution + validation live here; the Prisma client is injectable so
// tests never need a database.

const cfg = require('./ruleConfig');
const { priorityPhrase } = require('./ruleEngine');
const { sanitizeCustomText } = require('../onboarding/sanitize');

const CUSTOM_FOCUS_MAX = 80;

// The canonical approved focus list is exactly the onboarding
// difficult_moments answer ids that have an athlete-facing action label. No
// separate list is maintained: adding a focus means adding a label in
// ruleConfig, which keeps server and client from drifting.
const APPROVED_FOCUS_IDS = Object.keys(cfg.FOCUS_ACTION_LABEL);

function isApprovedFocusId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(cfg.FOCUS_ACTION_LABEL, id);
}

function lang(language) {
  return language === 'hi' ? 'hi' : 'en';
}

// Athlete-facing action label for a focus id. Custom focuses show the
// athlete's own sanitised words; an unusable custom value falls back to a
// neutral phrase rather than an empty card.
function focusLabel(focusId, customText, language) {
  const L = lang(language);
  if (focusId === cfg.CUSTOM_FOCUS_ID) {
    const clean = sanitizeCustomText(customText || '', CUSTOM_FOCUS_MAX);
    return clean || cfg.CUSTOM_FOCUS_FALLBACK_LABEL[L];
  }
  return cfg.FOCUS_ACTION_LABEL[focusId]?.[L] || cfg.CUSTOM_FOCUS_FALLBACK_LABEL[L];
}

// The conversational form, for Arjun's system context — never a raw label
// dropped into prose. Custom focuses use the athlete's own words.
function focusPhrase(focusId, customText, language, ruleOutput = null) {
  const L = lang(language);
  if (focusId === cfg.CUSTOM_FOCUS_ID) {
    const clean = sanitizeCustomText(customText || '', CUSTOM_FOCUS_MAX);
    if (clean) return clean;
    return cfg.PRIORITY_PHRASE_FALLBACK.custom[L];
  }
  return priorityPhrase(focusId, L, ruleOutput);
}

// The focus options offered to the athlete: the areas their own onboarding
// surfaced first, then the remaining approved areas. Ids + server-authored
// labels only — the client never maps an id to a label itself.
function buildFocusOptions({ ownMomentIds = [], language } = {}) {
  const own = (ownMomentIds || []).filter(isApprovedFocusId);
  const seen = new Set(own);
  const rest = APPROVED_FOCUS_IDS.filter((id) => !seen.has(id));
  const toOption = (id, personalised) => ({
    id,
    label: focusLabel(id, null, language),
    personalised,
  });
  return [
    ...own.map((id) => toOption(id, true)),
    ...rest.map((id) => toOption(id, false)),
  ];
}

// Resolves what the profile should DISPLAY as the current focus, given the
// stored row (may be absent) and the frozen starting profile.
// Returns null only when neither a row nor a confirmed agreed priority exists.
function resolveCurrentFocus({ focusRow, profile, ruleOutput, language }) {
  const L = lang(language);
  if (focusRow?.focusId) {
    return {
      id: focusRow.focusId,
      label: focusLabel(focusRow.focusId, focusRow.customText, L),
      phrase: focusPhrase(focusRow.focusId, focusRow.customText, L, ruleOutput),
      source: focusRow.source || 'ATHLETE_SELECTED',
      updatedAt: focusRow.updatedAt || null,
      canChange: true,
    };
  }
  // No row: fall back to the confirmed starting priority. Unconfirmed
  // profiles have no agreed priority yet, so there is nothing to show as a
  // *current* focus — the page shows the suggested starting focus instead.
  const agreed = profile?.agreedPriorityId || null;
  if (!agreed) return null;
  return {
    id: agreed,
    label: focusLabel(agreed, null, L),
    phrase: focusPhrase(agreed, null, L, ruleOutput),
    source: 'STARTING_PROFILE',
    updatedAt: profile?.confirmedAt || profile?.updatedAt || null,
    canChange: true,
  };
}

class InvalidFocusError extends Error {
  constructor(code = 'INVALID_FOCUS') {
    super(code);
    this.code = code;
  }
}

// Validates and normalises a focus-change request body. Never throws with
// athlete text in the message, and never returns unsanitised text.
function normaliseFocusInput(body = {}) {
  const focusId = typeof body.focusId === 'string' ? body.focusId.trim() : '';
  if (!focusId) throw new InvalidFocusError('INVALID_FOCUS');

  if (focusId === cfg.CUSTOM_FOCUS_ID) {
    const clean = sanitizeCustomText(body.customText || '', CUSTOM_FOCUS_MAX);
    if (!clean) throw new InvalidFocusError('INVALID_FOCUS_TEXT');
    return { focusId, customText: clean };
  }

  if (!isApprovedFocusId(focusId)) throw new InvalidFocusError('INVALID_FOCUS');
  return { focusId, customText: null };
}

module.exports = {
  APPROVED_FOCUS_IDS,
  CUSTOM_FOCUS_MAX,
  isApprovedFocusId,
  focusLabel,
  focusPhrase,
  buildFocusOptions,
  resolveCurrentFocus,
  normaliseFocusInput,
  InvalidFocusError,
};
