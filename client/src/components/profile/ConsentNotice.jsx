// Guardian-consent notice, extracted verbatim from the two duplicated blocks
// on StartingProfilePage so both paths stay identical.
//
// Informational only: amber, never red, no countdown, no urgency and no shame
// framing. The athlete can still read and confirm their profile — only entering
// Coach is gated, and that gate is enforced server-side as well.

import { ShieldAlert } from 'lucide-react';

export default function ConsentNotice({ t, guardianEmailMasked, onResend, resent }) {
  return (
    <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl px-4 py-3">
      <div className="flex items-start gap-2.5">
        <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-400">{t.consentTitle}</p>
          <p className="text-xs text-slt mt-1 leading-relaxed">{t.consentBody}</p>
          {guardianEmailMasked && (
            <p className="text-xs text-slt mt-1">{t.consentEmailed(guardianEmailMasked)}</p>
          )}
          <button
            type="button"
            onClick={onResend}
            disabled={resent}
            className="text-xs font-semibold text-amber-400 underline mt-2 py-3 min-h-[44px] disabled:opacity-60"
          >
            {resent ? t.resent : t.resend}
          </button>
        </div>
      </div>
    </div>
  );
}
