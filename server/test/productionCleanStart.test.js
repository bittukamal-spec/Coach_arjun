// Focused tests for the one-time production clean-start wipe script
// (server/scripts/productionCleanStart.js). Prisma and Razorpay are always
// mocked — these tests never connect to any real database or Razorpay
// account, and never write to disk outside a captured console.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const script = require('../scripts/productionCleanStart');
const {
  REQUIRED_CONFIRMATION,
  REQUIRED_ENV_FLAG,
  USER_OWNED_DELETE_ORDER,
  PRESERVED_MODELS,
  parseArgs,
  checkGuards,
  safeTargetDescriptor,
  printTargetDescriptor,
  printReport,
  getGuardianSummary,
  findPotentiallyBilledUsers,
  razorpayPreflight,
  performWipe,
  verifyPostWipe,
  buildAuditSummary,
  runDryRunReport,
  runExecuteFlow,
} = script;

// ── Fakes ────────────────────────────────────────────────────────────────

function makeModelFake({ countValue = 0, deleteManyValue = 0, throwOnDelete = false } = {}) {
  return {
    count: async () => countValue,
    deleteMany: async () => {
      if (throwOnDelete) throw new Error(`deleteMany must never be called on this model`);
      return { count: deleteManyValue };
    },
  };
}

function makeFakePrisma({
  userCountValue = 0,
  modelCounts = {},
  billedUsers = [],
  groupByResult = [{ tier: 'free', _count: { _all: 0 } }],
  deleteManyCounts = {},
  processedWebhookEventThrowsOnDelete = true,
  captureCalls = null,
} = {}) {
  const prisma = {
    user: {
      count: async (args) => {
        if (captureCalls) captureCalls.push({ model: 'user', method: 'count', args });
        return userCountValue;
      },
      findMany: async (args) => {
        if (captureCalls) captureCalls.push({ model: 'user', method: 'findMany', args });
        return billedUsers;
      },
      groupBy: async () => groupByResult,
      deleteMany: async () => ({ count: deleteManyCounts.user ?? userCountValue }),
    },
  };
  for (const model of USER_OWNED_DELETE_ORDER) {
    prisma[model] = makeModelFake({
      countValue: modelCounts[model] ?? 0,
      deleteManyValue: deleteManyCounts[model] ?? 0,
    });
  }
  for (const model of PRESERVED_MODELS) {
    prisma[model] = makeModelFake({
      countValue: modelCounts[model] ?? 0,
      throwOnDelete: processedWebhookEventThrowsOnDelete,
    });
  }
  let transactionCalled = false;
  prisma.$transaction = async (fn) => {
    transactionCalled = true;
    return fn(prisma);
  };
  Object.defineProperty(prisma, '_transactionCalled', { get: () => transactionCalled });
  return prisma;
}

function makeFakeRazorpaySuccess() {
  return {
    subscriptions: {
      cancel: async () => ({ status: 'cancelled' }),
      fetch: async () => ({ status: 'cancelled' }),
    },
  };
}

function makeFakeRazorpayFailure() {
  return {
    subscriptions: {
      cancel: async () => { throw new Error('network blip'); },
      fetch: async () => ({ status: 'active' }), // never reaches a terminal status
    },
  };
}

function captureConsole(fn) {
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => logs.push(args.join(' '));
  try {
    return { result: fn(), logs };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

// ── 1. Default mode is dry-run ──────────────────────────────────────────

test('parseArgs with no flags defaults to dry-run (execute: false)', () => {
  const args = parseArgs([]);
  assert.equal(args.execute, false);
  assert.equal(args.confirm, null);
  assert.equal(args.backupConfirmed, false);
});

// ── 2. Dry-run performs zero writes ─────────────────────────────────────

test('the dry-run report path never calls any mutating Prisma method', async () => {
  const prisma = makeFakePrisma({ userCountValue: 3 });
  // Remove every mutating method so any accidental write throws immediately.
  prisma.user.deleteMany = async () => { throw new Error('must not be called in dry-run'); };
  prisma.$transaction = async () => { throw new Error('must not be called in dry-run'); };
  for (const model of USER_OWNED_DELETE_ORDER) {
    prisma[model].deleteMany = async () => { throw new Error(`must not be called in dry-run: ${model}`); };
  }

  const report = await runDryRunReport(prisma);
  assert.equal(report.before.user, 3);
  assert.ok(report.guardianSummary);
  assert.ok(report.subscriptionSummary);
});

// ── 3-6. Guard combinations ─────────────────────────────────────────────

test('--execute alone (no confirm, no env flag, no backup) refuses', () => {
  const check = checkGuards({ execute: true, confirm: null, backupConfirmed: false }, {});
  assert.equal(check.ok, false);
  // execute is satisfied; the other three guards (confirm, env flag,
  // backup) are all still missing.
  assert.equal(check.problems.length, 3);
});

test('every guard missing at once reports one problem per guard', () => {
  const check = checkGuards({ execute: false, confirm: null, backupConfirmed: false }, {});
  assert.equal(check.ok, false);
  assert.equal(check.problems.length, 4);
});

test('missing --confirm refuses even with every other guard present', () => {
  const check = checkGuards(
    { execute: true, confirm: null, backupConfirmed: true },
    { [REQUIRED_ENV_FLAG]: 'true' },
  );
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => p.includes('--confirm=')));
});

