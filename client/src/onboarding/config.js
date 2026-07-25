// Client-side accessors over the generated onboarding v2 config (generated
// from shared/onboarding/v2.json). Pure and framework-agnostic — mirrors the
// server's resolution logic so the adaptive flow renders exactly what the
// server will accept. Labels are resolved separately via translation keys;
// the config stores stable IDs only.

import config from './v2.config.json';

export { config };
export const VERSION = config.version;

export function getQuestion(qid) {
  return config.questions[qid] || null;
}

export function getScreen(sid) {
  return (
    config.screens.find((s) => s.id === sid) ||
    (config.branchScreens[sid] ? { id: sid, ...config.branchScreens[sid] } : null)
  );
}

export function allScreenIds() {
  return [...config.screens.map((s) => s.id), ...Object.keys(config.branchScreens)];
}

export function findAnswer(qid, aid) {
  return getQuestion(qid)?.answers?.find((a) => a.id === aid) || null;
}
export const isExclusive = (qid, aid) => !!findAnswer(qid, aid)?.exclusive;
export const isCustom = (qid, aid) => !!findAnswer(qid, aid)?.custom;
export const customMax = (qid, aid) => findAnswer(qid, aid)?.max || config.customMaxLen || 120;

function selectedIds(answers, qid) {
  return answers?.[qid]?.answerIds || [];
}

export function hasPriority(answers) {
  const dm = selectedIds(answers, 'difficult_moments');
  if (dm.length === 0) return false;
  if (dm.length === 1 && dm[0] === 'not_sure') return false;
  return true;
}

export function resolveBranch(answers) {
  const dm = selectedIds(answers, 'difficult_moments');
  if (dm.length > 0 && dm.every((x) => x === 'not_sure')) return 'unsure';
  if (!hasPriority(answers)) return null;
  const pri = selectedIds(answers, 'primary_priority')[0];
  if (!pri) return null;
  if (pri === 'different') return 'custom';
  return config.priorityToBranch[pri] || null;
}

function branchScreenVisible(branchId, screenId, answers) {
  const cond = config.branches[branchId]?.conditionalScreens?.[screenId];
  if (!cond) return true;
  if (cond === 'unsureHasRecognition') {
    const rec = selectedIds(answers, 'unsure_recognition');
    return rec.length > 0 && !rec.includes('none_fit');
  }
  return true;
}

// Ordered reachable SCREEN ids given the current answers.
export function computeFlowScreenIds(answers) {
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

// The list of answer options to DISPLAY for a question given current answers.
// primary_priority mirrors the athlete's chosen difficult_moments (minus
// not_sure); everything else is static from the config.
export function displayAnswers(qid, answers) {
  const q = getQuestion(qid);
  if (!q) return [];
  if (qid === 'primary_priority') {
    const chosen = selectedIds(answers, 'difficult_moments').filter((id) => id !== 'not_sure');
    const dm = getQuestion('difficult_moments');
    return chosen
      .map((id) => dm.answers.find((a) => a.id === id))
      .filter(Boolean);
  }
  return q.answers || [];
}

// All question ids reachable under the current answers (for prune detection).
export function reachableQuestionIds(answers) {
  const ids = new Set();
  for (const sid of computeFlowScreenIds(answers)) {
    for (const qid of getScreen(sid)?.questionIds || []) ids.add(qid);
  }
  return ids;
}

// questionId -> branchId, for branch-scoped questions only.
const QUESTION_BRANCH = (() => {
  const map = {};
  for (const [branchId, b] of Object.entries(config.branches)) {
    for (const sid of b.screenIds || []) {
      for (const qid of config.branchScreens[sid]?.questionIds || []) map[qid] = branchId;
    }
  }
  return map;
})();
export const isBranchQuestion = (qid) => qid in QUESTION_BRANCH;

export function stageForScreen(sid) {
  const s = getScreen(sid);
  return s?.stage || null;
}

// Stable stages shown in the progress bar (PR 3 adds "profile").
export const STAGES = config.stages;
