// Server-side custom-text hygiene for onboarding free-text answers. Mirrors
// the client util (client/src/utils/sanitizeCustomText.js) but is the
// authoritative check — the client can never be trusted. Input hygiene only,
// NOT psychological/AI moderation. Raw athlete text is never logged.

const DEFAULT_MAX = 120;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
const MARKUP = /<[^>]*>/g;
const STRAY_BRACKETS = /[<>]/g;
const MULTI_SPACE = /\s{2,}/g;

function sanitizeCustomText(raw, maxLength = DEFAULT_MAX) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(MARKUP, ' ')
    .replace(STRAY_BRACKETS, ' ')
    .replace(CONTROL_CHARS, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim();
  return cleaned.slice(0, maxLength);
}

function isValidCustomText(raw, maxLength = DEFAULT_MAX) {
  return sanitizeCustomText(raw, maxLength).length > 0;
}

module.exports = { sanitizeCustomText, isValidCustomText, DEFAULT_MAX };
