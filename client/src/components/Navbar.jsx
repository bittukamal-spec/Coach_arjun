import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';

function Navbar() {
  const { user, language, logout, toggleLanguage } = useAuth();
  const t = translations[language];

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          <span className="font-bold text-gray-900 text-lg tracking-tight">MindGame</span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-brand-50"
          >
            {t.common.langToggle}
          </button>

          {/* User avatar + sign out */}
          {user && (
            <div className="flex items-center gap-3">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-8 h-8 rounded-full border-2 border-brand-100"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-500 text-white text-sm font-semibold flex items-center justify-center">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                onClick={logout}
                className="hidden sm:block text-sm font-medium text-gray-500 hover:text-red-500 transition-colors"
              >
                {t.nav.signOut}
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
