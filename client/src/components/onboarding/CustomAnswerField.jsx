import { useEffect, useRef } from 'react';

// Inline free-text field revealed when an athlete picks an "Other" / "…is
// different" option. Auto-focuses on reveal and scrolls itself into view so
// it isn't hidden behind the mobile keyboard or the sticky footer. Uses the
// shared .input-field theme tokens, so it looks correct in both themes with
// no per-theme branching.
//
// Presentation only: the label, placeholder, limit and value are supplied by
// the page. Sanitisation of the value for storage happens in the page on
// submit (see utils/sanitizeCustomText), not here — this field only enforces
// the hard maxLength while typing and surfaces a live character count.

function CustomAnswerField({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength = 60,
  autoFocus = true,
  showCount = true,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    ref.current.focus();
    // scrollIntoView is stubbed in jsdom; guarded for safety.
    ref.current.scrollIntoView?.({ block: 'nearest' });
  }, [autoFocus]);

  return (
    <div className="mt-3">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        type="text"
        inputMode="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => ref.current?.scrollIntoView?.({ block: 'nearest' })}
        className="input-field"
      />
      {showCount && (
        <p className="mt-1 text-right text-caption text-muted" aria-hidden="true">
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  );
}

export default CustomAnswerField;
