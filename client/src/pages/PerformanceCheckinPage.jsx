import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { useStartingProfile } from '../hooks/useStartingProfile';
import CheckinQuestion, { checkinScreenValid } from '../components/profile/CheckinQuestion';
import { ProfileSkeleton } from '../components/profile';
import ModalDialog from '../components/onboarding/ModalDialog';
import * as CFG from '../onboarding/config';

// ─── Section-scoped profile edit ───────────────────────────────────────────
// NEVER called "onboarding" in this page's own copy: onboarding is the
// first-time flow, this is one athlete changing one part of a profile they
// already have.
//
// There is no longer a full "Performance Check-in": an athlete who wants to
// change what helps them does not have to walk through their pressure
// sequence, their strengths and their goals to get there. Every entry point is
// scoped to exactly one section:
//
//   ?section=pressure    Situation → First response → Performance impact → Reset
//   ?section=helps       what helps me
//   ?section=strengths   my strengths
//   ?section=goals       broad goals + the 4-week change
//
// The last question saves directly — no old-values → new-values review screen
// between the athlete and their own answers — and lands back on the profile.
// A save sends ONLY the questions in scope, so editing one section can never
// overwrite another.
//
// The bare /starting-profile/check-in URL (the retired full flow) redirects to
// the profile rather than 404ing an old bookmark or back-button entry.

function tPath(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// `pattern` is the pre-simplification name for the pressure section, kept so an
// old bookmark or an in-flight client bundle still lands somewhere sensible.
const SECTION_ALIASES = { pattern: 'pressure' };
const VALID_SECTIONS = new Set(['pressure', 'helps', 'strengths', 'goals']);

export default function PerformanceCheckinPage() {
  const { token, language } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const L = translations[language] || translations.en;
  const c = L.performanceCheckin;
  const t = L.startingProfile;
  const label = (key) => tPath(L, key) ?? key;

  const { phase: loadPhase, profile, updateAnswers } = useStartingProfile(token);

  const requested = searchParams.get('section');
  const section = SECTION_ALIASES[requested] || requested;
  const scoped = VALID_SECTIONS.has(section) ? section : null;

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(null); // lazily seeded from profile.checkin.answers
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [confirmBranchChange, setConfirmBranchChange] = useState(null); // { nextStep }

  const originalAnswers = profile?.checkin?.answers || null;
  const screensByCategory = profile?.checkin?.screens || null;

  // Seed the editable draft once the profile has loaded — never re-seeded on a
  // later render (that would silently discard in-progress edits), so Back and
  // Next both preserve the draft.
  useEffect(() => {
    if (answers === null && originalAnswers) setAnswers(originalAnswers);
  }, [answers, originalAnswers]);
  const working = answers || originalAnswers || {};

  // The screens in scope. For the pressure section the list is recomputed from
  // the DRAFT answers, not the stored ones: changing the situation changes
  // which follow-up questions apply, and the athlete answers the new ones in
  // this same flow.
  const screenIds = useMemo(() => {
    if (!scoped || !screensByCategory) return [];
    if (scoped !== 'pressure') return screensByCategory[scoped] || [];
    const branchId = CFG.resolveBranch(working);
    const branchScreens = branchId ? (CFG.config.branches[branchId]?.screenIds || []) : [];
    return ['primary_priority', ...branchScreens];
  }, [scoped, screensByCategory, working]);

  // An unscoped visit is the retired full check-in: send it to the profile.
  if (!scoped) return <Navigate to="/starting-profile" replace />;

  if (loadPhase === 'loading' || !profile) {
    return (
      <div className="min-h-screen bg-dark-900 px-page py-6">
        <div className="max-w-md mx-auto">
          <ProfileSkeleton label={t.loading} />
        </div>
      </div>
    );
  }
  if (loadPhase === 'error') {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-body text-slt mb-4">{c.loadError}</p>
        <button type="button" onClick={() => navigate('/starting-profile')} className="btn-primary py-3 px-6">{c.retry}</button>
      </div>
    );
  }

  function goBackToProfile() {
    navigate('/starting-profile', { replace: true });
  }

  function handleBack() {
    if (step <= 0) { goBackToProfile(); return; }
    setStep((s) => s - 1);
  }

  // Which branch questions the athlete has already answered that the branch
  // they are moving to does not ask. Nothing is deleted — the server keeps
  // them — but they will no longer be part of this profile, so the athlete is
  // told before they commit to it.
  function orphanedBranchQuestions() {
    const reachable = CFG.reachableQuestionIds(working);
    return Object.keys(originalAnswers || {}).filter(
      (qid) => CFG.isBranchQuestion(qid) && !reachable.has(qid) && (originalAnswers[qid]?.answerIds || []).length
    );
  }

  async function handleNext() {
    const isLast = step === screenIds.length - 1;
    if (isLast) { await handleSave(); return; }
    // Confirm a situation change once, on the way out of the Situation screen.
    if (screenIds[step] === 'primary_priority' && orphanedBranchQuestions().length) {
      setConfirmBranchChange({ nextStep: step + 1 });
      return;
    }
    setStep((s) => s + 1);
  }

  async function handleSave() {
    // Only the question ids in scope for THIS run are sent, so a scoped edit
    // can never carry another section's answers into the save.
    const payload = {};
    for (const sid of screenIds) {
      const qid = CFG.getScreen(sid)?.questionIds?.[0];
      if (qid && working[qid]?.answerIds?.length) payload[qid] = working[qid];
    }
    setSaving(true);
    setSaveError(null);
    const res = await updateAnswers(payload);
    setSaving(false);
    if (!res.ok) { setSaveError(c.saveError); return; }
    goBackToProfile();
  }

  const screenId = screenIds[Math.min(step, Math.max(screenIds.length - 1, 0))];
  const valid = checkinScreenValid(screenId, working);
  const total = screenIds.length;
  const isLast = step >= total - 1;

  return (
    <div className="min-h-screen bg-dark-900 px-page py-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="max-w-md mx-auto">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t.backAria}
          className="w-11 h-11 -ml-2.5 flex items-center justify-center rounded-full text-ink mb-2"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        {total > 1 && (
          <div
            className="h-1.5 rounded-full bg-dark-600 overflow-hidden mb-6"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={total}
            aria-label={c.progressAria(step + 1, total)}
          >
            <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
          </div>
        )}
        <CheckinQuestion screenId={screenId} answers={working} onChange={setAnswers} labelFor={label} ui={c} />
        {saveError && <p className="text-caption text-red-400 mt-3" role="alert">{saveError}</p>}
        <button
          type="button"
          onClick={handleNext}
          disabled={!valid || saving}
          className="btn-primary w-full justify-center py-3 mt-6 disabled:opacity-40"
        >
          {saving ? c.saving : isLast ? c.save : c.next}
        </button>
      </div>

      {/* Changing the situation changes which follow-ups apply. */}
      <ModalDialog
        open={!!confirmBranchChange}
        titleId="checkin-branch-title"
        title={c.changeSituationTitle}
        onDismiss={() => setConfirmBranchChange(null)}
        actions={
          <>
            <button
              className="btn-primary w-full justify-center py-3"
              onClick={() => { const next = confirmBranchChange.nextStep; setConfirmBranchChange(null); setStep(next); }}
            >
              {c.changeSituationConfirm}
            </button>
            <button className="btn-ghost w-full justify-center py-3" onClick={() => setConfirmBranchChange(null)}>
              {c.changeSituationCancel}
            </button>
          </>
        }
      >
        {c.changeSituationBody}
      </ModalDialog>
    </div>
  );
}
