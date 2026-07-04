import { HELPLINES } from '../constants/helplines';
import { useAuth } from '../contexts/AuthContext';

// Consistent tap-to-call helpline rows for every safety surface.
// `tone` tweaks text colors so it sits well on both themed and hardcoded-dark screens.
function HelplineList({ tone = 'default' }) {
  const { language } = useAuth();
  const hi = language === 'hi';

  const labelClass = tone === 'dark' ? 'text-white/80' : 'text-slt';
  const numberClass = tone === 'dark' ? 'text-white' : 'text-ink';

  return (
    <div className="space-y-2">
      {HELPLINES.map(h => (
        <a
          key={h.key}
          href={`tel:${h.tel}`}
          className={`flex items-center justify-between rounded-xl px-4 py-3 ${
            tone === 'dark' ? 'bg-white/10' : 'bg-dark-700 border border-dark-600'
          }`}
        >
          <span className={`text-sm font-medium ${labelClass}`}>{hi ? h.labelHi : h.label}</span>
          <span className={`text-sm font-bold tabular-nums ${numberClass}`}>{h.number}</span>
        </a>
      ))}
    </div>
  );
}

export default HelplineList;
