// Per-sport Home illustrations (Playbook redesign). Flat, geometric drawings
// on a 200x200 canvas, in the fixed block palette (blue, sun, coral, white,
// ink) so they look the same in light and dark. Decorative: the card's own
// text carries the meaning, so each drawing is aria-hidden.
//
// One entry per sport the onboarding offers; any other value (including a
// custom sport) falls back to the neutral medal.

const ART = {
  // Cricket stumps and ball
  cricket: (
    <>
      <circle cx="100" cy="100" r="92" fill="#3A66FF"/>
      <ellipse cx="104" cy="170" rx="66" ry="10" fill="#1238C9"/>
      <rect x="74" y="72" width="11" height="98" rx="5" fill="#FFC629"/>
      <rect x="99" y="72" width="11" height="98" rx="5" fill="#FFC629"/>
      <rect x="124" y="72" width="11" height="98" rx="5" fill="#FFC629"/>
      <rect x="72" y="63" width="30" height="9" rx="4.5" fill="#FFFFFF"/>
      <rect x="107" y="63" width="30" height="9" rx="4.5" fill="#FFFFFF"/>
      <circle cx="44" cy="52" r="19" fill="#FF6B4A"/>
      <path d="M32 42c10 4 15 11 17 25" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round"/>
      <path d="M20 84c10-5 18-13 23-24" fill="none" stroke="#9DB4FF" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 10"/>
    </>
  ),
  // Football and goal
  football: (
    <>
      <circle cx="100" cy="100" r="92" fill="#3A66FF"/>
      <ellipse cx="100" cy="170" rx="70" ry="10" fill="#1238C9"/>
      <path d="M52 168V70h100v98" fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M72 74v92M92 74v92M112 74v92M132 74v92M56 94h92M56 118h92M56 142h92" stroke="#9DB4FF" strokeWidth="2"/>
      <circle cx="62" cy="150" r="24" fill="#FFFFFF"/>
      <path d="M62 138l11 8-4 13H55l-4-13z" fill="#101533"/>
      <path d="M62 138v-10M73 146l10-4M69 159l6 9M55 159l-6 9M51 146l-10-4" stroke="#101533" strokeWidth="3" strokeLinecap="round"/>
      <path d="M22 132c8-2 12-6 14-12" fill="none" stroke="#FFC629" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9"/>
    </>
  ),
  // Badminton racket and shuttlecock
  badminton: (
    <>
      <circle cx="100" cy="100" r="92" fill="#3A66FF"/>
      <g transform="rotate(-32 88 96)">
      <ellipse cx="88" cy="74" rx="34" ry="42" fill="#5C82FF" stroke="#FFFFFF" strokeWidth="7"/>
      <path d="M70 44v60M82 36v76M94 36v76M106 44v60M58 62h60M56 76h64M58 90h60" stroke="#FFFFFF" strokeWidth="1.6"/>
      <rect x="84" y="116" width="8" height="34" fill="#FFFFFF"/>
      <rect x="81" y="148" width="14" height="36" rx="6" fill="#FFC629"/>
      </g>
      <path d="M150 44l22-10-6 34z" fill="#FFFFFF"/>
      <path d="M156 42l8 18M163 39l3 22" stroke="#9DB4FF" strokeWidth="2"/>
      <circle cx="150" cy="64" r="9" fill="#FF6B4A"/>
      <path d="M132 92c6-4 10-9 12-16" fill="none" stroke="#FFC629" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9"/>
    </>
  ),
  // Running track and hurdle
  athletics: (
    <>
      <circle cx="100" cy="100" r="92" fill="#3A66FF"/>
      <path d="M20 168c10-70 70-110 160-112" fill="none" stroke="#FF6B4A" strokeWidth="16" strokeLinecap="round"/>
      <path d="M44 176c10-56 60-88 138-90" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeDasharray="10 10"/>
      <path d="M70 182c10-40 48-62 112-64" fill="none" stroke="#FF6B4A" strokeWidth="16" strokeLinecap="round"/>
      <rect x="96" y="92" width="7" height="50" rx="3" fill="#101533"/>
      <rect x="146" y="80" width="7" height="50" rx="3" fill="#101533"/>
      <path d="M92 94l66-14v12l-66 14z" fill="#FFFFFF"/>
      <path d="M108 90.600l6 10.600M124 87.200l6 10.600M140 83.800l6 10.600" stroke="#101533" strokeWidth="4"/>
      <rect x="40" y="36" width="5" height="46" rx="2.5" fill="#FFFFFF"/>
      <path d="M45 38h30l-8 10 8 10H45z" fill="#FFC629"/>
    </>
  ),
  // Two wrestlers locked on a mat
  wrestling: (
    <>
      <circle cx="100" cy="100" r="92" fill="#3A66FF"/>
      <ellipse cx="100" cy="160" rx="78" ry="20" fill="#FFC629"/>
      <ellipse cx="100" cy="160" rx="52" ry="13" fill="#FF6B4A"/>
      <ellipse cx="100" cy="160" rx="16" ry="4" fill="#FFFFFF"/>
      <path d="M60 156L74 104l22-22" fill="none" stroke="#FFFFFF" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M140 156l-14-52-22-22" fill="none" stroke="#101533" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="86" cy="66" r="13" fill="#FFFFFF"/>
      <circle cx="114" cy="66" r="13" fill="#101533"/>
      <path d="M76 100l48 4M124 100l-48 4" stroke="#FFC629" strokeWidth="8" strokeLinecap="round"/>
    </>
  ),
  // Two boxing gloves in front of ring ropes
  boxing: (
    <>
      <circle cx="100" cy="100" r="92" fill="#3A66FF"/>
      <path d="M14 70h172M10 100h180M14 130h172" stroke="#9DB4FF" strokeWidth="4"/>
      <rect x="40" y="56" width="58" height="70" rx="26" fill="#FF6B4A"/>
      <ellipse cx="96" cy="100" rx="14" ry="20" fill="#D94A2B"/>
      <rect x="48" y="122" width="42" height="30" rx="6" fill="#FFFFFF"/>
      <path d="M48 134h42" stroke="#FF6B4A" strokeWidth="4"/>
      <rect x="110" y="76" width="54" height="66" rx="24" fill="#FFC629"/>
      <ellipse cx="112" cy="116" rx="13" ry="19" fill="#E5A800"/>
      <rect x="118" y="138" width="40" height="28" rx="6" fill="#FFFFFF"/>
      <path d="M118 150h40" stroke="#FFC629" strokeWidth="4"/>
    </>
  ),
  // Kabaddi court with a raider crossing towards a chain of defenders
  kabaddi: (
    <>
      <circle cx="100" cy="100" r="92" fill="#3A66FF"/>
      <rect x="30" y="44" width="140" height="112" rx="10" fill="#FF6B4A"/>
      <path d="M100 44v112" stroke="#FFFFFF" strokeWidth="4"/>
      <path d="M128 44v112M72 44v112" stroke="#FFFFFF" strokeWidth="2" strokeDasharray="6 6"/>
      <path d="M30 60h140M30 140h140" stroke="#FFB8A6" strokeWidth="2"/>
      <circle cx="84" cy="100" r="11" fill="#FFC629"/>
      <path d="M46 100h22" stroke="#FFC629" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 8"/>
      <path d="M148 70c-8 12-8 48 0 60" fill="none" stroke="#101533" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="148" cy="70" r="9" fill="#FFFFFF"/>
      <circle cx="142" cy="90" r="9" fill="#FFFFFF"/>
      <circle cx="142" cy="110" r="9" fill="#FFFFFF"/>
      <circle cx="148" cy="130" r="9" fill="#FFFFFF"/>
    </>
  ),
  // Tennis racket and ball
  tennis: (
    <>
      <circle cx="100" cy="100" r="92" fill="#3A66FF"/>
      <g transform="rotate(28 104 100)">
      <ellipse cx="104" cy="74" rx="40" ry="46" fill="#5C82FF" stroke="#FFFFFF" strokeWidth="9"/>
      <path d="M82 40v68M96 32v84M112 32v84M126 40v68M68 58h72M66 74h76M68 90h72" stroke="#FFFFFF" strokeWidth="1.8"/>
      <path d="M96 118l8 16 8-16" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinejoin="round"/>
      <rect x="96" y="132" width="16" height="48" rx="7" fill="#FF6B4A"/>
      </g>
      <circle cx="46" cy="140" r="21" fill="#FFC629"/>
      <path d="M30 128c12 4 18 14 16 32" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M58 122c-2 12 4 22 9 26" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round"/>
    </>
  ),
  // Hockey stick, ball and goal
  hockey: (
    <>
      <circle cx="100" cy="100" r="92" fill="#3A66FF"/>
      <ellipse cx="100" cy="168" rx="70" ry="10" fill="#1238C9"/>
      <path d="M108 164V104h60v60" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="112" y="140" width="52" height="22" fill="#FF6B4A"/>
      <path d="M122 108v32M138 108v32M154 108v32M112 122h52" stroke="#9DB4FF" strokeWidth="2"/>
      <path d="M132 30L70 146c-6 12-26 12-30 0" fill="none" stroke="#FFC629" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M132 30l-16 30" stroke="#101533" strokeWidth="13" strokeLinecap="round"/>
      <circle cx="84" cy="156" r="12" fill="#FFFFFF"/>
      <path d="M64 170c-6 2-12 2-18 0" fill="none" stroke="#9DB4FF" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 8"/>
    </>
  ),
  // Swimmer in a pool lane
  swimming: (
    <>
      <circle cx="100" cy="100" r="92" fill="#3A66FF"/>
      <path d="M12 76h176" stroke="#FFC629" strokeWidth="7" strokeDasharray="14 8"/>
      <path d="M8 150h184" stroke="#FF6B4A" strokeWidth="7" strokeDasharray="14 8"/>
      <path d="M24 122c12-12 24-12 36 0s24 12 36 0 24-12 36 0 24 12 36 0" fill="none" stroke="#9DB4FF" strokeWidth="5" strokeLinecap="round"/>
      <path d="M78 110c14-34 40-42 68-30" fill="none" stroke="#FFFFFF" strokeWidth="13" strokeLinecap="round"/>
      <circle cx="74" cy="106" r="19" fill="#FFFFFF"/>
      <path d="M57 98c8-14 26-14 34 0z" fill="#FF6B4A"/>
      <rect x="60" y="100" width="28" height="9" rx="4.5" fill="#101533"/>
      <path d="M28 104c8-8 16-8 22 0" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round"/>
    </>
  ),
  // Medal on a ribbon
  other: (
    <>
      <circle cx="100" cy="100" r="92" fill="#3A66FF"/>
      <path d="M66 22l28 62h-26L44 22z" fill="#FF6B4A"/>
      <path d="M134 22l-28 62h26l24-62z" fill="#FFFFFF"/>
      <circle cx="100" cy="124" r="48" fill="#FFC629"/>
      <circle cx="100" cy="124" r="36" fill="#FFE08A"/>
      <path d="M100 98l8 17 18 2-13 13 3 18-16-9-16 9 3-18-13-13 18-2z" fill="#101533"/>
    </>
  ),
};

export const SPORT_ART_KEYS = Object.keys(ART);

export function sportArtKey(sport) {
  const key = String(sport || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ART, key) ? key : 'other';
}

export default function SportArt({ sport, size = 150, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      data-sport-art={sportArtKey(sport)}
    >
      {ART[sportArtKey(sport)]}
    </svg>
  );
}
