import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import {
  Target, Shield, RotateCcw, ClipboardList, Layers,
} from 'lucide-react';

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-4 mt-8">
      {children}
    </p>
  );
}

function TrainCard({
  icon: Icon, iconBg, iconColor,
  title, skillTag, desc, duration, bestFor,
  ctaLabel, onCta,
  secondaryLabel, onSecondary,
}) {
  return (
    <div className="bg-dark-400 border border-dark-600 rounded-2xl p-5 flex flex-col gap-3">

      {/* Header: icon + title + skill pill */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
            <Icon size={22} className={iconColor} />
          </div>
          <h2 className="text-base font-bold text-ink leading-tight">{title}</h2>
        </div>
        <span
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0"
          style={{ backgroundColor: 'rgba(24,95,165,0.10)', color: '#185FA5' }}
        >
          {skillTag}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-slt leading-relaxed">{desc}</p>

      {/* Duration + Best for */}
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span>{duration}</span>
        <span>·</span>
        <span>{bestFor}</span>
      </div>

      {/* CTA row */}
      <div className={`flex items-center mt-1 ${secondaryLabel ? 'justify-between' : 'justify-end'}`}>
        {secondaryLabel && (
          <button
            onClick={onSecondary}
            className="text-xs font-semibold text-brand-400 active:opacity-70 py-1"
          >
            {secondaryLabel}
          </button>
        )}
        <button
          onClick={onCta}
          className="text-white text-sm font-semibold px-6 rounded-xl active:scale-[0.98] transition-transform"
          style={{ backgroundColor: '#185FA5', minHeight: '44px' }}
        >
          {ctaLabel}
        </button>
      </div>

    </div>
  );
}

export default function TrainPage() {
  const navigate = useNavigate();
  const { language } = useAuth();
  const hi = language === 'hi';

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-lg mx-auto px-4 pt-20 pb-24 animate-fade-in">

        {/* Page header */}
        <div className="pt-4 mb-2">
          <p className="text-2xl font-black text-ink">{hi ? 'ट्रेन करो' : 'Train'}</p>
          <p className="text-sm text-slt mt-1">
            {hi ? 'अपनी मानसिक ट्रेनिंग शुरू करो।' : 'Your mental training toolkit.'}
          </p>
        </div>

        {/* ── PREPARE ──────────────────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'तैयारी' : 'Prepare'}</SectionLabel>
        <div className="space-y-3">
          <TrainCard
            icon={Target}
            iconBg="bg-brand-500/15"
            iconColor="text-brand-400"
            title={hi ? 'मैच से पहले' : 'Before You Play'}
            skillTag={hi ? 'प्री-मैच' : 'Pre-match'}
            desc={hi
              ? 'मैच, ट्रायल, या कठिन ट्रेनिंग से पहले खुद को लॉक इन करो।'
              : 'Lock in before a match, trial, or hard training session.'}
            duration="5 min"
            bestFor={hi ? 'प्री-मैच · प्री-ट्रेनिंग' : 'Pre-match · Pre-training'}
            ctaLabel={hi ? 'तैयारी शुरू करो' : 'Start Prep'}
            onCta={() => navigate('/before-you-play')}
          />
        </div>

        {/* ── RECOVER ──────────────────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'रिकवरी' : 'Recover'}</SectionLabel>
        <div className="space-y-3">
          <TrainCard
            icon={Shield}
            iconBg="bg-teal-500/15"
            iconColor="text-teal-400"
            title={hi ? 'वापसी करो' : 'Bounce Back'}
            skillTag={hi ? 'सेटबैक के बाद' : 'After a setback'}
            desc={hi
              ? 'गलती, खराब गेम, आलोचना, या सिलेक्शन सेटबैक के बाद रीसेट करो।'
              : 'Reset after a mistake, bad game, criticism, or selection setback.'}
            duration="3 min"
            bestFor={hi ? 'सेटबैक के बाद' : 'After a setback'}
            ctaLabel={hi ? 'रीसेट शुरू करो' : 'Start Reset'}
            onCta={() => navigate('/bounce-back')}
          />
          <TrainCard
            icon={RotateCcw}
            iconBg="bg-teal-500/15"
            iconColor="text-teal-400"
            title="Body Reset"
            skillTag={hi ? 'तनाव और घबराहट' : 'Tension & nerves'}
            desc={hi
              ? 'तनाव छोड़ो, सांस को धीमा करो, और शरीर को वापस कंट्रोल में लाओ।'
              : 'Release tension, slow your breathing, and bring your body back under control.'}
            duration="3 min"
            bestFor={hi ? 'घबराया हुआ, तना हुआ, या ओवरलोडेड' : 'Nervous, tight, or overloaded'}
            ctaLabel={hi ? 'Body Reset करो' : 'Reset Body'}
            onCta={() => navigate('/body-reset')}
            secondaryLabel={hi ? 'Reset history देखो →' : 'View reset history →'}
            onSecondary={() => navigate('/body-reset/history')}
          />
        </div>

        {/* ── BUILD SKILLS ──────────────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'स्किल बनाओ' : 'Build Skills'}</SectionLabel>
        <div className="space-y-3">
          <TrainCard
            icon={Layers}
            iconBg="bg-brand-500/15"
            iconColor="text-brand-400"
            title="Focus Card Builder"
            skillTag={hi ? 'फोकस और दबाव' : 'Focus & pressure'}
            desc={hi
              ? 'अपने cue word, reset word, और pressure self-talk को अहम पलों के लिए बनाओ।'
              : 'Build your cue word, reset word, and pressure self-talk for key moments.'}
            duration="5 min"
            bestFor={hi ? 'फोकस, आत्मविश्वास, दबाव' : 'Focus, confidence, pressure'}
            ctaLabel={hi ? 'Focus Card बनाओ' : 'Build Focus Card'}
            onCta={() => navigate('/self-talk')}
            secondaryLabel={hi ? 'Focus Cards देखो →' : 'View Focus Cards →'}
            onSecondary={() => navigate('/focus-deck')}
          />
        </div>

        {/* ── REVIEW ────────────────────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'रिव्यू' : 'Review'}</SectionLabel>
        <div className="space-y-3">
          <TrainCard
            icon={ClipboardList}
            iconBg="bg-saffron-500/15"
            iconColor="text-saffron-400"
            title={hi ? 'Training Review' : 'Training Review'}
            skillTag={hi ? 'मैच के बाद' : 'After match'}
            desc={hi
              ? 'क्या काम किया, क्या बदलना है, और आगे क्या फोकस करना है — यह रिव्यू करो।'
              : 'Review what worked, what to adjust, and what to focus on next.'}
            duration="4 min"
            bestFor={hi ? 'मैच या ट्रेनिंग के बाद' : 'After match or training'}
            ctaLabel={hi ? 'रिव्यू शुरू करो' : 'Start Review'}
            onCta={() => navigate('/debrief')}
          />
        </div>

      </main>
    </div>
  );
}
