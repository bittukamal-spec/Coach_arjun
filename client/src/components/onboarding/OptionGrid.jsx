// Layout wrapper for a set of SelectableOptions. Two layouts:
//   - 'grid'  → two columns (used for the sport picker)
//   - 'stack' → single full-width column (everything else)
//
// Provides the correct grouping semantics for assistive tech: a radiogroup
// for single-select, a plain group for multi-select checkboxes. Copy-free
// and field-agnostic — the page supplies the options as children.

function OptionGrid({ layout = 'stack', multi = false, ariaLabel, className = '', children }) {
  return (
    <div
      role={multi ? 'group' : 'radiogroup'}
      aria-label={ariaLabel}
      className={[
        // 'grid' stays two columns on normal phones but drops to a single
        // column on genuinely narrow viewports (<360px) so full labels are
        // never cut off. 'stack' is always a single column.
        layout === 'grid' ? 'grid grid-cols-1 min-[360px]:grid-cols-2 gap-3' : 'flex flex-col gap-3',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export default OptionGrid;
