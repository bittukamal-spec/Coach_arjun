import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';

const SPORT_ICONS = {
  cricket: '🏏', football: '⚽', badminton: '🏸', athletics: '🏃',
  wrestling: '🤼', boxing: '🥊', kabaddi: '🤸', tennis: '🎾',
  hockey: '🏑', swimming: '🏊', other: '🏅',
};

// Placeholder cards for features we'll build in the next steps
const UPCOMING = [
  { icon: '💬', labelKey: 'openCoach',    description: 'Chat with your AI mental performance coach' },
  { icon: '✅', labelKey: 'startCheckin', description: 'Rate your mood, focus, and confidence today' },
  { icon: '📈', labelKey: 'viewProgress', description: 'Charts of your mental performance over time' },
];

function Dashboard() {
  const { user, language, logout } = useAuth();
  const t = translations[language];
  const isPremium = user?.tier === 'premium';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 pt-24 pb-16 animate-fade-in">

        {/* Welcome header */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-2">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-14 h-14 rounded-full border-4 border-white shadow-md"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-brand-500 text-white text-2xl font-bold flex items-center justify-center shadow-md">
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-gray-400 text-sm">{t.dashboard.welcomeBack}</p>
              <h1 className="text-2xl font-bold text-gray-900">{user?.name}</h1>
            </div>
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
              isPremium
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-gray-100 text-gray-500 border border-gray-200'
            }`}>
              {isPremium ? '⭐ ' + t.dashboard.premiumTier : '🆓 ' + t.dashboard.freeTier}
            </span>
            {user?.sport && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-calm-50 text-calm-600 border border-calm-100">
                {SPORT_ICONS[user.sport] || '🏅'} {user.sport.charAt(0).toUpperCase() + user.sport.slice(1)}
              </span>
            )}
            {user?.experienceLevel && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                {user.experienceLevel.charAt(0).toUpperCase() + user.experienceLevel.slice(1)}
              </span>
            )}
          </div>
        </div>

        <p className="text-lg text-gray-600 mb-8">{t.dashboard.subtitle}</p>

        {/* Feature cards */}
        <div className="grid sm:grid-cols-3 gap-5 mb-10">
          {UPCOMING.map(({ icon, labelKey, description }) => (
            <div
              key={labelKey}
              className="card group hover:border-brand-200 hover:shadow-md transition-all cursor-not-allowed opacity-70"
            >
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{t.dashboard[labelKey]}</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">{description}</p>
              <span className="inline-block text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {t.dashboard.comingSoon}
              </span>
            </div>
          ))}
        </div>

        {/* Upgrade banner for free users */}
        {!isPremium && (
          <div className="card bg-gradient-to-r from-brand-500 to-brand-700 border-0 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="font-semibold text-white mb-1">🚀 {t.dashboard.upgradePrompt}</p>
                <p className="text-brand-100 text-sm">Unlimited AI coaching · All features · Cancel anytime</p>
              </div>
              <button className="bg-white text-brand-700 font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-brand-50 transition-colors whitespace-nowrap shrink-0">
                {t.dashboard.upgrade}
              </button>
            </div>
          </div>
        )}

        {/* Sign-out for mobile (Navbar hides it at small breakpoints) */}
        <div className="mt-8 sm:hidden">
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            {t.nav.signOut}
          </button>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
