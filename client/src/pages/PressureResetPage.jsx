import { useNavigate } from 'react-router-dom';
import { Target, RotateCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import Navbar from '../components/Navbar';

export default function PressureResetPage() {
  const { language } = useAuth();
  const t = translations[language].pressureReset;
  const navigate = useNavigate();

  function go(sessionType) {
    navigate('/coaching', { state: { sessionType } });
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <main className="max-w-lg mx-auto pt-20 pb-24 px-4 animate-fade-in">
        <h1 className="text-xl font-bold text-ink mb-1">{t.pageTitle}</h1>
        <p className="text-sm text-slt mb-6">{t.pageSubtitle}</p>

        <div className="flex flex-col gap-3">
          {/* Card 1 — Pre-match reset */}
          <button
            onClick={() => go('pressure_reset')}
            className="flex items-center gap-4 bg-dark-800 border border-dark-600 hover:border-brand-500/50 hover:bg-dark-700 active:scale-[0.98] rounded-2xl p-5 text-left transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
              <Target size={22} className="text-brand-400" />
            </div>
            <div>
              <p className="font-semibold text-ink text-base leading-tight">{t.preMatchLabel}</p>
              <p className="text-sm text-slt mt-1">{t.preMatchSubtitle}</p>
            </div>
          </button>

          {/* Card 2 — Bounce back */}
          <button
            onClick={() => go('setback_reset')}
            className="flex items-center gap-4 bg-dark-800 border border-dark-600 hover:border-fire-500/50 hover:bg-dark-700 active:scale-[0.98] rounded-2xl p-5 text-left transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-fire-500/15 flex items-center justify-center shrink-0">
              <RotateCcw size={22} className="text-fire-400" />
            </div>
            <div>
              <p className="font-semibold text-ink text-base leading-tight">{t.setbackLabel}</p>
              <p className="text-sm text-slt mt-1">{t.setbackSubtitle}</p>
            </div>
          </button>
        </div>

        {/* Secondary link — breathing exercise */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/breathing')}
            className="text-sm text-slt hover:text-brand-400 transition-colors"
          >
            {t.breathingLink} →
          </button>
        </div>
      </main>
    </div>
  );
}