test('a wrong --confirm value refuses', () => {
  const check = checkGuards(
    { execute: true, confirm: 'DELETE_EVERYTHING_PLEASE', backupConfirmed: true },
    { [REQUIRED_ENV_FLAG]: 'true' },
  );
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => p.includes('--confirm=')));
});

test('missing ALLOW_PRODUCTION_CLEAN_START refuses even with correct flags', () => {
  const check = checkGuards(
    { execute: true, confirm: REQUIRED_CONFIRMATION, backupConfirmed: true },
    {},
  );
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => p.includes(REQUIRED_ENV_FLAG)));
});

test('missing --backup-confirmed refuses even with correct flags and env', () => {
  const check = checkGuards(
    { execute: true, confirm: REQUIRED_CONFIRMATION, backupConfirmed: false },
    { [REQUIRED_ENV_FLAG]: 'true' },
  );
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => p.includes('--backup-confirmed')));
});

test('all four guards present together pass', () => {
  const check = checkGuards(
    { execute: true, confirm: REQUIRED_CONFIRMATION, backupConfirmed: true },
    { [REQUIRED_ENV_FLAG]: 'true' },
  );
  assert.equal(check.ok, true);
  assert.deepEqual(check.problems, []);
});

// ── 8. ProcessedWebhookEvent is never deleted ───────────────────────────

test('processedWebhookEvent is excluded from the delete order and listed as preserved', () => {
  assert.ok(!USER_OWNED_DELETE_ORDER.includes('processedWebhookEvent'));
  assert.ok(PRESERVED_MODELS.includes('processedWebhookEvent'));
});

test('performWipe never invokes deleteMany on processedWebhookEvent (throws if it tried)', async () => {
  const prisma = makeFakePrisma({ processedWebhookEventThrowsOnDelete: true });
  const deleted = await performWipe(prisma); // would throw if processedWebhookEvent.deleteMany were ever called
  assert.equal(typeof deleted.user, 'number');
});

// ── 9. SafetyEvent is in the approved delete scope ──────────────────────

test('safetyEvent is included in the user-owned delete order', () => {
  assert.ok(USER_OWNED_DELETE_ORDER.includes('safetyEvent'));
});

// ── 10. Guardian user data is included ──────────────────────────────────

test('getGuardianSummary queries guardianEmail and guardianConsentAt not-null counts', async () => {
  const calls = [];
  const prisma = { user: { count: async (args) => { calls.push(args); return 0; } } };
  await getGuardianSummary(prisma);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { where: { guardianEmail: { not: null } } });
  assert.deepEqual(calls[1], { where: { guardianConsentAt: { not: null } } });
});

test('guardian data lives only on User, which is fully removed by the wipe', async () => {
  const prisma = makeFakePrisma({ userCountValue: 5, deleteManyCounts: { user: 5 } });
  const deleted = await performWipe(prisma);
  assert.equal(deleted.user, 5);
});

// ── 11. Every user-owned model from the schema is included ─────────────

test('USER_OWNED_DELETE_ORDER matches every user-owned model in schema.prisma exactly', () => {
  const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Every top-level model block, by name.
  const modelBlocks = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)\n\}/gm)]
    .map((m) => ({ name: m[1], body: m[2] }));
  assert.ok(modelBlocks.length > 0, 'schema parsing produced no models — regex is broken');

  // A model is "user-owned" if it has a direct `user User @relation(...)`
  // field, OR (for the three composite/no-direct-FK cases) is known to
  // cascade transitively from one that does.
  const TRANSITIVE_ONLY = new Set(['PlanSession', 'ActiveOnboardingSession', 'StartingProfileWording']);
  const NOT_USER_OWNED = new Set(['User', 'ProcessedWebhookEvent']);

  const expectedUserOwned = modelBlocks
    .filter((m) => !NOT_USER_OWNED.has(m.name))
    .filter((m) => /user\s+User\s+@relation/.test(m.body) || TRANSITIVE_ONLY.has(m.name))
    .map((m) => m.name);

  // camelCase delegate name, matching Prisma's own convention.
  const toDelegateName = (modelName) => modelName[0].toLowerCase() + modelName.slice(1);
  const expectedDelegates = expectedUserOwned.map(toDelegateName).sort();
  const actualDelegates = [...USER_OWNED_DELETE_ORDER].sort();

  assert.deepEqual(
    actualDelegates,
    expectedDelegates,
    'USER_OWNED_DELETE_ORDER has drifted from the schema — a model was added/removed without updating this script',
  );
});

