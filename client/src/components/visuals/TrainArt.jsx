// Flat drawings for Train's colour blocks (Playbook redesign). Each shows the
// practice, not a sport, so one set serves every athlete. Fixed block-palette
// colours, identical in light and dark. Decorative only.

const base = { 'aria-hidden': true, width: 104, height: 96, viewBox: '0 0 104 96' };

// Ritual — steps climbed one at a time.
export function RitualArt() {
  return (
    <svg {...base}>
      <path d="M8 84h26V62h26V40h26V18" fill="none" stroke="#9DB4FF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="70" r="7" fill="#FFC629" />
      <circle cx="47" cy="48" r="7" fill="#FFC629" />
      <circle cx="73" cy="26" r="7" fill="#FFC629" />
      <circle cx="88" cy="12" r="8" fill="#FFFFFF" />
    </svg>
  );
}

// Pressure Reset — a breath settling to a still centre.
export function ResetArt() {
  return (
    <svg {...base}>
      <circle cx="52" cy="48" r="44" fill="#A8EFD8" />
      <circle cx="52" cy="48" r="30" fill="#D2F8EA" />
      <circle cx="52" cy="48" r="16" fill="#FFFFFF" />
      <circle cx="52" cy="48" r="6" fill="#101533" />
    </svg>
  );
}

// Quick Rep — a short, timed burst.
export function RepArt() {
  return (
    <svg {...base}>
      <circle cx="52" cy="52" r="38" fill="#FFE08A" />
      <rect x="44" y="4" width="16" height="10" rx="4" fill="#101533" />
      <path d="M58 22L38 54h14l-6 26 22-34H54z" fill="#101533" />
    </svg>
  );
}

// Focus Card — a cue written on a card.
export function FocusArt() {
  return (
    <svg {...base}>
      <rect x="30" y="14" width="56" height="70" rx="10" fill="#D94A2B" transform="rotate(10 58 49)" />
      <rect x="16" y="12" width="56" height="70" rx="10" fill="#FFFFFF" />
      <rect x="26" y="26" width="26" height="6" rx="3" fill="#101533" />
      <rect x="26" y="40" width="36" height="5" rx="2.5" fill="#FFB8A6" />
      <rect x="26" y="51" width="30" height="5" rx="2.5" fill="#FFB8A6" />
      <circle cx="58" cy="68" r="6" fill="#FFC629" />
    </svg>
  );
}

// My practice — a short checked list.
export function PracticeLogArt() {
  return (
    <svg aria-hidden="true" width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <rect x="4" y="4" width="36" height="36" rx="12" fill="#FFFFFF" />
      <path d="M13 16l3 3 5-6" fill="none" stroke="#19B892" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="24" y="14" width="10" height="3.5" rx="1.75" fill="#101533" />
      <path d="M13 28l3 3 5-6" fill="none" stroke="#19B892" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="24" y="26" width="10" height="3.5" rx="1.75" fill="#101533" />
    </svg>
  );
}
