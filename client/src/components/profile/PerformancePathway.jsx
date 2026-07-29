// The Starting Pattern: the frozen onboarding baseline, rendered as a vertical
// connected pathway.
//
// Nodes arrive from the server in stored order (the rule engine already built
// them as reaction → effect → duration), so this component adds no ordering
// decision, no missing node, and no inference of its own.
//
// It encodes SEQUENCE ONLY, never magnitude: every node is the same size, the
// same colour and the same weight. There are no arrowheads — an arrowhead reads
// as causality, and the engine records that these things co-occur, not that one
// causes the next.
//
// Semantics: an ordered list, so screen-reader order is the visual order for
// free. The step number and the connector are decorative; the type label
// ("Situation", "Reaction") is real visible text, so the sequence is
// comprehensible without seeing the line.

import { Zap, Brain, Eye, Clock } from 'lucide-react';

const NODE_ICON = {
  situation: Zap,
  reaction: Brain,
  effect: Eye,
  duration: Clock,
};

export default function PerformancePathway({ nodes, stepAria }) {
  const steps = (nodes || []).filter((n) => n && n.text);
  if (!steps.length) return null;

  return (
    <ol className="list-none p-0 m-0">
      {steps.map((node, i) => {
        const Icon = NODE_ICON[node.type] || Zap;
        const isLast = i === steps.length - 1;
        return (
          <li key={`${node.type}-${i}`} className="flex items-stretch gap-3">
            {/* Step number + connector — decorative; the label carries meaning */}
            <div className="flex flex-col items-center shrink-0" aria-hidden="true">
              <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              {!isLast && <span className="w-px flex-1 bg-dark-600 my-1" />}
            </div>

            <span
              className="w-9 h-9 rounded-full border border-dark-600 bg-dark-800 flex items-center justify-center shrink-0 mt-0"
              aria-hidden="true"
            >
              <Icon size={16} className="text-brand-500" />
            </span>

            <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-3 border-b border-dark-600 mb-3'}`}>
              {node.label && (
                <p className="text-caption font-semibold text-brand-500">
                  <span className="sr-only">{stepAria ? stepAria(i + 1, node.label) : ''}</span>
                  <span aria-hidden={stepAria ? 'true' : undefined}>{node.label}</span>
                </p>
              )}
              <p className="text-body text-ink break-words">{node.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
