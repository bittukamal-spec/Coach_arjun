// Stable-stage progress for onboarding.
//
// Deliberately NOT a per-question counter. It shows the fixed high-level
// stages of onboarding ("About you", "Your performance", "Your goals",
// "Your profile") so the bar stays meaningful when PR 2 inserts extra
// adaptive questions inside a stage — the stage count does not change, only
// the questions within a stage do.
//
// Purely presentational: stages + copy are passed in by the page. No
// onboarding field names, option lists, or validation live here.

function OnboardingStageProgress({ stages, currentStageKey, progressLabel, className = '' }) {
  const currentIndex = Math.max(0, stages.findIndex((s) => s.key === currentStageKey));
  const current = stages[currentIndex] || stages[0];

  // Accessible summary — e.g. "Stage 2 of 4: Your performance". The visual
  // segments below are decorative (aria-hidden); this text carries meaning
  // for screen readers.
  const summary = progressLabel
    ? progressLabel(currentIndex + 1, stages.length, current?.label)
    : `Stage ${currentIndex + 1} of ${stages.length}: ${current?.label ?? ''}`;

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {stages.map((stage, i) => (
          <span
            key={stage.key}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= currentIndex ? 'bg-brand-500' : 'bg-dark-700'
            }`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-caption font-semibold text-ink">{current?.label}</p>
        <p className="text-caption text-slt">{summary}</p>
      </div>
      {/* Announce stage transitions to assistive tech. */}
      <p className="sr-only" role="status" aria-live="polite">{summary}</p>
    </div>
  );
}

export default OnboardingStageProgress;
