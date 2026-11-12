// Small flat drawings for Home's colour blocks (Playbook redesign). Fixed
// block-palette colours, identical in light and dark. Decorative only.

export function TalkArt({ size = 62 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 62 62" className="shrink-0">
      <rect x="4" y="8" width="40" height="28" rx="10" fill="#101533" />
      <path d="M14 36v9l10-9z" fill="#101533" />
      <rect x="22" y="26" width="36" height="24" rx="9" fill="#FFFFFF" />
      <path d="M48 50v8l-9-8z" fill="#FFFFFF" />
      <circle cx="16" cy="22" r="2.5" fill="#FFC629" />
      <circle cx="24" cy="22" r="2.5" fill="#FFC629" />
      <circle cx="32" cy="22" r="2.5" fill="#FFC629" />
    </svg>
  );
}

export function JournalArt({ size = 48 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" className="shrink-0">
      <rect x="8" y="5" width="30" height="38" rx="6" fill="#101533" />
      <rect x="12" y="5" width="6" height="38" fill="#2A3166" />
      <rect x="22" y="14" width="12" height="3.5" rx="1.75" fill="#FFFFFF" />
      <rect x="22" y="21" width="9" height="3.5" rx="1.75" fill="#FFFFFF" />
      <path d="M33 30l8-8 4 4-8 8-5 1z" fill="#FFC629" />
    </svg>
  );
}
