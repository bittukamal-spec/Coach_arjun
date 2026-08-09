// Compact "My Performance Pattern" visual (approved-mockup pass) — replaces
// the old verbose vertical Starting Pattern + prose interpretation with one
// horizontal sequence of icon nodes: situation → reaction → effect (Duration
// intentionally omitted from the main-page overview per the approved
// mockup; the full node list, including duration, is still fetched and
// still available to the Review-pattern flow).
//
// Same data source as before (`dp.startingPattern.nodes`, server-authored,
// stored order — this component adds no ordering decision, no missing node
// and no inference of its own), just a different, more compact layout. No
// arrowheads for the same reason PerformancePathway has none: the engine
// records that these things co-occur, not that one causes the next — a
// plain connector reads as sequence without implying causality.

import { Zap, Brain, Eye } from 'lucide-react';

const NODE_ICON = { situation: Zap, reaction: Brain, effect: Eye };
const NODE_TONE = {
  situation: { bg: 'rgba(23,105,170,0.12)', fg: 'var(--brand-primary)' },
  reaction:  { bg: 'rgba(242,155,56,0.14)', fg: 'var(--accent-amber)' },
  effect:    { bg: 'rgba(34,211,197,0.14)', fg: 'var(--accent-teal)' },
};

export default function PerformancePatternFlow({ nodes, stepAria, ariaLabel }) {
  // Duration is deliberately excluded from this compact overview (per the
  // approved mockup); Review pattern still has full access to every answer.
  const steps = (nodes || []).filter((n) => n && n.text && n.type !== 'duration').slice(0, 3);
  if (!steps.length) return null;

  return (
    <ol aria-label={ariaLabel} className="list-none p-0 m-0 flex items-start gap-1.5">
      {steps.map((node, i) => {
        const Icon = NODE_ICON[node.type] || Zap;
        const tone = NODE_TONE[node.type] || NODE_TONE.situation;
        const isLast = i === steps.length - 1;
        return (
          <li key={`${node.type}-${i}`} className="flex items-start gap-1.5 min-w-0 flex-1">
            <div className="flex flex-col items-center min-w-0 flex-1">
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 mb-2"
                style={{ background: tone.bg }}
                aria-hidden="true"
              >
                <Icon size={20} style={{ color: tone.fg }} />
              </span>
              <span className="sr-only">{stepAria ? stepAria(i + 1, node.label) : node.label}</span>
              <p aria-hidden="true" className="text-caption font-semibold text-ink text-center leading-snug break-words [text-wrap:pretty]">
                {node.text}
              </p>
            </div>
            {!isLast && (
              <span className="text-muted shrink-0 mt-4" aria-hidden="true">→</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
