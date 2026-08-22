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
  const ifCardIdx = handler.lastIndexOf('if (committed.card)', cardIdx);
  assert.ok(ifCardIdx !== -1 && ifCardIdx < cardIdx, 'card emission must be guarded by if (committed.card)');
});


test('ANY commit failure — staged transition or plain message-only — falls back to the deterministic retry message, never the model text', () => {
  assert.match(handler, /const emitDeterministicRetry = async \(reasonCode, err\) => \{/);
  assert.match(handler, /getRetryMessage\(user\?\.language\)/);
  // EMPTY_FINAL_TEXT / ROUND_LIMIT no longer use it: production logs showed
  // those firing with transitionStaged:false, so "I couldn't save that
  // coaching step" was untrue, and asking the athlete to resend duplicated a
  // message that was already persisted. They now take the recovery/clarity
  // fallback path. The save-error copy remains ONLY for a genuine commit
  // failure, where nothing was in fact committed.
  assert.doesNotMatch(handler, /emitDeterministicRetry\('EMPTY_FINAL_TEXT'\)/);
  assert.doesNotMatch(handler, /return emitDeterministicRetry\(loop\.exceededRounds/);
  const catchIdx = handler.indexOf('} catch (commitErr) {');
  assert.ok(catchIdx !== -1);
  const catchBlock = handler.slice(catchIdx, catchIdx + 900);
  // No branching on loop.transition here — every commit failure, with or
  // without a staged transition, routes through the same retry.
  assert.doesNotMatch(catchBlock, /if \(loop\.transition\)/);
  assert.doesNotMatch(catchBlock, /throw commitErr/);
  assert.match(catchBlock, /return emitDeterministicRetry\(reasonCode, commitErr\)/);
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
    assert.match(payload, /t: '(d|end|error|card|quick_replies)'/, `unexpected SSE payload shape: ${payload}`);
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

test("buildSystemPrompt (Arjun's brain) is still called for both the quick-chat and main-chat paths, not bypassed", () => {
  assert.match(handler, /const promptExtra = \{ todayDrill/);
  // PR 2 cutover: reflection history is no longer read into promptExtra as
  // unconditional debriefs — it arrives through the consent-gated
  // reflectionContext threaded into the main-chat call below.
  assert.doesNotMatch(handler, /recentDebriefs/);
  const calls = [...handler.matchAll(/buildSystemPrompt\(user, recentCheckIns, memories, sessionType, ([^)]+)\)/g)].map((m) => m[1]);
  assert.equal(calls.length, 2, 'expected one call in the quick-chat branch and one in the main-chat branch');
  assert.ok(calls.includes('promptExtra'), 'quick chat must pass promptExtra unchanged');
  assert.ok(calls.some((c) => c.includes('...promptExtra') && c.includes('coachingContext')), 'main chat must extend promptExtra with coachingContext');
});

test('coachingContext is loaded before buildSystemPrompt is called on the main-chat path, so it reaches the model on the first round', () => {
  const loadIdx = handler.indexOf('const coachingContext = await loadCoachingContext(req.userId);');
  const mainPromptIdx = handler.indexOf('buildSystemPrompt(user, recentCheckIns, memories, sessionType, { ...promptExtra, coachingContext, mindJournalEntries, reflectionContext, startingProfile, currentFocus })');
  assert.ok(loadIdx !== -1 && mainPromptIdx !== -1);
  assert.ok(loadIdx < mainPromptIdx, 'coachingContext must be loaded before it is threaded into the system prompt');
});

test('quick chat never loads or threads coachingContext (dormant path unaffected by PR-10 correction 1)', () => {
  const quickIdx = handler.indexOf('if (isQuickChat)');
  const quickEnd = handler.indexOf('// ── Main coaching chat');
  const quickSlice = handler.slice(quickIdx, quickEnd);
  assert.doesNotMatch(quickSlice, /coachingContext/);
});

test('legacy historical [APP:...] handling is not removed from the codebase (client keeps parsing old messages)', () => {
  const clientChat = readFileSync(path.join(__dirname, '../../client/src/pages/ChatPage.jsx'), 'utf8');
  assert.match(clientChat, /parseArjunMessage/);
});

test('the persisted-equals-emitted invariant holds structurally: the same finalText identifier is passed to commit and to the d event', () => {
  assert.match(handler, /finalText,\s*\n\s*transition: loop\.transition/);
  assert.match(handler, /\{ t: 'd', c: finalText \}/);
});

// ── Correction 3: retry persistence invariant ────────────────────────────────

test('emitDeterministicRetry persists the retry message BEFORE writing it to the SSE stream', () => {
  const idx = handler.indexOf('const emitDeterministicRetry = async (reasonCode, err) => {');
  assert.ok(idx !== -1);
  const block = handler.slice(idx, handler.indexOf('};', idx));
  const persistIdx = block.indexOf('prisma.message.create(');
  const emitIdx = block.indexOf("{ t: 'd', c: retryText }");
  assert.ok(persistIdx !== -1 && emitIdx !== -1);
  assert.ok(persistIdx < emitIdx, 'the retry message must be persisted before it is streamed');
});

test('emitDeterministicRetry emits and persists the identical retryText value (byte-equality by construction, not by two independent computations)', () => {
  const idx = handler.indexOf('const emitDeterministicRetry = async (reasonCode, err) => {');
  const block = handler.slice(idx, handler.indexOf('};', idx));
  assert.match(block, /const retryText = getRetryMessage\(user\?\.language\);/);
  assert.match(block, /content: retryText/);
  assert.match(block, /\{ t: 'd', c: retryText \}/);
  // Only one retryText is ever computed in this function — no second/divergent copy.
  assert.equal((block.match(/getRetryMessage\(/g) || []).length, 1);
});

test('emitDeterministicRetry writes no coaching-state record — only the assistant Message', () => {
  const idx = handler.indexOf('const emitDeterministicRetry = async (reasonCode, err) => {');
  const block = handler.slice(idx, handler.indexOf('};', idx));
  assert.doesNotMatch(block, /coachingCycle|activeCoachingSelection|prescription\.create|commitCoachingTransition/i);
  assert.doesNotMatch(block, /t: 'card'/, 'no card may ever be emitted on the retry path');
  assert.match(block, /res\.end\(\)/, 'the stream must end cleanly');
});

test('the save-error retry is reserved for genuine commit failures; empty and round-capped text take the recovery/fallback path', () => {
  // Only a real commit failure still speaks the "nothing was changed" copy.
  assert.ok(handler.includes('return emitDeterministicRetry(reasonCode, commitErr);'));
  const emitCalls = handler.match(/emitDeterministicRetry\(/g) || [];
  // Definition + the commit-catch call + the persist-failure log path.
  assert.ok(emitCalls.length <= 3, `unexpected extra emitDeterministicRetry call sites: ${emitCalls.length}`);

  // Empty text is now a validation outcome fed into the shared pipeline,
  // carrying an accurate reason code for either cause.
  assert.match(handler, /const candidateText = loop\.exceededRounds \? null : sanitizeFinalText\(loop\.finalText\);/);
  assert.match(handler, /reasonCode: loop\.exceededRounds \? 'ROUND_LIMIT' : 'EMPTY_FINAL_TEXT'/);
});

test('a commit failure for a NORMAL response with no staged transition also routes through the deterministic retry — never the outer generic error handler with a different message', () => {
  const catchIdx = handler.indexOf('} catch (commitErr) {');
  const catchBlock = handler.slice(catchIdx, catchIdx + 900);
  assert.doesNotMatch(catchBlock, /throw commitErr/, 'a plain (non-transition) commit failure must not propagate to the outer catch');
  assert.match(catchBlock, /return emitDeterministicRetry\(reasonCode, commitErr\)/);
});

test('emitDeterministicRetry itself falls back to the safe generic stream error/end if the retry message cannot be persisted, without fabricating an id or recursing', () => {
  const idx = handler.indexOf('const emitDeterministicRetry = async (reasonCode, err) => {');
  const block = handler.slice(idx, handler.indexOf('\n    };', idx));
  assert.match(block, /} catch \(retryPersistErr\) \{/, 'a persistence failure for the retry message itself must be caught separately');
  const catchIdx = block.indexOf('} catch (retryPersistErr) {');
  const innerCatch = block.slice(catchIdx, block.indexOf('return res.end();', catchIdx) + 'return res.end();'.length);
  assert.match(innerCatch, /t: 'error', message: 'AI response failed\. Please try again\.'/);
  assert.match(innerCatch, /return res\.end\(\);/);
  assert.doesNotMatch(innerCatch, /t: 'd'|t: 'card'/, 'no model text or card may be emitted when the retry itself fails to persist');
  assert.doesNotMatch(innerCatch, /prisma\.message\.create/, 'no recursive retry of the write');
  // The success path only runs (and only references saved.id, never a fabricated fallback) once persistence succeeded.
  assert.doesNotMatch(block, /'retry-' \+ Date\.now\(\)/, 'must never fabricate an id and claim the retry was persisted');
  assert.match(block, /id: saved\.id/);
});

// ── Quick reply chip suppression ─────────────────────────────────────────────


test('emitDeterministicRetry never emits a quick_replies event — used by round-limit, empty-text, commit-failure, and retry-persistence-failure paths alike', () => {
  const idx = handler.indexOf('const emitDeterministicRetry = async (reasonCode, err) => {');
  const block = handler.slice(idx, handler.indexOf('\n    };', idx));
  assert.doesNotMatch(block, /quick_replies/, 'the deterministic retry path must never emit quick replies');
});

test('the deterministic safety-screen block never emits quick_replies (it returns before the buffered loop even runs)', () => {
  const screenIdx = handler.indexOf('screenSafetyText(content)');
  const safetyBlockEnd = handler.indexOf('return res.end();', screenIdx) + 'return res.end();'.length;
  const safetyBlock = handler.slice(screenIdx, safetyBlockEnd);
  assert.doesNotMatch(safetyBlock, /quick_replies/);
});

test('the dormant Quick Chat branch never references quick_replies or offer_quick_replies', () => {
  const quickIdx = handler.indexOf('if (isQuickChat)');
  const quickEnd = handler.indexOf('// ── Main coaching chat');
  const quickSlice = handler.slice(quickIdx, quickEnd);
  assert.doesNotMatch(quickSlice, /quick_replies|offer_quick_replies/);
});

// ── userMessageId threading for record_prescription_outcome (PR-13) ────────

test('the real created user Message id is captured, never invented, and threaded into commitCoachingTransition as userMessageId', () => {
  const saveIdx = handler.indexOf("role: 'user', content: content.trim()");
  assert.ok(saveIdx !== -1, 'expected the user message persistence to still exist');
  const beforeSave = handler.slice(0, saveIdx);
  assert.match(beforeSave.slice(-400), /const savedUserMessage = await prisma\.message\.create/, 'the create call\'s real return value must be captured');

  const commitIdx = handler.indexOf('committed = await commitCoachingTransition(');
  const commitCallBlock = handler.slice(commitIdx, handler.indexOf('});', commitIdx));
  assert.match(commitCallBlock, /userMessageId,/, 'commitCoachingTransition must receive the real captured id');
});

test('userMessageId is null for an invisible session-start marker (no user message is ever persisted for one)', () => {
  const idx = handler.indexOf('let userMessageId = null;');
  assert.ok(idx !== -1);
  const block = handler.slice(idx, idx + 400);
  assert.match(block, /if \(!isSessionStart\) \{/);
  assert.match(block, /userMessageId = savedUserMessage\.id;/);
});

// ── Safe retry diagnostics (production retry-loop bugfix) ─────────────────

test('logDeterministicRetry logs only safe operational fields — reasonCode, rounds, staged flag, response shape, and error name/code', () => {
  const idx = handler.indexOf('const logDeterministicRetry = (reasonCode, err, extra = {}) => {');
  assert.ok(idx !== -1, 'expected a dedicated safe-diagnostics logger');
  const block = handler.slice(idx, handler.indexOf('};', idx) + 1);
  for (const field of ['reasonCode', 'rounds: loop.rounds', 'transitionStaged: !!loop.transition', 'errorName: err?.name', 'errorCode: err?.code',
    // Content-free response shape added by the EMPTY_FINAL_TEXT hotfix.
    'responseShape: loop.responseShape', 'recoveryResponseShape: loop.recoveryResponseShape']) {
    assert.ok(block.includes(field), `expected the log payload to include "${field}"`);
  }
});

test('logDeterministicRetry never logs athlete/assistant text, card content, situation, prompt content, tool payloads, or raw records', () => {
  const idx = handler.indexOf('const logDeterministicRetry = (reasonCode, err, extra = {}) => {');
  const block = handler.slice(idx, handler.indexOf('};', idx) + 1);
  // Word-boundaried so the new safe boolean flags (finalTextRecoveryAttempted
  // / finalTextRecoverySucceeded — booleans about recovery, never text
  // itself) are not mistaken for a bare finalText/content reference.
  assert.doesNotMatch(block, /\bretryText\b|\bfinalText\b|\bcontent\b|\bcardContent\b|\bsituation\b|\bsystemPrompt\b|\bcommitted\./);
});

test('logDeterministicRetry also logs the final-text-recovery flags (production EMPTY_FINAL_TEXT bugfix)', () => {
  const idx = handler.indexOf('const logDeterministicRetry = (reasonCode, err, extra = {}) => {');
  const block = handler.slice(idx, handler.indexOf('};', idx) + 1);
  assert.ok(block.includes('finalTextRecoveryAttempted: !!loop.finalTextRecoveryAttempted'));
  assert.ok(block.includes('finalTextRecoverySucceeded: !!loop.finalTextRecoverySucceeded'));
});

test('chat.js never references the hidden final-text-recovery instruction directly — recovery is entirely internal to bufferedToolLoop.js', () => {
  assert.doesNotMatch(src, /Your tool action has already been accepted/);
  assert.doesNotMatch(src, /FINAL_TEXT_RECOVERY_INSTRUCTION/);
});

test('every deterministic-retry trigger passes a fixed reason code to the logger', () => {
  // Empty/round-capped text now reaches the logger through the fallback path.
  assert.match(handler, /reasonCode: loop\.exceededRounds \? 'ROUND_LIMIT' : 'EMPTY_FINAL_TEXT'/);
  assert.match(handler, /logDeterministicRetry\(firstCheck\.reasonCode, null, \{/);
  assert.match(handler, /const reasonCode = commitErr instanceof CoachingStateConflictError \? 'COACHING_STATE_CONFLICT' : 'COMMIT_FAILURE';/);
  assert.match(handler, /return emitDeterministicRetry\(reasonCode, commitErr\);/);
  assert.match(handler, /logDeterministicRetry\('RETRY_PERSIST_FAILURE', retryPersistErr\);/);
});

test('emitDeterministicRetry logs before attempting to persist the retry message — a log always happens even if persistence later fails', () => {
  const idx = handler.indexOf('const emitDeterministicRetry = async (reasonCode, err) => {');
  const logIdx = handler.indexOf('logDeterministicRetry(reasonCode, err);', idx);
  const persistIdx = handler.indexOf('prisma.message.create(', idx);
  assert.ok(logIdx !== -1 && persistIdx !== -1 && logIdx < persistIdx);
});

test('CoachingStateConflictError is imported from the coaching services barrel for the reason-code check', () => {
  assert.match(src, /const \{[^}]*CoachingStateConflictError[^}]*\} = require\('\.\.\/services\/coaching'\);/s);
});

// ── P2028 bounded commit-retry (confirmed production incident) ─────────────

test('a retryable commit error is defined as exactly PrismaClientKnownRequestError with code P2028 — nothing broader', () => {
  assert.match(handler, /const RETRYABLE_COMMIT_ERROR_CODE = 'P2028';/);
  assert.match(handler, /const isRetryableCommitError = \(e\) => e\?\.name === 'PrismaClientKnownRequestError' && e\?\.code === RETRYABLE_COMMIT_ERROR_CODE;/);
});

test('commitCoachingTransition is called at most twice — once normally, once more only inside the retryable branch', () => {
  const calls = [...handler.matchAll(/committed = await commitCoachingTransition\(\{/g)];
  assert.equal(calls.length, 2, 'exactly one first attempt and one retry call site — no unbounded loop');
});

test('the retry is gated on isRetryableCommitError and skipped entirely for anything else, including CoachingStateConflictError', () => {
  const guardIdx = handler.indexOf('if (!isRetryableCommitError(firstCommitErr)) {');
  assert.ok(guardIdx !== -1);
  // The non-retryable branch returns immediately — it never falls through
  // to the second commitCoachingTransition call below it.
  const guardCloseIdx = handler.indexOf('\n      }', guardIdx);
  assert.ok(guardCloseIdx !== -1);
  const guardBlock = handler.slice(guardIdx, guardCloseIdx);
  assert.match(guardBlock, /return emitDeterministicRetry\(reasonCode, firstCommitErr\);/);
});

test('a conflict raised BY THE RETRY is classified and handled exactly like a first-attempt conflict, never retried again', () => {
  const secondAttemptIdx = handler.indexOf('commitAttemptCount = 2;');
  assert.ok(secondAttemptIdx !== -1);
  const catchIdx = handler.indexOf('} catch (commitErr) {', secondAttemptIdx);
  assert.ok(catchIdx !== -1);
  const catchCloseIdx = handler.indexOf('\n      }', catchIdx);
  assert.ok(catchCloseIdx !== -1);
  const catchBlock = handler.slice(catchIdx, catchCloseIdx);
  assert.match(catchBlock, /const reasonCode = commitErr instanceof CoachingStateConflictError \? 'COACHING_STATE_CONFLICT' : 'COMMIT_FAILURE';/);
  assert.match(catchBlock, /return emitDeterministicRetry\(reasonCode, commitErr\);/);
  // No third attempt: nothing between the end of this catch block and the
  // next SSE write references commitCoachingTransition again.
  const nextWriteIdx = handler.indexOf('res.write(`data:', catchCloseIdx);
  assert.ok(nextWriteIdx !== -1);
  assert.doesNotMatch(handler.slice(catchCloseIdx, nextWriteIdx), /commitCoachingTransition\(/);
});

test('no individual write inside the transaction is ever retried — only the whole atomic commit is called again', () => {
  assert.doesNotMatch(src, /tx\.(message|coachingCycle|activeCoachingSelection|prescription)\./, 'chat.js must never reach into the transaction internals of commitCoachingTransition');
});

test('a successful retry never logs or emits the deterministic fallback — only a content-free recovery note', () => {
  const idx = handler.indexOf('if (commitRetrySucceeded) {');
  assert.ok(idx !== -1);
  const block = handler.slice(idx, handler.indexOf('\n    }', idx) + 5);
  assert.match(block, /console\.log\('\[chat\] commit_retry_recovered'/);
  assert.doesNotMatch(block, /emitDeterministicRetry/);
  assert.doesNotMatch(block, /finalText|retryText/);
});

test('logDeterministicRetry carries the commit-retry diagnostics as fixed, content-free fields read off the error object', () => {
  const idx = handler.indexOf('const logDeterministicRetry = (reasonCode, err, extra = {}) => {');
  const block = handler.slice(idx, handler.indexOf('};', idx) + 1);
  for (const field of ['commitAttemptCount: err?.commitAttemptCount', 'commitRetryAttempted: err?.commitRetryAttempted', 'commitRetrySucceeded: err?.commitRetrySucceeded', 'firstCommitErrorCode: err?.firstCommitErrorCode', 'finalCommitErrorCode: err?.finalCommitErrorCode']) {
    assert.ok(block.includes(field), `expected the log payload to include "${field}"`);
  }
});

test('both commit-failure branches enrich the thrown error with the same five diagnostic fields before emitting', () => {
  for (const field of ['commitAttemptCount', 'commitRetryAttempted', 'commitRetrySucceeded', 'firstCommitErrorCode', 'finalCommitErrorCode']) {
    const assignments = [...handler.matchAll(new RegExp(`\\.${field} = `, 'g'))];
    assert.equal(assignments.length, 2, `expected "${field}" to be assigned in both the non-retryable and retry-exhausted branches, found ${assignments.length}`);
  }
});
