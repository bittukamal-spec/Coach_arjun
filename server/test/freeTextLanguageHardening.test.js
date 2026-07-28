// Free-text Coach + sport-language hints + fallback variation.
//
// Three connected changes:
//   1. AI-generated reply chips are gone from Coach. They cost an extra model
//      round that regularly ended in EMPTY_FINAL_TEXT, and made the
//      conversation read as a form rather than a coach.
//   2. Conservative, sport-aware hints for likely transcription errors
//      ("wing bowling" → swing bowling) that never rewrite the athlete's
//      stored message and never reach the athlete.
//   3. The deterministic clarity fallback can no longer repeat itself.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const { COACHING_TOOLS } = require('../src/services/coaching/coachingTools');
const { runBufferedToolLoop, sanitizeFinalText } = require('../src/services/coaching/bufferedToolLoop');
const { validateAthleteText } = require('../src/services/coaching/validateAthleteText');
const {
  getSportLanguageHints, buildLanguageHintSection, describeHints, PROTECTED_TERMS,
} = require('../src/services/coaching/sportLanguageHints');
const {
  getClarityFallbackMessage, getSecondaryClarityFallbackMessage,
  getSimpleClarityPrompt, pickClarityFallback,
} = require('../src/services/coaching/commitCoachingTransition');
const { buildFirstMessage } = require('../src/profile/firstMessage');
const { buildRuleOutput } = require('../src/profile/ruleEngine');

const SRC = (p) => readFileSync(path.join(__dirname, '../src', p), 'utf8');
const chatSrc = SRC('routes/chat.js');
const loopSrc = SRC('services/coaching/bufferedToolLoop.js');
const toolsSrc = SRC('services/coaching/coachingTools.js');

// ── 1–3. Reply chips are gone from Coach ───────────────────────────────────

test('offer_quick_replies is no longer an available tool in Coach chat', () => {
  const names = COACHING_TOOLS.map((t) => t.name);
  assert.deepEqual(names, ['propose_barrier', 'prescribe_mental_rep', 'record_prescription_outcome']);
  assert.ok(!names.includes('offer_quick_replies'));
  assert.doesNotMatch(toolsSrc, /name: OFFER_QUICK_REPLIES/);
  assert.doesNotMatch(toolsSrc, /function validateOfferQuickReplies/);
});

test('the buffered loop no longer stages, tracks or returns quick replies', async () => {
  assert.doesNotMatch(loopSrc, /quickReplies/);
  assert.doesNotMatch(loopSrc, /buildQuickReplyPayload/);

  const stub = {
    calls: [],
    messages: {
      create: async (p) => {
        stub.calls.push(p);
        return stub.calls.length === 1
          ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'propose_barrier', input: { problemStatement: 'Rushing under pressure', barrierHypothesis: 'Fear of getting out' } }] }
          : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Does that fit what happens?' }] };
      },
    },
  };
  const loop = await runBufferedToolLoop({
    anthropic: stub, model: 'm', maxTokens: 800, system: 'SYS',
    messages: [{ role: 'user', content: 'hi' }],
    coachingContext: { hasActiveSelection: false, hasPrescription: false, barrierConfirmationStatus: null },
  });
  assert.equal('quickReplies' in loop, false, 'the loop result has no quickReplies key at all');
  assert.equal(loop.transition.type, 'propose_barrier', 'genuine coaching-state tools still work');
  assert.equal(loop.finalText, 'Does that fit what happens?');
  for (const call of stub.calls) {
    if (call.tools) assert.ok(!call.tools.some((t) => t.name === 'offer_quick_replies'));
  }
});

test('the route never emits a quick_replies SSE event and never filters chips', () => {
  assert.doesNotMatch(chatSrc, /t: 'quick_replies'/);
  assert.doesNotMatch(chatSrc, /filterQuickReplies/);
  assert.doesNotMatch(chatSrc, /buildQuickReplyPayload/);
  assert.doesNotMatch(chatSrc, /quickRepliesStaged/);
  assert.doesNotMatch(chatSrc, /buildQuickReplySection/);
});

