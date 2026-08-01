import { Link, useLocation } from 'react-router-dom';
import { Home, Dumbbell, MessageCircle, BookOpen, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';

// Order is fixed: Home · Train · Coach · Playbook · Profile.
// Profile points at the athlete's Performance Profile (`/starting-profile`),
// not Account/Settings — Account stays reachable from the Navbar avatar menu
// and its route is unchanged.
const NAV_ITEMS = [
  { icon: Home,          labelKey: 'home',     path: '/dashboard'        },
  { icon: Dumbbell,      labelKey: 'train',    path: '/train'            },
  { icon: MessageCircle, labelKey: 'coach',    path: '/coaching'         },
  { icon: BookOpen,      labelKey: 'playbook', path: '/playbook'         },
  { icon: User,          labelKey: 'profile',  path: '/starting-profile' },
];

function BottomNav() {
  const { pathname } = useLocation();
  const { language } = useAuth();
  const t = translations[language].nav;

  if (pathname.startsWith('/coaching')) return null;

  return (
    <nav
      // The bar keeps its 64px item row; the inset is added below it so the
      // last row of icons never sits under a home indicator.
      className="fixed bottom-0 inset-x-0 z-50 border-t pb-[env(safe-area-inset-bottom)]"
      style={{
        background: 'var(--nav-bar)',
        borderTopColor: 'var(--nav-hairline)',
      }}
    >
      <div className="flex items-stretch h-16 px-2 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ icon: Icon, labelKey, path }) => {
          const active = pathname === path || (path !== '/dashboard' && pathname.startsWith(path));
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center min-h-[48px] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
              style={{ '--tw-ring-color': 'var(--nav-fg-active)' }}
            >
              <div
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-colors"
                style={active ? { background: 'rgba(95, 168, 222, 0.14)' } : undefined}
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2.5 : 1.8}
                  style={{ color: active ? 'var(--nav-fg-active)' : 'var(--nav-fg-inactive)' }}
                  aria-hidden="true"
                />
                <span
                  className="text-[10px] font-semibold leading-none"
                  style={{ color: active ? 'var(--nav-fg-active)' : 'var(--nav-fg-inactive)' }}
                >
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
