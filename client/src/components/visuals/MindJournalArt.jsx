// Colour illustration for the Dashboard Mind Journal CTA (approved mockup):
// a closed navy journal with an "A" emblem, a pen laid across it, a ribbon
// bookmark, and a soft laurel-sprig motif beneath. Purely decorative.
// `accentColor` (the reflection/journal amber token, --accent-amber) tints
// the ribbon and pen cap — the one warm highlight against the navy journal.
function MindJournalArt({ className = '', accentColor = '#E2711D' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      {/* laurel sprigs */}
      <g stroke="#94A3B8" strokeWidth="2.5" fill="none" opacity="0.55">
        <path d="M30 100 q-14 -6 -16 -22" strokeLinecap="round" />
        <path d="M18 84 q-5 -2 -7 2 M20 90 q-5 -1 -8 3 M23 96 q-5 0 -7 4" strokeLinecap="round" />
        <path d="M90 100 q14 -6 16 -22" strokeLinecap="round" />
        <path d="M102 84 q5 -2 7 2 M100 90 q5 -1 8 3 M97 96 q5 0 7 4" strokeLinecap="round" />
      </g>

      {/* journal shadow */}
      <ellipse cx="60" cy="102" rx="30" ry="5" fill="#0F172A" opacity="0.10" />

      {/* journal body */}
      <rect x="30" y="26" width="60" height="76" rx="6" fill="#173B63" />
      <rect x="30" y="26" width="10" height="76" rx="5" fill="#0F2A47" />
      <rect x="70" y="34" width="4" height="60" fill="#3E6DA0" opacity="0.7" />

      {/* emblem */}
      <circle cx="55" cy="52" r="11" fill="#3E6DA0" opacity="0.5" />
      <text x="55" y="57" textAnchor="middle" fontSize="13" fontWeight="700" fill="#F8FAFC" fontFamily="Poppins, sans-serif">A</text>

      {/* ribbon bookmark */}
      <path d="M78 26 v20 l-5 -5 -5 5 v-20 z" fill={accentColor} />

      {/* pen */}
      <rect x="46" y="90" width="46" height="7" rx="3.5" fill="#0F172A" transform="rotate(-14 46 90)" />
      <rect x="86" y="80" width="10" height="7" rx="2" fill={accentColor} transform="rotate(-14 86 80)" />
    </svg>
  );
}

export default MindJournalArt;
