// PR-6 correction: every recordSafetyEvent call site must pass a meaningful
// sourceType, and a real persisted identifier (chatSessionId/sourceRecordId/
// userMessageId) whenever the route genuinely has one available — never an
// invented id. weeklyReports.js's identifier behavior is covered fully
// behaviorally in weeklyReportSafety.test.js (it has an injectable factory);
// the other call sites don't have DI wiring for this, so these are
// source-text assertions over the exact call sites, in the pattern already
// established by safetyWiring.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const routesDir = path.join(__dirname, '../src/routes');
const read = (f) => readFileSync(path.join(routesDir, f), 'utf8');

function callBlock(src, anchor, windowSize = 300) {
  const idx = src.indexOf(anchor);
  assert.ok(idx !== -1, `anchor not found: ${anchor}`);
  return src.slice(idx, idx + windowSize);
}

test('chat.js /message: flagged chat events identify the chat surface and pass the available chat-session reference', () => {
  const src = read('chat.js');
  const block = callBlock(src, "recordSafetyEvent(req.userId, 'chat', screen.category, {");
  assert.match(block, /sourceType:\s*'chat_message'/);
  assert.match(block, /chatSessionId:\s*chatSessionId\s*\|\|\s*null/);
  assert.match(block, /riskLevel:\s*screen\.riskLevel/);
});

test('chat.js /wizard (visualization): flagged events carry a meaningful sourceType', () => {
  const src = read('chat.js');
  const block = callBlock(src, "recordSafetyEvent(req.userId, 'visualization', wizardScreen.category, {");
  assert.match(block, /sourceType:\s*'visualization_wizard'/);
  assert.match(block, /riskLevel:\s*wizardScreen\.riskLevel/);
});

test('sessions.js: session-summary events identify the relevant (already-persisted) chat session', () => {
  const src = read('sessions.js');
  const block = callBlock(src, "recordSafetyEvent(userId, 'session_summary', summaryScreen.category, {");
  assert.match(block, /sourceType:\s*'session_summary'/);
  assert.match(block, /sourceRecordId:\s*sessionId/);
  assert.match(block, /chatSessionId:\s*sessionId/);
  assert.match(block, /riskLevel:\s*summaryScreen\.riskLevel/);
});

test('debrief.js: both legacy and structured flows have meaningful sourceType values', () => {
  const src = read('debrief.js');
  const legacyBlock = callBlock(src, "recordSafetyEvent(req.userId, 'debrief', legacyScreen.category, {");
  assert.match(legacyBlock, /sourceType:\s*'debrief_legacy'/);
  assert.match(legacyBlock, /riskLevel:\s*legacyScreen\.riskLevel/);

  const structBlock = callBlock(src, "recordSafetyEvent(req.userId, 'debrief', structScreen.category, {");
  assert.match(structBlock, /sourceType:\s*'debrief_structured'/);
  assert.match(structBlock, /riskLevel:\s*structScreen\.riskLevel/);
});

test('selfTalk.js: has a meaningful sourceType value', () => {
  const src = read('selfTalk.js');
  const block = callBlock(src, "recordSafetyEvent(req.userId, 'self_talk', preScreen.category, {");
  assert.match(block, /sourceType:\s*'self_talk_generate'/);
  assert.match(block, /riskLevel:\s*preScreen\.riskLevel/);
});

test('bodyReset.js: has a meaningful sourceType value', () => {
  const src = read('bodyReset.js');
  const block = callBlock(src, "recordSafetyEvent(req.userId, 'body_reset', preScreen.category, {");
  assert.match(block, /sourceType:\s*'body_reset_arjun_note'/);
  assert.match(block, /riskLevel:\s*preScreen\.riskLevel/);
});

test('profileIntro.js: has a meaningful sourceType value', () => {
  const src = read('profileIntro.js');
  const block = callBlock(src, "recordSafetyEvent(req.userId, 'profile_intro', nameScreen.category, {");
  assert.match(block, /sourceType:\s*'profile_name'/);
  assert.match(block, /riskLevel:\s*nameScreen\.riskLevel/);
});

test('none of the structured source calls invent an id — every identifier passed is a variable already in scope, never a literal fabricated string', () => {
  const files = ['chat.js', 'sessions.js', 'debrief.js', 'selfTalk.js', 'bodyReset.js', 'profileIntro.js'];
  for (const file of files) {
    const src = read(file);
    // Matches e.g. sourceRecordId: 'some-made-up-id' — a quoted literal
    // instead of a variable reference — which would indicate an invented id.
    assert.doesNotMatch(
      src,
      /(sourceRecordId|chatSessionId|userMessageId):\s*'[^']+'/,
      `${file}: an identifier field must reference a variable, not a literal string`
    );
  }
});
