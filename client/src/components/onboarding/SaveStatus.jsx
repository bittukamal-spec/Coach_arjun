import { Loader2, Check, AlertCircle } from 'lucide-react';

// Small, theme-aware save indicator shown in the onboarding footer. Reflects
// the server-authoritative save state; on error it offers Retry and the flow
// does not advance. Announced politely for assistive tech.

function SaveStatus({ state, onRetry, labels }) {
  if (state === 'idle') return null;
  return (
    <div className="flex items-center gap-2 text-caption" role="status" aria-live="polite">
      {state === 'saving' && (
        <>
          <Loader2 size={14} className="animate-spin text-slt" aria-hidden="true" />
          <span className="text-slt">{labels.saving}</span>
        </>
      )}
      {state === 'saved' && (
        <>
          <Check size={14} className="text-success" aria-hidden="true" />
          <span className="text-slt">{labels.saved}</span>
        </>
      )}
      {state === 'error' && (
        <>
          <AlertCircle size={14} className="text-alert" aria-hidden="true" />
          <span className="text-alert">{labels.saveFailed}</span>
          <button
            type="button"
            onClick={onRetry}
            className="font-semibold text-brand-400 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
          >
            {labels.retry}
          </button>
        </>
      )}
    </div>
  );
}

export default SaveStatus;
