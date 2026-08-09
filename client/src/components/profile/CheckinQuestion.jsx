// One question screen for the Performance Check-in flow (and for the
// section-scoped edit entry points — Review pattern / What Helps Me Edit /
// My Strengths Edit / Goals edit — which reuse this exact same component
// rather than four separate implementations).
//
// Deliberately simpler than OnboardingPage's own renderQuestion: Check-in
// questions are always answered already (pre-filled from the athlete's
// existing profile), so there is no grid/stack label-length heuristic here
// — every option reads as a plain full-width row, which is always correct
// and keeps this component small. Selection semantics (single/multi,
// exclusive, limit, custom-text reveal) mirror onboarding's own rules
// exactly via the same shared `../../onboarding/config` module.

import { SelectableOption, CustomAnswerField } from '../onboarding';
import * as CFG from '../../onboarding/config';

export default function CheckinQuestion({ screenId, answers, onChange, labelFor, ui }) {
  const screen = CFG.getScreen(screenId);
  if (!screen) return null;
  const qid = screen.questionIds[0];
  const q = CFG.getQuestion(qid);
  if (!q) return null;

  const multi = q.type === 'multi';
  const options = CFG.displayAnswers(qid, answers);
  const current = answers[qid] || { answerIds: [] };
  const sel = current.answerIds || [];
  const atLimit = multi && sel.filter((id) => !CFG.isExclusive(qid, id)).length >= q.limit;
  const customId = sel.find((id) => CFG.isCustom(qid, id));

  function setAnswer(next) {
    onChange({ ...answers, [qid]: next });
  }
  function selectSingle(aid) {
    setAnswer(CFG.isCustom(qid, aid) ? { answerIds: [aid], customText: current.customText || '' } : { answerIds: [aid] });
  }
  function toggleMulti(aid) {
    const cur = sel;
    let ids;
    if (cur.includes(aid)) ids = cur.filter((x) => x !== aid);
    else if (CFG.isExclusive(qid, aid)) ids = [aid];
    else {
      const noEx = cur.filter((x) => !CFG.isExclusive(qid, x));
      if (noEx.length >= q.limit) return;
      ids = [...cur.filter((x) => !CFG.isExclusive(qid, x)), aid];
    }
    const hasCustom = ids.some((x) => CFG.isCustom(qid, x));
    setAnswer(hasCustom ? { answerIds: ids, customText: current.customText || '' } : { answerIds: ids });
  }
  function setCustom(text) {
    setAnswer({ ...current, customText: text });
  }

  const title = labelFor(screen.titleKey);
  const subtitle = screen.subtitleKey ? labelFor(screen.subtitleKey) : null;

  return (
    <div>
      <h2 className="text-title font-bold text-ink mb-1.5">{title}</h2>
      {subtitle && <p className="text-body text-slt mb-4 leading-relaxed">{subtitle}</p>}
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={title}>
        {options.map((a) => {
          const selected = sel.includes(a.id);
          const disabled = multi && atLimit && !selected && !CFG.isExclusive(qid, a.id);
          return (
            <SelectableOption
              key={a.id}
              label={labelFor(a.key)}
              layout="row"
              multi={multi}
              selected={selected}
              disabled={disabled}
              onSelect={() => (multi ? toggleMulti(a.id) : selectSingle(a.id))}
            />
          );
        })}
      </div>
      {customId && (
        <CustomAnswerField
          id={`checkin-${qid}-custom`}
          label={ui.customLabel}
          placeholder={ui.customPlaceholder}
          value={current.customText || ''}
          maxLength={CFG.customMax(qid, customId)}
          onChange={setCustom}
        />
      )}
    </div>
  );
}

// Whether the current answer for this screen's question is valid enough to
// continue — required questions need >=1 id, and a selected custom id needs
// non-empty (sanitisable) custom text.
export function checkinScreenValid(screenId, answers) {
  const screen = CFG.getScreen(screenId);
  if (!screen) return true;
  const qid = screen.questionIds[0];
  const q = CFG.getQuestion(qid);
  const ans = answers[qid];
  const ids = ans?.answerIds || [];
  if (q?.required && ids.length === 0) return false;
  const customId = ids.find((id) => CFG.isCustom(qid, id));
  if (customId && !(ans?.customText && ans.customText.trim())) return false;
  return true;
}
