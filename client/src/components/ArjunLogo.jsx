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
export function ArjunLogo({ size = 32, className = '', variant = 'brand', alt = '', ariaLabel }) {
  const src = variant === 'coach' ? COACH_AVATAR : BRAND_MARK;
  return (
    <img
      src={src}
      alt={alt}
      aria-label={ariaLabel}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}
