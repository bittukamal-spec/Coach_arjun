import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import TrainGradientCard from '../components/train/TrainGradientCard';
import { AthleteMark, BreathMark, StopwatchMark, CardsMark } from '../components/visuals/CardArt';
import { SectionLabel } from '../components/ui';

// The FIVE real practices Arjun actually ships — nothing else. There is no
// eight-category structure and no practice-count metadata anywhere in the
// product, so neither is rendered here. Routes are the existing ones.
//
// Grouping is kept only where it still helps an athlete choose: when you
// play (Ritual, Pressure Reset) and the skill-building pair (Quick Rep,
// Focus Card Builder). No empty categories.
//
// PR 2 cutover: the separate "After you play → Match & Practice Reflection"
// entry is gone, along with its group — reflection is the Mind Journal, and
// it already has its own prominent entry on Home. It is deliberately NOT
// re-added here as a second reflection tile: one reflection concept, one
// place to start it.
//
// `variant` selects the approved gradient (blue/teal/amber/purple — the
// same GRADIENT_VARIANTS token family already used on tool-intro screens);
// `Illustration` is the faint background mark for that card. Pressure
// Reset's "View history" secondary action is NOT re-added here — it now
// lives on the Pressure Reset intro screen itself (BodyResetPage.jsx,
// PracticeIntro's secondaryLabel), which already exposes it. Relocated,
// not removed.
const GROUPS = [
  {
    labelKey: 'beforeLabel',
    practices: [
      { key: 'ritual',   to: '/ritual',      variant: 'blue', Illustration: AthleteMark },
      { key: 'pressure', to: '/body-reset',  variant: 'teal', Illustration: BreathMark },
    ],
  },
  {
    labelKey: 'buildLabel',
    practices: [
      { key: 'quickRep',  to: '/mental-rep', variant: 'purple', Illustration: StopwatchMark },
      { key: 'focusCard', to: '/self-talk',  variant: 'blue',   Illustration: CardsMark },
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

        {/* Two-column grid at every width. A lone wide practice would span
            both columns as one banner card rather than leave an empty cell;
            every current group happens to hold a clean pair. */}
        {GROUPS.map(group => (
          <section key={group.labelKey} className="mb-7">
            <SectionLabel>{t[group.labelKey]}</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5 items-stretch">
              {group.practices.map(p => {
                const copy = t.practices[p.key];
                return (
                  <TrainGradientCard
                    key={p.key}
                    title={copy.name}
                    desc={copy.desc}
                    variant={p.variant}
                    Illustration={p.Illustration}
                    wide={p.wide}
                    onClick={() => navigate(p.to)}
                    className={p.wide ? 'col-span-2' : ''}
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
