// Shared decorative art for the premium gradient cards introduced in the
// Dashboard/Train visual refresh (approved mockup pass). Every shape here is
// purely decorative (aria-hidden, pointer-events-none) — the card's own
// heading/description remains the accessible name. Kept in one file so the
// "wave-line + faint silhouette" language stays visually consistent across
// every gradient card instead of drifting per instance.

// Small concentric-ring + accent-arc mark, tinted to a caller-supplied
// colour — the one consistent "focus ring" icon language the approved
// mockup uses across every gradient card and the Home recommendation
// badge (echoes the existing Train PracticeMark family).
export function RingMark({ tone = 'currentColor', size = 20 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="11" stroke={tone} strokeOpacity="0.3" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="4.5" stroke={tone} strokeWidth="2.4" />
      <path d="M16 5a11 11 0 0 1 11 11" stroke={tone} strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

// Soft flowing wave-line texture — the "wave-line background treatment"
// requested for the Talk to Arjun hero and every Train gradient card.
// Three open curves at low opacity; colour is inherited via currentColor so
// each card can tint it (usually just white) without a new prop per case.
// Mockup-fidelity pass: the lines read as thick, dominant stripes rather
// than a faint decorative texture at the previous 10px/0.16 defaults, so
// both are turned down here — every existing caller (Dashboard hero, all
// five Train cards) picks up the fainter default automatically.
export function CardWaves({ className = '', opacity = 0.09 }) {
  return (
    <svg
      viewBox="0 0 400 240"
      preserveAspectRatio="none"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      aria-hidden="true"
      style={{ opacity }}
    >
      <path d="M-20 60 C 80 20, 160 100, 260 60 S 420 20, 460 60" stroke="white" strokeWidth="5" fill="none" />
      <path d="M-20 130 C 90 90, 170 170, 270 130 S 430 90, 470 130" stroke="white" strokeWidth="5" fill="none" />
      <path d="M-20 200 C 100 160, 180 240, 280 200 S 440 160, 480 200" stroke="white" strokeWidth="5" fill="none" />
    </svg>
  );
}

// Faint standing-athlete silhouette (cap + clasped hands) — Ritual card.
export function AthleteMark({ className = '' }) {
  return (
    <svg viewBox="0 0 140 160" className={className} aria-hidden="true" fill="currentColor">
      <ellipse cx="70" cy="34" rx="19" ry="20" />
      <path d="M50 20 a20 14 0 0 1 40 0 v6 h-40 z" />
      <path d="M46 58 c0 -14 10 -22 24 -22 s24 8 24 22 v34 c0 10 -8 16 -14 16 h-6 v20 h-8 v-20 h-6 c-6 0 -14 -6 -14 -16 z" />
      <path d="M58 70 q12 14 24 0 l4 8 q-16 18 -32 0 z" />
    </svg>
  );
}

// Faint breathing-figure silhouette (bust in profile with an expanding
// breath arc) — Pressure Reset card.
export function BreathMark({ className = '' }) {
  return (
    <svg viewBox="0 0 140 160" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="4">
      <circle cx="66" cy="38" r="20" fill="currentColor" stroke="none" />
      <path d="M40 140 v-30 c0 -22 12 -36 26 -36 s26 14 26 36 v30" fill="currentColor" stroke="none" />
      <path d="M96 30 a44 44 0 0 1 0 62" strokeLinecap="round" opacity="0.8" />
      <path d="M110 20 a62 62 0 0 1 0 82" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

// Faint open-notebook + pen silhouette. Kept in the shared card-art set
// (nothing renders it since the reflection tile left Train) rather than
// deleted, so a future reflection surface can reuse it.
export function NotebookMark({ className = '' }) {
  return (
    <svg viewBox="0 0 160 140" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="4">
      <path d="M20 20 h56 a8 8 0 0 1 8 8 v84 h-56 a8 8 0 0 1 -8 -8 z" />
      <path d="M140 20 h-56 a8 8 0 0 0 -8 8 v84 h56 a8 8 0 0 0 8 -8 z" />
      <path d="M76 28 v84" />
      <path d="M32 44 h32 M32 58 h32 M32 72 h20" strokeLinecap="round" />
      <path d="M92 44 h32 M92 58 h32 M92 72 h20" strokeLinecap="round" />
      <path d="M118 8 l16 16 -60 60 -20 4 4 -20 z" fill="currentColor" stroke="none" opacity="0.9" />
    </svg>
  );
}

// Faint stopwatch silhouette — Quick Rep card.
export function StopwatchMark({ className = '' }) {
  return (
    <svg viewBox="0 0 140 160" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="4">
      <rect x="56" y="8" width="28" height="12" rx="4" fill="currentColor" stroke="none" />
      <path d="M70 20 v10" />
      <circle cx="70" cy="94" r="56" />
      <path d="M70 94 v-34" strokeLinecap="round" />
      <path d="M70 94 l24 14" strokeLinecap="round" />
      <path d="M108 40 l10 -10" strokeLinecap="round" />
    </svg>
  );
}

// Faint stack-of-cards silhouette — Focus Card Builder card.
export function CardsMark({ className = '' }) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="4">
      <rect x="20" y="46" width="90" height="64" rx="12" transform="rotate(-8 20 46)" />
      <rect x="34" y="34" width="90" height="64" rx="12" transform="rotate(4 34 34)" />
      <rect x="40" y="30" width="90" height="64" rx="12" fill="currentColor" stroke="none" opacity="0.9" />
      <circle cx="85" cy="62" r="14" stroke="currentColor" opacity="0.8" />
    </svg>
  );
}
