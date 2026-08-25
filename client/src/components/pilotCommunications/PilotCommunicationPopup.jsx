// Pilot Communications v1 — the ONE popup Home may show per app load.
//
// Not a page, not a notification inbox: a single Arjun-native CENTERED
// modal dialog (same accessible-dialog semantics as ChangeFocusDialog/
// ModalDialog — role="dialog", focus moved in on open, Tab trapped inside,
// Escape closes, focus returned to the trigger's owner on close) that
// fetches at most ONE eligible communication and renders it inline on
// Home.
//
// Deliberately centered, not bottom-anchored: BottomNav (components/
// BottomNav.jsx) is `fixed bottom-0 … z-50` and mounts as Dashboard's
// sibling, so a bottom sheet at the same z-index had its lower edge
// (frequently the Submit/CTA button) painted over by the nav bar on real
// phones — those only ever hit the mobile `items-end` branch, never the
// `sm:items-center` one. Centering removes the geometric overlap entirely,
// and the wrapper's own z-[60] (one above every other z-50 fixed element
// in this app, BottomNav included) is the belt-and-braces guarantee that
// this dialog always paints above app chrome even if that ever changes.
//
// Every close path before a positive action (X, Escape, backdrop click) is
// treated as the one negative action this feature actually models for that
// communication type: a permanent dismiss for an announcement, a "Not now"
// for a survey — there is no third "closed without recording anything"
// state anywhere in the data model, so this component never invents one.
//
// "One per app visit": `hasResolvedThisLoad` is a plain module-scoped
// variable, not localStorage/sessionStorage. It naturally resets on a full
// page/app reload (a fresh JS module instance) and stays true across any
// in-app SPA navigation away from and back to Home for the rest of that
// load — exactly the "once per full page/app load" fallback the product
// spec calls out as acceptable.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { apiFetch } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';

let hasResolvedThisLoad = false;

