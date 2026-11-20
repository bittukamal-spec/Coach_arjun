// Teer — Arjun's mascot (3D renders made by the founder, Nov 2026).
// Images live in public/brand/teer/. Decorative by default (alt="").
// `motion` adds a gentle loop; motion-safe: so it stays still for people who
// turn off animations on their phone.

export const TEER_POSES = ['idle', 'wave', 'think', 'breathe', 'point', 'cheer', 'notes', 'head'];

// Natural size of each image (width / height), so the browser reserves space.
const RATIO = {
  idle: 229 / 354, wave: 277 / 354, think: 232 / 353, breathe: 294 / 348,
  point: 296 / 357, cheer: 303 / 357, notes: 271 / 357, head: 277 / 316,
};

const MOTION = {
  float: 'motion-safe:animate-float',
  hop: 'motion-safe:animate-hop origin-bottom',
  calm: 'motion-safe:animate-calm origin-bottom',
  // A small wave/bob that plays twice, then stops (Home's Talk to Arjun card).
  twice: 'motion-safe:animate-nudge-twice origin-bottom',
  none: '',
};

// `fluid`: size comes from className (e.g. a clamp() height + w-auto) instead of `height`.
export default function Teer({ pose = 'idle', height = 200, motion = 'none', alt = '', className = '', eager = false, fluid = false }) {
  const safePose = RATIO[pose] ? pose : 'idle';
  const width = Math.round(height * RATIO[safePose]);
  return (
    <img
      src={`/brand/teer/teer-${safePose}.webp`}
      width={width}
      height={height}
      alt={alt}
      aria-hidden={alt ? undefined : 'true'}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable="false"
      className={`select-none ${MOTION[motion] || ''} ${className}`}
      style={fluid ? undefined : { width, height }}
    />
  );
}
