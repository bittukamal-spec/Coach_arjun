import { useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Activity, User as UserIcon, Trophy,
  CheckCircle2, Settings as SettingsIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArjunLogo } from '../components/ArjunLogo';
import BottomNav from '../components/BottomNav';
import { useStartingProfile } from '../hooks/useStartingProfile';
import {
  ProfileSectionCard, ProfileChipGroup, CurrentFocusCard,
  PressureSequence, ChangeFocusDialog, ProfileSkeleton, ConsentNotice,
} from '../components/profile';
import { answerLabels } from '../onboarding/labels';

// ─── Performance Profile ────────────────────────────────────────────────────
// The coaching context Arjun remembers about this athlete — not an assessment,
// not a report, not a psychological interpretation of them.
//
// MVP simplification: everything the athlete sees on this page is now their
// OWN answer, shown exactly as they chose it. The rule engine still runs and
// still feeds Coach; it just no longer speaks for the athlete on their own
// profile, so "I get angry with myself" can never come back as "frustration
// with yourself can rise".
//
// Two modes, one component tree:
//   1. FIRST-TIME    — before fitResponse exists: "Your starting profile", a
//                      plain read-back of what they told us, with "Looks
//                      right" / "Change something", then the one-time
//                      Start-with-Arjun transition.
//   2. SAVED PROFILE — once fitResponse exists: five sections (Current Focus,
//                      My Game, When Pressure Hits, What Helps Me, My
//                      Strengths), each editable on its own. There is no
//                      full-profile refresh: nobody has to redo everything to
//                      change one thing.
//
// Mode is resolved from the stored profile first (fitResponse), so a refresh or
// a pasted URL always lands correctly; navigation state only makes the intent
// explicit.
//
// Viewing, confirming and changing focus are all open to under-18 accounts
// still waiting on guardian consent; only the conversation itself is gated.

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
  const agreedPhrase = profile?.agreedPriorityPhrase || null;

  const editPath = (section) => `/starting-profile/check-in?section=${section}`;

  // ── My Game — the stable sporting facts, Settings-owned ──────────────────
  // Goals are deliberately NOT here: they belong with Current Focus, which is
  // the one place that answers "what am I working on".
  const gameChips = useMemo(() => {
    const s = dp?.snapshot;
    if (!s) return [];
    return [
      s.sport && { key: 'sport', label: s.sport, icon: Activity },
      s.role && { key: 'role', label: s.role, icon: UserIcon },
      s.playingContext && { key: 'context', label: s.playingContext, icon: Trophy },
      s.experience && { key: 'experience', label: s.experience, icon: Trophy },
    ].filter(Boolean);
  }, [dp]);

  // ── The athlete's own answers, resolved to the labels they tapped ────────
  const sel = dp?.selections || null;
  const supportLabels = useMemo(() => answerLabels(sel?.supports, label), [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const strengthLabels = useMemo(() => answerLabels(sel?.strengths, label), [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const goalLabels = useMemo(() => answerLabels(sel?.broadGoals, label), [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const fourWeekLabel = useMemo(() => answerLabels(sel?.fourWeekOutcome, label)[0] || null, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const pressureStages = dp?.pressure?.stages || [];

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    setError(null);
    // "Looks right" is the same confirmation contract as before: fitResponse,
    // confirmedAt and the agreed priority are stored exactly as they always
    // were. Corrections now happen by editing the answers themselves, which is
    // why no separate correction note is sent.
    const res = await confirm({ fit: 'CONFIRMED' });
    setSaving(false);
    if (!res.ok) { setError(t.loadError); return; }
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
  // state, which is a linear flow the athlete should finish, not browse away
  // from. Driven by `savedMode`, NOT by consent: a consent-pending athlete with
  // a saved profile is still on that destination and keeps the bar.
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

        <h1 className="text-title font-bold text-ink mb-3">
          {savedMode ? t.savedTitleShort : t.summaryTitle}
        </h1>
        {!savedMode && <p className="text-body text-slt mb-4 leading-relaxed">{t.summarySubtitle}</p>}

        {savedMode ? (
          // ── SAVED profile — five sections, each edited on its own ────────
          <div className="flex flex-col gap-3">
            <CurrentFocusCard
              label={t.currentFocusLabel}
              focusLabel={dp?.currentFocus?.label || dp?.suggestedFocus?.label}
              helper={t.currentFocusHelper}
              updatedText={focusUpdated ? t.updatedOn(focusUpdated) : null}
              onChangeFocus={() => setFocusOpen(true)}
              changeFocusLabel={t.changeFocus}
              changeFocusRef={changeFocusRef}
            >
              {/* Goals stay reachable and editable in their own right — they
                  did not disappear with the full check-in. */}
              <div className="mt-3 pt-3 border-t border-dark-600">
                <p className="text-micro font-bold text-slt uppercase">{t.goalsLabel}</p>
                <p className={`text-body break-words ${goalLabels.length ? 'text-ink' : 'text-muted italic'}`}>
                  {goalLabels.length ? goalLabels.join(' · ') : t.notSetYet}
                </p>
                <p className="text-micro font-bold text-slt uppercase mt-2">{t.fourWeekLabel}</p>
                <p className={`text-body break-words ${fourWeekLabel ? 'text-ink' : 'text-muted italic'}`}>
                  {fourWeekLabel || t.notSetYet}
                </p>
                <button
                  type="button"
                  onClick={() => navigate(editPath('goals'))}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center mt-1 text-caption font-semibold text-brand-500 active:opacity-70"
                >
                  {t.updateGoals}
                </button>
              </div>
            </CurrentFocusCard>

            {/* ── My Game — display only; sport/role/level stay Settings-owned. */}
            {gameChips.length > 0 && (
              <ProfileSectionCard id="profile-game" title={t.myGameTitle}>
                <ProfileChipGroup items={gameChips} ariaLabel={t.myGameTitle} />
                <Link to="/account" className="inline-flex items-center gap-1 mt-3 min-h-[44px] min-w-[44px] text-caption font-semibold text-brand-400 active:opacity-70">
                  <SettingsIcon size={13} aria-hidden="true" />
                  {t.myGameSettingsLink}
                </Link>
              </ProfileSectionCard>
            )}

            {/* ── When Pressure Hits — the athlete's own four answers. */}
            <ProfileSectionCard id="profile-pressure" title={t.pressureTitle}>
              <PressureSequence stages={pressureStages} labelFor={label} t={t} ariaLabel={t.pressureTitle} />
              <button
                type="button"
                onClick={() => navigate(editPath('pressure'))}
                className="inline-flex items-center gap-1 mt-4 min-h-[44px] min-w-[44px] text-caption font-semibold text-brand-400 active:opacity-70"
              >
                {t.updateAction} <ChevronRight size={12} aria-hidden="true" />
              </button>
            </ProfileSectionCard>

            {/* ── What Helps Me — their own choices, unranked, unrewritten. */}
            <ProfileSectionCard id="profile-helps" title={t.whatHelpsMeTitle}>
              {supportLabels.length > 0 ? (
                <ul aria-label={t.whatHelpsMeTitle} className="list-none p-0 flex flex-col gap-2">
                  {supportLabels.map((text) => (
                    <li key={text} className="flex items-start gap-2 text-body text-ink break-words">
                      <CheckCircle2 size={16} className="text-win-500 shrink-0 mt-0.5" aria-hidden="true" />
                      {text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body text-muted italic leading-relaxed">{t.notSetYet}</p>
              )}
              <button
                type="button"
                onClick={() => navigate(editPath('helps'))}
                className="min-h-[44px] min-w-[44px] inline-flex items-center mt-3 text-caption font-semibold text-brand-400 active:opacity-70"
              >
                {t.editAction}
              </button>
            </ProfileSectionCard>

            {/* ── My Strengths. */}
            <ProfileSectionCard id="profile-strengths" title={t.myStrengthsTitle}>
              {strengthLabels.length > 0 ? (
                <ProfileChipGroup
                  items={strengthLabels.map((text) => ({ key: text, label: text }))}
                  ariaLabel={t.myStrengthsTitle}
                />
              ) : (
                <p className="text-body text-muted italic leading-relaxed">{t.notSetYet}</p>
              )}
              <button
                type="button"
                onClick={() => navigate(editPath('strengths'))}
                className="min-h-[44px] min-w-[44px] inline-flex items-center mt-3 text-caption font-semibold text-brand-400 active:opacity-70"
              >
                {t.editAction}
              </button>
            </ProfileSectionCard>
          </div>
        ) : (
          // ── FIRST-TIME "Your starting profile" — a read-back, not a report ─
          <div className="flex flex-col gap-3">
            <ProfileSectionCard id="profile-summary-focus" title={t.summaryMainFocus}>
              <p className="text-body text-ink font-semibold break-words">
                {dp?.suggestedFocus?.label || t.notSetYet}
              </p>
            </ProfileSectionCard>

            <ProfileSectionCard id="profile-summary-pressure" title={t.summaryWhenPressure}>
              <PressureSequence stages={pressureStages} labelFor={label} t={t} ariaLabel={t.summaryWhenPressure} />
            </ProfileSectionCard>

            <ProfileSectionCard id="profile-summary-helps" title={t.summaryWhatHelps}>
              <p className={`text-body break-words ${supportLabels.length ? 'text-ink' : 'text-muted italic'}`}>
                {supportLabels.length ? supportLabels.join(' · ') : t.notSetYet}
              </p>
            </ProfileSectionCard>

            <ProfileSectionCard id="profile-summary-strengths" title={t.summaryStrengths}>
              <p className={`text-body break-words ${strengthLabels.length ? 'text-ink' : 'text-muted italic'}`}>
                {strengthLabels.length ? strengthLabels.join(' · ') : t.notSetYet}
              </p>
            </ProfileSectionCard>
          </div>
        )}

        {safetyGuidance && (
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

        {/* ── First-time confirmation — "Looks right" / "Change something" ── */}
        {!confirmed && (
          <div className="mt-6">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="btn-primary w-full justify-center py-3 disabled:opacity-50"
            >
              {saving ? t.saving : t.looksRight}
            </button>
            <button
              type="button"
              onClick={() => navigate(editPath('pressure'))}
              className="w-full text-center text-caption font-semibold text-brand-400 mt-3 py-3 min-h-[44px]"
            >
              {t.changeSomething}
            </button>
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

        {!savedMode && <p className="text-caption text-muted mt-6 leading-relaxed text-center">{t.notDiagnosis}</p>}

        {/* Focus-change success is announced, not just shown. */}
        <div role="status" aria-live="polite" className="sr-only">{focusToast || ''}</div>
        {focusToast && (
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
