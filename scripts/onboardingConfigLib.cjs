// Shared (CommonJS) library for the onboarding config generator and the
// parity/validation tests. Kept CJS so the server's node:test suite can
// require it directly, while the .mjs entrypoint imports it too.

const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CANONICAL_PATH = path.join(ROOT, 'shared/onboarding/v2.json');
const TARGETS = [
  path.join(ROOT, 'server/src/onboarding/v2.config.json'),
  path.join(ROOT, 'client/src/onboarding/v2.config.json'),
];

// Throws on the first structural problem.
function validateConfig(cfg) {
  const errors = [];
  const fail = (m) => errors.push(m);

  if (cfg.version !== 2) fail(`version must be 2, got ${cfg.version}`);
  if (typeof cfg.customMaxLen !== 'number') fail('customMaxLen must be a number');

  const questionIds = new Set(Object.keys(cfg.questions || {}));
  const stageIds = new Set((cfg.stages || []).map((s) => s.id));

  for (const [qid, q] of Object.entries(cfg.questions || {})) {
    if (!['single', 'multi'].includes(q.type)) fail(`${qid}: bad type ${q.type}`);
    if (typeof q.limit !== 'number' || q.limit < 1) fail(`${qid}: bad limit`);
    if (typeof q.required !== 'boolean') fail(`${qid}: required must be boolean`);

    if (q.optionsFrom) {
      if (!questionIds.has(q.optionsFrom)) fail(`${qid}: optionsFrom '${q.optionsFrom}' missing`);
      continue;
    }
    if (!Array.isArray(q.answers) || q.answers.length === 0) {
      fail(`${qid}: must define answers[] or optionsFrom`);
      continue;
    }
    const seen = new Set();
    for (const a of q.answers) {
      if (!a.id) fail(`${qid}: answer missing id`);
      if (seen.has(a.id)) fail(`${qid}: duplicate answer id '${a.id}'`);
      seen.add(a.id);
      if (!a.key || typeof a.key !== 'string') fail(`${qid}.${a.id}: missing translation key`);
      if (a.exclusive !== undefined && typeof a.exclusive !== 'boolean') fail(`${qid}.${a.id}: exclusive must be boolean`);
      if (a.custom && (typeof a.max !== 'number' || a.max < 1)) fail(`${qid}.${a.id}: custom option must have numeric max`);
    }
  }

  for (const s of cfg.screens || []) {
    if (!stageIds.has(s.stage)) fail(`screen ${s.id}: unknown stage '${s.stage}'`);
    for (const qid of s.questionIds || []) {
      if (!questionIds.has(qid)) fail(`screen ${s.id}: unknown question '${qid}'`);
    }
  }

  for (const [sid, s] of Object.entries(cfg.branchScreens || {})) {
    for (const qid of s.questionIds || []) {
      if (!questionIds.has(qid)) fail(`branchScreen ${sid}: unknown question '${qid}'`);
    }
  }

  const branchScreenIds = new Set(Object.keys(cfg.branchScreens || {}));
  for (const [bid, b] of Object.entries(cfg.branches || {})) {
    for (const sid of b.screenIds || []) {
      if (!branchScreenIds.has(sid)) fail(`branch ${bid}: unknown screen '${sid}'`);
    }
    for (const qid of b.requiredQuestionIds || []) {
      if (!questionIds.has(qid)) fail(`branch ${bid}: required question '${qid}' missing`);
    }
  }

  const dm = cfg.questions?.difficult_moments;
  const dmIds = new Set((dm?.answers || []).map((a) => a.id));
  const branchIds = new Set(Object.keys(cfg.branches || {}));
  for (const [pid, bid] of Object.entries(cfg.priorityToBranch || {})) {
    if (!dmIds.has(pid)) fail(`priorityToBranch: '${pid}' not a difficult_moments answer`);
    if (!branchIds.has(bid)) fail(`priorityToBranch: branch '${bid}' missing`);
  }
  for (const pid of Object.keys(cfg.priorityToPrimaryChallenge || {})) {
    if (!dmIds.has(pid)) fail(`priorityToPrimaryChallenge: '${pid}' not a difficult_moments answer`);
  }

  if (errors.length) throw new Error(`Invalid onboarding config:\n - ${errors.join('\n - ')}`);
  return true;
}

function loadCanonical() {
  const cfg = JSON.parse(readFileSync(CANONICAL_PATH, 'utf8'));
  validateConfig(cfg);
  return cfg;
}

function serialize(cfg) {
  return JSON.stringify(cfg, null, 2) + '\n';
}

function generate() {
  const cfg = loadCanonical();
  const out = serialize(cfg);
  const written = [];
  for (const target of TARGETS) {
    writeFileSync(target, out);
    written.push(path.relative(ROOT, target));
  }
  return written;
}

module.exports = { ROOT, CANONICAL_PATH, TARGETS, validateConfig, loadCanonical, serialize, generate };
