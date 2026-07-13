import { Activity, MessageSquare, Users, CheckSquare, ShieldAlert } from 'lucide-react';

const TABS = [
  { id: 'pulse',  icon: Activity,      label: 'Pulse'   },
  { id: 'prompt', icon: MessageSquare, label: 'Prompt'  },
  { id: 'coach',  icon: Users,         label: 'Coach'   },
  { id: 'build',  icon: CheckSquare,   label: 'Build'   },
  { id: 'safety', icon: ShieldAlert,   label: 'Safety'  },
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
