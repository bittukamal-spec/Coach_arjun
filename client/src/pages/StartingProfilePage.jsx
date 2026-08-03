import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Activity, User as UserIcon, Trophy, Target as TargetIcon, Flag, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArjunLogo } from '../components/ArjunLogo';
import BottomNav from '../components/BottomNav';
import { useStartingProfile } from '../hooks/useStartingProfile';
import { SelectableOption, CustomAnswerField } from '../components/onboarding';
import {
  ProfileSectionCard, ProfileChipGroup, CurrentFocusCard,
  PerformancePathway, ChangeFocusDialog, ProfileSkeleton, ConsentNotice,
  ContinueCoachingRow,
} from '../components/profile';
import { isValidCustomText } from '../utils/sanitizeCustomText';
import * as CFG from '../onboarding/config';

// ─── Performance Profile ────────────────────────────────────────────────────
// Arjun's ONE starting interpretation of the athlete, plus the one mutable part
// (their current focus). Never a diagnosis, a score, or a personality type.
//
// Two modes, one component tree:
//   1. FIRST-TIME    — before fitResponse exists: the full visual profile with
//                      a SUGGESTED STARTING FOCUS (no Change focus, since
//                      nothing is confirmed yet), then "does this fit?", the
//                      correction flow, and the one-time Start-with-Arjun
//                      transition.
//   2. SAVED PROFILE — once fitResponse exists: read-only, CURRENT FOCUS with
//                      Change focus, and no onboarding-completion controls.
//
// Mode is resolved from the stored profile first (fitResponse), so a refresh or
// a pasted URL always lands correctly; navigation state only makes the intent
// explicit.
//
// Every psychological word on this page comes from the server's displayProfile.
// The client resolves no answer id to a label and composes no sentence.
//
// Viewing, confirming and changing focus are all open to under-18 accounts
// still waiting on guardian consent; only the conversation itself is gated.

const CORRECTION_MAX = 120;

