import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import {
  Target, TrendingUp, Sun, Wind, RotateCcw, Trophy,
  ClipboardList, Gamepad2, ChevronRight, Eye, Shield, Dumbbell,
  Brain, Star, Crown, Lock, MessageSquare,
} from 'lucide-react';

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-3 mt-6">
      {children}
    </p>
  );
}

function ToolCard({ icon: Icon, iconBg, iconColor, title, desc, duration, badge, onClick, locked }) {
  return (
    <button
      onClick={locked ? undefined : onClick}
      className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left border transition-all ${
        locked
          ? 'bg-dark-800 border-dark-700 opacity-60 cursor-default'
          : 'bg-dark-400 border-dark-600 hover:border-dark-500 active:scale-[0.98]'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        {locked
          ? <Lock size={16} className="text-muted" />
          : <Icon size={18} className={iconColor} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-ink leading-snug">{title}</p>
          {badge && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-saffron-400 bg-saffron-500/15 px-1.5 py-0.5 rounded-full border border-saffron-500/30">
              <Crown size={8} /> PRO
            </span>
          )}
        </div>
        <p className="text-xs text-slt leading-snug mt-0.5">{desc}</p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        {duration && <span className="text-[10px] text-muted font-medium">{duration}</span>}
        {!locked && <ChevronRight size={14} className="text-muted" />}
      </div>
    </button>
  );
}

export default function TrainPage() {
  const navigate = useNavigate();
  const { language } = useAuth();
  const t = translations[language].train;
  const hi = language === 'hi';

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-lg mx-auto px-4 pt-20 pb-24 animate-fade-in">

        {/* Page header */}
        <div className="pt-4 mb-2">
          <p className="text-2xl font-black text-ink">{hi ? 'ट्रेन करो' : 'Train'}</p>
          <p className="text-sm text-slt mt-1">{hi ? 'आज के लिए सही मानसिक टूल चुनो।' : 'Choose the mental tool you need today.'}</p>
        </div>

        {/* ── SECTION 1: MATCH PREP ─────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'मैच की तैयारी' : 'Match Prep'}</SectionLabel>
        <div className="space-y-2">
          <ToolCard
            icon={Target}
            iconBg="bg-brand-50"
            iconColor="text-brand-400"
            title={hi ? 'मैच से पहले'       : 'Before You Play'}
            desc={hi  ? 'मैच से पहले लॉक इन करो' : 'Lock in before match'}
            duration="5 min"
            onClick={() => navigate('/before-you-play')}
          />
          <ToolCard
            icon={Eye}
            iconBg="bg-purple-500/15"
            iconColor="text-purple-400"
            title={hi ? 'विज़ुअलाइज़ेशन'     : 'Visualization'}
            desc={hi  ? 'एक मुख्य पल को मानसिक रूप से तैयार करो' : 'Mentally rehearse one key moment'}
            duration="4 min"
            onClick={() => navigate('/visualization')}
          />
          <ToolCard
            icon={Trophy}
            iconBg="bg-saffron-500/15"
            iconColor="text-saffron-400"
            title={hi ? 'मेरी रूटीन'        : 'My Routine'}
            desc={hi  ? 'अपना प्री-मैच रूटीन चलाओ' : 'Run your pre-match routine'}
            duration="3 min"
            onClick={() => navigate('/ritual')}
          />
          <ToolCard
            icon={Star}
            iconBg="bg-navy-bright/10"
            iconColor="text-navy-bright"
            title={hi ? 'क्यू वर्ड'          : 'Cue Word Builder'}
            desc={hi  ? 'अपना परफॉर्मेंस क्यू वर्ड बनाओ और सेव करो' : 'Create and save a cue word'}
            duration="2 min"
            onClick={() => navigate('/before-you-play')}
          />
          <div>
            <ToolCard
              icon={MessageSquare}
              iconBg="bg-purple-500/15"
              iconColor="text-purple-400"
              title={t.selfTalkTitle}
              desc={t.selfTalkSub}
              duration="5 min"
              onClick={() => navigate('/self-talk')}
            />
            <p className="text-right text-xs font-semibold text-brand-400 pr-1 mt-1">
              <button onClick={() => navigate('/focus-deck')}>{hi ? 'Focus Deck देखो →' : 'View Focus Deck →'}</button>
            </p>
          </div>
          <ToolCard
            icon={Brain}
            iconBg="bg-brand-50"
            iconColor="text-brand-400"
            title={t.focusDeckTitle}
            desc={t.focusDeckSub}
            duration="2 min"
            onClick={() => navigate('/focus-deck')}
          />
        </div>

        {/* ── SECTION 2: RECOVERY ──────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'रिकवरी' : 'Recovery'}</SectionLabel>
        <div className="space-y-2">
          <ToolCard
            icon={Shield}
            iconBg="bg-teal-500/15"
            iconColor="text-teal-400"
            title={hi ? 'वापसी करो'         : 'Bounce Back'}
            desc={hi  ? 'गलती के बाद रीसेट करो' : 'Reset after a setback'}
            duration="3 min"
            onClick={() => navigate('/bounce-back')}
          />
          <ToolCard
            icon={Wind}
            iconBg="bg-teal-500/15"
            iconColor="text-teal-400"
            title={hi ? 'सांस और ग्राउंडिंग' : 'Calm Body'}
            desc={hi  ? 'श्वास और ग्राउंडिंग' : 'Breath and grounding'}
            duration="2 min"
            onClick={() => navigate('/breathing')}
          />
        </div>

        {/* ── SECTION 3: REFLECTION ────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'रिफ्लेक्शन' : 'Reflection'}</SectionLabel>
        <div className="space-y-2">
          <ToolCard
            icon={ClipboardList}
            iconBg="bg-saffron-500/15"
            iconColor="text-saffron-400"
            title={hi ? 'मैच के बाद'        : 'After the Match'}
            desc={hi  ? 'समीक्षा करो और सीखो' : 'Review and learn'}
            duration="4 min"
            onClick={() => navigate('/debrief')}
          />
          <ToolCard
            icon={TrendingUp}
            iconBg="bg-win-400/15"
            iconColor="text-win-400"
            title={hi ? 'साप्ताहिक समीक्षा'  : 'Weekly Review'}
            desc={hi  ? 'पैटर्न देखो, विकास ट्रैक करो' : 'Spot patterns, track growth'}
            duration="5 min"
            onClick={() => navigate('/progress')}
          />
        </div>

        {/* ── FOCUS GAMES ──────────────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'फोकस गेम्स' : 'Focus Games'}</SectionLabel>
        <Link to="/games">
          <div className="card p-4 flex items-center justify-between active:scale-[0.99] transition-transform hover:border-dark-500">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
                <Gamepad2 size={20} className="text-brand-400" />
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
