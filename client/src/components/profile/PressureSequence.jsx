// "When Pressure Hits" — the athlete's own answers, in order, in their own
// words. Situation → First response → Performance impact, with reset time as
// one short line underneath.
//
// This component resolves each stored answer id to the SAME label the question
// showed when the athlete tapped it, and prints a custom answer verbatim. It
// renders no rule-engine phrasing, composes no sentence, and merges no two
// answers into one string — "I get angry with myself" stays "I get angry with
// myself", never "frustration with yourself can rise".
//
// Stages the athlete's branch does not ask are absent from `stages` and are
// simply not rendered — nothing is invented to fill a slot. A stage that IS
// asked but unanswered shows "Not set yet"; a single-choice stage holding more
// than one historical answer shows "Needs update" and is resolved only by the
// athlete, in the edit flow.

import { Zap, Brain, Target } from 'lucide-react';
import { answerLabel } from '../../onboarding/labels';

const SEQUENCE = ['situation', 'firstResponse', 'impact'];

const STAGE_ICON = { situation: Zap, firstResponse: Brain, impact: Target };

// Blue / amber / teal — the same tone family the rest of the Performance
// Profile uses, one per stage so each is immediately distinct.
const STAGE_TONE = {
  situation:     { bg: 'rgba(23,105,170,0.12)', fg: 'var(--brand-primary)' },
  firstResponse: { bg: 'rgba(242,155,56,0.14)', fg: 'var(--accent-amber)' },
  impact:        { bg: 'rgba(34,211,197,0.14)', fg: 'var(--accent-teal)' },
};

export function stageValue(stage, labelFor, t) {
  if (!stage) return { text: t.notSetYet, muted: true };
  if (stage.status === 'ambiguous') return { text: t.needsUpdate, muted: true };
  const label = answerLabel(stage, labelFor);
  return label ? { text: label, muted: false } : { text: t.notSetYet, muted: true };
}

export default function PressureSequence({ stages, labelFor, t, ariaLabel }) {
  const byStage = (name) => (stages || []).find((s) => s && s.stage === name) || null;
  const shown = SEQUENCE.filter((name) => byStage(name));
  const reset = byStage('reset');

  const STAGE_LABEL = {
    situation: t.pressureSituation,
    firstResponse: t.pressureFirstResponse,
    impact: t.pressureImpact,
  };

  return (
    <div>
      <ol aria-label={ariaLabel} className="list-none p-0 m-0">
        {shown.map((name, i) => {
          const stage = byStage(name);
          const Icon = STAGE_ICON[name];
          const tone = STAGE_TONE[name];
          const isLast = i === shown.length - 1;
          const value = stageValue(stage, labelFor, t);
          return (
            <li key={name} className="flex items-stretch gap-3">
              {/* Icon + connector column — decorative. The stage name and the
                  athlete's answer are both real visible text, so the sequence
                  reads correctly without this column. */}
              <div className="flex flex-col items-center shrink-0" aria-hidden="true">
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: tone.bg }}
                >
                  <Icon size={18} style={{ color: tone.fg }} />
                </span>
                {!isLast && <span className="w-px flex-1 bg-dark-600 my-1" />}
              </div>

              <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                <p className="text-micro font-bold uppercase mb-0.5" style={{ color: tone.fg }}>
                  {STAGE_LABEL[name]}
                </p>
                <p
                  className={`text-body leading-snug break-words [text-wrap:pretty] ${
                    value.muted ? 'text-muted italic' : 'text-ink font-semibold'
                  }`}
                >
                  {value.text}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {reset && (
        <p className="text-caption text-slt mt-3 break-words">
          {t.pressureResetInline(stageValue(reset, labelFor, t).text)}
        </p>
      )}
    </div>
  );
}
