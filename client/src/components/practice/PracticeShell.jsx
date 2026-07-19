import { useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import ToolIntroLayout from '../train/ToolIntroLayout';

// Shared Intro → Practice → Completion shell for mental-training tools
// (proven first on Quick Rep, Stage 6). Each practice keeps its own step
// logic, data, and API calls untouched — this only supplies the consistent
// chrome around it: one intro screen with one Start action and an optional
// collapsible "why this works" disclosure, a consistent in-practice header,
// and a consistent full-screen completion frame.

export function PracticeHeader({ onBack, title, progress }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4 pb-2">
      <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full bg-dark-700 active:scale-95">
        <ArrowLeft size={18} className="text-ink" />
      </button>
      {title && <p className="text-sm font-bold text-ink">{title}</p>}
      {progress && (
        <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full transition-all duration-300" style={{ width: progress }} />
        </div>
      )}
    </div>
  );
}

// The practice's single introduction screen: hero + headline (via the
// existing ToolIntroLayout), an optional collapsible "why this works"
// explainer, and exactly one primary Start action pinned at the bottom.
export function PracticeIntro({
  onBack, headerTitle,
  icon, variant = 'blue', tag, title, desc,
  whyLabel, whyBody,
  onStart, startLabel,
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <PracticeHeader onBack={onBack} title={headerTitle} />
      <div className="flex-1 px-4 pt-2 pb-8 overflow-y-auto">
        <ToolIntroLayout icon={icon} variant={variant} tag={tag} title={title} desc={desc} />
        {whyBody && (
          <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden mt-2 mb-2">
            <button
              onClick={() => setWhyOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              aria-expanded={whyOpen}
            >
              <p className="text-xs font-bold text-brand-400 uppercase tracking-wider">{whyLabel}</p>
              <ChevronDown size={16} className={`text-slt shrink-0 transition-transform ${whyOpen ? 'rotate-180' : ''}`} />
            </button>
            {whyOpen && (
              <div className="px-4 pb-4 text-sm text-slt leading-relaxed border-t border-dark-700 pt-3">
                {whyBody}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="px-4 pb-8 pt-2">
        <button onClick={onStart} className="btn-gradient w-full py-3.5" style={{ minHeight: '52px' }}>
          {startLabel}
        </button>
      </div>
    </div>
  );
}

// One step of the practice itself — the same header + title/sub/children
// shape every practice already used locally before this shell existed.
export function PracticeScreen({ onBack, headerTitle, progress, title, sub, children }) {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <PracticeHeader onBack={onBack} title={headerTitle} progress={progress} />
      <div className="flex-1 px-4 pt-4 pb-8 max-w-lg mx-auto w-full">
        {title && <h1 className="text-xl font-bold text-ink mb-2 leading-snug">{title}</h1>}
        {sub && <p className="text-sm text-slt mb-6 leading-relaxed">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

// Consistent full-screen completion frame. The practice supplies its own
// completion content (icon, summary, save/exit actions) unchanged — only
// the surrounding frame is shared.
export function PracticeCompletion({ children }) {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 text-center">
      {children}
    </div>
  );
}
