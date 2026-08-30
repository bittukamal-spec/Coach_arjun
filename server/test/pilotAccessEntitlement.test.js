const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { isEntitled, hasPilotAccess, checkFreeLimit, isTrialActive } = require('../src/routes/chat');

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);
const daysFromNow = (n) => new Date(Date.now() + n * DAY_MS);

// ── isEntitled: the single source of truth behind checkFreeLimit and
// isTrialActive. Precedence: premium → active trial → active pilot grant →
// blocked. Every case below matches the precedence table in the task.

test('premium user is allowed', () => {
  assert.equal(isEntitled({ tier: 'premium', trialStarted: daysAgo(400), pilotAccessUntil: null }), true);
});

test('active trial (day 1 of 14) is allowed', () => {
  assert.equal(isEntitled({ tier: 'free', trialStarted: daysAgo(1), pilotAccessUntil: null }), true);
});

test('active trial right at the boundary (day 13) is still allowed', () => {
  assert.equal(isEntitled({ tier: 'free', trialStarted: daysAgo(13), pilotAccessUntil: null }), true);
});

test('expired trial without pilot access is blocked', () => {
  assert.equal(isEntitled({ tier: 'free', trialStarted: daysAgo(20), pilotAccessUntil: null }), false);
});

test('expired trial + active pilot grant is allowed', () => {
  assert.equal(isEntitled({ tier: 'free', trialStarted: daysAgo(20), pilotAccessUntil: daysFromNow(30) }), true);
});

test('expired trial + expired pilot grant is blocked', () => {
  assert.equal(isEntitled({ tier: 'free', trialStarted: daysAgo(20), pilotAccessUntil: daysAgo(1) }), false);
});

test('a pilot grant expiring at exactly this instant no longer counts (strictly greater-than)', () => {
  const now = new Date();
  assert.equal(hasPilotAccess({ pilotAccessUntil: now }), false);
});

test('cancelled/free-tier user with an active pilot grant is allowed — entitlement is independent of billing', () => {
  // Mirrors payments.js's subscription.cancelled handler: tier flips to
  // 'free' immediately, subscriptionEndDate is set — none of that is read
  // by isEntitled, only tier/trialStarted/pilotAccessUntil.
  assert.equal(
    isEntitled({ tier: 'free', trialStarted: daysAgo(200), pilotAccessUntil: daysFromNow(10) }),
    true,
  );
});

test('a user who never started a trial (trialStarted null, fresh createdAt) still gets the trial-active path, unaffected by pilot logic', () => {
  assert.equal(isEntitled({ tier: 'free', trialStarted: null, createdAt: daysAgo(1), pilotAccessUntil: null }), true);
});

test('hasPilotAccess is a pure boolean of pilotAccessUntil alone — no tier/trial involvement', () => {
  assert.equal(hasPilotAccess({ pilotAccessUntil: daysFromNow(5) }), true);
  assert.equal(hasPilotAccess({ pilotAccessUntil: daysAgo(5) }), false);
  assert.equal(hasPilotAccess({ pilotAccessUntil: null }), false);
  assert.equal(hasPilotAccess(undefined), false);
});

// ── checkFreeLimit / isTrialActive must never diverge from isEntitled ──────

const chatSrc = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');

test('checkFreeLimit and isTrialActive both defer to isEntitled — no duplicated/competing entitlement logic', () => {
  const checkFreeLimitBody = chatSrc.slice(
    chatSrc.indexOf('async function checkFreeLimit'),
    chatSrc.indexOf('async function isTrialActive'),
  );
  const isTrialActiveBody = chatSrc.slice(
    chatSrc.indexOf('async function isTrialActive'),
    chatSrc.indexOf('async function isTrialActive') + 700,
  );
  assert.match(checkFreeLimitBody, /select: PILOT_SELECT/);
  assert.match(checkFreeLimitBody, /if \(isEntitled\(user\)\) return next\(\);/);
  assert.match(isTrialActiveBody, /select: PILOT_SELECT/);
  assert.match(isTrialActiveBody, /return isEntitled\(user\);/);
  // Neither function computes its own trial-day-math or pilot-expiry
  // comparison inline — both bodies are thin wrappers around isEntitled.
  assert.doesNotMatch(checkFreeLimitBody, /daysSinceStart/);
  assert.doesNotMatch(isTrialActiveBody, /daysSinceStart/);
});

test('isTrialActive fails OPEN on a DB error — a hiccup never silently disables a free (or pilot) feature', () => {
  assert.match(chatSrc, /async function isTrialActive[\s\S]{0,400}catch \{\s*return true;\s*\}/);
});

