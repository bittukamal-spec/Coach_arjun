// Shared, presentation-agnostic sanitiser for free-text answers an athlete
// types into onboarding "Other" fields. Intentionally minimal — this is
// input hygiene, NOT psychological or AI content moderation (that is
// deliberately out of scope for PR 1). It only:
//   - trims leading / trailing whitespace
//   - collapses control characters and stray line breaks to single spaces
//   - strips obvious angle-bracket markup (<...>) so nothing HTML-ish is
//     stored, while leaving ordinary athlete punctuation intact
//   - enforces a maximum length
//
// It preserves normal language and punctuation (apostrophes, hyphens,
// accents, Devanagari, etc.) — only genuinely unsafe/meaningless characters
// are removed.

export const DEFAULT_CUSTOM_MAX = 60;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
const MARKUP = /<[^>]*>/g;
const STRAY_BRACKETS = /[<>]/g;
const MULTI_SPACE = /\s{2,}/g;

// Clean a raw value for STORAGE / submission. Returns a trimmed, bounded
// string with no control chars or markup. May return '' for input that was
// empty or whitespace/markup-only — callers treat '' as "no valid answer".
export function sanitizeCustomText(raw, maxLength = DEFAULT_CUSTOM_MAX) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(MARKUP, ' ')
    .replace(STRAY_BRACKETS, ' ')
    .replace(CONTROL_CHARS, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim();
  return cleaned.slice(0, maxLength);
}

// True when a raw custom value yields a non-empty answer after sanitising —
// used by per-screen Continue validation so a whitespace-only or
// markup-only entry never counts as a valid selection.
export function isValidCustomText(raw, maxLength = DEFAULT_CUSTOM_MAX) {
  return sanitizeCustomText(raw, maxLength).length > 0;
}
