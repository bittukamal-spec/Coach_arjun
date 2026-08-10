// Athlete-facing labels for a STORED answer, resolved from the shared
// onboarding config — the same label the question itself showed when the
// athlete tapped it.
//
// This is the whole point of the MVP profile: the page repeats what the
// athlete chose. It never phrases, summarises, softens or interprets it, and a
// custom answer is returned exactly as they wrote it — verbatim, and never
// translated, in either language.

import * as CFG from './config';

// `raw` is one of the server's structured answers:
//   { questionId, answerIds, customText, status }
// Returns [] for 'unset' and for 'ambiguous' (a single-choice question holding
// more than one stored id): the caller shows its own neutral state rather than
// this file silently picking one of them.
export function answerLabels(raw, labelFor) {
  if (!raw || raw.status === 'unset' || raw.status === 'ambiguous') return [];
  const qid = raw.questionId;
  return (raw.answerIds || [])
    .map((id) => {
      if (CFG.isCustom(qid, id)) return raw.customText || null;
      const a = CFG.findAnswer(qid, id);
      return a ? labelFor(a.key) : null;
    })
    .filter(Boolean);
}

// Convenience for the single-answer stages of "When Pressure Hits".
export function answerLabel(raw, labelFor) {
  return answerLabels(raw, labelFor)[0] || null;
}
