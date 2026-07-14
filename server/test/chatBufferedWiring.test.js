// Source-level wiring checks for the buffered coaching tool loop in
// chat.js (PR-10) — matching the repo's established pattern
// (safetyWiring.test.js): the behavioral logic is fully unit-tested in
// bufferedToolLoop.test.js / coachingCommit.test.js with stubs; these
// assertions prove chat.js actually wires it in with the required ordering
// and leaves the safety/quick-chat paths intact.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const src = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');

// The /message handler slice (from route declaration to the wizard route).
const handler = src.slice(src.indexOf("router.post('/message'"), src.indexOf('// ── Wizard reframe endpoint'));

// ── Buffered loop wiring ─────────────────────────────────────────────────────

test('chat.js imports the coaching services (loop, sanitizer, context, commit, retry copy)', () => {
  assert.match(src, /require\('\.\.\/services\/coaching'\)/);
  for (const name of ['runBufferedToolLoop', 'sanitizeFinalText', 'loadCoachingContext', 'commitCoachingTransition', 'getRetryMessage']) {
    assert.ok(src.includes(name), `chat.js must use ${name}`);
  }
});

test('main chat runs the buffered loop; the athlete text comes only from the committed finalText', () => {
  assert.match(handler, /const loop = await runBufferedToolLoop\(/);
  assert.match(handler, /sanitizeFinalText\(loop\.finalText\)/);
  // The buffered path's d-event carries finalText — the same variable that
  // was just persisted inside the transaction.
  assert.match(handler, /\{ t: 'd', c: finalText \}/);
});

test('the ONLY incremental stream.on(text) emission left is inside the dormant quick-chat branch', () => {
  const quickIdx = handler.indexOf('if (isQuickChat)');
  const quickEnd = handler.indexOf('// ── Main coaching chat');
  assert.ok(quickIdx !== -1 && quickEnd > quickIdx, 'expected an isQuickChat branch before the main buffered path');

  const streamEmits = [...handler.matchAll(/stream\.on\('text'/g)].map((m) => m.index);
  assert.equal(streamEmits.length, 1, 'exactly one incremental streaming emission may remain (quick chat)');
  assert.ok(streamEmits[0] > quickIdx && streamEmits[0] < quickEnd, 'it must live inside the quick-chat branch');
});

test('SSE emit order in the buffered path: transaction commit, then d, then card (conditional), then end', () => {
  const commitIdx = handler.indexOf('committed = await commitCoachingTransition(');
  const dIdx = handler.indexOf("{ t: 'd', c: finalText }");
  const cardIdx = handler.indexOf("{ t: 'card', card: committed.card }");
  const endIdx = handler.indexOf("{ t: 'end', id: committed.message.id }");
  assert.ok(commitIdx !== -1 && dIdx !== -1 && cardIdx !== -1 && endIdx !== -1, 'all four stages must exist');
  assert.ok(commitIdx < dIdx && dIdx < cardIdx && cardIdx < endIdx, 'order must be commit → d → card → end');
  // The card emission is guarded — it only fires for a newly committed prescription.
  const guardSlice = handler.slice(cardIdx - 80, cardIdx);
  assert.match(guardSlice, /if \(committed\.card\)/);
});

test('commit failures on a staged transition fall back to the deterministic retry message, never the model text', () => {
  assert.match(handler, /const emitDeterministicRetry = async \(\) => \{/);
  assert.match(handler, /getRetryMessage\(user\?\.language\)/);
  // Round-cap/empty-text path and commit-failure path both use it.
  assert.match(handler, /if \(!finalText\) return emitDeterministicRetry\(\)/);
  const catchIdx = handler.indexOf('} catch (commitErr) {');
  assert.ok(catchIdx !== -1);
  const catchBlock = handler.slice(catchIdx, catchIdx + 700);
  assert.match(catchBlock, /if \(loop\.transition\)/);
  assert.match(catchBlock, /return emitDeterministicRetry\(\)/);
});

test('the round cap discards everything: exceededRounds forces the retry path before any commit', () => {
  const idx = handler.indexOf('loop.exceededRounds ? null : sanitizeFinalText');
  assert.ok(idx !== -1, 'exceededRounds must null the final text (which routes to the retry path)');
  const commitIdx = handler.indexOf('committed = await commitCoachingTransition(');
  assert.ok(idx < commitIdx, 'the exceededRounds check must come before the commit');
});

test('no raw tool payload can reach the SSE stream: every res.write in the handler emits a known protocol event', () => {
  const writes = [...handler.matchAll(/res\.write\(`data: \$\{JSON\.stringify\((\{[^}]*\})\)/g)].map((m) => m[1]);
  assert.ok(writes.length >= 6, 'expected the full set of protocol writes');
  for (const payload of writes) {
    assert.match(payload, /t: '(d|end|error|card)'/, `unexpected SSE payload shape: ${payload}`);
    assert.doesNotMatch(payload, /tool_use|tool_result|loop\.|transition/, `tool internals must never be written: ${payload}`);
  }
});

// ── Preserved behavior ───────────────────────────────────────────────────────

test('safety regression: the deterministic screen still returns before any Anthropic construction or coaching-loop call', () => {
  const screenIdx = handler.indexOf('screenSafetyText(content)');
  const safetyReturnIdx = handler.indexOf('return res.end();', screenIdx);
  const anthropicIdx = handler.indexOf('new Anthropic({ apiKey');
  const loopIdx = handler.indexOf('runBufferedToolLoop(');
  assert.ok(screenIdx !== -1 && safetyReturnIdx !== -1);
  assert.ok(safetyReturnIdx < anthropicIdx, 'safety path must terminate before the Anthropic client exists');
  assert.ok(safetyReturnIdx < loopIdx, 'safety path must terminate before the coaching loop runs');
});

test('auth, consent, rate-limit, and trial middleware are unchanged on /message', () => {
  assert.match(handler, /router\.post\('\/message', authenticate, aiLimiter, requireGuardianConsent, checkFreeLimit,/);
});

test('the helpline safety event and background memory extraction still run on the buffered path', () => {
  const mainIdx = handler.indexOf('// ── Main coaching chat');
  const mainSlice = handler.slice(mainIdx);
  assert.match(mainSlice, /9152987821\|1800-599-0019/);
  assert.match(mainSlice, /extractAndStoreMemories\(req\.userId, conversationHistory, finalText\)/);
});

test('buildSystemPrompt (Arjun\'s brain) is called exactly as before — not modified, not bypassed', () => {
  assert.match(handler, /buildSystemPrompt\(user, recentCheckIns, memories, sessionType, \{ recentDebriefs, todayDrill/);
});

test('legacy historical [APP:...] handling is not removed from the codebase (client keeps parsing old messages)', () => {
  const clientChat = readFileSync(path.join(__dirname, '../../client/src/pages/ChatPage.jsx'), 'utf8');
  assert.match(clientChat, /parseArjunMessage/);
});

test('the persisted-equals-emitted invariant holds structurally: the same finalText identifier is passed to commit and to the d event', () => {
  assert.match(handler, /finalText,\s*\n\s*transition: loop\.transition/);
  assert.match(handler, /\{ t: 'd', c: finalText \}/);
});
