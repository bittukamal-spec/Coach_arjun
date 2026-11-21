import Teer from './Teer';

// Teer on a soft glow — the drawing at the top of a feature or empty screen,
// and on "done" screens (Premium plan, Step 7). Decorative. Size comes from
// `className` on the wrapper (a clamp() height keeps it right on short phones).
const GLOW = {
  white: 'bg-[radial-gradient(circle,rgba(255,255,255,0.8)_0%,rgba(255,255,255,0)_70%)]',
  mint: 'bg-[radial-gradient(circle,rgba(127,227,196,0.95)_0%,rgba(127,227,196,0)_70%)]',
  blue: 'bg-[radial-gradient(circle,rgba(27,77,255,0.16)_0%,rgba(27,77,255,0)_70%)]',
};
const MOTION = { breathe: 'calm', cheer: 'hop' };

export default function MascotArt({ pose = 'idle', glow = 'white', className = 'h-[clamp(130px,23dvh,200px)]' }) {
  return (
    <div className={`relative mx-auto flex items-end justify-center ${className}`}>
      <span aria-hidden="true" className={`absolute bottom-0 aspect-square h-[105%] rounded-full motion-safe:animate-glow ${GLOW[glow] || GLOW.white}`} />
      <Teer pose={pose} fluid motion={MOTION[pose] || 'float'} eager className="relative h-[92%] w-auto drop-shadow-[0_12px_18px_rgba(16,21,51,0.15)]" />
    </div>
  );
}