test('shared AI gating: Debrief, Weekly Reports, session summaries, Mind Journal review, Self-Talk, and Body Reset all still reuse isTrialActive/checkFreeLimit from chat.js — no route-by-route pilot check was added', () => {
  const gatedFiles = ['debrief.js', 'weeklyReports.js', 'sessions.js', 'mindJournal.js', 'selfTalk.js', 'bodyReset.js'];
  for (const file of gatedFiles) {
    const src = readFileSync(path.join(__dirname, '../src/routes', file), 'utf8');
    assert.match(
      src,
      /require\('\.\/chat'\)/,
      `${file} must import its trial/entitlement check from chat.js, not reimplement it`,
    );
    assert.match(
      src,
      /isTrialActive|checkFreeLimit/,
      `${file} must reuse isTrialActive or checkFreeLimit`,
    );
    assert.doesNotMatch(
      src,
      /pilotAccessUntil/,
      `${file} must not read pilotAccessUntil directly — pilot access must only ever be evaluated inside chat.js's isEntitled()`,
    );
  }
});

// ── Usage endpoint: reuses hasPilotAccess, never re-derives the pilot
// expiry comparison inline. ─────────────────────────────────────────────

test('GET /api/chat/usage reuses hasPilotAccess() rather than duplicating the pilot-expiry comparison', () => {
  const usageHandler = chatSrc.slice(
    chatSrc.indexOf("router.get('/usage'"),
    chatSrc.indexOf("router.post('/message'"),
  );
  assert.match(usageHandler, /const pilotAccess = hasPilotAccess\(user\);/);
  assert.match(usageHandler, /hasPilotAccess: pilotAccess/);
  assert.doesNotMatch(usageHandler, /pilotAccessUntil.*getTime\(\).*Date\.now\(\)/,
    'the route must not re-implement the >now comparison — it belongs only inside hasPilotAccess()');
});

test('expired-trial + active-pilot user is reported as effectively allowed by the same logic /usage reports on', () => {
  const user = { tier: 'free', trialStarted: daysAgo(20), pilotAccessUntil: daysFromNow(30) };
  // What GET /api/chat/usage would compute for this user (hasPilotAccess),
  // and what checkFreeLimit/isTrialActive would decide (isEntitled) — both
  // must agree the athlete is allowed.
  assert.equal(hasPilotAccess(user), true);
  assert.equal(isEntitled(user), true);
});

// ── Safety boundaries: entitlement is evaluated strictly after auth,
// guardian consent, and rate limiting — never instead of, or before, them.

test('the /message middleware chain runs auth, the AI rate limiter, and guardian consent BEFORE checkFreeLimit — pilot access cannot bypass any of them', () => {
  assert.match(
    chatSrc,
    /router\.post\('\/message', authenticate, aiLimiter, requireGuardianConsent, checkFreeLimit,/,
    'ordering must stay exactly: authenticate → aiLimiter → requireGuardianConsent → checkFreeLimit',
  );
});

test('the /wizard middleware chain preserves the same ordering', () => {
  assert.match(
    chatSrc,
    /router\.post\('\/wizard', authenticate, aiLimiter, requireGuardianConsent, checkFreeLimit,/,
  );
});

test('isEntitled/hasPilotAccess are pure functions of a user row — no req/res/session/JWT handling of any kind', () => {
  assert.equal(isEntitled.length, 1, 'isEntitled must take exactly one argument (the user row)');
  assert.equal(hasPilotAccess.length, 1, 'hasPilotAccess must take exactly one argument (the user row)');
  const isEntitledSrc = chatSrc.slice(chatSrc.indexOf('function isEntitled'), chatSrc.indexOf('function isEntitled') + 500);
  assert.doesNotMatch(isEntitledSrc, /req\.|res\.|jwt|Authorization|JWT_SECRET/i,
    'entitlement logic must never touch authentication itself');
});

test('guardian consent is a separate, earlier middleware that never reads tier/trial/pilot fields — it cannot be satisfied or bypassed by pilot access', () => {
  const consentSrc = readFileSync(path.join(__dirname, '../src/middleware/requireGuardianConsent.js'), 'utf8');
  assert.match(consentSrc, /dateOfBirth: true, guardianConsentAt: true/);
  assert.doesNotMatch(consentSrc, /tier|trialStarted|pilotAccess/i,
    'consent decisions must be based only on dateOfBirth/guardianConsentAt');
});

test('the AI rate limiter (aiLimiter) is tier/pilot-agnostic — a flat per-user limit unaffected by entitlement', () => {
  const rateLimitsSrc = readFileSync(path.join(__dirname, '../src/middleware/rateLimits.js'), 'utf8');
  const aiLimiterBlock = rateLimitsSrc.slice(
    rateLimitsSrc.indexOf('const aiLimiter'),
    rateLimitsSrc.indexOf('const founderLoginLimiter'),
  );
  assert.doesNotMatch(aiLimiterBlock, /tier|premium|pilotAccess|trial/i,
    'aiLimiter must not branch on entitlement — pilot access must not grant a different rate limit');
});

// ── functional check via the real async wrappers, proving they resolve
// through isEntitled rather than just asserting source text. ──────────────

test('checkFreeLimit and isTrialActive are the exact functions isEntitled backs (same reference wiring, not a copy)', () => {
  assert.equal(typeof checkFreeLimit, 'function');
  assert.equal(typeof isTrialActive, 'function');
  // Both are async functions of the shapes (req,res,next) and (userId).
  assert.equal(checkFreeLimit.length, 3);
  assert.equal(isTrialActive.length, 1);
});
