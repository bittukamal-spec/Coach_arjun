import { Link } from 'react-router-dom';

// Square tool tile for the Tools rows (founder layout, Nov 2026): a flat
// colour block, the drawing at the top and the name at the bottom. The rows
// scroll sideways, so each tile has a fixed square size.
const TONES = {
  sky: 'bg-sky', mint: 'bg-mint', sun: 'bg-sun', coral: 'bg-coral', blush: 'bg-blush',
  brand: 'bg-brand-500 text-white', card: 'bg-dark-400 text-ink',
};

export default function ToolTile({ to, tone = 'sky', title, art, onClick, badge = null }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex aspect-square w-[42vw] max-w-[168px] shrink-0 snap-start flex-col justify-between rounded-[24px] p-3.5 text-inkblock active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${TONES[tone] || TONES.sky}`}
    >
      <span className="flex h-[58%] items-start justify-between gap-1">
        <span aria-hidden="true">{art}</span>
        {badge && <span className="rounded-full bg-inkblock px-2 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-white" data-testid="tool-badge">{badge}</span>}
      </span>
      <span className="block text-[16px] font-extrabold leading-tight [text-wrap:balance]">{title}</span>
    </Link>
  );
}
