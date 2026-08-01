import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import PracticeTile from '../components/train/PracticeTile';
import { SectionLabel } from '../components/ui';

// The FIVE real practices Arjun actually ships — nothing else. There is no
// eight-category structure and no practice-count metadata anywhere in the
// product, so neither is rendered here. Routes are the existing ones.
//
// Grouping is kept only where it still helps an athlete choose: when you
// play (Ritual, Pressure Reset), after you play (Reflection), and the
// skill-building pair (Quick Rep, Focus Card Builder). No empty categories.
const GROUPS = [
  {
    labelKey: 'beforeLabel',
    practices: [
      { key: 'ritual',   to: '/ritual',      tone: 'var(--brand-primary)' },
      { key: 'pressure', to: '/body-reset',  tone: '#2E7D6B',
        // Pressure Reset's existing secondary route — preserved.
        historyTo: '/body-reset/history' },
    ],
  },
  {
    labelKey: 'afterLabel',
    practices: [
      { key: 'reflection', to: '/debrief', tone: '#D98B2B' },
    ],
  },
  {
    labelKey: 'buildLabel',
    practices: [
      { key: 'quickRep',  to: '/mental-rep', tone: 'var(--brand-primary)' },
      { key: 'focusCard', to: '/self-talk',  tone: 'var(--brand-primary)' },
    ],
  },
];

export default function TrainPage() {
  const navigate = useNavigate();
  const { language } = useAuth();
  const t = (translations[language] || translations.en).trainPage;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-lg md:max-w-2xl mx-auto px-4 pt-20 pb-28 animate-fade-in">

        {/* Page header */}
        <div className="pt-4 mb-6">
          <h1 className="text-2xl font-black text-ink">{t.title}</h1>
          <p className="text-sm text-slt mt-1">{t.subtitle}</p>
        </div>

        {/* Two-column grid at every width; the tiles simply get more room
            as the page column widens. Tiles stretch to a shared row height
            so a long Hindi label never leaves a ragged row. */}
        {GROUPS.map(group => (
          <section key={group.labelKey} className="mb-7">
            <SectionLabel>{t[group.labelKey]}</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5 items-stretch">
              {group.practices.map(p => {
                const copy = t.practices[p.key];
                return (
                  <PracticeTile
                    key={p.key}
                    name={copy.name}
                    desc={copy.desc}
                    tone={p.tone}
                    // A lone practice spans the row rather than leaving an
                    // empty cell — the grid stays two-column throughout.
                    className={group.practices.length === 1 ? 'col-span-2' : ''}
                    onClick={() => navigate(p.to)}
                    footer={p.historyTo && (
                      // min-h-[44px] + inline-flex items-center gives the
                      // whole clickable element a real 44px tap target
                      // without stretching the button's own compact,
                      // background-free text-link appearance — it still
                      // reads as a quiet secondary action, never a button.
                      <button
                        type="button"
                        onClick={() => navigate(p.historyTo)}
                        className="mt-1.5 self-start min-h-[44px] inline-flex items-center text-[11px] font-semibold text-brand-400 px-1 rounded active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {t.resetHistory}
                      </button>
                    )}
                  />
                );
              })}
            </div>
          </section>
        ))}

      </main>
    </div>
  );
}
