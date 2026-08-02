// One selectable answer for onboarding — single-select (radio) or
// multi-select (checkbox). Two layouts:
//   - 'row'  (default) → full-width horizontal row, optional sublabel
//   - 'tile'           → compact vertical card (icon over label) used for
//                        option sets whose labels are all short enough to
//                        sit comfortably in a two-column grid
//
// Fully tappable, keyboard-operable, with a visible selected state expressed
// by BORDER + TINT + CHECK (never colour alone) and a visible focus ring in
// both themes. Generic and copy-free.
//
// Stage G indicator rule (approved design): a multi-select always carries a
// small empty checkbox so it reads as "you may pick more than one", while a
// single-select shows a check ONLY once chosen — an unselected radio dot is
// noise on a list where exactly one answer is expected. The slot is reserved
// either way, so choosing an answer never reflows the label beside it.

const BASE =
  'border transition-colors active:scale-[0.99] focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-dark-900';

function stateClasses(selected, disabled) {
  if (selected) return 'border-brand-500 bg-brand-500/10';
  // Approved ~55% dim: unavailable, but still readable rather than erased.
  if (disabled) return 'border-dark-600 bg-dark-800 opacity-[0.55] cursor-not-allowed';
  return 'border-dark-600 bg-dark-800 hover:border-dark-400';
}

function SelectableOption({
  icon,
  label,
  sublabel,
  selected = false,
  disabled = false,
  multi = false,
  layout = 'row',
  onSelect,
}) {
  const commonProps = {
    type: 'button',
    role: multi ? 'checkbox' : 'radio',
    'aria-checked': selected,
    'aria-disabled': disabled || undefined,
    disabled,
    onClick: onSelect,
  };

  if (layout === 'tile') {
    return (
      <button
        {...commonProps}
        className={`relative w-full h-full min-h-[76px] flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-2xl text-center ${BASE} ${stateClasses(selected, disabled)}`}
      >
        {icon && (
          <span className="text-2xl leading-none" aria-hidden="true">
            {icon}
          </span>
        )}
        {/* 18px reserved either side so a wrapped line never runs under the
            top-right check badge. Labels WRAP rather than truncate —
            Devanagari in particular must never be clipped. */}
        <span className="text-sm font-semibold text-ink leading-tight px-[18px] [text-wrap:pretty]">
          {label}
        </span>
        {selected && (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 w-4 h-4 flex items-center justify-center rounded-full bg-brand-500"
          >
            <span className="text-white text-[9px] font-bold">✓</span>
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      {...commonProps}
      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left min-h-[52px] ${BASE} ${stateClasses(selected, disabled)}`}
    >
      {icon && (
        <span className="text-2xl leading-none shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-ink leading-tight [text-wrap:pretty]">{label}</span>
        {sublabel && (
          <span className="block text-caption text-slt mt-0.5 leading-snug">{sublabel}</span>
        )}
      </span>
      {/* Slot is always reserved. A single-select renders nothing inside it
          until chosen — no unselected radio dot, and no reflow on select. */}
      <span
        aria-hidden="true"
        className={[
          'shrink-0 w-5 h-5 flex items-center justify-center rounded-full transition-colors',
          multi ? 'rounded-md border-2' : '',
          multi
            ? (selected ? 'border-brand-500 bg-brand-500' : 'border-dark-500')
            : (selected ? 'border-2 border-brand-500 bg-brand-500' : ''),
        ].join(' ')}
      >
        {selected && <span className="text-white text-[10px] font-bold">✓</span>}
      </span>
    </button>
  );
}

export default SelectableOption;
