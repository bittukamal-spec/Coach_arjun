// Change-focus selector — a mobile-first bottom sheet with real dialog
// semantics: role="dialog" aria-modal, focus moved in on open, Tab trapped
// inside, Escape closes, and focus returned to the Change focus button by the
// caller on close.
//
// Options are server-authored (id + label). The athlete's own onboarding areas
// come first, then the remaining approved ones — the client never maps an id to
// a label itself.
//
// Selection is never communicated by colour alone: the selected row also gets a
// check icon and a thicker border.

import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { isValidCustomText } from '../../utils/sanitizeCustomText';

const CUSTOM_ID = 'different';
const CUSTOM_MAX = 80;

const FOCUSABLE = 'button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

export default function ChangeFocusDialog({
  t,
  options,          // [{ id, label, personalised }]
  currentFocusId,
  onCancel,
  onSave,           // async ({ focusId, customText }) => ({ ok, error })
}) {
  const [selected, setSelected] = useState(currentFocusId || null);
  const [customText, setCustomText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const panelRef = useRef(null);
  const headingRef = useRef(null);

  // Move focus into the sheet on open, and trap Tab inside it.
  useEffect(() => {
    headingRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel(); return; }
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
  }, [onCancel]);

  const isCustom = selected === CUSTOM_ID;
  const valid = isCustom ? isValidCustomText(customText, CUSTOM_MAX) : !!selected;
  const selectedLabel = isCustom
    ? customText.trim()
    : options.find((o) => o.id === selected)?.label || '';

  const personalised = options.filter((o) => o.personalised);
  const rest = options.filter((o) => !o.personalised);

  async function handleSave() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const res = await onSave({ focusId: selected, customText: isCustom ? customText.trim() : undefined });
    setSaving(false);
    if (!res?.ok) {
      // Keep the draft and stay open so the athlete can retry. Never surface
      // an API/Prisma/validation internal — only our own athlete-facing copy.
      // Out-of-scope gets its own message so the athlete knows WHAT to change,
      // not just that it failed.
      setConfirming(false);
      setError(res?.error === 'OUT_OF_SCOPE_FOCUS' ? t.focusOutOfScope : t.focusSaveError);
    }
  }

  function Option({ option }) {
    const isSel = selected === option.id;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={isSel}
        onClick={() => { setSelected(option.id); setError(null); }}
        className={`w-full min-h-[44px] flex items-center justify-between gap-3 text-left px-4 py-3 rounded-xl border text-body transition-colors ${
          isSel
            ? 'border-2 border-brand-500 bg-brand-50/60 text-ink font-semibold'
            : 'border border-dark-600 bg-dark-800 text-ink'
        }`}
      >
        <span className="min-w-0 break-words">{option.label}</span>
        {isSel && <Check size={18} className="text-brand-500 shrink-0" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-dialog-heading"
        className="relative w-full max-w-md max-h-[88vh] overflow-y-auto bg-dark-400 border border-dark-600 rounded-t-3xl px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2
            id="focus-dialog-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-title font-bold text-ink outline-none"
          >
            {t.focusDialogTitle}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t.focusClose}
            className="shrink-0 w-11 h-11 -mr-2 -mt-2 flex items-center justify-center rounded-full text-slt"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p className="text-caption text-slt leading-relaxed mb-4">{t.focusDialogBody}</p>

        {confirming ? (
          <div>
            <p className="text-body text-ink font-semibold mb-1.5">{t.focusConfirmTitle(selectedLabel)}</p>
            <p className="text-caption text-slt leading-relaxed mb-5">{t.focusConfirmBody}</p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary w-full justify-center py-3 min-h-[44px] disabled:opacity-50"
            >
              {saving ? t.focusSaving : t.focusConfirmYes}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="w-full text-center text-caption font-semibold text-slt mt-3 py-3 min-h-[44px]"
            >
              {t.focusConfirmNo}
            </button>
          </div>
        ) : (
          <div>
            <div role="radiogroup" aria-label={t.focusDialogTitle}>
              {personalised.length > 0 && (
                <>
                  <p className="text-micro font-bold text-slt uppercase mb-2">{t.focusDialogYours}</p>
                  <div className="flex flex-col gap-2 mb-4">
                    {personalised.map((o) => <Option key={o.id} option={o} />)}
                  </div>
                  <p className="text-micro font-bold text-slt uppercase mb-2">{t.focusDialogOther}</p>
                </>
              )}
              <div className="flex flex-col gap-2">
                {rest.map((o) => <Option key={o.id} option={o} />)}
                <Option option={{ id: CUSTOM_ID, label: t.focusSomethingElse }} />
              </div>
            </div>

            {isCustom && (
              <div className="mt-3">
                <label htmlFor="focus-custom" className="block text-caption font-semibold text-ink mb-1.5">
                  {t.focusCustomLabel}
                </label>
                <input
                  id="focus-custom"
                  type="text"
                  value={customText}
                  onChange={(e) => { setCustomText(e.target.value); setError(null); }}
                  placeholder={t.focusCustomPlaceholder}
                  maxLength={CUSTOM_MAX}
                  className="input-field"
                />
              </div>
            )}

            {error && <p className="text-caption text-red-400 mt-3" role="alert">{error}</p>}

            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!valid}
              className="btn-primary w-full justify-center py-3 min-h-[44px] mt-5 disabled:opacity-50"
            >
              {t.focusSave}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full text-center text-caption font-semibold text-slt mt-2 py-3 min-h-[44px]"
            >
              {t.focusCancel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
