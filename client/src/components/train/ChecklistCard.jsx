import { CheckCircle2 } from 'lucide-react';

// "What to expect" checklist — a card-surface list of short benefit lines.
function ChecklistCard({ title, items }) {
  return (
    <div className="card-surface p-4">
      {title && <p className="text-xs font-bold text-slt uppercase tracking-widest mb-3">{title}</p>}
      <div className="space-y-2.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-teal-400 shrink-0 mt-0.5" />
            <p className="text-sm text-ink leading-snug">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChecklistCard;
