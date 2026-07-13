// Shared deterministic pre-LLM safety screening (pilot plan PR-5).
//
// Usage in a route, before any Anthropic call that includes athlete-authored
// text:
//
//   const { screenSafetyFields, recordSafetyEvent, getSafetyGuidance } = require('../services/safety');
//   const screen = screenSafetyFields(fieldA, fieldB);
//   if (screen.flagged) {
//     recordSafetyEvent(req.userId, '<surface>', screen.category);
//     return <surface-native safety response using getSafetyGuidance(...)>;
//   }
//
// The prompt-level safety instructions in chat.js remain unchanged as the
// second defensive layer for indirect/contextual distress.

const { screenSafetyText, screenSafetyFields } = require('./screenSafetyText');
const { getSafetyGuidance } = require('./safetyMessages');
const recordSafetyEvent = require('./recordSafetyEvent');

module.exports = {
  screenSafetyText,
  screenSafetyFields,
  getSafetyGuidance,
  recordSafetyEvent,
};