test('ActiveCoachingSelection is deleted before CoachingCycle and Prescription (Restrict relations)', () => {
  const idxSelection = USER_OWNED_DELETE_ORDER.indexOf('activeCoachingSelection');
  const idxCycle = USER_OWNED_DELETE_ORDER.indexOf('coachingCycle');
  const idxPrescription = USER_OWNED_DELETE_ORDER.indexOf('prescription');
  assert.ok(idxSelection < idxCycle, 'activeCoachingSelection must be removed before coachingCycle (Restrict)');
  assert.ok(idxSelection < idxPrescription, 'activeCoachingSelection must be removed before prescription (Restrict)');
});

test('Message is deleted before ChatSession', () => {
  assert.ok(USER_OWNED_DELETE_ORDER.indexOf('message') < USER_OWNED_DELETE_ORDER.indexOf('chatSession'));
});

// ── 12. Razorpay-linked users trigger pre-flight ────────────────────────

test('findPotentiallyBilledUsers queries subscriptionId OR customerId OR premium tier, non-PII select only', async () => {
  let capturedArgs = null;
  const prisma = { user: { findMany: async (args) => { capturedArgs = args; return []; } } };
  await findPotentiallyBilledUsers(prisma);
  assert.deepEqual(capturedArgs.where.OR, [
    { razorpaySubscriptionId: { not: null } },
    { razorpayCustomerId: { not: null } },
    { tier: 'premium' },
  ]);
  assert.deepEqual(capturedArgs.select, { id: true, razorpaySubscriptionId: true, razorpayCustomerId: true, tier: true });
  assert.ok(!('email' in capturedArgs.select));
  assert.ok(!('name' in capturedArgs.select));
});

test('zero billed users: preflight is a trivial pass and reports zero checked', async () => {
  const prisma = makeFakePrisma({ billedUsers: [] });
  const razorpay = makeFakeRazorpaySuccess();
  const outcome = await runExecuteFlow({
    prisma,
    razorpay,
    args: { execute: true, confirm: REQUIRED_CONFIRMATION, backupConfirmed: true },
    env: { [REQUIRED_ENV_FLAG]: 'true' },
  });
  assert.equal(outcome.aborted, false);
  assert.equal(outcome.preflight.checked, 0);
  assert.ok(prisma._transactionCalled);
});

// ── 13-14. Razorpay cancellation failure aborts wipe, no DB writes ──────

test('a Razorpay cancellation that never reaches a terminal status aborts the entire wipe with zero DB writes', async () => {
  const prisma = makeFakePrisma({
    billedUsers: [{ id: 'user_1', razorpaySubscriptionId: 'sub_1', razorpayCustomerId: null, tier: 'premium' }],
  });
  const razorpay = makeFakeRazorpayFailure();

  const outcome = await runExecuteFlow({
    prisma,
    razorpay,
    args: { execute: true, confirm: REQUIRED_CONFIRMATION, backupConfirmed: true },
    env: { [REQUIRED_ENV_FLAG]: 'true' },
  });

  assert.equal(outcome.aborted, true);
  assert.equal(outcome.reason, 'razorpay_preflight_failed');
  assert.equal(outcome.preflight.failures.length, 1);
  assert.equal(prisma._transactionCalled, false, 'no transaction/DB write may occur after a preflight failure');
});

test('a billed user with no subscription id to verify against also aborts (cannot positively confirm)', async () => {
  const prisma = makeFakePrisma({
    billedUsers: [{ id: 'user_2', razorpaySubscriptionId: null, razorpayCustomerId: 'cust_1', tier: 'free' }],
  });
  const razorpay = makeFakeRazorpaySuccess();

  const outcome = await runExecuteFlow({
    prisma,
    razorpay,
    args: { execute: true, confirm: REQUIRED_CONFIRMATION, backupConfirmed: true },
    env: { [REQUIRED_ENV_FLAG]: 'true' },
  });

  assert.equal(outcome.aborted, true);
  assert.equal(outcome.preflight.failures[0].reason, 'no_subscription_id_to_verify');
  assert.equal(prisma._transactionCalled, false);
});

