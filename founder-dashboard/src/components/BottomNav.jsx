import { TrendingUp, ShieldAlert, Send } from 'lucide-react';

// Operational sections only — Pilot, Safety, Comms, in this order. Pulse,
// Prompt, Coach, and Build were removed in the founder dashboard declutter.
const TABS = [
  { id: 'pilot',  icon: TrendingUp,    label: 'Pilot'   },
  { id: 'safety', icon: ShieldAlert,   label: 'Safety'  },
  { id: 'comms',  icon: Send,          label: 'Comms'   },
];

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1E293B] border-t border-[#334155] flex safe-pb">
      {TABS.map(({ id, icon: Icon, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex-1 flex flex-col items-center gap-0.5 py-3 transition-colors"
            style={{ color: isActive ? '#1769AA' : '#64748B' }}
          >
            <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
