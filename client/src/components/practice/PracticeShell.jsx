import { useState } from 'react';
import { ArrowLeft, ChevronDown, CheckCircle2 } from 'lucide-react';

// Shared Intro → Practice → Completion shell for mental-training tools
// (proven first on Quick Rep, Stage 6). Each practice keeps its own step
// logic, data, and API calls untouched — this only supplies the consistent
// chrome around it: one intro screen with one Start action and an optional
// collapsible "why this works" disclosure, a consistent in-practice header,
// and a consistent full-screen completion frame.

export function PracticeHeader({ onBack, title, progress, canGoBack = true }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4 pb-2">
      {canGoBack ? (
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-11 h-11 flex items-center justify-center rounded-2xl bg-dark-400 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft size={18} className="text-ink" />
        </button>
      ) : (
        <div className="w-11 h-11" />
      )}
      {title && <p className="text-sm font-extrabold text-ink">{title}</p>}
      {progress && (
        <div className="flex-1 h-2 bg-dark-400 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full transition-all duration-300" style={{ width: progress }} />
        </div>
      )}
    </div>
  );
}

// Playbook redesign: the intro opens with ONE flat colour block — the
// practice's own colour, its drawing, the time tag, title and one line —
// then plain card-surface facts, an optional "why this works" disclosure,
// and one sun-coloured Start action. No gradients. Blocks are identical in
// light and dark, so everything on them uses dark ink.
const TONE_BLOCK = { mint: 'bg-mint', sky: 'bg-sky', sun: 'bg-sun', coral: 'bg-coral' };
// Older callers still pass the gradient-era `variant`; map it to a block.
const VARIANT_TONE = { teal: 'mint', blue: 'sky', amber: 'sun', purple: 'sky' };

export function PracticeIntro({
  onBack, headerTitle,
  icon: Icon, variant = 'blue', tone, Art, tag, title, desc, stats, checklist,
  whyLabel, whyBody,
  onStart, startLabel,
  secondaryLabel, onSecondary,
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const block = TONE_BLOCK[tone || VARIANT_TONE[variant]] || TONE_BLOCK.sky;
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <PracticeHeader onBack={onBack} title={headerTitle} />
      <div className="flex-1 px-4 pt-2 pb-6 overflow-y-auto max-w-lg mx-auto w-full">
        <section className={`relative overflow-hidden rounded-[28px] p-5 text-inkblock ${block}`}>
          <div className="flex items-start justify-between gap-3">
            {tag && (
              <span className="rounded-full bg-inkblock text-white text-micro font-bold uppercase px-3 py-1">{tag}</span>
            )}
            {Art
              ? <Art className="h-[clamp(72px,12dvh,104px)] w-auto shrink-0 -mt-1 -mr-1" />
              : Icon && (
                <span className="w-14 h-14 rounded-2xl bg-white/70 flex items-center justify-center shrink-0" aria-hidden="true">
                  <Icon size={26} />
                </span>
              )}
          </div>
          <h2 className="mt-2 text-[26px] leading-[1.12] font-extrabold">{title}</h2>
          {desc && <p className="mt-1.5 text-[14px] leading-relaxed text-inkblock/80">{desc}</p>}
        </section>

        {stats && stats.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {stats.map(st => (
              <div key={st.label} className="rounded-2xl bg-dark-400 px-3 py-3">
                <p className="text-micro font-bold uppercase text-slt">{st.label}</p>
                <p className="mt-1 text-[13px] font-bold leading-snug text-ink">{st.value}</p>
              </div>
            ))}
          </div>
        )}

        {checklist && (
          <div className="rounded-3xl bg-dark-400 p-4 mt-3">
            {checklist.title && <p className="text-[14px] font-extrabold text-ink mb-3">{checklist.title}</p>}
            <ul className="space-y-2.5">
              {checklist.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 size={18} className="text-brand-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-sm text-ink leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {whyBody && (
          <div className="rounded-3xl bg-dark-400 overflow-hidden mt-3">
            <button
              onClick={() => setWhyOpen(o => !o)}
              className="w-full min-h-[52px] flex items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-3xl"
              aria-expanded={whyOpen}
            >
              <p className="text-[14px] font-extrabold text-ink">{whyLabel}</p>
              <ChevronDown size={18} className={`text-slt shrink-0 transition-transform ${whyOpen ? 'rotate-180' : ''}`} />
            </button>
            {whyOpen && (
              <div className="px-4 pb-4 text-sm text-slt leading-relaxed">
                {whyBody}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="px-4 pb-8 pt-2 max-w-lg mx-auto w-full">
        <button
          onClick={onStart}
          className="w-full min-h-[56px] rounded-[18px] bg-sun text-inkblock text-base font-extrabold active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {startLabel}
        </button>
        {/* Secondary intro action (e.g. Pressure Reset's "View history").
            min-h-[44px] + flex centering give the control itself a real 44px
            tap target — it stays a quiet text link visually. */}
        {secondaryLabel && (
          <button
            onClick={onSecondary}
            className="w-full min-h-[44px] flex items-center justify-center text-center text-sm text-slt font-semibold mt-2 rounded active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// One step of the practice itself — the same header + title/sub/children
// shape every practice already used locally before this shell existed.
export function PracticeScreen({ onBack, headerTitle, progress, canGoBack = true, title, sub, children }) {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <PracticeHeader onBack={onBack} title={headerTitle} progress={progress} canGoBack={canGoBack} />
      <div className="flex-1 px-4 pt-4 pb-8 max-w-lg mx-auto w-full">
        {title && <h1 className="text-[22px] font-extrabold text-ink mb-2 leading-snug">{title}</h1>}
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
