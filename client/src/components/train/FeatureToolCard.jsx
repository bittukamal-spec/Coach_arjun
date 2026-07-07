import GradientIconTile, { GRADIENT_VARIANTS } from './GradientIconTile';

// Bigger card for a major Train tool. `hero` reserves the full gradient
// treatment for the single highest-priority tool on the page — everywhere
// else uses a plain elevated card with a gradient icon tile, so the
// gradient still reads as "the one that matters" rather than being
// everywhere.
function FeatureToolCard({
  icon: Icon, variant = 'blue', hero = false,
  title, tag, desc, meta,
  ctaLabel, onCta,
  secondaryLabel, onSecondary,
  secondaryLabel2, onSecondary2,
}) {
  const hasSecondary = secondaryLabel || secondaryLabel2;

  if (hero) {
    const { from, to } = GRADIENT_VARIANTS[variant] || GRADIENT_VARIANTS.blue;
    return (
      <div className="card-hero p-5 flex flex-col gap-3 text-white" style={{ '--grad-from': from, '--grad-to': to }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              {Icon && <Icon size={24} />}
            </div>
            <h2 className="text-lg font-bold leading-tight">{title}</h2>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap bg-white/20">{tag}</span>
        </div>
        <p className="text-sm leading-relaxed text-white/90">{desc}</p>
        <div className="flex items-center gap-1.5 text-xs text-white/75">
          <span>{meta}</span>
        </div>
        <div className={`flex items-center mt-1 ${hasSecondary ? 'justify-between' : 'justify-end'}`}>
          {hasSecondary && (
            <div className="flex items-center gap-3">
              {secondaryLabel && (
                <button onClick={onSecondary} className="text-xs font-semibold text-white/90 underline underline-offset-2 active:opacity-70 py-1">
                  {secondaryLabel}
                </button>
              )}
              {secondaryLabel && secondaryLabel2 && <span className="text-xs text-white/50">·</span>}
              {secondaryLabel2 && (
                <button onClick={onSecondary2} className="text-xs font-semibold text-white/90 underline underline-offset-2 active:opacity-70 py-1">
                  {secondaryLabel2}
                </button>
              )}
            </div>
          )}
          <button
            onClick={onCta}
            className="text-sm font-bold px-6 rounded-xl bg-white active:scale-[0.98] transition-transform"
            style={{ minHeight: '44px', color: '#185FA5' }}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-elevated p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <GradientIconTile icon={Icon} variant={variant} className="w-11 h-11 rounded-xl" size={20} />
          <h2 className="text-base font-bold text-ink leading-tight">{title}</h2>
        </div>
        <span className="tag-pill" style={{ '--tile-fg': '#185FA5', '--tile-bg': 'rgb(var(--brand-50))' }}>{tag}</span>
      </div>
      <p className="text-sm text-slt leading-relaxed">{desc}</p>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span>{meta}</span>
      </div>
      <div className={`flex items-center mt-1 ${hasSecondary ? 'justify-between' : 'justify-end'}`}>
        {hasSecondary && (
          <div className="flex items-center gap-3">
            {secondaryLabel && (
              <button onClick={onSecondary} className="text-xs font-semibold text-brand-400 active:opacity-70 py-1">
                {secondaryLabel}
              </button>
            )}
            {secondaryLabel && secondaryLabel2 && <span className="text-xs text-muted">·</span>}
            {secondaryLabel2 && (
              <button onClick={onSecondary2} className="text-xs font-semibold text-brand-400 active:opacity-70 py-1">
                {secondaryLabel2}
              </button>
            )}
          </div>
        )}
        <button onClick={onCta} className="btn-gradient text-sm px-6" style={{ minHeight: '44px' }}>
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

export default FeatureToolCard;
