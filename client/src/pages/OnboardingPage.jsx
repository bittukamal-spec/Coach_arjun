import { useEffect, useRef, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import {
  OnboardingShell,
  SelectableOption,
  OptionGrid,
  CustomAnswerField,
} from '../components/onboarding';
import SaveStatus from '../components/ui/SaveStatus';
import ModalDialog from '../components/onboarding/ModalDialog';
import { useOnboardingSession } from '../hooks/useOnboardingSession';
import { isValidCustomText } from '../utils/sanitizeCustomText';
import * as CFG from '../onboarding/config';

// ─── Adaptive onboarding (v2) ───────────────────────────────────────────────
// Config-driven, server-authoritative flow built on the PR 1 shell + option
// components. Stores only raw answers (ids + custom text) — no interpretation.

// Display-only: which sport-relevant roles to surface on the role screen.
// Server validates against the full role answer set regardless.
const SPORT_ROLE_SETS = {
  cricket: ['batter', 'bowler', 'all_rounder', 'wicketkeeper'],
  football: ['goalkeeper', 'defender', 'midfielder', 'forward'],
  hockey: ['goalkeeper', 'defender', 'midfielder', 'forward'],
  badminton: ['singles', 'doubles', 'both'],
  tennis: ['singles', 'doubles', 'both'],
};
const ROLE_FIXED = ['none', 'unsure', 'different'];
const SPORT_ICONS = {
  cricket: '🏏', football: '⚽', badminton: '🏸', athletics: '🏃', wrestling: '🤼',
  boxing: '🥊', kabaddi: '🤸', tennis: '🎾', hockey: '🏑', swimming: '🏊', other: '🏅',
};

function tPath(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// ── Option layout rule (Stage G) ──────────────────────────────────────────
// Two columns ONLY when every label in the set is short; a full-width row as
// soon as one option is a sentence. Decided from the REAL answer text, not a
// per-question hardcoded list, and measured across BOTH languages so a screen
// does not switch layout when the athlete switches language.
//
// 24 characters is the practical ceiling for a tile: at 360px each column is
// ~158px, which holds roughly two lines at this type size. Anything longer
// reads better as a full-width row.
const TILE_MAX_LABEL = 24;

function longestLabelAcrossLanguages(options) {
  let longest = 0;
  for (const a of options) {
    for (const lang of Object.keys(translations)) {
      const text = tPath(translations[lang], a.key);
      if (typeof text === 'string' && text.length > longest) longest = text.length;
    }
  }
  return longest;
}

export default function OnboardingPage() {
  const { user, token, language, updateUser } = useAuth();
  const navigate = useNavigate();
  const L = translations[language];
  const ui = L.onboarding.v2.ui;
  const label = (key) => tPath(L, key) ?? key;

  const {
    phase, session, saveState, conflict,
    save, complete, retryLast, reload,
    resolveConflictUseServer, resolveConflictReapplyLocal,
  } = useOnboardingSession(user?.id, token);

  const [working, setWorking] = useState({});
  const [currentStepId, setCurrentStepId] = useState(null);
  const [live, setLive] = useState('');
  const [confirmPrune, setConfirmPrune] = useState(null); // { payload, nextStepId, isLast }
  const pendingRef = useRef(null); // last Continue action, for Retry

  // Hydrate working state from the server session on load and after each save.
  useEffect(() => {
    if (!session) return;
    setWorking(session.answers || {});
    setCurrentStepId((cur) => cur || session.currentStepId || 'sport');
  }, [session]);

  // ── Completed-user guard ────────────────────────────────────────────────
  if (user?.onboardingDone) return <Navigate to="/starting-profile" replace />;
  if (session?.status === 'COMPLETED') return <Navigate to="/starting-profile" replace />;

  // ── Loading / error states ──────────────────────────────────────────────
  // Order matters: a failed initial load sets phase='error' while session (and
  // therefore currentStepId) stays null. The error state must be checked FIRST,
  // otherwise the "no currentStepId yet" loading fallback would win and trap the
  // athlete on an infinite spinner with no way to recover.
  const errorScreen = (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-6 text-center">
      <p className="text-body text-slt mb-4">{ui.loadError}</p>
      <button type="button" onClick={reload} className="btn-primary py-3 px-6">{ui.retry}</button>
    </div>
  );

  if (phase === 'error') return errorScreen;
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center" role="status" aria-live="polite">
        <Loader2 size={28} className="animate-spin text-brand-500" aria-hidden="true" />
        <span className="sr-only">{ui.loading}</span>
      </div>
    );
  }
  // Ready, but no resolvable step (unexpected) → controlled recovery, never a
  // silent infinite spinner.
  if (!currentStepId) return errorScreen;

  // ── Derived flow ─────────────────────────────────────────────────────────
  const flow = CFG.computeFlowScreenIds(working);
  const idx = Math.max(0, flow.indexOf(currentStepId));
  const isLast = idx === flow.length - 1;
  const screen = CFG.getScreen(currentStepId);
  const questionIds = screen?.questionIds || [];
  const sportId = working.sport?.answerIds?.[0];

  const stages = CFG.STAGES.map((s) => ({ key: s.id, label: label(s.titleKey) }));

  // ── Answer editing ─────────────────────────────────────────────────────
  const setAnswer = (qid, updater) =>
    setWorking((w) => ({ ...w, [qid]: updater(w[qid] || { answerIds: [] }) }));

  function selectSingle(qid, aid) {
    setAnswer(qid, (prev) =>
      CFG.isCustom(qid, aid) ? { answerIds: [aid], customText: prev.customText || '' } : { answerIds: [aid] }
    );
  }
  function toggleMulti(qid, aid, limit) {
    setAnswer(qid, (prev) => {
      const cur = prev.answerIds || [];
      let ids;
      if (cur.includes(aid)) ids = cur.filter((x) => x !== aid);
      else if (CFG.isExclusive(qid, aid)) ids = [aid];
      else {
        const noEx = cur.filter((x) => !CFG.isExclusive(qid, x));
        if (noEx.length >= limit) { setLive(ui.maxReached(limit)); return prev; }
        ids = [...noEx, aid];
      }
      const hasCustom = ids.some((x) => CFG.isCustom(qid, x));
      setLive(ui.selectedCount(ids.length, limit));
      return hasCustom ? { answerIds: ids, customText: prev.customText || '' } : { answerIds: ids };
    });
  }
  const setCustom = (qid, text) => setAnswer(qid, (prev) => ({ ...prev, customText: text }));

  // ── Validation ───────────────────────────────────────────────────────────
  function questionValid(qid) {
    const q = CFG.getQuestion(qid);
    const ans = working[qid] || {};
    const ids = ans.answerIds || [];
    if (ids.length === 0) return !q.required;
    // limit is 1 for every single-choice question, so this also catches an
    // in-flight session with >1 stored ids from before it became
    // single-choice — the ambiguous-state notice above is what resolves it.
    if (ids.length > q.limit) return false;
    const customSel = ids.filter((id) => CFG.isCustom(qid, id));
    if (customSel.length && !isValidCustomText(ans.customText || '', CFG.customMax(qid, customSel[0]))) return false;
    return true;
  }
  const screenValid = questionIds.every(questionValid);

  // ── Options to display for a question ────────────────────────────────────
  function optionsFor(qid) {
    if (qid === 'role_position') {
      const ids = [...(SPORT_ROLE_SETS[sportId] || []), ...ROLE_FIXED];
      const q = CFG.getQuestion(qid);
      return ids.map((id) => q.answers.find((a) => a.id === id)).filter(Boolean);
    }
    return CFG.displayAnswers(qid);
  }

  // ── Save / advance ────────────────────────────────────────────────────────
  async function persist(payload, nextStepId, last) {
    pendingRef.current = { payload, nextStepId, last }; // enable Retry
    const result = await save(payload, nextStepId);
    if (!result.ok) return; // conflict dialog or SaveStatus retry handles it
    if (result.prunedQuestionIds?.length) setLive(ui.answersCleared);
    if (last) {
      const done = await complete(result.session.revision);
      if (done.ok) {
        updateUser(done.user);
        navigate('/starting-profile', {
          replace: true,
          state: { fromOnboarding: true, entryMode: 'onboarding-completion' },
        });
      } else if (done.missing?.length) {
        // Jump back to the first missing screen.
        const missingScreen = CFG.computeFlowScreenIds(working).find((sid) =>
          (CFG.getScreen(sid)?.questionIds || []).some((q) => done.missing.includes(q))
        );
        if (missingScreen) setCurrentStepId(missingScreen);
        setLive(ui.incomplete);
      }
    } else {
      setCurrentStepId(nextStepId);
    }
  }

  async function onContinue() {
    if (!screenValid) return;
    const payload = {};
    for (const qid of questionIds) if (working[qid]?.answerIds?.length) payload[qid] = working[qid];
    const nextStepId = isLast ? currentStepId : flow[idx + 1];

    // Branch-change confirmation: changing the priority may orphan branch answers.
    if (currentStepId === 'primary_priority' && session) {
      const willReach = CFG.reachableQuestionIds(working);
      const prunable = Object.keys(session.answers || {}).filter(
        (qid) => CFG.isBranchQuestion(qid) && !willReach.has(qid)
      );
      if (prunable.length) {
        setConfirmPrune({ payload, nextStepId, isLast });
        return;
      }
    }
    await persist(payload, nextStepId, isLast);
  }

  function onBack() {
    if (idx > 0) { setCurrentStepId(flow[idx - 1]); setLive(''); }
  }

  // Retry replays the whole Continue action (save + advance / complete), not
  // just the bare PATCH, so a recovered save still moves the athlete forward.
  function retryContinue() {
    const p = pendingRef.current;
    if (p) return persist(p.payload, p.nextStepId, p.last);
    return retryLast();
  }

  // ── Render one question ────────────────────────────────────────────────────
  function renderQuestion(qid, groupLabel) {
    const q = CFG.getQuestion(qid);
    const multi = q.type === 'multi';
    const options = optionsFor(qid);
    const sel = working[qid]?.answerIds || [];
    const atLimit = multi && sel.filter((id) => !CFG.isExclusive(qid, id)).length >= q.limit;
    const isSport = qid === 'sport';
    // Defence in depth for an in-flight onboarding session started before a
    // question became single-choice: >1 stored ids can't be shown as one
    // radio selection, so none render pre-selected and the athlete must
    // choose one — same rule and same notice as Performance Check-in's
    // CheckinQuestion (questionValid enforces it before Continue enables).
    const ambiguous = !multi && sel.length > 1;
    const customId = !ambiguous && sel.find((id) => CFG.isCustom(qid, id));

    // Grid only when every label in this set is short (see TILE_MAX_LABEL).
    // Sport additionally carries an emoji marker, so it keeps its tiles
    // regardless — its labels are the shortest set in the flow anyway.
    const useGrid = isSport || longestLabelAcrossLanguages(options) <= TILE_MAX_LABEL;

    return (
      <div key={qid} className="mb-2">
        {groupLabel && <h2 className="text-body font-semibold text-ink mb-3">{groupLabel}</h2>}
        {ambiguous && (
          <p className="text-caption text-amber-400 mb-3" role="status">{ui.chooseOneNotice}</p>
        )}
        <OptionGrid
          layout={useGrid ? 'grid' : 'stack'}
          multi={multi}
          ariaLabel={groupLabel || label(screen.titleKey)}
        >
          {options.map((a) => {
            const selected = !ambiguous && sel.includes(a.id);
            const disabled = multi && atLimit && !selected && !CFG.isExclusive(qid, a.id);
            return (
              <SelectableOption
                key={a.id}
                icon={isSport ? SPORT_ICONS[a.id] : undefined}
                label={label(a.key)}
                layout={useGrid ? 'tile' : 'row'}
                multi={multi}
                selected={selected}
                disabled={disabled}
                onSelect={() => (multi ? toggleMulti(qid, a.id, q.limit) : selectSingle(qid, a.id))}
              />
            );
          })}
        </OptionGrid>
        {/* The custom option is always the final answer in every set, so the
            field renders directly beneath the option that reveals it. The
            option itself stays selected while the field is open. */}
        {customId && (
          <CustomAnswerField
            id={`${qid}-custom`}
            label={ui.customLabel}
            placeholder={ui.customPlaceholder}
            value={working[qid]?.customText || ''}
            maxLength={CFG.customMax(qid, customId)}
            onChange={(v) => setCustom(qid, v)}
          />
        )}
      </div>
    );
  }

  const heading = label(screen.titleKey);
  const subcopy = screen.subtitleKey ? label(screen.subtitleKey) : '';
  const isContext = currentStepId === 'playing_context';

  // Approved action area: the selection count sits in small muted text
  // directly above Continue rather than above the options. Every multi-select
  // question in the flow is alone on its screen, so this reads unambiguously.
  const countQid = questionIds.length === 1 && CFG.getQuestion(questionIds[0])?.type === 'multi'
    ? questionIds[0]
    : null;
  const countText = countQid
    ? ui.selectedCount((working[countQid]?.answerIds || []).length, CFG.getQuestion(countQid).limit)
    : null;

  const footer = (
    <div>
      <div className="mb-2 min-h-[18px]">
        <SaveStatus state={saveState} onRetry={retryContinue} labels={ui} />
      </div>
      {countText && (
        <p className="mb-2 text-caption text-muted" aria-hidden="true">
          {countText}
        </p>
      )}
      <button
        type="button"
        onClick={onContinue}
        disabled={!screenValid || saveState === 'saving'}
        className="btn-primary w-full justify-center text-base disabled:opacity-40"
      >
        {saveState === 'saving' ? ui.saving : isLast ? ui.finish : ui.continue}
      </button>
    </div>
  );

  return (
    <>
      <OnboardingShell
        screenKey={currentStepId}
        stages={stages}
        currentStageKey={CFG.stageForScreen(currentStepId)}
        progressLabel={ui.progressLabel}
        backLabel={ui.back}
        onBack={onBack}
        canGoBack={idx > 0}
        heading={heading}
        subcopy={subcopy}
        liveMessage={live}
        footer={footer}
      >
        {isContext
          ? questionIds.map((qid) =>
              renderQuestion(qid, qid === 'competition_level' ? ui.competitionGroup : ui.experienceGroup)
            )
          : questionIds.map((qid) => renderQuestion(qid))}
      </OnboardingShell>

      {/* Branch-change confirmation before orphaning branch answers. */}
      <ModalDialog
        open={!!confirmPrune}
        titleId="onb-prune-title"
        title={ui.branchChangeTitle}
        onDismiss={() => setConfirmPrune(null)}
        actions={
          <>
            <button
              className="btn-primary w-full justify-center py-3"
              onClick={async () => { const p = confirmPrune; setConfirmPrune(null); await persist(p.payload, p.nextStepId, p.isLast); }}
            >
              {ui.branchChangeConfirm}
            </button>
            <button className="btn-ghost w-full justify-center py-3" onClick={() => setConfirmPrune(null)}>
              {ui.cancel}
            </button>
          </>
        }
      >
        {ui.branchChangeBody}
      </ModalDialog>

      {/* Server/local conflict recovery choice. */}
      <ModalDialog
        open={!!conflict}
        titleId="onb-conflict-title"
        title={ui.conflictTitle}
        actions={
          <>
            <button className="btn-primary w-full justify-center py-3" onClick={resolveConflictUseServer}>
              {ui.conflictUseServer}
            </button>
            <button className="btn-secondary w-full justify-center py-3" onClick={resolveConflictReapplyLocal}>
              {ui.conflictReapply}
            </button>
          </>
        }
      >
        {ui.conflictBody}
      </ModalDialog>
    </>
  );
}
