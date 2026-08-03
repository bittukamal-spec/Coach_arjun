// The one quiet route from a saved profile back into coaching.
//
// Deliberately an ACTION ROW, not a primary button: it must read as available
// without competing with the Current Focus card above it, which is the thing
// the athlete came to see. Label left, chevron right, hairline border, the
// Stage A `elevation-row` shadow.
//
// It creates nothing on render. The caller's handler hits the idempotent
// start-chat endpoint, which reopens the existing first conversation — merely
// loading the profile never claims a follow-up opener.
//
// This component is rendered ONLY when coaching is actually open to the
// athlete. A guardian-consent-pending athlete must not get a disabled or
// hidden-but-present control, so the caller omits it from the tree entirely.

import { ChevronRight } from 'lucide-react';

export default function ContinueCoachingRow({ label, busyLabel, busy = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="w-full min-h-[56px] flex items-center justify-between gap-3 px-4 py-3 rounded-2xl card elevation-row text-left active:scale-[0.99] transition-transform disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900"
    >
      <span className="min-w-0 text-body font-semibold text-ink break-words">
        {busy ? busyLabel : label}
      </span>
      <ChevronRight size={20} className="shrink-0 text-slt" aria-hidden="true" />
    </button>
  );
}
