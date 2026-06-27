import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { Target, Zap, TrendingUp, Sun, Wind, RotateCcw, Trophy, ClipboardList, Gamepad2, ChevronRight, Eye } from 'lucide-react';

export default function TrainPage() {
  const navigate = useNavigate();
  const { language } = useAuth();
  const t = translations[language].train;
  const hi = language === 'hi';

  const SITUATIONS = [
    {
      icon: Target,
      label: t.beforeLabel,
      sub:   t.beforeSub,
      session: 'match_prep',
      color: 'text-brand-600',
      bg: 'bg-brand-50 border-brand-100',
    },
    {
      icon: Zap,
      label: t.duringLabel,
      sub:   t.duringSub,
      session: 'focus_reset',
      color: 'text-fire-600',
      bg: 'bg-fire-300/10 border-fire-300/30',
    },
    {
      icon: TrendingUp,
      label: t.afterLabel,
      sub:   t.afterSub,
      session: 'post_match',
      color: 'text-win-600',
      bg: 'bg-win-300/10 border-win-300/30',
    },
    {
      icon: Sun,
      label: t.dailyLabel,
      sub:   t.dailySub,
      session: 'general',
      color: 'text-amber-600',
      bg: 'bg-amber-50 border-amber-100',
    },
  ];

  const TOOLS = [
    { Icon: Wind,          label: hi ? 'श्वास'         : 'Breathing',      to: '/breathing' },
    { Icon: RotateCcw,     label: hi ? 'प्रेशर रीसेट' : 'Pressure Reset', to: '/reset'     },
    { Icon: Trophy,        label: hi ? 'रिचुअल'       : 'Ritual',         to: '/ritual'    },
    { Icon: ClipboardList, label: hi ? 'डीब्रीफ'       : 'Debrief',        to: '/debrief'   },
  ];

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-lg mx-auto px-4 pt-20 pb-24 animate-fade-in">

        {/* Train by Situation */}
        <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-3 mt-4">
          {t.situTitle}
        </p>
        <div className="grid grid-cols-2 gap-3 mb-8">
          {SITUATIONS.map(({ icon: Icon, label, sub, session, color, bg }) => (
            <button
              key={session}
              onClick={() => navigate('/coaching', { state: { sessionType: session } })}
              className={`bg-white border rounded-2xl p-4 text-left active:scale-95 transition-transform shadow-sm hover:shadow-md ${bg}`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${bg}`}>
                <Icon size={18} className={color} />
              </div>
              <p className="font-semibold text-ink text-sm leading-tight mb-1">{label}</p>
              <p className="text-[11px] text-slt leading-tight">{sub}</p>
            </button>
          ))}
        </div>

        {/* Mental Tools */}
        <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-3">
          {t.toolsTitle}
        </p>
        <div className="grid grid-cols-4 gap-2 mb-8">
          {TOOLS.map(({ Icon, label, to }) => (
            <Link key={to} to={to}>
              <div className="bg-white border border-dark-600 rounded-2xl p-3 flex flex-col items-center gap-2 active:scale-95 transition-transform shadow-sm text-center">
                <Icon size={20} className="text-brand-500" />
                <span className="text-[10px] font-medium text-slt leading-tight">{label}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Prepare your mind */}
        <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-3">
          {hi ? 'मन तैयार करो' : 'Prepare your mind'}
        </p>
        <Link to="/visualization">
          <div className="bg-white border border-dark-600 rounded-2xl p-4 flex items-center justify-between active:scale-[0.99] transition-transform shadow-sm hover:shadow-md mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Eye size={20} className="text-[#185FA5]" />
              </div>
              <div>
                <p className="font-semibold text-ink text-sm">{hi ? 'विज़ुअलाइज़ेशन' : 'Visualization'}</p>
                <p className="text-xs text-slt">{hi ? 'मैच से पहले mental rep' : 'Mental rep before your match'}</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slt shrink-0" />
          </div>
        </Link>

        {/* Focus Games */}
        <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-3">
          {t.gamesTitle}
        </p>
        <Link to="/games">
          <div className="bg-white border border-dark-600 rounded-2xl p-4 flex items-center justify-between active:scale-[0.99] transition-transform shadow-sm hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
                <Gamepad2 size={20} className="text-brand-600" />
              </div>
              <div>
                <p className="font-semibold text-ink text-sm">{hi ? 'फोकस गेम्स' : 'Focus Games'}</p>
                <p className="text-xs text-slt">{t.gamesDesc}</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slt shrink-0" />
          </div>
        </Link>

      </main>
    </div>
  );
}
