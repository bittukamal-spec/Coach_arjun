import { ArrowRight } from 'lucide-react';
import { CardWaves, RingMark } from '../visuals/CardArt';

// Train-card-specific gradient stops (approved mockup's blue/teal/amber/
// purple system). Deliberately its OWN token set, not GradientIconTile's
// GRADIENT_VARIANTS — that shared blue (brand → purple) is tuned for a
// small 40-56px icon tile elsewhere in the app (tool-intro headers), and
// stretching it across a full card made Ritual/Focus Card Builder read as
// blue-to-purple instead of the mockup's solid blue. Keeping a separate
// map here means this refresh never touches those other screens.
// Contrast note: white card copy sits directly on these gradients, so each
// stop's luminance is what makes the text readable. Teal/amber/purple were
// measured failing WCAG AA at the real rendered text positions (description
// 2.0–3.6:1 against a 4.5 requirement). Each stop below is scaled down in
// HSL *lightness only* — hue and saturation are untouched — by the smallest
// amount that clears AA with a little margin, so the approved teal/amber/
// purple identity, the wave artwork and the silhouettes all read as before.
//
// The teal/amber/purple stops are set so that EVERY point along each
// gradient clears 4.5:1 against white, not just the spot the copy happens
// to occupy at one width — the wide Reflection banner in particular moves
// its text to a lighter part of the ramp as the viewport narrows, which is
// exactly how the original 360px failure appeared. Blue already passed at
// every real text position with margin and is deliberately untouched.
const CARD_GRADIENTS = {
  blue:   { from: '#1F85D0', to: '#0C4D85' },
  teal:   { from: '#225D4F', to: '#158178' },
  amber:  { from: '#AB6418', to: '#915A07' },
  purple: { from: '#5D60F0', to: '#8350F6' },
};

// Premium gradient practice card (Train redesign). Two layouts:
//  - tile (default): square-ish card for the 2-column groups (Ritual,
//    Pressure Reset, Quick Rep, Focus Card Builder).
//  - wide: full-width banner for Match & Practice Reflection, illustration
//    sitting to the right of the copy instead of bleeding off a corner.
// The whole card is the single interactive control — its title/desc supply
// the accessible name, matching the flat PracticeTile it replaces.
function TrainGradientCard({
  variant = 'blue', title, desc, onClick,
  Illustration, wide = false, className = '',
}) {
  const { from, to } = CARD_GRADIENTS[variant] || CARD_GRADIENTS.blue;
  const gradient = `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: gradient }}
      className={`relative overflow-hidden text-left rounded-3xl border border-transparent active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 elevation-card ${
        wide ? 'w-full min-h-[136px] p-5 flex items-center gap-4' : 'w-full min-h-[176px] p-4 flex flex-col'
      } ${className}`}
    >
      <CardWaves className="text-white" />

      {Illustration && (
        <Illustration
          className={
            wide
              ? 'relative z-10 w-24 h-24 shrink-0 text-white/80 hidden xs:block'
              : 'absolute -right-3 -bottom-2 w-28 h-28 text-white/[0.16] pointer-events-none'
          }
        />
      )}

      <div className={wide ? 'relative z-10 flex-1 min-w-0' : 'relative z-10 flex flex-col flex-1'}>
        <div className="w-11 h-11 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0 mb-3">
          <RingMark tone={from} size={20} />
        </div>
        {/* Mockup fidelity: the old fixed `pr-8` reserved arrow clearance
            across the FULL text column height, not just the one corner the
            arrow badge actually occupies — on the narrower tile cards
            (Quick Rep, Focus Card Builder) that alone forced the title and
            every line of the description into a needlessly narrow column.
            The arrow now sits in normal flow at the end of this same column
            (pushed down by mt-auto) instead of floating absolutely over the
            text, so it never needs dedicated padding and the copy gets the
            card's full width. */}
        <div className={wide ? '' : 'flex-1 min-w-0'}>
          <h3 className={`text-white font-black leading-tight mb-1 [text-wrap:pretty] ${wide ? 'text-lg' : 'text-base'}`}>{title}</h3>
          {/* Full-opacity white: at 85% the 13px description measured below
              WCAG AA on every non-blue card. Full white buys ~0.7:1 back,
              which keeps the gradients lighter/more vivid than darkening
              them further would have. */}
          <p className="text-white text-[13px] leading-snug [text-wrap:pretty]">{desc}</p>
        </div>
        {!wide && (
          <span className="relative z-10 w-9 h-9 rounded-full bg-white/25 flex items-center justify-center self-end mt-auto shrink-0" aria-hidden="true">
            <ArrowRight size={16} className="text-white" />
          </span>
        )}
      </div>

      {wide && (
        <span className="absolute bottom-4 right-4 z-10 w-9 h-9 rounded-full bg-white/25 flex items-center justify-center" aria-hidden="true">
          <ArrowRight size={16} className="text-white" />
        </span>
      )}
    </button>
  );
}

export default TrainGradientCard;
