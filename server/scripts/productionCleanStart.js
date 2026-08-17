// One-time, manually-invoked production clean-start wipe for Arjun.
//
// Founder decision (final, see task history): all 24 existing production
// athlete/user accounts and everything they own are test/trash data. The
// pilot is to start from ZERO users. This script deletes every User and
// every user-owned record (chat, coaching, journal, safety, guardian
// consent — all of it), and preserves ONLY ProcessedWebhookEvent (Razorpay
// idempotency ledger — not user data) and everything Prisma/infra-internal
// (migrations bookkeeping, schema, env vars, Razorpay plan config).
//
// SAFE BY DEFAULT: running this with no flags does a READ-ONLY dry-run —
// it connects, counts, reports, and writes nothing. Actually deleting
// requires FOUR separate, independent guards (see checkGuards below) —
// missing or wrong ANY of them refuses to run and makes zero writes.
//
// This is NOT an HTTP endpoint, is not imported by any route file, is not
// scheduled, and is not part of `npm start`. It only runs when a human
// operator invokes it directly from a shell with `node`.
//
// Usage (from server/):
//   node scripts/productionCleanStart.js
//     → dry run: prints counts only, "NO DATA WAS MODIFIED", exits 0.
//
//   ALLOW_PRODUCTION_CLEAN_START=true node scripts/productionCleanStart.js \
//     --execute \
//     --confirm=DELETE_ALL_ARJUN_PILOT_TEST_DATA \
//     --backup-confirmed
//     → actually deletes, ONLY if a Razorpay pre-flight confirms no live
//       billing survives, and ONLY after all four guards above are present.
//
// Testability note: unlike this repo's other one-off scripts (e.g.
// scripts/cleanup-breathing-data.js), this file must be safely `require()`-
// able with zero database/Razorpay connectivity, so it can be unit-tested
// with fake Prisma/Razorpay clients and never touch a real DB in CI. To get
// that, every DB/Razorpay-touching function takes its client as a
// parameter (dependency injection) instead of constructing one at module
// scope, and `new PrismaClient()` / `new Razorpay()` only happen inside
// main(), which itself only runs when this file is executed directly
// (`require.main === module`) — requiring the module for tests never
// constructs either client.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Guard constants ──────────────────────────────────────────────────────

const REQUIRED_CONFIRMATION = 'DELETE_ALL_ARJUN_PILOT_TEST_DATA';
const REQUIRED_ENV_FLAG = 'ALLOW_PRODUCTION_CLEAN_START';
const TERMINAL_SUBSCRIPTION_STATUSES = ['cancelled', 'completed', 'expired'];
// Generous but bounded — 24 users' worth of rows is small; this just
// protects against an interactive transaction hanging indefinitely.
const WIPE_TRANSACTION_TIMEOUT_MS = 120000;

// ── The delete graph ─────────────────────────────────────────────────────
//
// Every Prisma model below is 100% user-owned (verified against
// server/prisma/schema.prisma — see test/productionCleanStart.test.js's
// "matches every user-owned model in schema.prisma exactly" test, which
// cross-checks this exact list against every `user User @relation(...)`
// field in the schema so a future model can't silently go unhandled).
//
// Order matters and is deliberately explicit rather than relying purely on
// `onDelete: Cascade` for a bulk multi-row wipe:
//   - ActiveCoachingSelection is removed FIRST because it holds `Restrict`
//     (not Cascade) relations to CoachingCycle and Prescription — deleting
//     it first means nothing ever hits that Restrict during this script.
//   - Message is removed before ChatSession even though Message.userId
//     already cascades from User on its own — same defensive ordering the
//     existing DELETE /api/auth/account handler already uses, and cheap
//     insurance for a bulk (not single-row) delete.
//   - Everything else follows child-before-parent for clarity, even where
//     Cascade alone would already handle it.
//
// User itself is deleted separately, last, after every row in this list.
const USER_OWNED_DELETE_ORDER = [
  'activeCoachingSelection',
  'prescription',
  'coachingCycle',
  'userCoachingState',
  'planSession',
  'plan',
  'startingProfileWording',
  'startingPerformanceProfile',
  'activeOnboardingSession',
  'onboardingSession',
  'currentCoachingFocus',
  'message',
  'chatSession',
  'safetyEvent',
  'toolReport',
  'selfTalkCard',
  'bodyResetSession',
  'skillProgress',
  'weeklyReport',
  'mindJournalEntry',
  'mentalFitnessEntry',
  'debrief',
  'gameSession',
  'drillCompletion',
  'userAchievement',
  'userMemory',
  'checkIn',
  'passwordResetToken',
];