// The tool was deleted, so any surviving prompt instruction to call it would
// ask the model for something it cannot do. Assert on the built prompt, not
// just the wiring, so a leftover instruction in any coaching state is caught.
test('no coaching-state prompt instructs the model to call the removed chip tool', () => {
  const { buildCoachingStateSection } = require('../src/routes/chat');
  const states = [
    { hasActiveSelection: false, hasPrescription: false, barrierConfirmationStatus: null },
    { hasActiveSelection: true, hasPrescription: false, barrierConfirmationStatus: 'PENDING' },
    { hasActiveSelection: true, hasPrescription: false, barrierConfirmationStatus: 'CONFIRMED' },
    { hasActiveSelection: true, hasPrescription: true, barrierConfirmationStatus: 'CONFIRMED' },
  ];
  for (const state of states) {
    const section = buildCoachingStateSection(state);
    assert.doesNotMatch(section, /offer_quick_replies/, `chip tool referenced for ${JSON.stringify(state)}`);
    assert.doesNotMatch(section, /Reply-Chip Tool section/i, 'points at a prompt section that no longer exists');
  }
});

test('the language rule no longer scopes itself to chip labels', () => {
  assert.doesNotMatch(chatSrc, /including any offer_quick_replies chip labels/);
  assert.match(chatSrc, /This rule applies to ALL text you write\./);
});

test('the removed modules are gone and nothing imports them', () => {
  assert.equal(existsSync(path.join(__dirname, '../src/services/coaching/filterQuickReplies.js')), false);
  assert.equal(existsSync(path.join(__dirname, '../../client/src/utils/quickReplyEvent.js')), false);
  const barrel = SRC('services/coaching/index.js');
  assert.doesNotMatch(barrel, /filterQuickReplies|buildQuickReplyPayload|OFFER_QUICK_REPLIES|QUICK_REPLY_LIMITS/);
});

// ── 4–6. The first personalised message ────────────────────────────────────

const RO = buildRuleOutput({
  branchId: 'mistakes', primaryPriorityId: 'after_mistake',
  answers: {
    sport: { answerIds: ['cricket'] },
    difficult_moments: { answerIds: ['after_mistake'] },
    primary_priority: { answerIds: ['after_mistake'] },
    mistakes_first_response: { answerIds: ['keep_thinking'] },
    mistakes_recovery: { answerIds: ['most_of_session'] },
  },
});

