// Guardian-consent notice, extracted verbatim from the two duplicated blocks
// on StartingProfilePage so both paths stay identical.
//
// Informational only: amber, never red, no countdown, no urgency and no shame
// framing. The athlete can still read and confirm their profile — only entering
// Coach is gated, and that gate is enforced server-side as well.
//
// Colour comes from the theme-branched warn tokens, NOT from fixed Tailwind
// amber classes. The previous `bg-amber-950/30` + `text-amber-400` pairing was
// authored for the dark theme and measured 1.18:1 in the light theme, which
// made the one notice a waiting minor most needs to read the least readable
// thing on the page. Both themes now clear AA (6.7:1 light, 8.1:1 dark).
// Wording, behaviour and the resend action are unchanged.

import { ShieldAlert } from 'lucide-react';

export default function ConsentNotice({ t, guardianEmailMasked, onResend, resent }) {
  return (
    <div
      className="rounded-2xl px-4 py-3 border"
      style={{ background: 'var(--surface-warn)', borderColor: 'var(--border-warn)' }}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert
          size={18}
          className="shrink-0 mt-0.5"
          style={{ color: 'var(--status-warn)' }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--status-warn)' }}>
            {t.consentTitle}
          </p>
          <p className="text-xs text-slt mt-1 leading-relaxed">{t.consentBody}</p>
          {guardianEmailMasked && (
            <p className="text-xs text-slt mt-1">{t.consentEmailed(guardianEmailMasked)}</p>
          )}
          <button
            type="button"
            onClick={onResend}
            disabled={resent}
            className="text-xs font-semibold underline mt-2 py-3 min-h-[44px] disabled:opacity-60"
            style={{ color: 'var(--status-warn)' }}
          >
            {resent ? t.resent : t.resend}
          </button>
        </div>
      </div>
    </div>
  );
}
