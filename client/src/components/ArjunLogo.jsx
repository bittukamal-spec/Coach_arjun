// Arjun's brand mark: Teer's head (the mascot), drawn flat so it stays sharp
// from a 16px browser tab to a 512px app icon — founder picked "Calm smile",
// Nov 2026 (docs/PREMIUM-PLAN.md, Step 4c). Same drawing as the favicon /
// PWA / Apple-touch / email icons in public/brand/arjun/ (teer-mark.svg).
// The 3D renders of Teer (components/visuals/Teer.jsx) are for illustrations.
//
// `alt`/`ariaLabel` give the mark an accessible name when it's the only
// label present (e.g. the Coach chat header passes ariaLabel="Arjun logo");
// left unset, it's decorative (every other call site already places visible
// "Arjun" text next to it via ArjunWordmark below).
//
// `responsive` drops the pixel width/height so a caller's own `w-*/h-*`
// Tailwind classes (with breakpoint variants) control the rendered size —
// used by the `header` wordmark preset, which grows the icon at 360px.
export const TEER_MARK = {
  blue: '#1B4DFF', shade: '#1238C9', sun: '#FFC629', sunEdge: '#E3A600',
  quill: '#C98A12', ink: '#101533', iris: '#6B3A1E', white: '#FFFFFF',
};

export function ArjunLogo({ size = 32, className = '', alt = '', ariaLabel, responsive = false }) {
  const label = ariaLabel || alt || undefined;
  const c = TEER_MARK;
  return (
    <svg
      {...(responsive ? {} : { width: size, height: size })}
      viewBox="2 4 96 96"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={responsive ? undefined : { width: size, height: size }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' })}
    >
      {/* Feather tucked into the band */}
      <g transform="translate(-2 9) rotate(26 70 26)">
        <path d="M70 2 C77 8 78 19 73 28 L67 28 C62 19 63 8 70 2Z" fill={c.sun} stroke={c.sunEdge} strokeWidth="1" />
        <path d="M70 2 C73.5 5 74.5 9.5 74 13 L66 13 C65.5 9.5 66.5 5 70 2Z" fill={c.white} />
        <path d="M70 9 V34" stroke={c.quill} strokeWidth="2" strokeLinecap="round" />
        <path d="M70 17 l-4 -3 M70 22 l-4 -3 M70 17 l4 -3 M70 22 l4 -3" stroke={c.quill} strokeWidth="1.4" strokeLinecap="round" />
      </g>
      {/* Head */}
      <circle cx="50" cy="60" r="36" fill={c.blue} />
      <path d="M14.5 66 A36 36 0 0 0 85.5 66 A38 32 0 0 1 14.5 66Z" fill={c.shade} opacity=".45" />
      {/* Sweatband with the arrow */}
      <path d="M12 51 Q14 33 50 30 Q86 33 88 51 Q88 56 83 57 Q50 44 17 57 Q12 56 12 51Z" fill={c.sun} />
      <path d="M17 57 Q50 44 83 57" fill="none" stroke={c.sunEdge} strokeWidth="1.6" opacity=".8" />
      <path d="M42 41 h15 m-5 -4.5 l5 4.5 -5 4.5" fill="none" stroke={c.white} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* Calm smile */}
      <g transform="translate(0 6)">
        <path d="M30 51 q6 -3 12 -1" fill="none" stroke={c.ink} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M58 50 q6 -2 12 1" fill="none" stroke={c.ink} strokeWidth="2.4" strokeLinecap="round" />
        {[37, 63].map(x => (
          <g key={x}>
            <ellipse cx={x} cy="63" rx="8.5" ry="10" fill={c.white} />
            <circle cx={x} cy="64" r="6.2" fill={c.iris} />
            <circle cx={x} cy="64" r="3.4" fill={c.ink} />
            <circle cx={x + 2.2} cy="61.4" r="1.9" fill={c.white} />
          </g>
        ))}
        <path d="M44 78 q6 5 12 0" fill="none" stroke={c.ink} strokeWidth="2.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// ── Wordmark lockup ─────────────────────────────────────────────────────
//
// The icon+"Arjun" pairing used across headers. Centralised here so every
// call site gets the same deliberate icon:text:gap relationship instead of
// one-off Tailwind sizing per page. Presets, not free-form props, so the
// pairing can't drift out of proportion at a single call site. Unchanged
// from the prior sizing refinement — this PR only swaps what ArjunLogo
// renders, not how big it or the wordmark sit next to each other.
//
//   hero    — headers with no competing controls (auth, reset password,
//             onboarding): the full-strength lockup at every width.
//   header  — the public homepage header, which shares its row with the
//             language/install/menu controls. Starts at the same footprint
//             as before (so 320px stays exactly as it was — zero risk of a
//             regression there) and steps up to the strong lockup once the
//             row has room, at 360px and up (verified against the header's
//             actual control widths, not guessed).
//   medium  — homepage footer: smaller than the header, still a designed
//             wordmark rather than plain text.
//   compact — tight bars: the authenticated app Navbar and the Coach chat
//             header. Sized to the icon:text ratio above without adding
//             height to a header that's already sized by its back button.
const LOCKUP_PRESETS = {
  hero: {
    icon: 48,
    gapClassName: 'gap-3',
    textClassName: 'text-[32px] font-extrabold leading-none tracking-[-0.02em] text-[#1B4DFF]',
  },
  header: {
    responsive: true,
    iconSizeClassName: 'w-8 h-8 min-[360px]:w-10 min-[360px]:h-10',
    gapClassName: 'gap-2 min-[360px]:gap-2.5',
    textClassName: 'text-[19px] min-[360px]:text-[26px] font-black leading-none tracking-tight min-[360px]:text-[#1B4DFF]',
  },
  medium: {
    icon: 28,
    gapClassName: 'gap-2',
    textClassName: 'text-[20px] font-extrabold leading-none tracking-[-0.02em] text-[#1B4DFF]',
  },
  compact: {
    icon: 32,
    gapClassName: 'gap-2',
    textClassName: 'text-[21px] font-extrabold leading-none tracking-[-0.02em] text-[#1B4DFF]',
  },
};

// `size` selects a preset above. `wordmark` defaults to "Arjun" — the only
// text this ever needs to say. The artwork's own rounded-square corners
// mean no caller needs to pass a `rounded-*` className for the icon anymore
// (unlike the raster mark this replaces) — `iconClassName` stays available
// for anything else a call site needs.
export function ArjunWordmark({
  size = 'hero',
  wordmark = 'Arjun',
  className = '',
  iconClassName = '',
  textClassName = '',
}) {
  const preset = LOCKUP_PRESETS[size] || LOCKUP_PRESETS.hero;
  return (
    <span className={`inline-flex items-center ${preset.gapClassName} ${className}`.trim()}>
      <ArjunLogo
        alt=""
        responsive={!!preset.responsive}
        size={preset.icon}
        className={`${preset.responsive ? preset.iconSizeClassName : ''} shrink-0 ${iconClassName}`.trim()}
      />
      <span className={`${preset.textClassName} ${textClassName}`.trim()}>{wordmark}</span>
    </span>
  );
}