test('missing guards abort before Razorpay or the database are ever touched', async () => {
  const prisma = makeFakePrisma();
  let razorpayTouched = false;
  const razorpay = {
    subscriptions: {
      cancel: async () => { razorpayTouched = true; return {}; },
      fetch: async () => { razorpayTouched = true; return {}; },
    },
  };

  const outcome = await runExecuteFlow({
    prisma,
    razorpay,
    args: { execute: true, confirm: null, backupConfirmed: false },
    env: {},
  });

  assert.equal(outcome.aborted, true);
  assert.equal(outcome.reason, 'guards_failed');
  assert.equal(razorpayTouched, false);
  assert.equal(prisma._transactionCalled, false);
});

// ── 15. Successful pre-flight permits deletion ──────────────────────────

test('a successfully cancelled subscription allows the wipe to proceed', async () => {
  const prisma = makeFakePrisma({
    billedUsers: [{ id: 'user_3', razorpaySubscriptionId: 'sub_3', razorpayCustomerId: null, tier: 'premium' }],
    userCountValue: 1,
    deleteManyCounts: { user: 1 },
  });
  const razorpay = makeFakeRazorpaySuccess();

  const outcome = await runExecuteFlow({
    prisma,
    razorpay,
    args: { execute: true, confirm: REQUIRED_CONFIRMATION, backupConfirmed: true },
    env: { [REQUIRED_ENV_FLAG]: 'true' },
  });

  assert.equal(outcome.aborted, false);
  assert.equal(outcome.preflight.cancelled, 1);
  assert.ok(prisma._transactionCalled);
  assert.equal(outcome.deleted.user, 1);
});

test('an already-inactive subscription (cancel throws, fetch confirms terminal) still permits the wipe', async () => {
  const razorpay = {
    subscriptions: {
      cancel: async () => { throw new Error('subscription already cancelled'); },
      fetch: async () => ({ status: 'cancelled' }),
    },
  };
  const users = [{ id: 'user_4', razorpaySubscriptionId: 'sub_4' }];
  const result = await razorpayPreflight(razorpay, users);
  assert.equal(result.alreadyInactive, 1);
  assert.equal(result.failures.length, 0);
});

// ── 16. Before/after counts are generated ───────────────────────────────

test('runExecuteFlow returns both before and after count snapshots on success', async () => {
  const prisma = makeFakePrisma({ userCountValue: 2, deleteManyCounts: { user: 2 } });
  const razorpay = makeFakeRazorpaySuccess();
  const outcome = await runExecuteFlow({
    prisma,
    razorpay,
    args: { execute: true, confirm: REQUIRED_CONFIRMATION, backupConfirmed: true },
    env: { [REQUIRED_ENV_FLAG]: 'true' },
  });
  assert.equal(outcome.before.user, 2);
  assert.ok(typeof outcome.after.user === 'number');
});

// ── 17. Secrets/content are never printed ───────────────────────────────

test('safeTargetDescriptor never includes the raw connection string, username, or password', () => {
  const url = 'postgresql://realuser:supersecretpassword@my-host.railway.internal:5432/railway';
  const descriptor = safeTargetDescriptor(url);
  const serialized = JSON.stringify(descriptor);
  assert.doesNotMatch(serialized, /supersecretpassword/);
  assert.doesNotMatch(serialized, /realuser/);
  assert.equal(descriptor.host, 'my-host.railway.internal');
});

