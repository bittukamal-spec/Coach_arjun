// Server-side accessors over the generated onboarding v2 config. The config
// itself is the single source of truth (generated from shared/onboarding/v2.json
// by scripts/buildOnboardingConfig.mjs). Everything here is pure — no DB, no
// Express — so it can be unit-tested and reused by the route, the validators,
// and the completion service.

const config = require('./v2.config.json');

const VERSION = config.version;

function getQuestion(qid) {
  return config.questions[qid] || null;
}

function getScreen(sid) {
  return (
    config.screens.find((s) => s.id === sid) ||
    (config.branchScreens[sid] ? { id: sid, ...config.branchScreens[sid] } : null)
  );
}

function allScreenIds() {
  return [...config.screens.map((s) => s.id), ...Object.keys(config.branchScreens)];
}

// Static allowed answer ids for a question. primary_priority derives its
// options from difficult_moments (minus excluded ids) — the runtime
// intersection with the athlete's actual selection is enforced in validate.js.
function answerIdsFor(qid) {
  const q = getQuestion(qid);
  if (!q) return [];
  if (q.optionsFrom) {
    const base = getQuestion(q.optionsFrom);
    const exclude = new Set(q.excludeOptions || []);
    return (base?.answers || []).map((a) => a.id).filter((id) => !exclude.has(id));
  }
  return (q.answers || []).map((a) => a.id);
}

function findAnswer(qid, aid) {
  const q = getQuestion(qid);
  if (!q || !q.answers) return null;
  return q.answers.find((a) => a.id === aid) || null;
}

function isExclusive(qid, aid) {
  return !!findAnswer(qid, aid)?.exclusive;
}
function isCustom(qid, aid) {
  return !!findAnswer(qid, aid)?.custom;
}
function customMax(qid, aid) {
  return findAnswer(qid, aid)?.max || config.customMaxLen || 120;
}

// ── Flow / branch resolution (server-authoritative) ─────────────────────────

function selectedIds(answers, qid) {
  return answers?.[qid]?.answerIds || [];
}

// difficult_moments answered with something the athlete can prioritise.
function hasPriority(answers) {
  const dm = selectedIds(answers, 'difficult_moments');
  if (dm.length === 0) return false;
  if (dm.length === 1 && dm[0] === 'not_sure') return false;
  return true;
}

function resolveBranch(answers) {
  const dm = selectedIds(answers, 'difficult_moments');
  if (dm.length > 0 && dm.every((x) => x === 'not_sure')) return 'unsure';
  if (!hasPriority(answers)) return null;
  const pri = selectedIds(answers, 'primary_priority')[0];
  if (!pri) return null;
  if (pri === 'different') return 'custom';
  return config.priorityToBranch[pri] || null;
}

function branchScreenVisible(branchId, screenId, answers) {
  const b = config.branches[branchId];
  const cond = b?.conditionalScreens?.[screenId];
  if (!cond) return true;
  if (cond === 'unsureHasRecognition') {
    const rec = selectedIds(answers, 'unsure_recognition');
    return rec.length > 0 && !rec.includes('none_fit');
  }
  return true;
}

// Ordered list of reachable SCREEN ids given the current answers.
function computeFlowScreenIds(answers) {
  const pre = config.flow.preBranchScreens.filter(
    (sid) => sid !== 'primary_priority' || hasPriority(answers)
  );
  const branchId = resolveBranch(answers);
  let branchScreens = [];
  if (branchId) {
    branchScreens = (config.branches[branchId].screenIds || []).filter((sid) =>
      branchScreenVisible(branchId, sid, answers)
    );
  }
  return [...pre, ...branchScreens, ...config.flow.postBranchScreens];
}

// All question ids reachable under the current answers (used for pruning).
function reachableQuestionIds(answers) {
  const ids = new Set();
  for (const sid of computeFlowScreenIds(answers)) {
    const screen = getScreen(sid);
    for (const qid of screen?.questionIds || []) ids.add(qid);
  }
  return ids;
}

// Required question ids given the resolved branch — computed from the reachable
// flow + each question's own required flag (config-driven, never a fixed count).
function requiredQuestionIds(answers) {
  const req = [];
  for (const sid of computeFlowScreenIds(answers)) {
    const screen = getScreen(sid);
    for (const qid of screen?.questionIds || []) {
      if (getQuestion(qid)?.required) req.push(qid);
    }
  }
  return req;
}

module.exports = {
  config,
  VERSION,
  getQuestion,
  getScreen,
  allScreenIds,
  answerIdsFor,
  findAnswer,
  isExclusive,
  isCustom,
  customMax,
  hasPriority,
  resolveBranch,
  computeFlowScreenIds,
  reachableQuestionIds,
  requiredQuestionIds,
};
