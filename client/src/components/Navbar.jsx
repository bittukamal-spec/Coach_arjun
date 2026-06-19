import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { ArjunLogo } from './ArjunLogo';

function Navbar() {
  const { user, language, toggleLanguage } = useAuth();
  const t = translations[language];

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-dark-900/95 backdrop-blur-md border-b border-dark-600">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <ArjunLogo size={30} />
          <span className="font-bold text-lg tracking-tight">
            <span className="text-brand-400">A</span><span className="text-white">rjun</span>
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleLanguage}
            className="text-sm font-medium text-slate-400 hover:text-brand-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-dark-700"
          >
            {t.common.langToggle}
          </button>

          {user && (
            <div className="w-8 h-8 rounded-full bg-brand-500 text-white text-sm font-bold flex items-center justify-center ring-2 ring-brand-700">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