test('the first personalised message carries no [SUGGEST:] marker, in either language or any fit response', () => {
  for (const fit of ['CONFIRMED', 'PARTLY', 'NOT_REALLY']) {
    for (const language of ['en', 'hi']) {
      const msg = buildFirstMessage({ fitResponse: fit, agreedPriorityId: 'after_mistake' }, RO, { name: 'Rahul', language });
      assert.doesNotMatch(msg, /\[SUGGEST:/, `${fit}/${language} still has a marker`);
      assert.doesNotMatch(msg, /\[APP:/);
    }
  }
  // Removed at source, not hidden downstream: nothing CONSTRUCTS the tag any
  // more (the only remaining mention is the comment explaining its removal).
  assert.doesNotMatch(SRC('profile/firstMessage.js'), /\[SUGGEST: \$\{/);
  assert.doesNotMatch(SRC('profile/firstMessage.js'), /const QUICK = \{/);
});

test('the first message still does its job: greets, names the focus, and asks for a real example', () => {
  const msg = buildFirstMessage({ fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake' }, RO, { name: 'Rahul', language: 'en' });
  assert.match(msg, /Rahul/);
  assert.match(msg, /after a mistake/i);
  assert.match(msg, /what happened\?$/);
  assert.doesNotMatch(msg, /try this|practice|each day/i, 'nothing is prescribed yet');
});

test('the first message is still deterministic, so re-running it cannot produce a second variant', () => {
  const a = buildFirstMessage({ fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake' }, RO, { name: 'Rahul', language: 'en' });
  const b = buildFirstMessage({ fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake' }, RO, { name: 'Rahul', language: 'en' });
  assert.equal(a, b);
});

// ── 13–17. Sport-language hints ────────────────────────────────────────────

const hintsFor = (message, sport = 'cricket', context = '') =>
  getSportLanguageHints({ sport, message, context }).highConfidence;

test('cricket "wing bowling" in a bowling context yields a swing-bowling hint', () => {
  const h = hintsFor("I'm afraid of playing wing bowling.");
  assert.equal(h.length, 1);
  assert.equal(h[0].observed, 'wing bowling');
  assert.equal(h[0].intended, 'swing bowling');
  assert.equal(h[0].reasonCode, 'CRICKET_SWING_BOWLING_TRANSCRIPTION');
  // Variants of the same near-miss.
  assert.equal(hintsFor('I keep struggling against wing bowlers when facing them.')[0].intended, 'swing bowlers');
});

test('correctly written "swing bowling" produces no hint at all', () => {
  assert.deepEqual(hintsFor('I struggle against swing bowling.'), []);
  assert.deepEqual(hintsFor('The swing bowler troubles me every match.'), []);
});

test('specialist cricket terminology is never flagged for correction', () => {
  const messages = [
    'I edged an outswinger after trying to play late.',
    'The inswinger keeps trapping me lbw.',
    'His yorker is fast and the bouncer follows.',
    'I face seam bowling and pace bowling in the nets.',
    'The googly and the doosra both beat me outside off side.',
    'I left it well outside the crease on the leg side.',
  ];
  for (const m of messages) assert.deepEqual(hintsFor(m), [], `wrongly flagged: ${m}`);
  for (const term of ['swing bowling', 'outswinger', 'inswinger', 'seam bowling', 'yorker', 'bouncer', 'slower ball', 'googly', 'doosra', 'crease', 'edge', 'leave', 'play late', 'leg side', 'off side']) {
    assert.ok(PROTECTED_TERMS.includes(term), `${term} must be a protected term`);
  }
});

test('cricket "wing shot" with rush/get-out context yields a wrong-shot hint', () => {
  const h = hintsFor('When I play badly, I rush and play a wing shot and get out.');
  assert.equal(h.length, 1);
  assert.equal(h[0].intended, 'wrong shot');
  assert.equal(h[0].reasonCode, 'CRICKET_WRONG_SHOT_TRANSCRIPTION');
});

test('"wing shot" outside a qualifying context forces no correction', () => {
  assert.deepEqual(hintsFor('We talked about a wing shot.'), []);
  // And nothing fires for another sport.
  assert.deepEqual(hintsFor('I rush and play a wing shot and get out.', 'football'), []);
  assert.deepEqual(hintsFor("I'm afraid of playing wing bowling.", 'badminton'), []);
});

test('genuinely ambiguous wording produces no invented correction', () => {
  assert.deepEqual(hintsFor('My coach wants me to open more.'), []);
  assert.deepEqual(hintsFor('I want to go up a level.'), []);
});

test('the internal hint note is system-context only and carries no athlete identifiers', () => {
  const hints = getSportLanguageHints({ sport: 'cricket', message: 'afraid of wing bowling' });
  const section = buildLanguageHintSection(hints);
  assert.match(section, /## Language interpretation note \(internal\)/);
  assert.match(section, /may have meant "swing bowling"/);
  assert.match(section, /Do not mention the spelling correction/);
  assert.match(section, /do not quote the likely mistaken phrase back/);
  assert.equal(buildLanguageHintSection({ highConfidence: [] }), '', 'no note when there is no hint');

  // Appended to the SYSTEM prompt only — never a message, never streamed.
  assert.match(chatSrc, /\+ buildLanguageHintSection\(languageHints\);/);
  assert.doesNotMatch(chatSrc, /role: 'user', content: buildLanguageHintSection/);
});

test('the athlete\'s stored message is never rewritten by the hint layer', () => {
  const original = "I'm afraid of playing wing bowling.";
  const copy = original;
  getSportLanguageHints({ sport: 'cricket', message: original });
  assert.equal(original, copy, 'the input string is untouched');
  // The route persists req.body content, never a hint-derived rewrite.
  assert.match(chatSrc, /content: content\.trim\(\)/);
  assert.doesNotMatch(chatSrc, /content: correctedContent|content: rewritten/);
});

test('hint logging carries reason codes and a count only — never observed or intended text', () => {
  const hints = getSportLanguageHints({ sport: 'cricket', message: 'afraid of wing bowling' });
  const safe = describeHints(hints);
  assert.deepEqual(Object.keys(safe).sort(), ['hintCount', 'reasonCodes']);
  const serialised = JSON.stringify(safe);
  assert.ok(!serialised.includes('wing bowling'));
  assert.ok(!serialised.includes('swing bowling'));
  assert.ok(!serialised.includes('afraid'));
  assert.match(chatSrc, /console\.log\('\[chat\] language_hints', JSON\.stringify\(describeHints\(languageHints\)\)\)/);
});

// ── 18–21. Typo-echo validation ────────────────────────────────────────────

const ECHO_HINTS = { highConfidence: [{ observed: 'wing bowling', intended: 'swing bowling', reasonCode: 'X' }] };

test('an assistant reply that repeats the likely mistake as fact is rejected', () => {
  const r = validateAthleteText('So you are afraid of wing bowling. Tell me about the last time.', { languageHints: ECHO_HINTS });
  assert.equal(r.ok, false);
  assert.equal(r.reasonCode, 'LIKELY_TYPO_ECHO');
});

test('using the intended phrase is allowed', () => {
  assert.equal(validateAthleteText('So swing bowling makes you rush your shot.', { languageHints: ECHO_HINTS }).ok, true);
});

test('a natural paraphrase avoiding both phrases is allowed', () => {
  assert.equal(validateAthleteText('So that type of movement through the air makes you rush.', { languageHints: ECHO_HINTS }).ok, true);
});

test('a brief clarification that quotes the phrase is allowed — asking is not asserting', () => {
  assert.equal(validateAthleteText('Did you mean swing bowling?', { languageHints: ECHO_HINTS }).ok, true);
  assert.equal(validateAthleteText('When you say wing bowling, do you mean the ball moving in the air?', { languageHints: ECHO_HINTS }).ok, true);
});

test('with no hint present the same sentence is untouched — the layer only fires on a real hint', () => {
  assert.equal(validateAthleteText('So you are afraid of wing bowling.').ok, true);
});

test('the route threads hints into both the first check and the retry check', () => {
  assert.match(chatSrc, /validateAthleteText\(candidateText, \{ languageHints \}\)/);
  assert.match(chatSrc, /validateAthleteText\(retryText \|\| '', \{ languageHints \}\)/);
  // Still exactly one controlled retry in the validation path — no extra
  // model call was added by the hint layer.
  assert.equal((chatSrc.match(/const retryResponse = await anthropic\.messages\.create\(/g) || []).length, 1);
});

// ── 25–28. Repeated fallbacks ──────────────────────────────────────────────

const PHRASE = 'what happens after a mistake';

test('a repeated primary fallback selects the secondary variant', () => {
  const primary = getClarityFallbackMessage('en', PHRASE);
  const picked = pickClarityFallback('en', PHRASE, primary);
  assert.equal(picked.variant, 'secondary');
  assert.equal(picked.text, getSecondaryClarityFallbackMessage('en', PHRASE));
  assert.match(picked.text, /^Let's reset and keep this simple\./);
});

test('a repeated secondary fallback selects the final simple prompt', () => {
  const secondary = getSecondaryClarityFallbackMessage('en', PHRASE);
  const picked = pickClarityFallback('en', PHRASE, secondary);
  assert.equal(picked.variant, 'simple');
  assert.equal(picked.text, 'Take your time. Describe the moment in your own words.');
});

test('with no previous message, or an unrelated one, the primary is used', () => {
  assert.equal(pickClarityFallback('en', PHRASE, null).variant, 'primary');
  assert.equal(pickClarityFallback('en', PHRASE, 'What happens right before you commit?').variant, 'primary');
});

test('near-identical repeats are caught, not just byte-identical ones', () => {
  const primary = getClarityFallbackMessage('en', PHRASE);
  const noisy = `  ${primary.toUpperCase().replace(/\./g, '')}  `;
  assert.equal(pickClarityFallback('en', PHRASE, noisy).variant, 'secondary');
});

test('no fallback variant ever asks the athlete to resend a message', () => {
  const all = [
    getClarityFallbackMessage('en', PHRASE), getClarityFallbackMessage('en', null),
    getSecondaryClarityFallbackMessage('en', PHRASE), getSecondaryClarityFallbackMessage('en', null),
    getSimpleClarityPrompt('en'),
    getClarityFallbackMessage('hi', 'दबाव बढ़ने पर क्या होता है'), getClarityFallbackMessage('hi', null),
    getSecondaryClarityFallbackMessage('hi', 'दबाव बढ़ने पर क्या होता है'), getSecondaryClarityFallbackMessage('hi', null),
    getSimpleClarityPrompt('hi'),
  ];
  for (const text of all) {
    assert.ok(!/send.*again|resend|dobara bhej|Nothing was changed/i.test(text), `asks for a resend: ${text}`);
    assert.equal(validateAthleteText(text).ok, true, `a fallback must itself be valid: ${text}`);
  }
});

test('both English and Hindi variants exist for every step of the ladder', () => {
  assert.equal(getSecondaryClarityFallbackMessage('hi', 'दबाव बढ़ने पर क्या होता है'),
    'चलिए इसे सरल तरीके से फिर से देखते हैं। दबाव बढ़ने पर क्या होता है के ठीक पहले क्या हुआ था, जब आपका ध्यान टूटा या आप जल्दबाज़ी करने लगे?');
  assert.equal(getSecondaryClarityFallbackMessage('hi', null),
    'चलिए इसे सरल तरीके से फिर से देखते हैं। मुश्किल होने से ठीक पहले क्या हुआ था?');
  assert.equal(getSimpleClarityPrompt('hi'), 'आराम से सोचो। उस पल को अपने शब्दों में बताओ।');
  for (const t of [getSecondaryClarityFallbackMessage('hi', null), getSimpleClarityPrompt('hi')]) {
    assert.match(t, /[ऀ-ॿ]/, 'Hindi variants must be in Devanagari');
  }
});

test('the route picks the variant from the most recent visible assistant message', () => {
  assert.match(chatSrc, /const lastAssistantText = \[\.\.\.conversationHistory\]\.reverse\(\)/);
  assert.match(chatSrc, /const picked = pickClarityFallback\(user\?\.language, situationPhrase, lastAssistantText\);/);
  assert.match(chatSrc, /fallbackVariant: picked\.variant/);
});

// ── 24, 29–30. Prompt rule and untouched behaviour ─────────────────────────

test('the contextual language rule appears exactly once', () => {
  const matches = chatSrc.match(/Athletes may use spelling mistakes, voice-transcription errors/g) || [];
  assert.equal(matches.length, 1);
  assert.match(chatSrc, /silently use the corrected meaning/i);
  assert.match(chatSrc, /Ask one brief clarification only when multiple plausible meanings would materially change/);
  assert.match(chatSrc, /never "correct" real sport terminology you recognise/);
});

test('exact-quoting stays scoped to saved artifacts that genuinely need it', () => {
  assert.match(chatSrc, /Quote THESE SAVED CARD WORDS exactly/);
  assert.match(chatSrc, /This exact-quoting rule applies only to the saved card text above/);
  assert.match(chatSrc, /must include that exact lessonText verbatim/);
});

test('safety, consent and the deterministic follow-up path are untouched', () => {
  assert.match(chatSrc, /Stop playing immediately/);
  assert.match(chatSrc, /9152987821/);
  assert.match(chatSrc, /router\.post\('\/message', authenticate, aiLimiter, requireGuardianConsent, checkFr/);
  assert.match(chatSrc, /const emitDeterministicRetry = async \(reasonCode, err\) => \{/);
  // The deterministic prescription-outcome follow-up lives in its own service
  // and its own route — untouched by the chip removal, and still emitting the
  // structured outcome choices the client renders as buttons.
  const followUp = SRC('services/coaching/claimPrescriptionFollowUp.js');
  assert.match(followUp, /outcomePending: true, outcomeChoices: buildOutcomeChoices\(language\)/);
  assert.match(SRC('routes/prescriptions.js'), /claimPrescriptionFollowUp/);
});

test('internal-orchestration rejection and EMPTY_FINAL_TEXT recovery still hold', () => {
  assert.equal(validateAthleteText('Your tool action has already been accepted. Produce the final response text now.').ok, false);
  assert.equal(sanitizeFinalText('   '), null);
  assert.match(chatSrc, /reasonCode: loop\.exceededRounds \? 'ROUND_LIMIT' : 'EMPTY_FINAL_TEXT'/);
  assert.match(chatSrc, /const recoveryAlreadySpent = !!loop\.finalTextRecoveryAttempted;/);
});
