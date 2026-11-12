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
//
// Deliberately shows NO fit-response status. "Confirmed / Partly corrected /
// Corrected" is the athlete's answer to the original Starting Profile — it
// describes that one-time review, not this mutable focus, which they may
// change at any time. Showing it here implied the current focus had been
// vetted. It stays in the API for compatibility.


import { TargetArt } from '../visuals/ProfileArt';

export default function CurrentFocusCard({
  label,          // section label, already localised
  focusLabel,     // the athlete-facing action label
  helper,
  updatedText,    // localised "Updated 27 Jul 2026"
  onChangeFocus,  // omit to hide the control (first-time mode)
  changeFocusLabel,
  changeFocusRef,
  children,       // goals block — the rest of "what am I working on"
}) {
  if (!focusLabel) return null;
  const hasMeta = !!(updatedText || onChangeFocus);

  // Playbook redesign: the focus is the blue block with a target drawing —
  // white text on brand blue, identical in both themes. Anything passed as
  // `children` renders on that blue, so it must use white-based text.
  return (
    <section
      aria-labelledby="profile-focus-heading"
      className="relative overflow-hidden rounded-[28px] bg-brand-500 text-white p-5"
    >
      <TargetArt className="absolute -right-4 -top-3 pointer-events-none" />

      <div className="relative">
        <h2
          id="profile-focus-heading"
          className="inline-block rounded-full bg-white text-brand-600 text-micro font-bold uppercase px-3 py-1"
        >
          {label}
        </h2>
        <p className="mt-3 max-w-[14.5rem] text-[22px] leading-[1.2] font-extrabold break-words">{focusLabel}</p>
        {helper && <p className="mt-1 max-w-[15.5rem] text-[13px] leading-normal text-white/90 break-words">{helper}</p>}

        {children}

        {hasMeta && (
          <div className="mt-3 flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              {updatedText && <p className="text-caption text-white/85">{updatedText}</p>}
            </div>
            {onChangeFocus && (
              <button
                type="button"
                ref={changeFocusRef}
                onClick={onChangeFocus}
                className="shrink-0 px-4 py-3 min-h-[44px] rounded-2xl bg-brand-600 text-[13.5px] font-bold text-white active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {changeFocusLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
