// A soft photo scene behind the top of a page, fading into the page colour.
// Scenes live in public/backgrounds/ (founder-supplied, Nov 2026). A small copy
// is used on phones, the full one on wider screens. Purely decorative.
//
// `fadeTo` is a Tailwind "to-" colour class matching the page underneath
// (default the page token, so it works in light and dark).

export const SCENES = ['track-sunrise', 'court', 'lake', 'stadium-dusk'];

export default function SceneBackdrop({
  scene = 'track-sunrise',
  height = 'h-[560px]',
  position = 'center',
  fadeTo = 'to-dark-900',
  fadeVia = 'via-transparent',
  dim = false,
  className = '',
}) {
  const base = `/backgrounds/bg-${scene}`;
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden ${height} ${className}`}>
      <picture>
        <source media="(min-width: 700px)" srcSet={`${base}.webp`} />
        <img
          src={`${base}-sm.webp`}
          alt=""
          decoding="async"
          className="scene-photo h-full w-full object-cover"
          style={{ objectPosition: position }}
        />
      </picture>
      {dim && <div className="absolute inset-0 bg-inkblock/30" />}
      <div className={`absolute inset-0 bg-gradient-to-b from-transparent ${fadeVia} ${fadeTo}`} />
    </div>
  );
}
