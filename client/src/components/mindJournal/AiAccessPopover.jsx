// Mind Journal AI-access control — an icon-only header button plus a small
// anchored popover.
//
// This is the ONE place the Mind Journal home surface exposes the coaching
// consent setting. It is not a page, not a bottom sheet and not navigation:
// the popover opens anchored under the header icon, the page stays mounted
// behind it, and dismissing it returns focus to the icon. The dedicated
// /mind-journal/context screen is untouched and stays routed for old deep
// links.
//
// It drives the EXISTING consent contract and nothing else:
//   read  — `contextEnabled` from the caller's own GET /api/mind-journal
//   write — PATCH /api/mind-journal/context { enabled } → { contextEnabled }
// There is no second setting, no new endpoint and no local copy of the
// preference. The switch is never flipped optimistically: it moves only once
// the server has confirmed the new value, so the UI can never claim a state
// the server did not accept. A failed write leaves the switch where it was
// and says so.

import { useEffect, useId, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { apiFetch } from '../../api';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

export default function AiAccessPopover({ token, mj, contextEnabled, onContextEnabledChange }) {
  const ai = mj.aiAccess;

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  // Set while closing so focus returns to the icon exactly once, and only
  // when the athlete dismissed the popover themselves.
  const restoreFocusRef = useRef(false);

  const panelId = useId();
  const headingId = useId();
  const bodyId = useId();

  function close() {
    restoreFocusRef.current = true;
    setOpen(false);
  }

  // Move focus into the popover on open, trap Tab inside it, and close on
  // Escape — the same dialog semantics ChangeFocusDialog already uses.
  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
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
  }, [open]);

  // Return focus to the header icon after a dismissal, so keyboard and
  // screen-reader users land back where they were instead of at the top of
  // the document.
  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [open]);

  async function handleToggle() {
    // Guards the in-flight write: the input is also disabled, but a fast
    // double tap or a keyboard repeat must never start a second PATCH.
    if (saving) return;
    const next = !contextEnabled;
    setError(false);
    setSaving(true);
    try {
      const res = await apiFetch('/api/mind-journal/context', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.contextEnabled !== 'boolean') {
        setError(true);
      } else {
        // Only the server's own value ever reaches the switch.
        onContextEnabledChange(data.contextEnabled);
      }
    } catch {
      setError(true);
    }
    setSaving(false);
  }

  return (
    <div className="relative">
      {/* Icon only, by design: no text label beside it and no status pill.
          The accessible name carries the meaning, and the ON state is
          announced through aria-pressed rather than by colour alone. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={ai.trigger}
        aria-pressed={contextEnabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        data-testid="mj-ai-access-trigger"
        className="w-11 h-11 flex items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        style={{
          color: contextEnabled ? 'var(--journal-accent)' : 'var(--text-secondary)',
          background: contextEnabled ? 'var(--journal-surface)' : 'transparent',
        }}
      >
        <Sparkles size={18} aria-hidden="true" />
      </button>

      {open ? (
        <>
          {/* Subtle dim, and the click-outside target. Purely presentational:
              the button below it owns the dismissal. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
            data-testid="mj-ai-access-scrim"
            className="fixed inset-0 z-40 bg-black/25 cursor-default"
          />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            aria-describedby={bodyId}
            tabIndex={-1}
            data-testid="mj-ai-access-popover"
            /* Anchored under the icon and pinned inside the viewport on the
               narrowest phone: right-aligned to the trigger, width capped by
               the screen rather than a fixed pixel value, so it can never be
               clipped at 360px. */
            className="absolute right-0 top-full mt-2 z-50 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border p-4 text-left elevation-card focus-visible:outline-none"
            style={{ background: 'var(--surface-card)', borderColor: 'var(--journal-border)' }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h2 id={headingId} className="text-body font-bold text-ink leading-snug">
                {ai.heading}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={ai.close}
                data-testid="mj-ai-access-close"
                className="w-8 h-8 -mr-1 -mt-1 flex items-center justify-center rounded-full shrink-0 text-slt hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <p id={bodyId} className="text-caption text-slt leading-relaxed mb-3.5">
              {ai.body}
            </p>

            <label className="flex items-center justify-between gap-3 cursor-pointer min-h-[44px]">
              <span className="text-caption font-semibold text-ink leading-snug flex-1">
                {ai.toggleLabel}
              </span>
              <span className="relative inline-flex items-center shrink-0">
                <input
                  type="checkbox"
                  role="switch"
                  checked={contextEnabled}
                  disabled={saving}
                  onChange={handleToggle}
                  data-testid="mj-ai-access-toggle"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                />
                <span
                  className={`w-11 h-6 rounded-full transition-colors pointer-events-none ${saving ? 'opacity-60' : ''}`}
                  style={{ background: contextEnabled ? 'var(--journal-accent)' : 'rgb(var(--dark-600))' }}
                  aria-hidden="true"
                />
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-dark-400 border border-dark-600 shadow-sm transition-transform pointer-events-none ${
                    contextEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                  aria-hidden="true"
                />
              </span>
            </label>

            {/* State in words as well as position, so it is never carried by
                the switch's colour alone. */}
            <p className="text-micro font-bold mt-1" style={{ color: 'var(--journal-accent)' }}>
              {saving ? mj.saving : contextEnabled ? mj.contextStatus.on : mj.contextStatus.off}
            </p>

            {error ? (
              <p role="alert" className="text-caption mt-2 leading-snug" style={{ color: 'var(--status-error)' }} data-testid="mj-ai-access-error">
                {mj.contextError}
              </p>
            ) : null}

            <p className="text-micro text-slt leading-relaxed mt-3 pt-3 border-t border-dark-600">
              {ai.privacy}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