// Test-only seam — resets the module-level "already checked this load" flag
// between test cases. Never called from app code.
export function __resetPilotCommunicationLoadStateForTests() {
  hasResolvedThisLoad = false;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function PilotCommunicationPopup() {
  const { token, language } = useAuth();
  const navigate = useNavigate();
  const t = (translations[language] || translations.en).pilotCommunications;

  const [communication, setCommunication] = useState(null);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const panelRef = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => {
    if (hasResolvedThisLoad || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/pilot-communications/next', { headers: authHeaders(token) });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        hasResolvedThisLoad = true;
        const c = data?.communication;
        if (c) {
          setCommunication(c);
          // Fire-and-forget: presenting the popup IS the "seen" moment.
          // Server-side idempotent — never overwrites an earlier seenAt.
          apiFetch(`/api/pilot-communications/${c.id}/seen`, {
            method: 'POST',
            headers: authHeaders(token),
          }).catch(() => {});
        }
      } catch {
        if (!cancelled) hasResolvedThisLoad = true;
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!communication) return undefined;
    headingRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); handleClose(); return; }
      if (e.key !== 'Tab') return;
      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!nodes || !nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication]);

  if (!communication) return null;

  const isSurvey = communication.type === 'SURVEY';

  // The one negative action this popup ever records for the current
  // communication — dismiss for an announcement, "Not now" for a survey.
  // Used by the X button, Escape, and the backdrop click alike.
  async function handleClose() {
    const path = isSurvey ? 'not-now' : 'dismiss';
    try {
      await apiFetch(`/api/pilot-communications/${communication.id}/${path}`, {
        method: 'POST',
        headers: authHeaders(token),
      });
    } catch {
      // Nothing else to do — the athlete is leaving either way, and a
      // later app load simply re-resolves the same eligibility server-side.
    }
    setCommunication(null);
  }

  async function handleCta() {
    const route = communication.ctaRoute;
    try {
      await apiFetch(`/api/pilot-communications/${communication.id}/dismiss`, {
        method: 'POST',
        headers: authHeaders(token),
      });
    } catch {
      // Navigate regardless — the CTA is the point, and a failed dismiss
      // write just means this announcement may resurface next load.
    }
    setCommunication(null);
    if (route) navigate(route);
  }

  async function handleSubmit() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/pilot-communications/${communication.id}/respond`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ value: selected }),
      });
      if (!res.ok) throw new Error('respond failed');
      setSubmitted(true);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  function ResponseOption({ value, label, ariaLabel }) {
    const isSel = selected === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={isSel}
        aria-label={ariaLabel || undefined}
        onClick={() => setSelected(value)}
        className={`min-h-[44px] flex-1 text-center px-3 py-3 rounded-xl border text-body font-semibold transition-colors ${
          isSel
            ? 'border-2 border-brand-500 bg-brand-50/60 text-ink'
            : 'border border-dark-600 bg-dark-800 text-ink'
        }`}
      >
        {label}
      </button>
    );
  }

  function ResponseControls() {
    if (communication.responseType === 'YES_SOMEWHAT_NO') {
      return (
        <div role="radiogroup" aria-label={communication.title} className="flex gap-2">
          <ResponseOption value="yes" label={t.yes} />
          <ResponseOption value="somewhat" label={t.somewhat} />
          <ResponseOption value="no" label={t.no} />
        </div>
      );
    }
    if (communication.responseType === 'RATING_1_5') {
      return (
        <div role="radiogroup" aria-label={communication.title} className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <ResponseOption key={n} value={String(n)} label={String(n)} ariaLabel={t.ratingAria(n)} />
          ))}
        </div>
      );
    }
    // CUSTOM_SINGLE_CHOICE — founder-authored option text, shown exactly as
    // entered (no translation of founder content).
    return (
      <div role="radiogroup" aria-label={communication.title} className="flex flex-col gap-2">
        {(communication.responseOptions || []).map((opt) => (
          <ResponseOption key={opt} value={opt} label={opt} />
        ))}
      </div>
    );
  }

  return (
    // Centered on every viewport (no `items-end`/bottom-sheet branch) with
    // comfortable side margins from the wrapper's own padding — never
    // anchored to the bottom edge, so it can never sit under BottomNav.
    // z-[60] is deliberately above z-50, the highest z-index anything else
    // in this app (including BottomNav and Navbar) uses.
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
        data-testid="pilot-comm-backdrop"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pilot-comm-heading"
        data-testid="pilot-comm-popup"
        // max-w-[340px] keeps it in the ~320–360px mobile range at every
        // target width (360/390/430); max-h + overflow-y-auto means only
        // this content area ever scrolls on unusually long content — the
        // dialog itself never grows past a comfortable viewport fraction.
        className="relative w-full max-w-[340px] max-h-[85vh] overflow-y-auto bg-dark-400 border border-dark-600 rounded-3xl p-5"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2
            id="pilot-comm-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-heading font-bold text-ink outline-none break-words"
          >
            {communication.title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t.close}
            data-testid="pilot-comm-close"
            className="shrink-0 w-11 h-11 -mr-2 -mt-2 flex items-center justify-center rounded-full text-slt"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {submitted ? (
          <div>
            <p role="status" className="text-body text-ink font-semibold leading-relaxed mb-5">
              {t.thanks}
            </p>
            <button type="button" onClick={() => setCommunication(null)} className="btn-primary w-full justify-center">
              {t.done}
            </button>
          </div>
        ) : (
          <div>
            {communication.body && (
              <p className="text-caption text-slt leading-relaxed mb-4 break-words">{communication.body}</p>
            )}

            {isSurvey ? (
              <>
                <ResponseControls />
                {error && (
                  <p role="alert" className="text-caption text-red-400 mt-3">
                    {t.submitError}
                  </p>
                )}
                <div className="flex flex-col gap-2 mt-5">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!selected || submitting}
                    data-testid="pilot-comm-submit"
                    className="btn-primary w-full justify-center disabled:opacity-50"
                  >
                    {submitting ? '…' : t.submit}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    data-testid="pilot-comm-not-now"
                    className="w-full text-center text-caption font-semibold text-slt py-3 min-h-[44px]"
                  >
                    {t.notNow}
                  </button>
                </div>
              </>
            ) : (
              communication.ctaRoute && communication.ctaLabel && (
                <button
                  type="button"
                  onClick={handleCta}
                  data-testid="pilot-comm-cta"
                  className="btn-primary w-full justify-center mt-1"
                >
                  {communication.ctaLabel}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
