import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { useStartingProfile } from '../hooks/useStartingProfile';
import { SelectableOption, CustomAnswerField } from '../components/onboarding';
import { isValidCustomText } from '../utils/sanitizeCustomText';
import * as CFG from '../onboarding/config';

// ─── Starting Performance Profile (PR 3) ────────────────────────────────────
// Arjun's ONE starting interpretation of the athlete. It is a starting point,
// never a diagnosis, a score, or a personality type — and the athlete's answer
// to "does this fit?" is what the coaching actually uses.
//
// The page has two modes:
//   1. FIRST-TIME    — straight after onboarding, while fitResponse is empty:
//                      the four sections, "does this fit?", the correction
//                      flow, and the one-time Start-with-Arjun transition.
//   2. SAVED PROFILE — reopened later from Account or by direct navigation
//                      once fitResponse exists: read-only, with no
//                      onboarding-completion controls at all.
//
// Mode is resolved from the stored profile first (fitResponse), so a refresh
// or a pasted URL always lands correctly; navigation state only makes the
// intent explicit. Editing a saved profile is deliberately not built here.
//
// Viewing and confirming are open to under-18 accounts still waiting on
// guardian consent; only the conversation itself is consent-gated.

const CORRECTION_MAX = 120;

function tPath(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function Section({ title, body }) {
  if (!body) return null;
  return (
    <section className="card p-5 mb-3">
      <h2 className="text-caption font-semibold uppercase tracking-wide text-slt mb-1.5">{title}</h2>
      <p className="text-body text-ink leading-relaxed whitespace-pre-line">{body}</p>
    </section>
  );
}

const FIT_STATUS_KEY = { CONFIRMED: 'statusConfirmed', PARTLY: 'statusPartly', NOT_REALLY: 'statusCorrected' };

function formatDate(value, language) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export default function StartingProfilePage() {
  const { token, language } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const L = translations[language] || translations.en;
  const t = L.startingProfile;
  const label = (key) => tPath(L, key) ?? key;

  const { phase, profile, consent, safetyGuidance, reload, confirm, startChat } = useStartingProfile(token);

  const [fit, setFit] = useState(null);
  const [pickedPriority, setPickedPriority] = useState(null);
  const [correctionText, setCorrectionText] = useState('');
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [resent, setResent] = useState(false);
  // True only for the confirmation that just happened on this screen — the one
  // moment the completion transition is correct. A refresh clears it, which is
  // exactly right: the athlete is then looking at a saved profile.
  const [justConfirmed, setJustConfirmed] = useState(false);

  // Read once at mount: navigation state is a hint, never the source of truth.
  const entryMode = useRef(location.state?.entryMode || null).current;

  const confirmed = !!profile?.fitResponse;
  // Saved view whenever the profile is already confirmed, unless this very
  // screen is the one that just confirmed it and the athlete did not arrive
  // from Account asking to view it.
  const savedMode = confirmed && (!justConfirmed || entryMode === 'saved-profile');

  // The athlete's own difficult moments, resolved to labels from the shared
  // onboarding config — no wording is duplicated on the wire.
  const priorityOptions = useMemo(() => {
    const q = CFG.getQuestion('difficult_moments');
    return (profile?.priorityOptions || [])
      .map((id) => q?.answers?.find((a) => a.id === id))
      .filter(Boolean)
      .map((a) => ({ id: a.id, label: label(a.key) }));
  }, [profile?.priorityOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  // The conversational phrase from the server ("what happens when the pressure
  // increases"). The onboarding option label is a list label, not prose — it
  // must never be dropped into a sentence.
  const agreedPhrase = profile?.agreedPriorityPhrase || null;

  const needsCorrection = fit === 'NOT_REALLY';
  const correctionReady =
    !needsCorrection || !!pickedPriority || isValidCustomText(correctionText, CORRECTION_MAX);

  async function handleConfirm() {
    if (!fit || saving || !correctionReady) return;
    setSaving(true);
    setError(null);
    const res = await confirm({
      fit,
      agreedPriorityId: pickedPriority || undefined,
      correctionSelectedId: fit === 'CONFIRMED' ? undefined : pickedPriority || undefined,
      correctionText: fit === 'CONFIRMED' ? undefined : correctionText.trim() || undefined,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error === 'NETWORK' ? t.loadError : t.correctionNeeded); return; }
    setJustConfirmed(true);
  }

  async function handleStartChat() {
    if (starting) return;
    setStarting(true);
    setError(null);
    const res = await startChat();
    setStarting(false);
    if (res.ok) {
      // `replace` so the profile is not the immediate previous entry, and an
      // explicit destination so Back from the first conversation goes home
      // rather than back into the confirmation flow the athlete just finished.
      navigate('/coaching', {
        replace: true,
        state: { chatSessionId: res.chatSessionId, returnTo: '/dashboard', enteredFromStartingProfile: true },
      });
      return;
    }
    if (res.error !== 'CONSENT_REQUIRED') setError(t.startError);
  }

  async function handleResend() {
    try {
      const res = await apiFetch('/api/auth/resend-guardian-consent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setResent(true);
    } catch { /* ignore */ }
  }

  // ── Loading / recovery states ────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center" role="status" aria-live="polite">
        <Loader2 size={28} className="animate-spin text-brand-500" aria-hidden="true" />
        <span className="sr-only">{t.loading}</span>
      </div>
    );
  }
  if (phase === 'incomplete') {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-body text-slt mb-4">{t.incomplete}</p>
        <button type="button" onClick={() => navigate('/onboarding')} className="btn-primary py-3 px-6">
          {t.goToOnboarding}
        </button>
      </div>
    );
  }
  if (phase === 'error' || !profile) {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-body text-slt mb-4">{t.loadError}</p>
        <button type="button" onClick={reload} className="btn-primary py-3 px-6">{t.retry}</button>
      </div>
    );
  }

  const s = profile.sections || {};

  return (
    <div className="min-h-screen bg-dark-900 px-5 py-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-h2 font-bold text-ink mb-1.5">{savedMode ? t.savedViewTitle : t.title}</h1>
        <p className="text-body text-slt mb-6 leading-relaxed">{savedMode ? t.savedViewSubtitle : t.subtitle}</p>

        {/* ── Saved profile: the agreed focus and what the athlete said ── */}
        {savedMode && (
          <div className="card p-5 mb-3">
            {agreedPhrase && (
              <>
                <h2 className="text-caption font-semibold uppercase tracking-wide text-slt mb-1.5">{t.agreedFocusLabel}</h2>
                <p className="text-body text-ink leading-relaxed mb-3">{agreedPhrase}</p>
              </>
            )}
            <p className="text-caption text-slt">
              {t.statusLabel}: <span className="text-ink font-semibold">{t[FIT_STATUS_KEY[profile.fitResponse]] || ''}</span>
            </p>
            {formatDate(profile.updatedAt || profile.confirmedAt || profile.generatedAt, language) && (
              <p className="text-caption text-muted mt-1">
                {t.lastUpdated(formatDate(profile.updatedAt || profile.confirmedAt || profile.generatedAt, language))}
              </p>
            )}
          </div>
        )}

        <Section title={t.sectionWhatMatters} body={s.whatMatters} />
        <Section title={t.sectionPattern} body={s.possiblePattern} />
        <Section title={t.sectionHelps} body={s.whatHelps} />
        <Section title={t.sectionBegin} body={s.whereWeBegin} />

        {safetyGuidance && (
          <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl px-4 py-3 mt-4">
            <p className="text-sm font-semibold text-amber-400 mb-1">{t.safetyTitle}</p>
            <p className="text-xs text-slt leading-relaxed whitespace-pre-line">{safetyGuidance}</p>
          </div>
        )}

        {/* ── Does this fit? ── */}
        {!confirmed && (
          <div className="mt-6">
            <h2 className="text-body font-semibold text-ink mb-3">{t.fitQuestion}</h2>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={t.fitQuestion}>
              <SelectableOption label={t.fitConfirmed} selected={fit === 'CONFIRMED'} onSelect={() => setFit('CONFIRMED')} />
              <SelectableOption label={t.fitPartly} selected={fit === 'PARTLY'} onSelect={() => setFit('PARTLY')} />
              <SelectableOption label={t.fitNotReally} selected={fit === 'NOT_REALLY'} onSelect={() => setFit('NOT_REALLY')} />
            </div>

            {(fit === 'PARTLY' || fit === 'NOT_REALLY') && (
              <div className="mt-5">
                <h3 className="text-body font-semibold text-ink mb-1">{t.correctionTitle}</h3>
                <p className="text-caption text-slt mb-3">{t.correctionHint}</p>
                <div className="flex flex-col gap-2" role="radiogroup" aria-label={t.correctionTitle}>
                  {priorityOptions.map((o) => (
                    <SelectableOption
                      key={o.id}
                      label={o.label}
                      selected={pickedPriority === o.id}
                      onSelect={() => setPickedPriority((cur) => (cur === o.id ? null : o.id))}
                    />
                  ))}
                </div>
                <CustomAnswerField
                  id="profile-correction"
                  label={t.correctionPlaceholder}
                  placeholder={t.correctionPlaceholder}
                  value={correctionText}
                  onChange={setCorrectionText}
                  maxLength={CORRECTION_MAX}
                  autoFocus={false}
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!fit || saving || !correctionReady}
              className="btn-primary w-full justify-center py-3 mt-5 disabled:opacity-50"
            >
              {saving ? t.saving : t.saveFit}
            </button>
            {needsCorrection && !correctionReady && (
              <p className="text-caption text-slt mt-2">{t.correctionNeeded}</p>
            )}
          </div>
        )}

        {/* ── Saved profile: read-only, with one quiet way back into coaching.
             `startChat` is idempotent server-side, so this opens the existing
             first conversation and never creates a second one. ── */}
        {savedMode && !consent.pending && (
          <button
            type="button"
            onClick={handleStartChat}
            disabled={starting}
            className="w-full text-center text-caption font-semibold text-brand-400 mt-2 py-2 underline disabled:opacity-60"
          >
            {starting ? t.starting : t.continueCoaching}
          </button>
        )}

        {/* Consent is still outstanding: say so here too, so a pending minor
            reopening their profile is not left without the resend action. */}
        {savedMode && consent.pending && (
          <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl px-4 py-3 mt-4">
            <div className="flex items-start gap-2.5">
              <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-400">{t.consentTitle}</p>
                <p className="text-xs text-slt mt-1 leading-relaxed">{t.consentBody}</p>
                {consent.guardianEmailMasked && (
                  <p className="text-xs text-slt mt-1">{t.consentEmailed(consent.guardianEmailMasked)}</p>
                )}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resent}
                  className="text-xs font-semibold text-amber-400 underline mt-2 disabled:opacity-60"
                >
                  {resent ? t.resent : t.resend}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── One-time completion transition: only on the screen where the
             athlete just answered "does this fit?" ── */}
        {confirmed && !savedMode && (
          <div className="mt-6">
            <h2 className="text-body font-semibold text-ink mb-1">{t.savedTitle}</h2>
            <p className="text-body text-slt mb-4">
              {agreedPhrase ? t.savedBody(agreedPhrase) : t.savedBodyPlain}
            </p>

            {consent.pending ? (
              <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-400">{t.consentTitle}</p>
                    <p className="text-xs text-slt mt-1 leading-relaxed">{t.consentBody}</p>
                    {consent.guardianEmailMasked && (
                      <p className="text-xs text-slt mt-1">{t.consentEmailed(consent.guardianEmailMasked)}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resent}
                      className="text-xs font-semibold text-amber-400 underline mt-2 disabled:opacity-60"
                    >
                      {resent ? t.resent : t.resend}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartChat}
                disabled={starting}
                className="btn-primary w-full justify-center py-3 disabled:opacity-50"
              >
                {starting ? t.starting : t.startChat}
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/dashboard', { replace: true })}
              className="w-full text-center text-caption text-slt mt-4 py-2"
            >
              {t.backToDashboard}
            </button>
          </div>
        )}

        {error && <p className="text-caption text-red-400 mt-3" role="alert">{error}</p>}

        <p className="text-caption text-muted mt-8 leading-relaxed">{t.notDiagnosis}</p>
      </div>
    </div>
  );
}
