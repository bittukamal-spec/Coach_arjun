import { ArrowRight } from 'lucide-react';
import { CardWaves, RingMark } from '../visuals/CardArt';

// Train-card-specific gradient stops (approved mockup's blue/teal/amber/
// purple system). Deliberately its OWN token set, not GradientIconTile's
// GRADIENT_VARIANTS — that shared blue (brand → purple) is tuned for a
// small 40-56px icon tile elsewhere in the app (tool-intro headers), and
// stretching it across a full card made Ritual/Focus Card Builder read as
// blue-to-purple instead of the mockup's solid blue. Keeping a separate
// map here means this refresh never touches those other screens.
const CARD_GRADIENTS = {
  blue:   { from: '#1F85D0', to: '#0C4D85' },
  teal:   { from: '#2E7D6B', to: '#22D3C5' },
  amber:  { from: '#D97F1E', to: '#F5A62E' },
  purple: { from: '#6366F1', to: '#8B5CF6' },
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
        wide ? 'w-full min-h-[136px] p-5 flex items-center gap-4' : 'w-full h-full min-h-[212px] p-4 flex flex-col'
      } ${className}`}
    >
      <CardWaves className="text-white" opacity={0.16} />

      {Illustration && (
        <Illustration
          className={
            wide
              ? 'relative z-10 w-24 h-24 shrink-0 text-white/80 hidden xs:block'
              : 'absolute -right-3 -bottom-2 w-28 h-28 text-white/[0.16] pointer-events-none'
          }
        />
      )}

      <div className={wide ? 'relative z-10 flex-1 min-w-0' : 'relative z-10 flex flex-col h-full'}>
        <div className="w-11 h-11 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0 mb-3">
          <RingMark tone={from} size={20} />
        </div>
        <div className={wide ? '' : 'flex-1 pr-8'}>
          <h3 className="text-white font-black text-lg leading-tight mb-1 [text-wrap:pretty]">{title}</h3>
          <p className="text-white/85 text-[13px] leading-snug [text-wrap:pretty]">{desc}</p>
        </div>
      </div>

      <span className="absolute bottom-4 right-4 z-10 w-9 h-9 rounded-full bg-white/25 flex items-center justify-center" aria-hidden="true">
        <ArrowRight size={16} className="text-white" />
      </span>
    </button>
  );
}

export default TrainGradientCard;
