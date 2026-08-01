// Train grid tile (Stage E). Deliberately Train-specific rather than a
// change to SmallToolRow / FeatureToolCard / GradientIconTile — those are
// shared with ToolIntroLayout and MentalRepPage, so restyling them would
// leak into routes this stage does not own.
//
// Flat by design: no gradient, no glow, no game-reward or therapy imagery.
// The marker is an abstract Arjun geometry mark (a focus ring with an
// offset accent arc) rather than a literal icon set, tinted per practice
// from the approved token family.

function PracticeMark({ tone }) {
  // Two concentric strokes + one accent arc — the "focus ring / motion arc"
  // family. Purely decorative; the tile's own text is the accessible name.
  return (
    <svg
      viewBox="0 0 32 32"
      className="w-7 h-7 shrink-0"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="11" stroke={tone} strokeOpacity="0.28" strokeWidth="2" />
      <circle cx="16" cy="16" r="4.5" stroke={tone} strokeWidth="2" />
      <path
        d="M16 5a11 11 0 0 1 11 11"
        stroke={tone}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PracticeTile({ name, desc, tone = 'var(--brand-primary)', onClick, footer, className = '' }) {
  return (
    <div className={`flex flex-col ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="w-full min-h-[76px] h-full text-left rounded-2xl border border-dark-600 bg-dark-400 p-3.5 flex flex-col gap-2 elevation-row active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        <PracticeMark tone={tone} />
        <div className="min-w-0">
          {/* text-wrap:pretty keeps long Hindi labels from stranding a word */}
          <p className="text-sm font-bold text-ink leading-snug [text-wrap:pretty]">{name}</p>
          <p className="text-[12px] text-slt leading-snug mt-1 [text-wrap:pretty]">{desc}</p>
        </div>
      </button>
      {footer}
    </div>
  );
}

export default PracticeTile;
