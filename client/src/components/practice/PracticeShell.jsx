import { useState } from 'react';
import { ArrowLeft, ChevronDown, CheckCircle2 } from 'lucide-react';
import TonePage, { useStatusBarColour } from '../ui/TonePage';
import Teer from '../visuals/Teer';
import SceneBackdrop from '../visuals/SceneBackdrop';
import ExampleCard from './ExampleCard';

// Photo scenes fade into the feature's page colour (literal classes for Tailwind).
const SCENE_FADE = {
  mint: 'to-tonepage-mint', sky: 'to-tonepage-sky', sun: 'to-tonepage-sun',
  coral: 'to-tonepage-coral', blush: 'to-tonepage-blush',
};
const GLOW = {
  mint: 'bg-[radial-gradient(circle,rgba(127,227,196,0.95)_0%,rgba(127,227,196,0)_70%)]',
  default: 'bg-[radial-gradient(circle,rgba(255,255,255,0.8)_0%,rgba(255,255,255,0)_70%)]',
};
const MASCOT_MOTION = { breathe: 'calm', cheer: 'hop' };

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

// Playbook redesign, founder layout (Nov 2026): the whole intro sits on the
// feature's own page colour — no separate hero box and no boxes around the
// details. Everything is centred, in this order: drawing, title, one line,
// the time tag; then "What to expect"; then "Why this works" (a quiet
// disclosure). The old Duration / Best for / Goal tiles are gone; the time
// tag carries the duration. One Start action at the bottom.
const VARIANT_TONE = { teal: 'mint', blue: 'sky', amber: 'sun', purple: 'sky' };
// The main action must stand out from the page: sun everywhere except on the
// sun page itself, where it is brand blue.
const START_CLASS = {
  sun: 'bg-brand-500 text-white',
  default: 'bg-sun text-inkblock',
};

