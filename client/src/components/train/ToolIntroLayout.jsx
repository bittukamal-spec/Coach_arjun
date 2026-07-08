import GradientIconTile, { GRADIENT_VARIANTS } from './GradientIconTile';
import InfoStatCard from './InfoStatCard';
import ChecklistCard from './ChecklistCard';

// Shared premium intro block for tool entry screens (Pressure Reset,
// Focus Card Builder, Match & Practice Reflection, ...). Renders the hero
// (gradient icon + tag pill), headline, optional stat row and checklist,
// then any page-specific sections as children. It deliberately does NOT
// render the page header/back button or own the CTA footer — each tool
// keeps its existing navigation and button logic and just slots this in
// as the top of its intro screen.
function ToolIntroLayout({
  icon, variant = 'blue',
  tag, title, desc,
  stats = [],        // [{ label, value }]
  checklist = null,  // { title, items }
  children,
}) {
  const accent = (GRADIENT_VARIANTS[variant] || GRADIENT_VARIANTS.blue).from;
  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <GradientIconTile icon={icon} variant={variant} size={26} />
        {tag && (
          <span className="tag-pill" style={{ '--tile-fg': accent, '--tile-bg': `${accent}1F` }}>
            {tag}
          </span>
        )}
      </div>
      <h2 className="text-2xl font-black text-ink mb-2 leading-tight">{title}</h2>
      {desc && <p className="text-sm text-slt mb-5 leading-relaxed">{desc}</p>}
      {stats.length > 0 && (
        <div className="flex gap-2.5 mb-6">
          {stats.map(s => <InfoStatCard key={s.label} label={s.label} value={s.value} />)}
        </div>
      )}
      {checklist && (
        <div className="mb-6">
          <ChecklistCard title={checklist.title} items={checklist.items} />
        </div>
      )}
      {children}
    </>
  );
}

export default ToolIntroLayout;
