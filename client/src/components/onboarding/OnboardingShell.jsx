import { useEffect, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import OnboardingStageProgress from './OnboardingStageProgress';

// The shared onboarding layout frame — the first surface of Arjun's future
// design system. Identical DOM/structure in both themes; only the semantic
// theme tokens (bg-dark-*, text-ink/slt, brand) resolve to different colours.
//
// Responsibilities that belong to the FRAME (not to any one question):
//   - mobile-first container (~480px), consistent gutters
//   - top header: Back action + stable-stage progress
//   - a scrollable question region
//   - a sticky footer (Continue) that respects the device safe area and
//     stays in normal flow (never overlays content, keyboard-reachable)
//   - focus + scroll management: on every screen change, scroll the content
//     to the top and move focus to the new screen's heading
//   - reduced-motion-safe entrance animation
//
// Copy (heading, subcopy, back label, footer button) is passed in by the
// page. The shell contains no onboarding copy, field names, options, API
// calls, or validation.

function OnboardingShell({
  screenKey,
  stages,
  currentStageKey,
  progressLabel,
  backLabel = 'Back',
  onBack,
  canGoBack = true,
  heading,
  subcopy,
  liveMessage = '',
  footer,
  children,
}) {
  const mainRef = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => {
    // New screen: reset scroll and hand focus to the heading so keyboard and
    // screen-reader users start at the top of the new question, not wherever
    // the previous screen left them.
    if (mainRef.current) mainRef.current.scrollTop = 0;
    if (headingRef.current) headingRef.current.focus();
  }, [screenKey]);

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* ── Header: back + stable-stage progress ─────────────────────── */}
      <header className="shrink-0 w-full max-w-[480px] mx-auto px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          {canGoBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-dark-700 text-ink active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900"
            >
              <ChevronLeft size={20} />
            </button>
          ) : (
            <div className="shrink-0 w-9 h-9" aria-hidden="true" />
          )}
          <OnboardingStageProgress
            stages={stages}
            currentStageKey={currentStageKey}
            progressLabel={progressLabel}
            className="flex-1 min-w-0"
          />
        </div>
      </header>

      {/* ── Scrollable question region ───────────────────────────────── */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto w-full max-w-[480px] mx-auto px-4 pt-2 pb-6"
      >
        <div key={screenKey} className="motion-safe:animate-fade-in">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-title font-bold text-ink mb-1 leading-snug outline-none"
          >
            {heading}
          </h1>
          {subcopy && <p className="text-body text-slt mb-5 leading-relaxed">{subcopy}</p>}
          {children}
        </div>
        {/* Polite live region for selection-limit / validation messages. */}
        <p className="sr-only" role="status" aria-live="polite">
          {liveMessage}
        </p>
      </main>

      {/* ── Sticky footer (Continue) with safe-area padding ──────────── */}
      <footer
        className="shrink-0 w-full max-w-[480px] mx-auto px-4 pt-3 border-t border-dark-600 bg-dark-900"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {footer}
      </footer>
    </div>
  );
}

export default OnboardingShell;