test('printTargetDescriptor never prints the raw DATABASE_URL, username, or password', () => {
  const url = 'postgresql://realuser:supersecretpassword@my-host.railway.internal:5432/railway';
  const target = safeTargetDescriptor(url);
  const { logs } = captureConsole(() => printTargetDescriptor(target));
  const combined = logs.join('\n');
  assert.doesNotMatch(combined, /supersecretpassword/);
  assert.doesNotMatch(combined, /realuser/);
  assert.doesNotMatch(combined, /postgresql:\/\//);
  assert.match(combined, /my-host\.railway\.internal/, 'the safe hostname is still shown');
});

test('a full dry-run report, printed to the console, contains only counts — no emails, no free text', async () => {
  const prisma = makeFakePrisma({
    userCountValue: 24,
    modelCounts: { message: 500, safetyEvent: 3 },
  });
  const report = await runDryRunReport(prisma);
  const { logs } = captureConsole(() => printReport(report));
  const combined = logs.join('\n');
  assert.match(combined, /User: 24/);
  assert.match(combined, /message: 500/);
  assert.match(combined, /safetyEvent: 3/);
  assert.doesNotMatch(combined, /@/, 'no email-shaped content should ever appear in the report');
  // "passwordResetToken" (a model name) is the one legitimate, expected
  // occurrence — it appears both as its own count line and inside the
  // delete-order list. Strip every occurrence before checking the rest of
  // the output never mentions a password/token/secret VALUE.
  const withoutModelName = combined.replace(/passwordResetToken/g, '');
  assert.doesNotMatch(withoutModelName, /password|token|secret/i);
});

test('buildAuditSummary output carries no forbidden keys (email/name/content/password/token/databaseUrl)', () => {
  const summary = buildAuditSummary({
    mode: 'execute',
    aborted: false,
    before: { user: 24, message: 500 },
    after: { user: 0, message: 0 },
    deleted: { user: 24, message: 500 },
    preflight: { checked: 1, cancelled: 1, alreadyInactive: 0, failures: [] },
    success: true,
  });
  const serialized = JSON.stringify(summary);
  for (const forbidden of ['email', 'name', 'content', 'password', 'token', 'databaseUrl', 'DATABASE_URL', 'razorpayKey']) {
    assert.doesNotMatch(serialized.toLowerCase(), new RegExp(forbidden.toLowerCase()));
  }
});

test('buildAuditSummary preflight failures carry only userId + reason strings, never a message longer than 200 chars', async () => {
  const razorpay = {
    subscriptions: {
      cancel: async () => {},
      fetch: async () => { throw new Error('x'.repeat(5000)); },
    },
  };
  const preflight = await razorpayPreflight(razorpay, [{ id: 'user_5', razorpaySubscriptionId: 'sub_5' }]);
  assert.equal(preflight.failures.length, 1);
  assert.ok(preflight.failures[0].message.length <= 200);
});

// ── 18. Expected post-wipe User count = 0 ───────────────────────────────

test('verifyPostWipe passes when every user-owned model and User are zero and ProcessedWebhookEvent is unchanged', async () => {
  const prisma = makeFakePrisma({ modelCounts: { processedWebhookEvent: 7 } });
  const before = { user: 24, processedWebhookEvent: 7, ...Object.fromEntries(USER_OWNED_DELETE_ORDER.map((m) => [m, 1])) };
  const verification = await verifyPostWipe(prisma, before);
  assert.equal(verification.ok, true);
  assert.equal(verification.after.user, 0);
  assert.equal(verification.after.processedWebhookEvent, 7);
});

test('verifyPostWipe fails clearly if any user-owned model is non-zero after the wipe', async () => {
  const prisma = makeFakePrisma({ modelCounts: { message: 3 } });
  const before = { user: 24, processedWebhookEvent: 0 };
  const verification = await verifyPostWipe(prisma, before);
  assert.equal(verification.ok, false);
  assert.ok(verification.problems.some((p) => p.includes('message')));
});

test('verifyPostWipe fails if ProcessedWebhookEvent count changed', async () => {
  const prisma = makeFakePrisma({ modelCounts: { processedWebhookEvent: 5 } });
  const before = { user: 24, processedWebhookEvent: 7 };
  const verification = await verifyPostWipe(prisma, before);
  assert.equal(verification.ok, false);
  assert.ok(verification.problems.some((p) => p.includes('processedWebhookEvent')));
});

// ── 19. No public API endpoint is created ───────────────────────────────

test('the script defines no HTTP route and is not wired into index.js', () => {
  const scriptSrc = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'productionCleanStart.js'), 'utf8');
  assert.doesNotMatch(scriptSrc, /require\(['"]express['"]\)/);
  assert.doesNotMatch(scriptSrc, /app\.(get|post|put|patch|delete)\(/);
  assert.doesNotMatch(scriptSrc, /router\.(get|post|put|patch|delete)\(/);

  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.doesNotMatch(indexSrc, /productionCleanStart/);
});

test('the script is not referenced by any route file under src/routes', () => {
  const routesDir = path.join(__dirname, '..', 'src', 'routes');
  const files = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const src = fs.readFileSync(path.join(routesDir, file), 'utf8');
    assert.doesNotMatch(src, /productionCleanStart/, `${file} must not reference the wipe script`);
  }
});

// ── Extra: dedicated environment guard is a hard-to-trigger, exact match ─

test('REQUIRED_CONFIRMATION and REQUIRED_ENV_FLAG match the task-specified exact strings', () => {
  assert.equal(REQUIRED_CONFIRMATION, 'DELETE_ALL_ARJUN_PILOT_TEST_DATA');
  assert.equal(REQUIRED_ENV_FLAG, 'ALLOW_PRODUCTION_CLEAN_START');
});
