import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { translations } from '../i18n/translations';
import { ArjunWordmark } from './ArjunLogo';
import { User, ChevronDown, Bell } from 'lucide-react';

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

function Navbar() {
  const { user, language, toggleLanguage, avatarUrl } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const t = translations[language].nav;
  // Reads the SAME server-preference-backed status Account's own toggle
  // uses (see usePushNotifications.js) — never inferred from browser
  // Notification permission alone, and never a second state source. This
  // is a status/shortcut surface only: no enable/disable/permission logic
  // lives here, that stays entirely in Account.
  const push = usePushNotifications();
  const pushOn = push.status === 'enabled';

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-dark-900">
      <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
        {/* Logo */}
        <ArjunWordmark size="compact" />

        {/* Avatar + dropdown */}
        {user && (
          <div className="relative" ref={menuRef}>
            {/* >=44px hit area around the 32px avatar circle: the mark keeps
                its size, the target stays above the minimum. Width is
                intrinsic (avatar + chevron), not fixed, so the added
                chevron indicator stays part of the same single tap target
                rather than shrinking the avatar's own hit area. Deliberately
                NOT given an aria-label here — this menu is the Settings
                entry point, and naming it "Profile" would collide with the
                approved Profile-vs-Settings distinction the bottom nav owns. */}
            <button
              onClick={() => setMenuOpen(v => !v)}
              aria-expanded={menuOpen}
              className="h-11 -mr-1.5 pl-1.5 pr-2.5 flex items-center justify-center gap-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <span className="w-8 h-8 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center ring-2 ring-brand-700 hover:bg-brand-600 transition-colors overflow-hidden">
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="w-8 h-8 object-cover" />
                  : getInitials(user.name)
                }
              </span>
              {/* Decorative only — aria-expanded on the button above is the
                  real accessibility signal; this just makes "this opens a
                  menu" visually obvious next to the avatar. */}
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={`text-slt shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 bg-dark-800 border border-dark-600 rounded-2xl shadow-card w-52 z-50 overflow-hidden animate-fade-in">
                {/* Language toggle */}
                <div className="px-4 py-3 border-b border-dark-700">
                  <p className="text-[11px] text-slt font-medium mb-2">
                    {t.language}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { if (language !== 'en') toggleLanguage(); setMenuOpen(false); }}
                      className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-colors ${
                        language === 'en' ? 'bg-brand-500 text-white' : 'bg-dark-700 text-slt hover:text-ink'
                      }`}
                    >
                      EN
                    </button>
                    <button
                      onClick={() => { if (language !== 'hi') toggleLanguage(); setMenuOpen(false); }}
                      className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-colors ${
                        language === 'hi' ? 'bg-brand-500 text-white' : 'bg-dark-700 text-slt hover:text-ink'
                      }`}
                    >
                      हि
                    </button>
                  </div>
                </div>
                {/* Theme toggle */}
                <div className="px-4 py-3 border-b border-dark-700">
                  <p className="text-[11px] text-slt font-medium mb-2">
                    {t.theme}
                  </p>
                  <div className="flex gap-1 bg-dark-700 rounded-lg p-0.5">
                    {[
                      { v: 'system', label: t.themeAuto },
                      { v: 'light',  label: t.themeLight },
                      { v: 'dark',   label: t.themeDark },
                    ].map(opt => (
                      <button
                        key={opt.v}
                        onClick={() => setTheme(opt.v)}
                        className={`flex-1 py-1 text-[11px] rounded-md font-semibold transition-colors ${
                          theme === opt.v ? 'bg-dark-400 text-ink shadow-sm' : 'text-slt hover:text-ink'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Notifications shortcut — status/navigation only. Never
                    the permission/toggle flow itself (that stays entirely
                    in Account's own Notifications section, which this
                    links straight to). Status text ("On"/"Off") carries
                    the state, not color alone. */}
                <button
                  onClick={() => { navigate('/account#notifications'); setMenuOpen(false); }}
                  className="w-full px-4 py-3 text-left hover:bg-dark-700 transition-colors flex items-center gap-3 border-b border-dark-700"
                  aria-label={`${t.notifications} — ${pushOn ? t.notificationsOn : t.notificationsOff}`}
                >
                  <Bell size={14} className="text-slt shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{t.notifications}</span>
                      <span className={`text-[11px] font-semibold shrink-0 ${pushOn ? 'text-win-400' : 'text-slt'}`}>
                        {pushOn ? t.notificationsOn : t.notificationsOff}
                      </span>
                    </span>
                    <span className="block text-[11px] text-slt font-normal mt-0.5">{t.notificationsSub}</span>
                  </span>
                </button>
                {/* Settings link — opens /account. Labelled "Settings", not
                    "Profile": the bottom nav's Profile tab now points at
                    /starting-profile, so the two labels must stay distinct. */}
                <button
                  onClick={() => { navigate('/account'); setMenuOpen(false); }}
                  className="w-full px-4 py-3 text-left text-sm font-medium text-ink hover:bg-dark-700 transition-colors flex items-center gap-3"
                >
                  <User size={14} className="text-slt shrink-0" />
                  {t.settings}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
