import { Link, useLocation } from 'react-router-dom';
import { Home, ClipboardCheck, MessageCircle, Gamepad2, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';

const NAV_ITEMS = [
  { icon: Home,           labelKey: 'home',     path: '/dashboard' },
  { icon: ClipboardCheck, labelKey: 'checkin',  path: '/checkin'   },
  { icon: MessageCircle,  labelKey: 'coach',    path: '/coaching'  },
  { icon: Gamepad2,       labelKey: 'games',    path: '/games'     },
  { icon: TrendingUp,     labelKey: 'progress', path: '/progress'  },
];

function BottomNav() {
  const { pathname } = useLocation();
  const { language } = useAuth();
  const t = translations[language].nav;

  if (pathname.startsWith('/coaching') || pathname.startsWith('/sessions')) return null;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 sm:hidden bg-dark-800/95 backdrop-blur-md border-t border-dark-600">
      <div className="flex items-stretch h-16 px-1">
        {NAV_ITEMS.map(({ icon: Icon, labelKey, path }) => {
          const active = pathname === path || (path !== '/dashboard' && pathname.startsWith(path));
          return (
            <Link
              key={path}
              to={path}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
            >
              <div className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${
                active ? 'bg-brand-500/15' : ''
              }`}>
                <Icon
                  size={20}
                  strokeWidth={active ? 2.5 : 1.8}
                  className={active ? 'text-brand-600' : 'text-slt'}
                />
                <span className={`text-[10px] font-medium leading-none ${active ? 'text-brand-600' : 'text-slt'}`}>
                  {t[labelKey]}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default BottomNav;
