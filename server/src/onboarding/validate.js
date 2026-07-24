// Authoritative server-side validation of onboarding answers. The client is
// never trusted: every question id, answer id, selection limit, exclusive
// rule, custom-text rule, and branch-consistency rule is enforced here.

const C = require('./config');
const { sanitizeCustomText } = require('./sanitize');

// questionId -> branchId (branch-scoped questions only), precomputed once.
const QUESTION_BRANCH = (() => {
  const map = {};
  for (const [branchId, b] of Object.entries(C.config.branches)) {
    for (const sid of b.screenIds || []) {
      const screen = C.config.branchScreens[sid];
      for (const qid of screen?.questionIds || []) map[qid] = branchId;
    }
  }
  return map;
})();

function err(code, message) {
  return { ok: false, code, error: message };
}

function selected(answers, qid) {
  return answers?.[qid]?.answerIds || [];
}

// Allowed answer ids for a question given the merged context. primary_priority
// is restricted to the athlete's own selected difficult_moments (minus not_sure).
function allowedIds(qid, merged) {
  if (qid === 'primary_priority') {
    return selected(merged, 'difficult_moments').filter((id) => id !== 'not_sure');
  }
  return C.answerIdsFor(qid);
}

// Validate + clean the questions in `payload` using `merged` for cross-question
// references. Returns { ok, cleaned } or { ok:false, code, error, questionId }.
function validateAnswers(payload, merged) {
  const cleaned = {};
  const resolvedBranch = C.resolveBranch(merged);

  for (const [qid, ans] of Object.entries(payload || {})) {
    const q = C.getQuestion(qid);
    if (!q) return { ...err('INVALID_QUESTION_ID', `Unknown question '${qid}'`), questionId: qid };
    if (!ans || !Array.isArray(ans.answerIds)) {
      return { ...err('INVALID_ANSWER_ID', `Question '${qid}' needs answerIds[]`), questionId: qid };
    }

    const ids = ans.answerIds;
    // No duplicates.
    if (new Set(ids).size !== ids.length) {
      return { ...err('INVALID_ANSWER_ID', `Duplicate answer in '${qid}'`), questionId: qid };
    }
    // Every id must be allowed for this question in this context.
    const allowed = new Set(allowedIds(qid, merged));
    for (const id of ids) {
      if (!allowed.has(id)) {
        return { ...err('INVALID_ANSWER_ID', `Answer '${id}' invalid for '${qid}'`), questionId: qid };
      }
    }
    // Selection limit (custom counts — it is one of the ids).
    if (ids.length > q.limit) {
      return { ...err('LIMIT_EXCEEDED', `'${qid}' allows at most ${q.limit}`), questionId: qid };
    }
    // Exclusive answers stand alone.
    const exclusiveSelected = ids.filter((id) => C.isExclusive(qid, id));
    if (exclusiveSelected.length > 0 && ids.length > 1) {
      return { ...err('EXCLUSIVE_CONFLICT', `'${exclusiveSelected[0]}' cannot combine with others`), questionId: qid };
    }
    // Custom text.
    const customSelected = ids.filter((id) => C.isCustom(qid, id));
    let customText;
    if (customSelected.length > 0) {
      const max = C.customMax(qid, customSelected[0]);
      const clean = sanitizeCustomText(ans.customText, max);
      if (!clean) {
        return { ...err('INVALID_CUSTOM_TEXT', `Custom answer for '${qid}' is empty or invalid`), questionId: qid };
      }
      customText = clean;
    }
    // Branch consistency: a branch-scoped question must match the resolved branch.
    const qBranch = QUESTION_BRANCH[qid];
    if (qBranch && qBranch !== resolvedBranch) {
      return { ...err('BRANCH_MISMATCH', `'${qid}' does not belong to branch '${resolvedBranch || 'none'}'`), questionId: qid };
    }

    cleaned[qid] = customText !== undefined ? { answerIds: ids, customText } : { answerIds: ids };
  }

  return { ok: true, cleaned };
}

// A stored answer satisfies a required question when it has ≥1 id (and, if a
// custom id is present, valid custom text — already guaranteed on write).
function isAnswered(answers, qid) {
  const ans = answers?.[qid];
  if (!ans || !Array.isArray(ans.answerIds) || ans.answerIds.length === 0) return false;
  const hasCustom = ans.answerIds.some((id) => C.isCustom(qid, id));
  if (hasCustom && !(ans.customText && ans.customText.trim())) return false;
  return true;
}

// Which required questions are missing for completion, given the resolved branch.
function missingRequired(answers) {
  return C.requiredQuestionIds(answers).filter((qid) => !isAnswered(answers, qid));
}

module.exports = { validateAnswers, isAnswered, missingRequired, QUESTION_BRANCH };
