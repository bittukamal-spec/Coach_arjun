// Source-text verification for Pilot Tracking Phase 2A across every route
// this feature touches (or must NOT touch). Complements the genuine
// end-to-end HTTP tests in activityTrackingMindJournalWiring.test.js and
// activityTracking.test.js.
//
// Many of the routes below use a module-level `const prisma = new
// PrismaClient()` (not the injectable-client factory pattern), so a real
// request-cycle test would require a live database this repo's test suite
// deliberately never uses. Source-text assertions are this repo's own
// established fallback for exactly this situation (see e.g.
// completeActivePrescription.test.js's "never constructs an Anthropic
// client" check, and founder-dashboard's whole test suite) — each
// assertion below anchors to the specific code structure (import present,
// call present at the correct point relative to the real write, absent
// from excluded branches/routes) so a real regression breaks it.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const routesDir = path.join(__dirname, '../src/routes');
const servicesDir = path.join(__dirname, '../src/services');
const read = (dir, f) => readFileSync(path.join(dir, f), 'utf8');
const readRoute = (f) => read(routesDir, f);

// ── The service itself is imported correctly everywhere it's used ───────

const WIRED_ROUTES = [
  'chat.js', 'onboarding.js', 'profile.js', 'mentalRep.js', 'mindJournal.js',
  'selfTalk.js', 'bodyReset.js', 'debrief.js', 'ritual.js', 'skills.js', 'games.js',
];