export function PracticeIntro({
  onBack, headerTitle,
  icon: Icon, variant = 'blue', tone, Art, mascot, scene, tag, title, desc, checklist, example, steps, exampleLine, howLabel = 'How it works', exampleLabel = 'Example',
  whyLabel, whyBody,
  onStart, startLabel,
  secondaryLabel, onSecondary,
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const pageTone = tone || VARIANT_TONE[variant] || 'sky';
  const startClass = START_CLASS[pageTone] || START_CLASS.default;
  return (
    <TonePage tone={pageTone} className="relative flex flex-col">
      {scene && <SceneBackdrop scene={scene} height="h-[min(62dvh,560px)]" fadeVia="via-transparent" fadeTo={SCENE_FADE[pageTone] || 'to-dark-900'} />}
      <div className="relative"><PracticeHeader onBack={onBack} title={headerTitle} /></div>
      <div className="relative flex-1 px-6 pt-2 pb-6 overflow-y-auto max-w-lg mx-auto w-full text-center">
        <section>
          {mascot
            ? (
              <div className="relative mx-auto flex h-[clamp(130px,23dvh,200px)] items-end justify-center">
                <span aria-hidden="true" className={`absolute bottom-0 aspect-square h-[105%] rounded-full motion-safe:animate-glow ${GLOW[pageTone] || GLOW.default}`} />
                <Teer pose={mascot} fluid motion={MASCOT_MOTION[mascot] || 'float'} eager className="relative h-[92%] w-auto drop-shadow-[0_12px_18px_rgba(16,21,51,0.15)]" />
              </div>
            )
            : Art
            ? <Art className="h-[clamp(84px,14dvh,128px)] w-auto mx-auto" />
            : Icon && (
              <span className="w-16 h-16 rounded-3xl bg-dark-400 text-ink flex items-center justify-center mx-auto" aria-hidden="true">
                <Icon size={28} />
              </span>
            )}
          <h2 className="mt-4 text-[28px] leading-[1.12] font-extrabold text-ink">{title}</h2>
          {desc && <p className="mt-2 text-[15px] leading-relaxed text-slt">{desc}</p>}
          {tag && (
            <span className="mt-4 inline-block rounded-full bg-inkblock text-white text-micro font-bold uppercase px-3.5 py-1.5">{tag}</span>
          )}
        </section>

        {steps && (
          <section className="mt-7" aria-label={howLabel} data-testid="intro-steps">
            <h3 className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-ink/70">{howLabel}</h3>
            <ol className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
              {steps.map((step, i) => (
                <li key={step} className="flex flex-col items-center gap-1.5 rounded-[18px] bg-dark-400 px-2 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-inkblock text-[13px] font-extrabold text-white" aria-hidden="true">{i + 1}</span>
                  <span className="text-[13px] font-bold leading-snug text-ink">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {exampleLine && (
          <p className="mt-4 rounded-[18px] bg-dark-400 px-4 py-3 text-[14px] leading-snug text-ink" data-testid="intro-example">
            <span className="font-extrabold">{exampleLabel}: </span>{exampleLine}
          </p>
        )}

        {example && <ExampleCard example={example} className="mt-6" />}

        {checklist && (
          <section className="mt-8">
            {checklist.title && <h3 className="text-[16px] font-extrabold text-ink mb-3">{checklist.title}</h3>}
            <ul className="space-y-2.5">
              {checklist.items.map((item, i) => (
                <li key={i} className="flex items-start justify-center gap-2 text-[14.5px] text-ink leading-snug">
                  <CheckCircle2 size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-left">{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {whyBody && (
          <section className="mt-6">
            <button
              onClick={() => setWhyOpen(o => !o)}
              className="min-h-[48px] inline-flex items-center justify-center gap-1.5 px-3 rounded-2xl text-[16px] font-extrabold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-expanded={whyOpen}
            >
              {whyLabel}
              <ChevronDown size={18} className={`shrink-0 transition-transform ${whyOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {whyOpen && (
              <div className="mt-1 text-[14.5px] text-slt leading-relaxed">
                {whyBody}
              </div>
            )}
          </section>
        )}
      </div>
      <div className="px-4 pb-8 pt-2 max-w-lg mx-auto w-full">
        <button
          onClick={onStart}
          className={`w-full min-h-[56px] rounded-[18px] text-base font-extrabold active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${startClass}`}
        >
          {startLabel}
        </button>
        {/* Secondary intro action (e.g. Pressure Reset's "View history").
            min-h-[44px] + flex centering give the control itself a real 44px
            tap target — it stays a quiet text link visually. */}
        {secondaryLabel && (
          <button
            onClick={onSecondary}
            className="w-full min-h-[44px] flex items-center justify-center text-center text-sm text-ink font-semibold mt-2 rounded active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </TonePage>
  );
}

// One step of the practice itself. With a `tone`, the step sits on the
// feature's page colour like its intro; without one, on the ordinary page.
export function PracticeScreen({ onBack, headerTitle, progress, canGoBack = true, title, sub, tone, children }) {
  const body = (
    <>
      <PracticeHeader onBack={onBack} title={headerTitle} progress={progress} canGoBack={canGoBack} />
      <div className="flex-1 px-4 pt-4 pb-8 max-w-lg mx-auto w-full">
        {title && <h1 className="text-[22px] font-extrabold text-ink mb-2 leading-snug">{title}</h1>}
        {sub && <p className="text-sm text-slt mb-6 leading-relaxed">{sub}</p>}
        {children}
      </div>
    </>
  );
  return tone
    ? <TonePage tone={tone} className="flex flex-col">{body}</TonePage>
    : <div className="min-h-screen bg-dark-900 flex flex-col">{body}</div>;
}

// Consistent full-screen completion frame. The practice supplies its own
// completion content (icon, summary, save/exit actions) unchanged — only
// the surrounding frame is shared.
//
// With `scene`, the completion is a celebration: a dark photo scene (e.g. a
// stadium at dusk) with white text — the practice passes light-on-dark content.
export function PracticeCompletion({ tone, scene, children }) {
  const cls = 'flex flex-col items-center justify-center px-4 text-center';
  if (scene) return <SceneCompletion scene={scene} className={cls}>{children}</SceneCompletion>;
  return tone
    ? <TonePage tone={tone} className={cls}>{children}</TonePage>
    : <div className={`min-h-screen bg-dark-900 ${cls}`}>{children}</div>;
}

const NIGHT = '#101533';
function SceneCompletion({ scene, className, children }) {
  useStatusBarColour({ colour: NIGHT });
  return (
    <div className={`relative min-h-screen overflow-hidden bg-inkblock text-white ${className}`}>
      <SceneBackdrop scene={scene} height="h-full" position="12% 50%" dim fadeVia="via-inkblock/10" fadeTo="to-inkblock/90" />
      <div className="relative flex w-full max-w-lg flex-col items-center pb-[calc(2rem+env(safe-area-inset-bottom))] pt-10">
        {children}
      </div>
    </div>
  );
}

// Teer celebrating, for a scene completion.
export function CompletionMascot({ pose = 'cheer' }) {
  return <Teer pose={pose} height={210} motion={MASCOT_MOTION[pose] || 'float'} eager className="mb-5 drop-shadow-[0_16px_24px_rgba(0,0,0,0.35)]" />;
}
