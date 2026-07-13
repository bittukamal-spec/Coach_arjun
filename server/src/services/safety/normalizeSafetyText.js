// Pure text normalization for deterministic safety screening.
// No dependencies, no side effects — unit-testable in isolation.

// Zero-width and invisible characters that could be used (or appear
// accidentally, e.g. from mobile keyboards) to split trigger phrases.
const ZERO_WIDTH = /[​-‍﻿­]/g;

// Curly/smart quotes → straight, so phrases like "can't" match "can’t".
const SMART_QUOTES = [
  [/[‘’ʼ]/g, "'"],
  [/[“”]/g, '"'],
];

function normalizeSafetyText(input) {
  if (typeof input !== 'string' || input.length === 0) return '';

  let text = input.normalize('NFC'); // canonical form — critical for Devanagari matras
  text = text.replace(ZERO_WIDTH, '');
  for (const [pattern, replacement] of SMART_QUOTES) {
    text = text.replace(pattern, replacement);
  }
  text = text.toLowerCase();       // affects Latin only; Devanagari has no case
  text = text.replace(/\s+/g, ' ').trim(); // collapse all whitespace runs

  return text;
}

module.exports = { normalizeSafetyText };
