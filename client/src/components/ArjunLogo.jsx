// Arjun's approved production brand mark. These are fixed production
// crops/resizes of the approved logo artwork — do not redraw, recolour,
// trace or replace with an inline SVG. See
// client/public/brand/arjun/README.txt for the full approved asset set.
const BRAND_MARK = '/brand/arjun/arjun-brand-mark-384.png';
const COACH_AVATAR = '/brand/arjun/arjun-coach-avatar-256.png';

// `variant="coach"` renders the Coach avatar crop (Arjun himself, in chat);
// the default `variant="brand"` renders the general brand mark used in
// headers, auth and onboarding. `alt` defaults to decorative ("") because
// every current call site already places visible "Arjun" text next to the
// mark — pass an explicit alt when the mark is the only label present.
// `ariaLabel` is separate from `alt`: pass it where the mark itself must
// carry an accessible name (e.g. the Coach chat header).
//
// `responsive` swaps pixel sizing for pure className sizing (used by the
// `header` wordmark preset below, which grows the icon at a breakpoint via
// `min-[…]:w-*/h-*` — inline width/height would otherwise out-rank those
// classes). Only the icon artwork is ever unchanged; this only sizes it.
export function ArjunLogo({ size = 32, className = '', variant = 'brand', alt = '', ariaLabel, responsive = false }) {
  const src = variant === 'coach' ? COACH_AVATAR : BRAND_MARK;
  return (
    <img
      src={src}
      alt={alt}
      aria-label={ariaLabel}
      {...(responsive ? {} : { width: size, height: size })}
      className={className}
      style={responsive ? { objectFit: 'contain' } : { width: size, height: size, objectFit: 'contain' }}
    />
  );
}

// ── Wordmark lockup ─────────────────────────────────────────────────────
//
// The icon+"Arjun" pairing used across headers. Centralised here so every
// call site gets the same deliberate icon:text:gap relationship instead of
// one-off Tailwind sizing per page. Presets, not free-form props, so the
// pairing can't drift out of proportion at a single call site.
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

// `size` selects a preset above; `variant` still picks brand vs Coach
// artwork (deterministic, same values as ArjunLogo). `wordmark` defaults to
// "Arjun" — the only text this ever needs to say.
export function ArjunWordmark({
  size = 'hero',
  variant = 'brand',
  wordmark = 'Arjun',
  className = '',
  iconClassName = '',
  textClassName = '',
}) {
  const preset = LOCKUP_PRESETS[size] || LOCKUP_PRESETS.hero;
  return (
    <span className={`inline-flex items-center ${preset.gapClassName} ${className}`.trim()}>
      <ArjunLogo
        variant={variant}
        alt=""
        responsive={!!preset.responsive}
        size={preset.icon}
        className={`${preset.responsive ? preset.iconSizeClassName : ''} shrink-0 ${iconClassName}`.trim()}
      />
      <span className={`${preset.textClassName} ${textClassName}`.trim()}>{wordmark}</span>
    </span>
  );
}