function tPath(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

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

  const { phase, profile, consent, safetyGuidance, reload, confirm, startChat, changeFocus } = useStartingProfile(token);

  const [fit, setFit] = useState(null);
  const [pickedPriority, setPickedPriority] = useState(null);
  const [correctionText, setCorrectionText] = useState('');
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [resent, setResent] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusToast, setFocusToast] = useState(null);
  // True only for the confirmation that just happened on this screen — the one
  // moment the completion transition is correct. A refresh clears it, which is
  // exactly right: the athlete is then looking at a saved profile.
  const [justConfirmed, setJustConfirmed] = useState(false);
  const changeFocusRef = useRef(null);

  // Read once at mount: navigation state is a hint, never the source of truth.
  const entryMode = useRef(location.state?.entryMode || null).current;

  const confirmed = !!profile?.fitResponse;
  const savedMode = confirmed && (!justConfirmed || entryMode === 'saved-profile');

  const dp = profile?.displayProfile || null;

  // The athlete's own difficult moments, resolved to labels from the shared
  // onboarding config — the correction flow's option list, unchanged.
  const priorityOptions = useMemo(() => {
    const q = CFG.getQuestion('difficult_moments');
    return (profile?.priorityOptions || [])
      .map((id) => q?.answers?.find((a) => a.id === id))
      .filter(Boolean)
      .map((a) => ({ id: a.id, label: label(a.key) }));
  }, [profile?.priorityOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const agreedPhrase = profile?.agreedPriorityPhrase || null;

  // Snapshot chips: every item independently omitted when absent, so a missing
  // answer never shows an empty chip, "Unknown", or a fabricated value.
  const snapshotChips = useMemo(() => {
    const s = dp?.snapshot;
    if (!s) return [];
    const goalList = (s.goals || []).map((g) => g.label).filter(Boolean).join(', ');
    return [
      s.sport && { key: 'sport', label: s.sport, icon: Activity },
      s.role && { key: 'role', label: s.role, icon: UserIcon },
      s.playingContext && { key: 'context', label: s.playingContext, icon: Trophy },
      s.experience && { key: 'experience', label: s.experience, icon: Trophy },
      goalList && { key: 'goals', label: t.goalsChip(goalList), icon: TargetIcon },
      s.fourWeekOutcome && { key: 'outcome', label: t.fourWeekChip(s.fourWeekOutcome), icon: Flag },
    ].filter(Boolean);
  }, [dp, t]);

  // Supports and strengths are two DIFFERENT things the athlete told us —
  // what already helps them, and what they say they are good at. The payload
  // has always kept them apart; presenting them as one list blurred that, so
  // each is now its own labelled group. Neither is scored, ranked or merged,
  // and an empty group is omitted rather than padded.
  const toChips = (items) =>
    (items || []).filter((x) => x && x.label).map((x) => ({ key: x.id, label: x.label, icon: CheckCircle2 }));
  const supportChips = useMemo(() => toChips(dp?.supports), [dp]); // eslint-disable-line react-hooks/exhaustive-deps
  const strengthChips = useMemo(() => toChips(dp?.strengths), [dp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Node-kind vocabulary for the pathway, keyed off the server's stable
  // `node.type`. The step TEXT still comes from the server untouched.
  const patternKindLabels = useMemo(() => ({
    situation: t.patternSituation,
    reaction: t.patternReaction,
    effect: t.patternEffect,
    duration: t.patternDuration,
  }), [t]);

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

  // Closes the sheet and returns focus to the control that opened it.
  function closeFocusDialog() {
    setFocusOpen(false);
    requestAnimationFrame(() => changeFocusRef.current?.focus());
  }

  async function handleSaveFocus({ focusId, customText }) {
    const res = await changeFocus({ focusId, customText });
    if (res.ok) {
      closeFocusDialog();
      setFocusToast(t.focusUpdated);
      setTimeout(() => setFocusToast(null), 4000);
    }
    return res;
  }

  // ── Loading / recovery states ────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-dark-900 px-page py-6">
        <div className="max-w-md mx-auto">
          <ProfileSkeleton label={t.loading} />
        </div>
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

  const focusUpdatedRaw = dp?.currentFocus?.updatedAt || profile.updatedAt || profile.confirmedAt || profile.generatedAt;
  const focusUpdated = formatDate(focusUpdatedRaw, language);

  // ── State-aware app navigation ──────────────────────────────────────────
  // The bottom bar belongs to the SAVED profile — the destination an athlete
  // taps "Profile" to reach. It is deliberately absent from every first-time
  // state (review, correction, and the one-time "Got it" transition), which is
  // a linear flow the athlete should finish, not browse away from.
  //
  // Driven by `savedMode`, NOT by consent: a consent-pending athlete with a
  // saved profile is still on that destination and keeps the bar. What consent
  // removes is the coaching action further down, and it is removed from the
  // DOM rather than disabled.
  //
  // The loading, incomplete and error states all return above this line, so
  // the bar cannot flash before the mode is known. This route mounts no
  // BottomNav in App.jsx, so this is the only instance on the page.
  const showAppNav = savedMode;

  return (
    <div
      className={`min-h-screen bg-dark-900 px-page py-4 ${
        showAppNav ? 'pb-28' : 'pb-[calc(2rem+env(safe-area-inset-bottom))]'
      }`}
    >
      <div className="max-w-md mx-auto">
        {/* ── Top app bar ── */}
        <div className="flex items-center gap-2.5 mb-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={t.backAria}
            className="w-11 h-11 -ml-2.5 flex items-center justify-center rounded-full text-ink"
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <ArjunLogo size={30} />
          <span className="text-heading font-semibold text-ink">Arjun</span>
        </div>

        {/* ── Page title. Saved mode deliberately has NO subtitle. ── */}
        <h1 className="text-title font-bold text-ink mb-3">
          {savedMode ? t.savedTitleShort : t.title}
        </h1>
        {!savedMode && <p className="text-body text-slt mb-4 leading-relaxed">{t.subtitle}</p>}

        <div className="flex flex-col gap-3">
          {/* ── Current / suggested focus ── */}
          {savedMode ? (
            <CurrentFocusCard
              label={t.currentFocusLabel}
              // The server always resolves a current focus for a confirmed
              // profile (falling back to the agreed starting priority), so the
              // suggested label is only a defence against an older payload —
              // without it the whole card would vanish.
              focusLabel={dp?.currentFocus?.label || dp?.suggestedFocus?.label}
              helper={t.currentFocusHelper}
              updatedText={focusUpdated ? t.updatedOn(focusUpdated) : null}
              onChangeFocus={() => setFocusOpen(true)}
              changeFocusLabel={t.changeFocus}
              changeFocusRef={changeFocusRef}
            />
          ) : (
            <CurrentFocusCard
              label={t.suggestedFocusLabel}
              focusLabel={dp?.suggestedFocus?.label}
              helper={t.suggestedFocusHelper}
            />
          )}

          {/* ── Athlete snapshot — now a visible heading, not sr-only ── */}
          {snapshotChips.length > 0 && (
            <ProfileSectionCard id="profile-snapshot" title={t.snapshotTitle}>
              <ProfileChipGroup items={snapshotChips} ariaLabel={t.snapshotTitle} />
            </ProfileSectionCard>
          )}

          {/* ── Your Starting Pattern — the frozen onboarding baseline ── */}
          {dp?.startingPattern?.nodes?.length > 0 && (
            <ProfileSectionCard
              id="profile-pattern"
              title={t.startingPatternTitle}
              note={t.startingPatternNote}
            >
              <PerformancePathway
                nodes={dp.startingPattern.nodes}
                stepAria={t.patternStepAria}
                kindLabels={patternKindLabels}
              />
              {(dp.startingPattern.notes || []).length > 0 && (
                <ul className="list-none p-0 mt-3 flex flex-col gap-1">
                  {dp.startingPattern.notes.map((n) => (
                    <li key={n.kind} className="text-caption text-slt break-words">{n.text}</li>
                  ))}
                </ul>
              )}
            </ProfileSectionCard>
          )}

          {/* ── What Already Helps — the athlete's supports.
               Shown whenever there are supports, and also when BOTH groups are
               empty, so "nothing named yet" is said once in a real card rather
               than leaving the page with a silent gap. ── */}
          {(supportChips.length > 0 || strengthChips.length === 0) && (
            <ProfileSectionCard id="profile-helps" title={t.whatHelpsTitle}>
              {supportChips.length > 0
                ? <ProfileChipGroup items={supportChips} ariaLabel={t.whatHelpsTitle} />
                : <p className="text-body text-slt leading-relaxed">{t.whatHelpsEmpty}</p>}
            </ProfileSectionCard>
          )}

          {/* ── Strengths you named — a separate group, omitted when empty ── */}
          {strengthChips.length > 0 && (
            <ProfileSectionCard id="profile-strengths" title={t.strengthsTitle}>
              <ProfileChipGroup items={strengthChips} ariaLabel={t.strengthsTitle} />
            </ProfileSectionCard>
          )}

          {/* ── A possible pattern — the stored interpretation wording,
               verbatim. Never regenerated, never re-worded here. ── */}
          {dp?.interpretation && (
            <ProfileSectionCard id="profile-interpretation" title={t.sectionPattern}>
              <p className="text-body text-ink leading-relaxed whitespace-pre-line">{dp.interpretation}</p>
            </ProfileSectionCard>
          )}

          {/* ── Where We Can Begin — stored wording, never regenerated ── */}
          {dp?.nextStep && (
            <ProfileSectionCard id="profile-begin" title={t.whereWeBeginTitle}>
              <p className="text-body text-ink leading-relaxed whitespace-pre-line">{dp.nextStep}</p>
            </ProfileSectionCard>
          )}
        </div>

        {safetyGuidance && (
          // Same theme-branched warn tokens as the consent notice: the fixed
          // amber classes this used to carry were unreadable in the light
          // theme, and safety guidance is the last thing that should be hard
          // to read. Wording and behaviour unchanged.
          <div
            className="rounded-2xl px-4 py-3 mt-4 border"
            style={{ background: 'var(--surface-warn)', borderColor: 'var(--border-warn)' }}
          >
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--status-warn)' }}>
              {t.safetyTitle}
            </p>
            <p className="text-xs text-slt leading-relaxed whitespace-pre-line">{safetyGuidance}</p>
          </div>
        )}

        {/* ── Does this fit? — first-time only ── */}
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

        {/* ── Saved profile: one quiet way back into coaching. `startChat` is
             idempotent server-side, so this reopens the existing first
             conversation and never creates a second. ── */}
        {savedMode && !consent.pending && (
          <div className="mt-5">
            <ContinueCoachingRow
              label={t.continueCoaching}
              busyLabel={t.starting}
              busy={starting}
              onClick={handleStartChat}
            />
          </div>
        )}

        {/* Consent still outstanding: a pending minor reopening their profile
            must not be left without the resend action, and gets no route into
            chat at all — the control is absent, not disabled. */}
        {savedMode && consent.pending && (
          <div className="mt-4">
            <ConsentNotice t={t} guardianEmailMasked={consent.guardianEmailMasked} onResend={handleResend} resent={resent} />
          </div>
        )}

        {/* ── One-time completion transition ── */}
        {confirmed && !savedMode && (
          <div className="mt-6">
            <h2 className="text-body font-semibold text-ink mb-1">{t.savedTitle}</h2>
            <p className="text-body text-slt mb-4">
              {agreedPhrase ? t.savedBody(agreedPhrase) : t.savedBodyPlain}
            </p>

            {consent.pending ? (
              <ConsentNotice t={t} guardianEmailMasked={consent.guardianEmailMasked} onResend={handleResend} resent={resent} />
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
              className="w-full text-center text-caption text-slt mt-4 py-3 min-h-[44px]"
            >
              {t.backToDashboard}
            </button>
          </div>
        )}

        {error && <p className="text-caption text-red-400 mt-3" role="alert">{error}</p>}

        <p className="text-caption text-muted mt-6 leading-relaxed text-center">{t.notDiagnosis}</p>

        {/* Focus-change success is announced, not just shown. */}
        <div role="status" aria-live="polite" className="sr-only">{focusToast || ''}</div>
        {focusToast && (
          // Lifted clear of the bottom bar when it is mounted, so the
          // confirmation is never half-hidden behind the nav.
          <div
            className={`fixed left-0 right-0 flex justify-center px-4 pointer-events-none ${
              showAppNav ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'bottom-6'
            }`}
          >
            <p className="px-4 py-2 rounded-full bg-dark-400 border border-dark-600 text-caption font-semibold text-ink shadow-card">
              {focusToast}
            </p>
          </div>
        )}
      </div>

      {showAppNav && <BottomNav />}

      {focusOpen && (
        <ChangeFocusDialog
          t={t}
          options={profile.focusOptions || []}
          currentFocusId={dp?.currentFocus?.id || null}
          onCancel={closeFocusDialog}
          onSave={handleSaveFocus}
        />
      )}
    </div>
  );
}
