// "My Performance Pattern" — a compact, always-complete 3-stage VERTICAL
// mobile flow: Trigger → Reaction → Effect (mobile-fix pass).
//
// Stages are found by TYPE, never by array position/slice. The server's rule
// engine can legitimately send more than one reaction- or effect-dimension
// observation (an athlete may pick two "first response" answers), and the
// PREVIOUS version of this component took `nodes.slice(0, 3)` after
// filtering out duration — a purely positional cut that could silently drop
// an entire stage the server DID send (e.g. situation + 2 reactions + 1
// effect => the slice kept both reactions and dropped the effect). Looking
// each stage up by its own `type` fixes that mapping bug without touching
// the server at all: every stage the payload actually contains is now found
// regardless of how many siblings of another dimension came before it.
//
// Duration is still deliberately excluded from this overview (per the
// approved mockup) — it's a filter on the RENDER, never something dropped
// from the fetched data; Review pattern still has full access to it.
//
// A stage with genuinely no matching node in the payload is shown, not
// hidden — "Not set yet" is the ONLY thing rendered for it. No inference, no
// fabricated psychology, no AI: this is a pure display of already-fetched
// data plus one static fallback string.

import { Zap, Brain, Target } from 'lucide-react';

const STAGE_TYPES = ['situation', 'reaction', 'effect'];

const STAGE_ICON = { situation: Zap, reaction: Brain, effect: Target };

// Blue / amber / teal — the same tone family the rest of the redesigned
// Performance Profile uses (Learning/Focus Cards = blue, Reflections =
// amber, Saved Cues = teal on Playbook), reused here per-stage so Trigger,
// Reaction and Effect are each immediately, visually distinct.
const STAGE_TONE = {
  situation: { bg: 'rgba(23,105,170,0.12)', fg: 'var(--brand-primary)' },
  reaction:  { bg: 'rgba(242,155,56,0.14)', fg: 'var(--accent-amber)' },
  effect:    { bg: 'rgba(34,211,197,0.14)', fg: 'var(--accent-teal)' },
};

export default function PerformancePatternFlow({ nodes, stageLabels, notSetLabel, ariaLabel }) {
  const byType = (type) => (nodes || []).find((n) => n && n.type === type && n.text) || null;

  return (
    <ol aria-label={ariaLabel} className="list-none p-0 m-0">
      {STAGE_TYPES.map((type, i) => {
        const node = byType(type);
        const Icon = STAGE_ICON[type];
        const tone = STAGE_TONE[type];
        const isLast = i === STAGE_TYPES.length - 1;
        return (
          <li key={type} className="flex items-stretch gap-3">
            {/* Icon + connector column — decorative; the stage label and
                value are real visible text, so the sequence and each
                stage's identity are legible without seeing this column. */}
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
                {stageLabels[type]}
              </p>
              <p
                className={`text-body leading-snug break-words [text-wrap:pretty] ${
                  node ? 'text-ink font-semibold' : 'text-muted italic'
                }`}
              >
                {node ? node.text : notSetLabel}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
