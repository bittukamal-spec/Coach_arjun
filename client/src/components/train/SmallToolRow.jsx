import { ChevronRight } from 'lucide-react';
import GradientIconTile from './GradientIconTile';

// Compact stacked row for a secondary Train tool — icon, title, one-line
// description, chevron. Whole row is tappable.
function SmallToolRow({ icon, variant = 'blue', title, desc, onClick }) {
  return (
    <button onClick={onClick} className="card-elevated w-full p-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform">
      <GradientIconTile icon={icon} variant={variant} className="w-10 h-10 rounded-lg" size={18} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink leading-tight">{title}</p>
        <p className="text-xs text-slt leading-snug mt-0.5 truncate">{desc}</p>
      </div>
      <ChevronRight size={16} className="text-muted shrink-0" />
    </button>
  );
}

export default SmallToolRow;
