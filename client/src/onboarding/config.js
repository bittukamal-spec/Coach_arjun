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

// Answer definitions for a question, following `optionsFrom` so the mirrored
// Situation question (primary_priority) resolves the SAME answer objects —
// labels, `custom` and `exclusive` flags included — as the list it borrows
// from. Mirrors server/src/onboarding/config.js exactly.
export function answersFor(qid) {
  const q = getQuestion(qid);
  if (!q) return [];
  if (q.optionsFrom) {
    const base = getQuestion(q.optionsFrom);
    const exclude = new Set(q.excludeOptions || []);
    return (base?.answers || []).filter((a) => !exclude.has(a.id));
  }
  return q.answers || [];
}

export function findAnswer(qid, aid) {
  return answersFor(qid).find((a) => a.id === aid) || null;
}
export const isExclusive = (qid, aid) => !!findAnswer(qid, aid)?.exclusive;
export const isCustom = (qid, aid) => !!findAnswer(qid, aid)?.custom;
export const customMax = (qid, aid) => findAnswer(qid, aid)?.max || config.customMaxLen || 120;

function selectedIds(answers, qid) {
  return answers?.[qid]?.answerIds || [];
}

// The Situation question is asked directly, so it is reachable by default.
// The one case that skips it is a historical session whose difficult_moments
// say "I'm not sure yet" and which has never answered the Situation question.
export function hasPriority(answers) {
  if (selectedIds(answers, 'primary_priority').length > 0) return true;
  const dm = selectedIds(answers, 'difficult_moments');
  if (dm.length > 0 && dm.every((x) => x === 'not_sure')) return false;
  return true;
}

// An EXPLICIT Situation always wins; a historical `difficult_moments =
// ['not_sure']` only selects the shallow `unsure` branch while there is no
// valid Situation to read. Mirrors server/src/onboarding/config.js exactly.
export function resolveBranch(answers) {
  const pri = selectedIds(answers, 'primary_priority')[0];
  if (pri) {
    if (pri === 'different') return 'custom';
    const branchId = config.priorityToBranch[pri];
    if (branchId) return branchId;
  }
  const dm = selectedIds(answers, 'difficult_moments');
  if (dm.length > 0 && dm.every((x) => x === 'not_sure')) return 'unsure';
  return null;
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

// The list of answer options to DISPLAY for a question. The Situation question
// shows the full situation list (it borrows its options from
// difficult_moments); everything else is static from the config.
export function displayAnswers(qid) {
  return answersFor(qid);
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

// ── "When Pressure Hits" presentation roles (mirrors the server) ──────────
export const SITUATION_QUESTION_ID = config.situationQuestionId || 'primary_priority';

export function pressureRoles(branchId) {
  return config.pressureRoles?.[branchId] || null;
}

// Ordered [{ stage, questionId }] for a branch, situation first. A stage whose
// question the branch does not define is omitted, never shown permanently
// unset. `context` is the branch's one non-sequence question, shown as a short
// secondary line. Mirrors server/src/onboarding/config.js exactly.
export function pressureStages(branchId) {
  const roles = pressureRoles(branchId);
  const out = [{ stage: 'situation', questionId: SITUATION_QUESTION_ID }];
  for (const stage of ['firstResponse', 'impact', 'reset', 'context']) {
    const qid = roles?.[stage];
    if (qid) out.push({ stage, questionId: qid });
  }
  return out;
}

export function stageForScreen(sid) {
  const s = getScreen(sid);
  return s?.stage || null;
}

// Stable stages shown in the progress bar (PR 3 adds "profile").
export const STAGES = config.stages;
