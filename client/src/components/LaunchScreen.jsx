import Teer from './visuals/Teer';

// The screen shown while the app opens (auth check in App.jsx). Same look as
// the plain-HTML splash in index.html, which shows before any JavaScript has
// loaded, so the hand-over is seamless: Teer waving on a soft glow, name, one
// line, three dots.
export const LAUNCH_GLOW =
  'radial-gradient(120% 60% at 50% 0%, rgba(255,186,140,0.32) 0%, rgba(255,186,140,0) 60%), ' +
  'radial-gradient(90% 55% at 50% 100%, rgba(27,77,255,0.16) 0%, rgba(27,77,255,0) 70%)';

export default function LaunchScreen({ tagline, loadingLabel }) {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center" style={{ backgroundImage: LAUNCH_GLOW }}>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="relative flex h-[200px] w-[200px] items-end justify-center">
          <span aria-hidden="true" className="absolute top-3 h-[180px] w-[180px] rounded-full bg-dark-400/70" />
          <Teer pose="wave" height={190} motion="float" eager className="relative" />
        </div>
        <p className="mt-2 text-[30px] font-extrabold leading-none tracking-[-0.02em] text-brand-500">Arjun</p>
        <p className="text-[15px] font-semibold text-slt">{tagline}</p>
      </div>
      <div
        role="status"
        aria-label={loadingLabel}
        className="flex gap-2 pb-[calc(6rem+env(safe-area-inset-bottom))]"
      >
        {[0, 150, 300].map(delay => (
          <span
            key={delay}
            aria-hidden="true"
            className="w-[9px] h-[9px] rounded-full bg-brand-500 animate-launch-dot"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
