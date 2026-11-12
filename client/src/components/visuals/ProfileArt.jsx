// Flat drawing for the Profile focus block (Playbook redesign): a target
// with an arrow in it. Fixed block-palette colours, identical in light and
// dark. Decorative only.
export function TargetArt({ className = '' }) {
  return (
    <svg aria-hidden="true" width="120" height="120" viewBox="0 0 120 120" className={className}>
      <circle cx="60" cy="60" r="54" fill="#3A66FF" />
      <circle cx="60" cy="60" r="36" fill="#FFFFFF" />
      <circle cx="60" cy="60" r="20" fill="#FF6B4A" />
      <circle cx="60" cy="60" r="7" fill="#FFC629" />
      <path d="M60 60L22 98" stroke="#101533" strokeWidth="4" strokeLinecap="round" />
      <path d="M22 98l-2-12M22 98l12 2" stroke="#101533" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
