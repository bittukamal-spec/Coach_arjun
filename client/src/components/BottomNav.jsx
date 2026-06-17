import { Link, useLocation } from 'react-router-dom';
import { Home, CheckSquare, MessageCircle, TrendingUp, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';

const NAV_ITEMS = [
  { icon: Home,          labelKey: 'home',     path: '/dashboard' },
  { icon: CheckSquare,   labelKey: 'checkin',  path: '/checkin'   },
  { icon: MessageCircle, labelKey: 'coach',    path: '/coaching'  },
  { icon: TrendingUp,    labelKey: 'progress', path: '/progress'  },
  { icon: User,          labelKey: 'profile',  path: '/account'   },
];

function BottomNav() {
  const { pathname } = useLocation();
  const { language } = useAuth();
  const t = translations[language].nav;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 sm:hidden bg-dark-800/95 backdrop-blur-md border-t border-dark-600">
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map(({ icon: Icon, labelKey, path }) => {
          const active = pathname === path || (path !== '/dashboard' && pathname.startsWith(path));
          return (
            <Link
              key={path}
              to={path}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-brand-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 bg-brand-500 rounded-full -mt-px" />
              )}
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium leading-none">{t[labelKey]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default BottomNav;
