// One selectable answer row/card for onboarding — single-select (radio) or
// multi-select (checkbox). Fully tappable, keyboard-operable, with a visible
// selected state expressed by BORDER + TINT + CHECKMARK (never colour alone)
// and a visible focus ring in both themes.
//
// Generic and copy-free: label/icon/state are passed in. It knows nothing
// about sports, goals, or which field it maps to.

function SelectableOption({
  icon,
  label,
  sublabel,
  selected = false,
  disabled = false,
  multi = false,
  oneLine = false,
  onSelect,
}) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onSelect}
      className={[
        'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left',
        'min-h-[44px] transition-colors active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900',
        selected
          ? 'border-brand-500 bg-brand-500/10'
          : disabled
          ? 'border-dark-600 bg-dark-800 opacity-60 cursor-not-allowed'
          : 'border-dark-600 bg-dark-800 hover:border-dark-400',
      ].join(' ')}
    >
      {icon && (
        <span className="text-2xl leading-none shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span
          className={`block font-semibold text-ink leading-tight ${oneLine ? 'truncate' : ''}`}
        >
          {label}
        </span>
        {sublabel && (
          <span className="block text-caption text-slt mt-0.5 leading-snug">{sublabel}</span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={[
          'shrink-0 w-5 h-5 flex items-center justify-center border-2 transition-colors',
          multi ? 'rounded-md' : 'rounded-full',
          selected ? 'border-brand-500 bg-brand-500' : 'border-dark-500',
        ].join(' ')}
      >
        {selected && <span className="text-white text-[10px] font-bold">✓</span>}
      </span>
    </button>
  );
}

export default SelectableOption;