test('every wired route imports the activityTracking module by reference (not a destructure) so it stays mockable', () => {
  for (const f of WIRED_ROUTES) {
    const src = readRoute(f);
    assert.match(src, /const activityTracking = require\(['"]\.\.\/services\/activityTracking['"]\)/, `${f} must import activityTracking by module reference`);
    assert.doesNotMatch(src, /const\s*\{\s*touchActivity\s*\}\s*=\s*require\(['"]\.\.\/services\/activityTracking['"]\)/, `${f} must not destructure touchActivity (breaks mockability)`);
  }
});

// ── A. Coach ─────────────────────────────────────────────────────────────

test('chat.js touches activity right after the real athlete user-message create, inside the same guarded branch', () => {
  const src = readRoute('chat.js');
  const createIdx = src.indexOf("prisma.message.create({\n        data: { userId: req.userId, role: 'user'");
  const touchIdx = src.indexOf('activityTracking.touchActivity(req.userId)');
  assert.ok(createIdx !== -1, 'expected the real user-message create call');
  assert.ok(touchIdx > createIdx, 'touchActivity must come after the message create succeeds');
  assert.ok(touchIdx - createIdx < 700, 'touchActivity should be close to the create, not far downstream in an unrelated branch');
});

test('chat.js /wizard touches activity only after the visualization XP award (the confirmed-success point), not before generation', () => {
  const src = readRoute('chat.js');
  const xpIdx = src.indexOf("data: { xp: { increment: VIZ_XP } }");
  const touchIdx = src.indexOf('activityTracking.touchActivity(req.userId)', xpIdx);
  assert.ok(xpIdx !== -1 && touchIdx !== -1 && touchIdx > xpIdx);
});

// ── B. Onboarding ────────────────────────────────────────────────────────

test('onboarding.js touches activity after a successful PATCH /session save and after completion', () => {
  const src = readRoute('onboarding.js');
  const patchCalls = (src.match(/activityTracking\.touchActivity\(/g) || []).length;
  assert.equal(patchCalls, 2, 'expected exactly two touch points: PATCH /session and POST /session/complete');
});

// ── D. Prescribed Mental Rep — outcome piggybacks on Coach, no separate hook ─

test('the outcome-commit path (chat.js) does not add its own separate touchActivity call beyond the message-save one', () => {
  const src = readRoute('chat.js');
  const touches = (src.match(/activityTracking\.touchActivity\(/g) || []).length;
  // Exactly two total in chat.js: the user-message save, and the
  // visualization-wizard completion. commitCoachingTransition (outcome
  // reporting) runs inside the same /message request as the first.
  assert.equal(touches, 2);
});

test('prescriptions.js claim-opener route is never wired to activityTracking — it is an automatic system trigger, not a deliberate athlete action', () => {
  const src = readRoute('prescriptions.js');
  assert.doesNotMatch(src, /activityTracking/, 'prescriptions.js route file must not reference activityTracking at all — completion touches lastActiveAt inside completeActivePrescription.js itself');
});

test('completeActivePrescription.js touches lastActiveAt directly via tx.user.update inside its own transaction, only on a genuine (non-replay) completion', () => {
  const src = read(path.join(servicesDir, 'coaching'), 'completeActivePrescription.js');
  assert.match(src, /if \(claim\.count > 0\) \{\s*\n\s*await tx\.user\.update/);
});

// ── E. Daily Mental Rep ──────────────────────────────────────────────────

test('mentalRep.js touches activity after the ToolReport create, and never references the coaching-cycle Prescription model', () => {
  const src = readRoute('mentalRep.js');
  assert.match(src, /activityTracking\.touchActivity\(req\.userId\)/);
  assert.doesNotMatch(src, /prescription/i, 'the generic Mental Rep route must stay independent of the Prescription funnel');
});

// ── F. Mind Journal — entry create only, never context/delete ───────────

test('mindJournal.js touches activity only in the POST / handler, never in PATCH /context or DELETE /:id', () => {
  const src = readRoute('mindJournal.js');
  const touches = (src.match(/activityTracking\.touchActivity\(/g) || []).length;
  assert.equal(touches, 1, 'expected exactly one touch point (entry creation)');

  const postIdx = src.indexOf("router.post('/', authenticate");
  const patchIdx = src.indexOf("router.patch('/context'");
  const deleteIdx = src.indexOf("router.delete('/:id'");
  const touchIdx = src.indexOf('activityTracking.touchActivity(');
  assert.ok(touchIdx > postIdx && touchIdx < patchIdx, 'the touch must be inside the POST / handler, before PATCH /context begins');
  assert.ok(deleteIdx > patchIdx);
});

// ── G. Focus Card — save, edit, practice; never generate or delete ──────

test('selfTalk.js touches activity on save, edit, and practice — never on /generate (a draft, not yet saved) or DELETE', () => {
  const src = readRoute('selfTalk.js');
  const touches = (src.match(/activityTracking\.touchActivity\(/g) || []).length;
  assert.equal(touches, 3, 'expected exactly three touch points: save, PATCH edit, practice');

  const generateIdx = src.indexOf("router.post('/generate'");
  const saveIdx = src.indexOf("router.post('/save'");
  const firstTouchIdx = src.indexOf('activityTracking.touchActivity(');
  assert.ok(generateIdx < saveIdx, 'sanity: /generate is declared before /save');
  assert.ok(firstTouchIdx > saveIdx, 'no touch point exists before /save (i.e. none inside /generate)');

  const deleteIdx = src.indexOf("router.delete('/cards/:id'");
  const practiceIdx = src.indexOf("router.post('/cards/:id/practice'");
  const lastTouchIdx = src.lastIndexOf('activityTracking.touchActivity(');
  assert.ok(deleteIdx < practiceIdx, 'sanity: DELETE is declared before /practice');
  assert.ok(lastTouchIdx > practiceIdx, 'the last touch point is inside /practice, none inside DELETE');
});

// ── H. Body Reset ────────────────────────────────────────────────────────

test('bodyReset.js touches activity after a successful session save, never in arjun-note (no persisted record) or DELETE', () => {
  const src = readRoute('bodyReset.js');
  const touches = (src.match(/activityTracking\.touchActivity\(/g) || []).length;
  assert.equal(touches, 1);
  const saveIdx = src.indexOf("router.post('/save'");
  const deleteIdx = src.indexOf("router.delete('/:id'");
  const touchIdx = src.indexOf('activityTracking.touchActivity(');
  assert.ok(touchIdx > saveIdx && touchIdx < deleteIdx);
});

// ── I. Debrief ───────────────────────────────────────────────────────────

test('debrief.js touches activity on both the legacy and structured save branches — the debrief always persists regardless of the safety flag', () => {
  const src = readRoute('debrief.js');
  const touches = (src.match(/activityTracking\.touchActivity\(/g) || []).length;
  assert.equal(touches, 2);
});

// ── J. Ritual ────────────────────────────────────────────────────────────

test('ritual.js touches activity after the ritual save succeeds', () => {
  const src = readRoute('ritual.js');
  assert.match(src, /activityTracking\.touchActivity\(req\.userId\)/);
});

// ── K. Skill practice — learn always; quick-check only on a genuine pass ─

test('skills.js touches activity on /learn unconditionally, and on /quick-check only inside the passed===true branch', () => {
  const src = readRoute('skills.js');
  const touches = (src.match(/activityTracking\.touchActivity\(/g) || []).length;
  assert.equal(touches, 2);

  const passedBlockIdx = src.indexOf("if (passed === true) {");
  const secondTouchIdx = src.lastIndexOf('activityTracking.touchActivity(');
  assert.ok(secondTouchIdx > passedBlockIdx, 'the quick-check touch must be inside the passed===true block');
});

// ── L. Games — real session only, never the bookkeeping-only /xp path ───

test('games.js touches activity only in POST /session, never in POST /xp', () => {
  const src = readRoute('games.js');
  const touches = (src.match(/activityTracking\.touchActivity\(/g) || []).length;
  assert.equal(touches, 1, 'expected exactly one touch point (POST /session)');

  const xpIdx = src.indexOf("router.post('/xp'");
  const sessionIdx = src.indexOf("router.post('/session'");
  const touchIdx = src.indexOf('activityTracking.touchActivity(');
  assert.ok(xpIdx < sessionIdx, 'sanity: /xp is declared before /session');
  assert.ok(touchIdx > sessionIdx, 'the only touch point is inside /session, none inside /xp');
});

// ── C. Profile / current performance profile actions ─────────────────────

test('profile.js touches activity on Starting Profile confirm and on current-focus change only when actually saved', () => {
  const src = readRoute('profile.js');
  const touches = (src.match(/activityTracking\.touchActivity\(/g) || []).length;
  assert.equal(touches, 2);

  const notSavedIdx = src.indexOf('if (!result.saved) {');
  const secondTouchIdx = src.lastIndexOf('activityTracking.touchActivity(');
  assert.ok(secondTouchIdx > notSavedIdx, 'the current-focus touch must come after the not-saved early return, i.e. only on the saved path');
});

// ── Section 5: explicit exclusions — none of these files ever reference activityTracking ─

const NEVER_WIRED_ROUTES = [
  'auth.js',            // login, JWT, settings, guardian consent, account deletion
  'payments.js',        // create-subscription, cancel, webhook
  'streaks.js',         // freeze
  'weeklyReports.js',   // GET-only lazy generation
  'userData.js',        // selective data deletion
  'contact.js',          // public contact form
  'plan.js',             // hidden/legacy Starter Plan generate/session routes
  'founder.js', 'founderAuth.js', 'founderSafetyEvents.js', 'founderPilotOverview.js',
];

test('routes explicitly excluded by the frozen tracking principle never reference activityTracking', () => {
  for (const f of NEVER_WIRED_ROUTES) {
    const src = readRoute(f);
    assert.doesNotMatch(src, /activityTracking/, `${f} must never reference activityTracking`);
  }
});

test('games.js /xp is explicitly documented as excluded (bookkeeping-only XP path)', () => {
  const src = readRoute('games.js');
  const idx = src.indexOf("router.post('/xp'");
  const commentBlock = src.slice(Math.max(0, idx - 500), idx);
  assert.match(commentBlock, /bookkeeping/i);
});
