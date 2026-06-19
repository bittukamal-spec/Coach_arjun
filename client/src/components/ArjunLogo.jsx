export function ArjunLogo({ size = 32, className = '' }) {
  const r = Math.round(size * 0.188);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Arjun logo"
    >
      <rect width="512" height="512" rx={96} fill="#7C3AED" />
      <path d="M 168 92 C 430 92 430 420 168 420"
            stroke="white" strokeWidth="28" fill="none" strokeLinecap="round" />
      <path d="M 196 182 C 268 202 268 308 196 328"
            stroke="white" strokeWidth="14" fill="none" strokeLinecap="round" opacity="0.5" />
      <line x1="86" y1="256" x2="376" y2="256" stroke="white" strokeWidth="22" strokeLinecap="round" />
      <polygon points="364,226 422,256 364,286" fill="white" />
      <line x1="112" y1="256" x2="80" y2="220" stroke="white" strokeWidth="16" strokeLinecap="round" />
      <line x1="112" y1="256" x2="80" y2="292" stroke="white" strokeWidth="16" strokeLinecap="round" />
    </svg>
  );
}