// ProcessedWebhookEvent is Razorpay webhook-idempotency bookkeeping, not
// tied to any user (no userId field exists on it at all) — never touched.
const PRESERVED_MODELS = ['processedWebhookEvent'];

// ── CLI argument parsing ─────────────────────────────────────────────────

function parseArgs(argv) {
  const confirmArg = argv.find((a) => a.startsWith('--confirm='));
  return {
    execute: argv.includes('--execute'),
    confirm: confirmArg ? confirmArg.slice('--confirm='.length) : null,
    backupConfirmed: argv.includes('--backup-confirmed'),
  };
}

// ── Execution guards — ALL must pass, or zero writes happen ────────────
//
// Four independent guards, matching the task's explicit requirement:
//   1. --execute flag
//   2. --confirm=<exact string>
//   3. ALLOW_PRODUCTION_CLEAN_START=true env var
//   4. --backup-confirmed flag (operator attests a Railway backup/snapshot
//      already exists — this script never takes one itself)

function checkGuards(args, env) {
  const problems = [];
  if (!args.execute) problems.push('--execute flag is required');
  if (args.confirm !== REQUIRED_CONFIRMATION) {
    problems.push(
      args.confirm
        ? `--confirm=${REQUIRED_CONFIRMATION} is required (the value given does not match)`
        : `--confirm=${REQUIRED_CONFIRMATION} is required`
    );
  }
  if (env[REQUIRED_ENV_FLAG] !== 'true') {
    problems.push(`${REQUIRED_ENV_FLAG}=true environment variable is required`);
  }
  if (!args.backupConfirmed) {
    problems.push('--backup-confirmed flag is required (confirms a Railway Postgres backup/snapshot was taken BEFORE running this)');
  }
  return { ok: problems.length === 0, problems };
}

// ── Safe target descriptor — never the raw DATABASE_URL ─────────────────
//
// Prints enough for a human operator to visually sanity-check "is this the
// database I think it is" WITHOUT ever exposing credentials, and without
// this script itself claiming to know whether a host is "production" —
// hostname-based auto-detection is explicitly not attempted here (an
// operator's own judgement, informed by this printed descriptor plus the
// ALLOW_PRODUCTION_CLEAN_START guard they set, is the real confirmation).

