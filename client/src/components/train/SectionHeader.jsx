// Uppercase, letter-spaced section label used across Train and tool-intro
// screens. Thin wrapper over the shared .section-label token so every
// section heading in the app stays visually identical by construction.
function SectionHeader({ children, className = '' }) {
  return <p className={`section-label ${className}`}>{children}</p>;
}

export default SectionHeader;
