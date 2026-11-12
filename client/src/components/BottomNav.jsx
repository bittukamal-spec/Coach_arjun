import { Link, useLocation } from 'react-router-dom';
import { Home, Dumbbell, MessageCircle, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';

// Order is fixed: Home · Train · Coach · Profile.
// Profile points at the athlete's Performance Profile (`/starting-profile`),
// not Account/Settings — Account stays reachable from the Navbar avatar menu
// and its route is unchanged.
const NAV_ITEMS = [
  { icon: Home,          labelKey: 'home',    path: '/dashboard'        },
  { icon: Dumbbell,      labelKey: 'train',   path: '/train'            },
  { icon: MessageCircle, labelKey: 'coach',   path: '/coaching'         },
  { icon: User,          labelKey: 'profile', path: '/starting-profile' },
];

function BottomNav() {
  const { pathname } = useLocation();
  const { language } = useAuth();
  const t = translations[language].nav;

  if (pathname.startsWith('/coaching')) return null;

  return (
    <nav
      // A floating pill: the bar sits above the page with a gutter on each
      // side, and the safe-area inset is added below it so it never sits
      // under a home indicator. The wrapper ignores taps so the page beside
      // and below the pill stays usable.
      className="fixed bottom-0 inset-x-0 z-50 px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pointer-events-none"
    >
      <div
        className="pointer-events-auto flex items-stretch h-16 px-1.5 max-w-lg mx-auto rounded-3xl elevation-row"
        style={{ background: 'var(--nav-bar)' }}
      >
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
                className="flex flex-col items-center justify-center gap-0.5 w-full mx-1 h-12 rounded-[18px] transition-colors"
                style={active ? { background: 'var(--nav-fg-active)' } : undefined}
              >
                <Icon
                  size={19}
                  strokeWidth={active ? 2.6 : 1.9}
                  style={{ color: active ? 'var(--nav-on-active)' : 'var(--nav-fg-inactive)' }}
                  aria-hidden="true"
                />
                <span
                  className={`text-[10.5px] leading-none ${active ? 'font-extrabold' : 'font-semibold'}`}
                  style={{ color: active ? 'var(--nav-on-active)' : 'var(--nav-fg-inactive)' }}
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