function safeTargetDescriptor(databaseUrl) {
  if (!databaseUrl) return { configured: false };
  try {
    const u = new URL(databaseUrl);
    // A stable, non-reversible fingerprint — lets an operator confirm
    // "same DB as last time I ran this" across two invocations without the
    // credential ever being printed or logged anywhere.
    const fingerprint = crypto.createHash('sha256').update(databaseUrl).digest('hex').slice(0, 12);
    return {
      configured: true,
      parseable: true,
      protocol: u.protocol.replace(':', ''),
      host: u.hostname,
      port: u.port || null,
      database: u.pathname.replace(/^\//, '') || null,
      fingerprint,
    };
  } catch {
    return { configured: true, parseable: false };
  }
}

function printTargetDescriptor(target) {
  console.log('\n=== Target ===');
  if (!target.configured) {
    console.log('DATABASE_URL is not set.');
    return;
  }
  if (!target.parseable) {
    console.log('DATABASE_URL is set but could not be parsed as a URL.');
    return;
  }
  console.log(`  host:        ${target.host}`);
  console.log(`  port:        ${target.port ?? '(default)'}`);
  console.log(`  database:    ${target.database ?? '(unknown)'}`);
  console.log(`  fingerprint: ${target.fingerprint}  (stable hash of the connection string — not reversible)`);
  console.log('  NOTE: this script does not and cannot auto-detect "production" from the');
  console.log('  hostname alone. Confirm the target yourself before setting');
  console.log(`  ${REQUIRED_ENV_FLAG}=true.`);
}

// ── Read-only counts / summaries ─────────────────────────────────────────

async function getCounts(prisma) {
  const counts = { user: await prisma.user.count() };
  for (const model of USER_OWNED_DELETE_ORDER) {
    counts[model] = await prisma[model].count();
  }
  for (const model of PRESERVED_MODELS) {
    counts[model] = await prisma[model].count();
  }
  return counts;
}

async function getGuardianSummary(prisma) {
  const [withGuardianEmail, withGuardianConsentAt] = await Promise.all([
    prisma.user.count({ where: { guardianEmail: { not: null } } }),
    prisma.user.count({ where: { guardianConsentAt: { not: null } } }),
  ]);
  return { withGuardianEmail, withGuardianConsentAt };
}

async function getSubscriptionSummary(prisma) {
  const [byTierRaw, withRazorpaySubscriptionId, withRazorpayCustomerId] = await Promise.all([
    prisma.user.groupBy({ by: ['tier'], _count: { _all: true } }),
    prisma.user.count({ where: { razorpaySubscriptionId: { not: null } } }),
    prisma.user.count({ where: { razorpayCustomerId: { not: null } } }),
  ]);
  const byTier = Object.fromEntries(byTierRaw.map((r) => [r.tier, r._count._all]));
  return { byTier, withRazorpaySubscriptionId, withRazorpayCustomerId };
}

function printReport({ before, guardianSummary, subscriptionSummary }) {
  console.log('\n=== Current counts (read-only) ===');
  console.log(`  User: ${before.user}`);
  for (const model of USER_OWNED_DELETE_ORDER) {
    console.log(`  ${model}: ${before[model]}`);
  }
  console.log('\n=== Guardian data ===');
  console.log(`  Users with guardianEmail set:     ${guardianSummary.withGuardianEmail}`);
  console.log(`  Users with guardianConsentAt set: ${guardianSummary.withGuardianConsentAt}`);
  console.log('\n=== Subscription / billing state ===');
  console.log(`  By tier: ${JSON.stringify(subscriptionSummary.byTier)}`);
  console.log(`  Users with razorpaySubscriptionId: ${subscriptionSummary.withRazorpaySubscriptionId}`);
  console.log(`  Users with razorpayCustomerId:      ${subscriptionSummary.withRazorpayCustomerId}`);
  console.log('\n=== Preserved (never touched) ===');
  for (const model of PRESERVED_MODELS) {
    console.log(`  ${model}: ${before[model]}`);
  }
  console.log('  Also preserved: _prisma_migrations, schema structure, env vars, founder credentials, Razorpay plan config.');
  console.log('\n=== Models that WOULD be deleted (in this exact order) ===');
  console.log(`  ${USER_OWNED_DELETE_ORDER.concat(['user']).join(', ')}`);
  console.log('\n=== Models that WOULD be preserved ===');
  console.log(`  ${PRESERVED_MODELS.join(', ')}`);
}

async function runDryRunReport(prisma) {
  const before = await getCounts(prisma);
  const guardianSummary = await getGuardianSummary(prisma);
  const subscriptionSummary = await getSubscriptionSummary(prisma);
  return { before, guardianSummary, subscriptionSummary };
}

// ── Razorpay pre-flight — CRITICAL, runs before any DB write ────────────
//
// Anyone with a subscription id, a customer id, OR a premium tier is
// treated as "potentially billed" — a deliberately wide net. Unlike the
// existing DELETE /api/auth/account handler, a cancellation failure here
// does NOT get logged-and-continued — it aborts the entire wipe.

async function findPotentiallyBilledUsers(prisma) {
  return prisma.user.findMany({
    where: {
      OR: [
        { razorpaySubscriptionId: { not: null } },
        { razorpayCustomerId: { not: null } },
        { tier: 'premium' },
      ],
    },
    // Only non-PII billing fields — never email/name.
    select: { id: true, razorpaySubscriptionId: true, razorpayCustomerId: true, tier: true },
  });
}

async function razorpayPreflight(razorpay, users) {
  const result = { checked: users.length, cancelled: 0, alreadyInactive: 0, failures: [] };

  for (const user of users) {
    if (!user.razorpaySubscriptionId) {
      // Potentially billed (premium tier and/or a customer id) but no
      // subscription id to verify against — cannot positively confirm
      // anything is inactive, so this is an abort condition.
      result.failures.push({ userId: user.id, reason: 'no_subscription_id_to_verify' });
      continue;
    }

    let cancelErr = null;
    try {
      await razorpay.subscriptions.cancel(user.razorpaySubscriptionId, { cancel_at_cycle_end: false });
    } catch (err) {
      // Don't treat this as fatal yet — it may simply mean "already
      // cancelled". The fetch() below is the real, positive confirmation.
      cancelErr = err;
    }

    try {
      const fresh = await razorpay.subscriptions.fetch(user.razorpaySubscriptionId);
      if (TERMINAL_SUBSCRIPTION_STATUSES.includes(fresh?.status)) {
        if (cancelErr) result.alreadyInactive += 1;
        else result.cancelled += 1;
      } else {
        result.failures.push({ userId: user.id, reason: `status_not_terminal:${fresh?.status ?? 'unknown'}` });
      }
    } catch (fetchErr) {
      result.failures.push({
        userId: user.id,
        reason: 'razorpay_fetch_error',
        message: (fetchErr?.message || cancelErr?.message || 'unknown').slice(0, 200),
      });
    }
  }

  return result;
}

// ── Transactional DB wipe ─────────────────────────────────────────────────
//
// Deliberately not TRUNCATE CASCADE — explicit, ordered deleteMany() calls
// scoped to exactly the approved model list, inside one interactive
// transaction, so a mid-wipe failure rolls the whole thing back instead of
// leaving a half-wiped database.

async function performWipe(prisma) {
  return prisma.$transaction(
    async (tx) => {
      const deleted = {};
      for (const model of USER_OWNED_DELETE_ORDER) {
        const { count } = await tx[model].deleteMany({});
        deleted[model] = count;
      }
      const { count: userCount } = await tx.user.deleteMany({});
      deleted.user = userCount;
      return deleted;
    },
    { timeout: WIPE_TRANSACTION_TIMEOUT_MS }
  );
}

async function verifyPostWipe(prisma, before) {
  const after = await getCounts(prisma);
  const problems = [];
  if (after.user !== 0) problems.push('User count is not zero after wipe');
  for (const model of USER_OWNED_DELETE_ORDER) {
    if (after[model] !== 0) problems.push(`${model} count is not zero after wipe`);
  }
  for (const model of PRESERVED_MODELS) {
    if (after[model] !== before[model]) {
      problems.push(`${model} count changed (was ${before[model]}, now ${after[model]}) — this table must never change`);
    }
  }
  return { ok: problems.length === 0, problems, after };
}

// ── Audit summary — counts only, never content ───────────────────────────
//
// userId values (opaque cuids) may appear inside preflight failure entries
// for operator debugging — never an email, name, or any free text.

function getScriptVersion() {
  try {
    return require('child_process')
      .execSync('git rev-parse HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    try {
      return require('../package.json').version || 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

function buildAuditSummary({ mode, aborted, reason, before, after, deleted, preflight, success }) {
  return {
    timestamp: new Date().toISOString(),
    scriptVersion: getScriptVersion(),
    mode,
    aborted: !!aborted,
    reason: reason || null,
    before: before || null,
    after: after || null,
    deleted: deleted || null,
    razorpayPreflight: preflight
      ? {
          checked: preflight.checked,
          cancelled: preflight.cancelled,
          alreadyInactive: preflight.alreadyInactive,
          failureCount: preflight.failures.length,
          failures: preflight.failures, // userId + reason strings only
        }
      : null,
    preservedProcessedWebhookEventCount: after ? after.processedWebhookEvent : before ? before.processedWebhookEvent : null,
    success: success === undefined ? null : !!success,
  };
}

function writeAuditSummary(data) {
  const summary = buildAuditSummary(data);
  // Same convention as scripts/cleanup-breathing-data.js — server/backups/
  // is already gitignored, so this is never committed.
  const backupDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(backupDir, `production-clean-start-audit-${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2));
  return { path: filePath, summary };
}

// ── Orchestration — the full guarded execute flow ────────────────────────
//
// Separated from main() so it can be exercised end-to-end in tests with
// fake prisma/razorpay clients, without ever touching a real database or
// Razorpay account.

async function runExecuteFlow({ prisma, razorpay, args, env }) {
  const before = await getCounts(prisma);

  const guardCheck = checkGuards(args, env);
  if (!guardCheck.ok) {
    return { aborted: true, reason: 'guards_failed', problems: guardCheck.problems, before, preflight: null };
  }

  const billedUsers = await findPotentiallyBilledUsers(prisma);
  let preflight = { checked: 0, cancelled: 0, alreadyInactive: 0, failures: [] };
  if (billedUsers.length > 0) {
    preflight = await razorpayPreflight(razorpay, billedUsers);
  }

  if (preflight.failures.length > 0) {
    // No database write of any kind has happened yet — the wipe transaction
    // is only ever entered below, after this check.
    return { aborted: true, reason: 'razorpay_preflight_failed', before, preflight };
  }

  const deleted = await performWipe(prisma);
  const verification = await verifyPostWipe(prisma, before);

  return {
    aborted: false,
    before,
    after: verification.after,
    deleted,
    preflight,
    verificationOk: verification.ok,
    verificationProblems: verification.problems,
  };
}

// ── CLI entrypoint ────────────────────────────────────────────────────────

async function main() {
  require('dotenv').config();
  const { PrismaClient } = require('@prisma/client');

  const args = parseArgs(process.argv.slice(2));
  const target = safeTargetDescriptor(process.env.DATABASE_URL);

  console.log('=== Arjun production clean-start wipe ===');
  console.log(`Mode: ${args.execute ? 'EXECUTE' : 'DRY RUN'}`);
  printTargetDescriptor(target);

  const prisma = new PrismaClient();
  try {
    // The same read-only report is shown in both modes — an operator sees
    // exactly what's about to happen before any guard is even evaluated.
    const report = await runDryRunReport(prisma);
    printReport(report);

    if (!args.execute) {
      console.log('\nNO DATA WAS MODIFIED');
      return;
    }

    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // The real, single source of truth for the guarded execute flow — the
    // exact same function this repo's tests exercise with fakes.
    const outcome = await runExecuteFlow({ prisma, razorpay, args, env: process.env });

    if (outcome.aborted && outcome.reason === 'guards_failed') {
      console.error('\nRefusing to execute — missing required guard(s):');
      for (const p of outcome.problems) console.error(`  - ${p}`);
      console.error('\nNO DATA WAS MODIFIED');
      process.exitCode = 1;
      return;
    }

    if (outcome.aborted && outcome.reason === 'razorpay_preflight_failed') {
      console.error('\nRazorpay pre-flight FAILED for one or more users — ABORTING THE ENTIRE WIPE.');
      console.error('No database writes have been made.');
      for (const f of outcome.preflight.failures) console.error(`  - user ${f.userId}: ${f.reason}`);
      writeAuditSummary({ mode: 'execute', aborted: true, reason: outcome.reason, before: outcome.before, preflight: outcome.preflight, success: false });
      console.error('\nNO DATA WAS MODIFIED');
      process.exitCode = 1;
      return;
    }

    // Success path.
    console.log(`\n=== Razorpay pre-flight === (checked=${outcome.preflight.checked} cancelled=${outcome.preflight.cancelled} alreadyInactive=${outcome.preflight.alreadyInactive})`);
    console.log('\nRazorpay pre-flight passed. Database wipe complete.');
    console.log('\n=== AFTER ===');
    console.log(`  User: ${outcome.after.user}`);
    for (const model of USER_OWNED_DELETE_ORDER) console.log(`  ${model}: ${outcome.after[model]}`);
    for (const model of PRESERVED_MODELS) console.log(`  ${model} (preserved): ${outcome.after[model]}`);

    const { path: auditPath } = writeAuditSummary({
      mode: 'execute',
      aborted: false,
      before: outcome.before,
      after: outcome.after,
      deleted: outcome.deleted,
      preflight: outcome.preflight,
      success: outcome.verificationOk,
    });

    if (!outcome.verificationOk) {
      console.error('\nPOST-WIPE VERIFICATION FAILED:');
      for (const p of outcome.verificationProblems) console.error(`  - ${p}`);
      console.error(`\nAudit summary written to: ${auditPath}`);
      process.exitCode = 1;
      return;
    }

    console.log(`\nAudit summary written to: ${auditPath}`);
    console.log('\nWIPE COMPLETE — all athlete data removed. ProcessedWebhookEvent preserved.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err?.message || err);
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_CONFIRMATION,
  REQUIRED_ENV_FLAG,
  USER_OWNED_DELETE_ORDER,
  PRESERVED_MODELS,
  TERMINAL_SUBSCRIPTION_STATUSES,
  WIPE_TRANSACTION_TIMEOUT_MS,
  parseArgs,
  checkGuards,
  safeTargetDescriptor,
  printTargetDescriptor,
  getCounts,
  getGuardianSummary,
  getSubscriptionSummary,
  printReport,
  findPotentiallyBilledUsers,
  razorpayPreflight,
  performWipe,
  verifyPostWipe,
  buildAuditSummary,
  writeAuditSummary,
  runDryRunReport,
  runExecuteFlow,
  getScriptVersion,
  main,
};
