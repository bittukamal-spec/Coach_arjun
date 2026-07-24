import { useEffect, useRef } from 'react';

// Minimal accessible modal used for the branch-change confirmation and the
// server/local conflict choice. Theme-aware (semantic tokens only), focus is
// moved to the dialog on open, Escape triggers the secondary action.
//
// Generic and copy-free: title/body/actions are passed in by the caller.

function ModalDialog({ open, titleId, title, children, actions, onDismiss }) {
  const ref = useRef(null);
  useEffect(() => {
    if (open && ref.current) ref.current.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
      onKeyDown={(e) => { if (e.key === 'Escape' && onDismiss) onDismiss(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl border border-dark-600 bg-dark-800 p-5 outline-none"
      >
        <h2 id={titleId} className="text-heading font-bold text-ink mb-2">{title}</h2>
        <div className="text-body text-slt leading-relaxed mb-4">{children}</div>
        <div className="flex flex-col gap-2">{actions}</div>
      </div>
    </div>
  );
}

export default ModalDialog;
