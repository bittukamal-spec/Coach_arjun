import { ArjunLogo } from './ArjunLogo';

// The screen shown while the app opens (auth check in App.jsx). Same look as
// the plain-HTML splash in index.html, which shows before any JavaScript has
// loaded, so the hand-over is seamless: logo, name, one line, three dots.
export default function LaunchScreen({ tagline, loadingLabel }) {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center">
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <ArjunLogo size={88} />
        <p className="text-[30px] font-extrabold leading-none tracking-[-0.02em] text-brand-500">Arjun</p>
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
