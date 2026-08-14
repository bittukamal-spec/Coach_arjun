// Arjun's brand mark: a bow-and-arrow / brain-arc symbol. This is the
// original pre-refresh symbol, restored from git history — same path/line/
// polygon geometry, unchanged. Only the colour treatment changed: one
// consistent Arjun-blue family everywhere (this component, the favicon, the
// PWA/install icons, the Apple touch icon — previously the in-app mark was
// blue while the favicon/PWA set was a mismatched purple), and a solid
// light-blue accent stroke in place of the old translucent one, which
// read as washed out rather than a deliberate second colour.
//
// `--brand-logo` (index.css) is the one CSS variable reserved for this
// mark's fill — never reused as a general UI colour.
//
// `alt`/`ariaLabel` give the mark an accessible name when it's the only
// label present (e.g. the Coach chat header passes ariaLabel="Arjun logo");
// left unset, it's decorative (every other call site already places visible
// "Arjun" text next to it via ArjunWordmark below).
//
// `responsive` drops the pixel width/height so a caller's own `w-*/h-*`
// Tailwind classes (with breakpoint variants) control the rendered size —
// used by the `header` wordmark preset, which grows the icon at 360px.
export function ArjunLogo({ size = 32, className = '', alt = '', ariaLabel, responsive = false }) {
  const label = ariaLabel || alt || undefined;
  return (
    <svg
      {...(responsive ? {} : { width: size, height: size })}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={responsive ? undefined : { width: size, height: size }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' })}
    >
      {/* Rounded-square field — the artwork's own corner radius, so it
          stays crisp at every rendered size with no CSS clipping needed. */}
      <rect width="512" height="512" rx="96" fill="var(--brand-logo)" />
      {/* Bow arc — curves right like a brain hemisphere. */}
      <path d="M 168 92 C 430 92 430 420 168 420"
            stroke="#FFFFFF" strokeWidth="28" fill="none" strokeLinecap="round" />
      {/* Brain-fold hint — a solid light-blue accent, not a translucent
          overlay, so it stays a clean, deliberate second colour. */}
      <path d="M 196 182 C 268 202 268 308 196 328"
            stroke="#8ECBFF" strokeWidth="14" fill="none" strokeLinecap="round" />
      {/* Arrow shaft */}
      <line x1="86" y1="256" x2="376" y2="256" stroke="#FFFFFF" strokeWidth="22" strokeLinecap="round" />
      {/* Arrowhead */}
      <polygon points="364,226 422,256 364,286" fill="#FFFFFF" />
      {/* Fletching */}
      <line x1="112" y1="256" x2="80" y2="220" stroke="#FFFFFF" strokeWidth="16" strokeLinecap="round" />
      <line x1="112" y1="256" x2="80" y2="292" stroke="#FFFFFF" strokeWidth="16" strokeLinecap="round" />
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
    textClassName: 'text-[32px] font-extrabold leading-none tracking-[-0.02em] text-[#185FA5]',
  },
  header: {
    responsive: true,
    iconSizeClassName: 'w-8 h-8 min-[360px]:w-10 min-[360px]:h-10',
    gapClassName: 'gap-2 min-[360px]:gap-2.5',
    textClassName: 'text-[19px] min-[360px]:text-[26px] font-black leading-none tracking-tight min-[360px]:text-[#185FA5]',
  },
  medium: {
    icon: 28,
    gapClassName: 'gap-2',
    textClassName: 'text-[20px] font-extrabold leading-none tracking-[-0.02em] text-[#185FA5]',
  },
  compact: {
    icon: 32,
    gapClassName: 'gap-2',
    textClassName: 'text-[21px] font-extrabold leading-none tracking-[-0.02em] text-[#185FA5]',
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
