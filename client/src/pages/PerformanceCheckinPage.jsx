import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ClipboardCheck, Clock3, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { useStartingProfile } from '../hooks/useStartingProfile';
import CheckinQuestion, { checkinScreenValid } from '../components/profile/CheckinQuestion';
import { ProfileSkeleton } from '../components/profile';
import * as CFG from '../onboarding/config';

// ─── Performance Check-in — the returning-user profile update flow ─────────
// NEVER called "onboarding" in this page's own copy: onboarding is the
// first-time flow, this is a refresh of an already-completed profile.
// Reuses the exact same structured-question components/config as onboarding
// (CheckinQuestion → SelectableOption/CustomAnswerField/CFG), just over a
// server-whitelisted question subset (goals, what-helps, strengths, and the
// athlete's own already-resolved pattern branch — never sport/role/level,
// which stay Settings-owned, and never the branch-choosing questions
// themselves). See profileService.updateProfileAnswers on the server.
//
// Two entry shapes, one component tree:
//   full check-in   — no ?section= param: entry screen → every editable
//                      screen (pattern → helps → strengths → goals) → review
//   section-scoped  — ?section=pattern|helps|strengths|goals: skips the
//                      entry screen and walks only that one category, used
//                      by "Review pattern" / "What Helps Me → Edit" /
//                      "My Strengths → Edit" / the goals edit entry point.
// Both end on the same review-before-save screen and the same save call,
// and both return to /starting-profile on success.

function tPath(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const SECTION_ORDER = ['pattern', 'helps', 'strengths', 'goals'];
const VALID_SECTIONS = new Set(SECTION_ORDER);

export default function PerformanceCheckinPage() {
  const { token, language } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const L = translations[language] || translations.en;
  const c = L.performanceCheckin;
  const t = L.startingProfile;
  const label = (key) => tPath(L, key) ?? key;

  const { phase: loadPhase, profile, updateAnswers } = useStartingProfile(token);

  const requestedSection = searchParams.get('section');
  const scoped = VALID_SECTIONS.has(requestedSection) ? requestedSection : null;

  // 'entry' only for the full flow; a section-scoped edit starts directly on
  // its first question.
  const [step, setStep] = useState(scoped ? 0 : -1); // -1 = entry screen
  const [reviewing, setReviewing] = useState(false);
  const [answers, setAnswers] = useState(null); // lazily seeded from profile.checkin.answers
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const originalAnswers = profile?.checkin?.answers || null;
  const screensByCategory = profile?.checkin?.screens || null;

  // Ordered flat list of screen ids in scope for this run of the flow.
  const screenIds = useMemo(() => {
    if (!screensByCategory) return [];
    const categories = scoped ? [scoped] : SECTION_ORDER;
    return categories.flatMap((cat) => screensByCategory[cat] || []);
  }, [screensByCategory, scoped]);

  // Seed the editable draft once the profile has loaded — never re-seeded
  // on a later render (that would silently discard in-progress edits every
  // time this component re-renders), so Back/Next preserves the draft.
  useEffect(() => {
    if (answers === null && originalAnswers) setAnswers(originalAnswers);
  }, [answers, originalAnswers]);
  const working = answers || originalAnswers || {};

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
    if (reviewing) { setReviewing(false); return; }
    if (step <= (scoped ? 0 : -1)) { goBackToProfile(); return; }
    setStep((s) => s - 1);
  }

  function handleNext() {
    if (step === screenIds.length - 1) { setReviewing(true); return; }
    setStep((s) => s + 1);
  }

  async function handleSave() {
    // Only send the qids actually in scope for this run — never the whole
    // answers map, even though `working` may carry other categories from a
    // previous full check-in in the same session.
    const payload = {};
    for (const sid of screenIds) {
      const qid = CFG.getScreen(sid)?.questionIds?.[0];
      if (qid && working[qid]) payload[qid] = working[qid];
    }
    setSaving(true);
    setSaveError(null);
    const res = await updateAnswers(payload);
    setSaving(false);
    if (!res.ok) { setSaveError(c.saveError); return; }
    goBackToProfile();
  }

  // ── Entry screen (full check-in only) ────────────────────────────────────
  if (step === -1 && !reviewing) {
    return (
      <div className="min-h-screen bg-dark-900 px-page py-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto">
          <TopBar onBack={goBackToProfile} backAria={t.backAria} />
          <div className="flex flex-col items-center text-center mt-4">
            <span className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(23,105,170,0.12)' }} aria-hidden="true">
              <RefreshCw size={28} style={{ color: 'var(--brand-primary)' }} />
            </span>
            <h1 className="text-title font-bold text-ink mb-2">{c.entryTitle}</h1>
            <p className="text-heading font-bold text-ink mb-2">{c.entryHeadline}</p>
            <p className="text-body text-slt leading-relaxed mb-6">{c.entryBody}</p>
          </div>
          <div className="flex flex-col gap-3 mb-8">
            <InfoRow icon={Clock3} text={c.entryTime} />
            <InfoRow icon={ClipboardCheck} text={c.entrySeeChanges} />
          </div>
          <button type="button" onClick={() => setStep(0)} className="btn-primary w-full justify-center py-3">
            {c.start}
          </button>
        </div>
      </div>
    );
  }

  // ── Review before save ────────────────────────────────────────────────────
  if (reviewing) {
    return (
      <div className="min-h-screen bg-dark-900 px-page py-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto">
          <TopBar onBack={handleBack} backAria={t.backAria} />
          <h1 className="text-title font-bold text-ink mb-4">{c.reviewTitle}</h1>
          <ReviewDiff
            scoped={scoped}
            screensByCategory={screensByCategory}
            original={originalAnswers}
            current={working}
            label={label}
            c={c}
          />
          {saveError && <p className="text-caption text-red-400 mt-3" role="alert">{saveError}</p>}
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center py-3 mt-6 disabled:opacity-50">
            {saving ? c.saving : c.save}
          </button>
          <button type="button" onClick={handleBack} className="w-full text-center text-caption text-slt mt-3 py-3 min-h-[44px]">
            {c.goBack}
          </button>
        </div>
      </div>
    );
  }

  // ── One question screen ───────────────────────────────────────────────────
  const screenId = screenIds[step];
  const valid = checkinScreenValid(screenId, working);
  const total = screenIds.length;

  return (
    <div className="min-h-screen bg-dark-900 px-page py-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="max-w-md mx-auto">
        <TopBar onBack={handleBack} backAria={t.backAria} />
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
        <CheckinQuestion screenId={screenId} answers={working} onChange={setAnswers} labelFor={label} ui={c} />
        <button
          type="button"
          onClick={handleNext}
          disabled={!valid}
          className="btn-primary w-full justify-center py-3 mt-6 disabled:opacity-40"
        >
          {c.next}
        </button>
      </div>
    </div>
  );
}

