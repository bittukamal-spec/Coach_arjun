// The one mutable thing on the profile: what the athlete says they're working
// on right now.
//
// Two modes, same DOM:
//   saved      — "CURRENT FOCUS" + the Change focus control
//   first-time — "SUGGESTED STARTING FOCUS", no Change focus (nothing is
//                confirmed yet, so there is no current focus to change)
//
// The headline is the server-authored action label ("Bounce back after
// mistakes"), never the mid-sentence phrase ("what happens after a mistake").
// Fit status is shown as text, never as a colour or a rating.

import { Target } from 'lucide-react';

export default function CurrentFocusCard({
  label,          // section label, already localised
  focusLabel,     // the athlete-facing action label
  helper,
  fitStatusLabel, // localised "Confirmed" / "Partly corrected" / "Corrected"
  fitStatusTitle, // localised "Current response"
  updatedText,    // localised "Updated 27 Jul 2026"
  onChangeFocus,  // omit to hide the control (first-time mode)
  changeFocusLabel,
  changeFocusRef,
}) {
  if (!focusLabel) return null;
  const hasMeta = !!(fitStatusLabel || updatedText || onChangeFocus);

  return (
    <section
      aria-labelledby="profile-focus-heading"
      className="card p-4 bg-brand-50/60 border-brand-500/20"
    >
      <div className="flex items-start gap-3">
        <span
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 border border-brand-500/25 bg-brand-50"
          aria-hidden="true"
        >
          <Target size={20} className="text-brand-500" />
        </span>
        <div className="min-w-0">
          <h2 id="profile-focus-heading" className="text-micro font-bold text-slt uppercase">
            {label}
          </h2>
          <p className="text-heading font-bold text-ink mt-0.5 break-words">{focusLabel}</p>
          {helper && <p className="text-caption text-slt mt-1 break-words">{helper}</p>}
        </div>
      </div>

      {hasMeta && (
        <>
          <div className="h-px bg-dark-600 my-3" aria-hidden="true" />
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              {fitStatusLabel && (
                <p className="text-caption text-slt">
                  {fitStatusTitle}: <span className="text-ink font-semibold">{fitStatusLabel}</span>
                </p>
              )}
              {updatedText && <p className="text-caption text-muted mt-0.5">{updatedText}</p>}
            </div>
            {onChangeFocus && (
              <button
                type="button"
                ref={changeFocusRef}
                onClick={onChangeFocus}
                className="shrink-0 px-4 py-3 min-h-[44px] rounded-xl border border-brand-500/40 text-caption font-semibold text-brand-500 bg-dark-400 active:scale-95 transition-transform"
              >
                {changeFocusLabel}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
