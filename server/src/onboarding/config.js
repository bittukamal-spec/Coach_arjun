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

// Allowed answer ids for a question. primary_priority (the Situation
// question) derives its options from the difficult_moments answer set minus
// the excluded ids — the athlete picks their situation from that full list.
function answerIdsFor(qid) {
  return answersFor(qid).map((a) => a.id);
}

// Answer definitions for a question, following `optionsFrom` so a mirrored
// question (primary_priority) resolves the SAME answer objects — including
// their `custom`/`exclusive` flags — as the question it borrows from. Before
// this, primary_priority had no resolvable answers at all, so its "My
// situation is different" option was never treated as a custom answer.
function answersFor(qid) {
  const q = getQuestion(qid);
  if (!q) return [];
  if (q.optionsFrom) {
    const base = getQuestion(q.optionsFrom);
    const exclude = new Set(q.excludeOptions || []);
    return (base?.answers || []).filter((a) => !exclude.has(a.id));
  }
  return q.answers || [];
}

function findAnswer(qid, aid) {
  return answersFor(qid).find((a) => a.id === aid) || null;
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

// Whether the Situation question is reachable. The simplified flow asks it
// directly, so it is reachable by default; the ONE case that still skips it is
// a historical session whose difficult_moments say "I'm not sure yet" — those
// athletes were routed to the shallow `unsure` branch and must stay there.
function hasPriority(answers) {
  const dm = selectedIds(answers, 'difficult_moments');
  if (dm.length > 0 && dm.every((x) => x === 'not_sure')) return false;
  return true;
}

function resolveBranch(answers) {
  const dm = selectedIds(answers, 'difficult_moments');
  if (dm.length > 0 && dm.every((x) => x === 'not_sure')) return 'unsure';
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

// ── "When Pressure Hits" presentation roles ────────────────────────────────
// Which existing question feeds each stage of the athlete-facing sequence
// (Situation → First response → Performance impact → Reset time) for a given
// branch. A role may be null when a branch structurally has no such question —
// that stage is then omitted rather than shown permanently unset.
const SITUATION_QUESTION_ID = config.situationQuestionId || 'primary_priority';

function pressureRoles(branchId) {
  return config.pressureRoles?.[branchId] || null;
}

// Ordered [{ stage, questionId }] for a branch, situation first. Stages whose
// question is not defined for the branch are omitted.
function pressureStages(branchId) {
  const roles = pressureRoles(branchId);
  const out = [{ stage: 'situation', questionId: SITUATION_QUESTION_ID }];
  for (const stage of ['firstResponse', 'impact', 'reset']) {
    const qid = roles?.[stage];
    if (qid) out.push({ stage, questionId: qid });
  }
  return out;
}

module.exports = {
  config,
  VERSION,
  SITUATION_QUESTION_ID,
  pressureRoles,
  pressureStages,
  answersFor,
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