function TopBar({ onBack, backAria }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={backAria}
      className="w-11 h-11 -ml-2.5 flex items-center justify-center rounded-full text-ink mb-2"
    >
      <ChevronLeft size={22} aria-hidden="true" />
    </button>
  );
}

function InfoRow({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dark-600 bg-dark-800 p-3">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(23,105,170,0.12)' }} aria-hidden="true">
        <Icon size={16} style={{ color: 'var(--brand-primary)' }} />
      </span>
      <p className="text-body text-ink">{text}</p>
    </div>
  );
}

// Resolves the athlete-facing label(s) currently selected for one screen's
// question — custom text wins when present, otherwise the config answer
// label(s), joined for a multi-select.
function screenAnswerLabels(screenId, answersMap, labelFor) {
  const screen = CFG.getScreen(screenId);
  const qid = screen?.questionIds?.[0];
  if (!qid) return '';
  const ans = answersMap?.[qid];
  const ids = ans?.answerIds || [];
  if (ids.length === 0) return '';
  if (ans?.customText) return ans.customText;
  return ids.map((id) => {
    const a = CFG.findAnswer(qid, id);
    return a ? labelFor(a.key) : id;
  }).join(', ');
}

// Deterministic client-side comparison, grouped by category (not per raw
// question — a category reads as one line, matching the approved review
// layout). "Unchanged" is shown rather than nothing, so an athlete who
// opened a section and changed nothing still gets a clear confirmation.
function ReviewDiff({ scoped, screensByCategory, original, current, label, c }) {
  const categories = scoped ? [scoped] : SECTION_ORDER;
  const SECTION_LABEL = { goals: c.sectionGoals, pattern: c.sectionPattern, helps: c.sectionHelps, strengths: c.sectionStrengths };
  let anyChange = false;

  const rows = categories.map((cat) => {
    const sids = screensByCategory?.[cat] || [];
    const before = sids.map((sid) => screenAnswerLabels(sid, original, label)).filter(Boolean).join(' · ');
    const after = sids.map((sid) => screenAnswerLabels(sid, current, label)).filter(Boolean).join(' · ');
    const changed = before !== after;
    if (changed) anyChange = true;
    return { cat, before, after, changed };
  });

  if (!anyChange) {
    return <p className="text-body text-slt leading-relaxed">{c.noChanges}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((r) => (
        <div key={r.cat}>
          <p className="text-micro font-bold text-muted uppercase mb-1.5">{SECTION_LABEL[r.cat]}</p>
          {r.changed ? (
            <p className="text-body text-ink break-words">
              <span className="text-slt">{r.before || '—'}</span>
              <span className="text-muted"> → </span>
              <span className="font-semibold">{r.after || '—'}</span>
            </p>
          ) : (
            <p className="text-body text-slt">{c.unchanged}</p>
          )}
        </div>
      ))}
    </div>
  );
}
