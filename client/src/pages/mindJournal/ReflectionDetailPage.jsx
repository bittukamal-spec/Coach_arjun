import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronDown, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import { Card, PageHeader } from '../../components/ui';
import { stateTagsForEntry, contextLabelForEntry } from './constants';
import { useMindJournalBack } from './shared';

// ─── Reflection details — read-only view of one owned Mind Journal entry.
// Opens from Recent reflections. No editing in this pilot. Delete reuses the
// existing ownership-scoped DELETE /api/mind-journal/:id after confirmation.
//
// The hierarchy is insight-first: a compact summary, then Arjun's stored
// analysis and takeaway, then the athlete's own answers as a short snapshot,
// with the full questionnaire collapsed behind a disclosure. Nothing on this
// screen is generated, regenerated, re-worded or inferred here — every string
// is either a stored value or a translated label. A legacy row simply has
// fewer of these parts and renders the ones it has. ────────────────────────

function formatDetailDateTime(iso, language) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString(language === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function VerbatimText({ children }) {
  return (
    <p className="text-body text-ink leading-relaxed break-words whitespace-pre-wrap">{children}</p>
  );
}

// Small uppercase section heading, shared by every block below so the screen
// reads as one hierarchy rather than a stack of unrelated cards.
function BlockHeading({ children, tone = 'muted', id }) {
  return (
    <h2
      id={id}
      className="text-micro font-bold uppercase tracking-wide mb-2"
      style={{ color: tone === 'journal' ? 'var(--journal-accent)' : 'var(--text-secondary)' }}
    >
      {children}
    </h2>
  );
}

// A neutral card for anything that is the athlete's own record.
function DetailSection({ heading, children, testId }) {
  return (
    <Card className="p-4 mb-3 elevation-card text-left" data-testid={testId}>
      {heading ? <BlockHeading>{heading}</BlockHeading> : null}
      {children}
    </Card>
  );
}

export default function ReflectionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const handleBack = useMindJournalBack();
  const { token, language } = useAuth();
  const mj = translations[language].mindJournal;
  const d = mj.detail;
  const del = mj.deleteReflection;

  const titleId = useId();
  const bodyId = useId();
  const answersId = useId();
  const cancelRef = useRef(null);

  const [entry, setEntry] = useState(null); // null loading, false not found/error, object ok
  const [loadError, setLoadError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  // The full questionnaire is secondary to the insight, so it starts closed.
  const [answersOpen, setAnswersOpen] = useState(false);

  const loadEntry = useCallback(() => {
    setEntry(null);
    setLoadError(null);
    apiFetch(`/api/mind-journal/${id}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(async (r) => {
        if (r.status === 404) {
          setEntry(false);
          return;
        }
        if (!r.ok) {
          setLoadError(d.loadError);
          setEntry(false);
          return;
        }
        const data = await r.json();
        setEntry(data?.entry || false);
      })
      .catch(() => {
        setLoadError(d.loadError);
        setEntry(false);
      });
  }, [id, token, d.loadError]);

  useEffect(() => {
    loadEntry();
  }, [loadEntry]);

  useEffect(() => {
    if (!confirmOpen) return undefined;
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && !deleting) setConfirmOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmOpen, deleting]);

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await apiFetch(`/api/mind-journal/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDeleteError(data?.error || del.error);
        setDeleting(false);
        return;
      }
      navigate('/mind-journal', { replace: true });
    } catch {
      setDeleteError(del.error);
      setDeleting(false);
    }
  }

  if (entry === null) {
    return (
      <div className="min-h-screen bg-dark-900 pb-10">
        <PageHeader onBack={handleBack} title={d.title} />
        <div className="px-page pt-5 max-w-lg mx-auto">
          <div className="h-32 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />
        </div>
      </div>
    );
  }

  if (entry === false) {
    return (
      <div className="min-h-screen bg-dark-900 pb-10">
        <PageHeader onBack={handleBack} title={d.title} />
        <div className="px-page pt-8 max-w-lg mx-auto text-left">
          <Card className="p-5 elevation-card mb-4">
            <p className="text-body text-slt leading-relaxed mb-4">
              {loadError || d.notFound}
            </p>
            <Link
              to="/mind-journal"
              replace
              className="inline-flex items-center justify-center min-h-[48px] px-4 rounded-[14px] bg-brand-500 text-white text-body font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              data-testid="mj-detail-back-journal"
            >
              {d.backToJournal}
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  const r = mj.reflection;
  const isReflection = entry.entryType === 'REFLECTION';
  const isGuided = entry.entryType === 'GUIDED_REFLECTION';
  const dateLabel = formatDetailDateTime(entry.createdAt, language);

  // Context tag — one violet treatment for every category (see .journal-tag).
  const contextLabel = isReflection
    ? (entry.contextType === 'SOMETHING_ELSE' && entry.customContext
      ? entry.customContext
      : r.q1.options[entry.contextType] || null)
    : isGuided ? contextLabelForEntry(entry, mj) : null;
  const tagLabel = isReflection || isGuided
    ? (contextLabel || mj.contextTypes.SOMETHING_ELSE)
    : mj.quickNote.tag;

  // Structured answers render as their translated labels; a "Write my own"
  // value is the athlete's text and is shown verbatim, never re-worded.
  const answerChips = (tags, labels, custom) => [
    ...(Array.isArray(tags) ? tags.map(k => labels[k] || k) : []),
    ...(custom ? [custom] : []),
  ];
  const joinAnswers = (values) => (values.length ? values.join(' · ') : null);

  const eventAnswers = isReflection ? answerChips(entry.eventTags, r.q2.options, entry.customEvent) : [];
  const stateAnswers = isReflection ? answerChips(entry.states, mj.states, entry.customState) : [];
  const thoughtAnswers = isReflection ? answerChips(entry.thoughtTags, r.q4.options, entry.customThought) : [];
  const responseAnswers = isReflection ? answerChips(entry.responseTags, r.q5.options, entry.customResponse) : [];
  const bodyAnswers = isReflection ? answerChips(entry.bodyTags, r.q6body.options, entry.customBody) : [];
  const cueAnswers = isReflection && entry.cueFeedback ? [r.q6cue.options[entry.cueFeedback]] : [];

  // The summary title is the athlete's own account of what happened.
  const summaryTitle = isReflection
    ? (entry.customEvent || (entry.eventTags?.length ? r.q2.options[entry.eventTags[0]] : null))
    : isGuided ? (entry.whatHappened || null) : null;
  // A reflection's full state list lives in the snapshot below, so the summary
  // only previews the first two. A quick note or legacy row has no snapshot —
  // its states ARE its content — so it shows them all here and drops the
  // separate states card, rather than repeating the same chips twice.
  const allStateTags = stateTagsForEntry(entry, mj);
  const summaryChips = isReflection ? allStateTags.slice(0, 2) : allStateTags;

  // Reflection Snapshot — one compact block instead of five large question
  // cards. A row only exists when the entry actually has that answer, so a
  // skipped question is absent rather than shown as an empty placeholder.
  const SNAPSHOT_ROWS = isReflection ? [
    [d.snapshot.happened, joinAnswers(eventAnswers)],
    [d.snapshot.felt, joinAnswers(stateAnswers)],
    [d.snapshot.mind, joinAnswers(thoughtAnswers)],
    [d.snapshot.did, joinAnswers(responseAnswers)],
    [d.snapshot.body, joinAnswers(bodyAnswers)],
    [d.snapshot.cue, joinAnswers(cueAnswers)],
  ].filter(([, value]) => !!value) : [];

  // The collapsed disclosure replays the real questions with their stored
  // answers — the same set, nothing added and nothing dropped.
  const FULL_ANSWERS = isReflection ? [
    [r.q1.title, contextLabel, 'mj-answer-context'],
    [r.q2.title[entry.contextType] || r.q2.title.SOMETHING_ELSE, joinAnswers(eventAnswers), 'mj-answer-event'],
    [r.q3.title, joinAnswers(stateAnswers), 'mj-answer-states'],
    [r.q4.title, joinAnswers(thoughtAnswers), 'mj-answer-thoughts'],
    [r.q5.title, joinAnswers(responseAnswers), 'mj-answer-responses'],
    [r.q6body.title, joinAnswers(bodyAnswers), 'mj-answer-body'],
    [r.q6cue.title, joinAnswers(cueAnswers), 'mj-answer-cue'],
  ].filter(([, value]) => !!value) : [];

  const note = typeof entry.note === 'string' && entry.note.trim() ? entry.note : null;
  // A guided entry's "what happened" answer is promoted into the summary title
  // above, so its own card below would be the same text twice.
  const whatHappened = entry.whatHappened && entry.whatHappened !== summaryTitle ? entry.whatHappened : null;
  const whatNoticed = entry.whatNoticed || null;
  const helpedOrGotInWay = entry.helpedOrGotInWay || null;
  const takeForward = entry.takeForward || null;

  return (
    <div className="min-h-screen bg-dark-900 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <PageHeader onBack={handleBack} title={d.title} />

      <div className="px-page pt-5 max-w-lg mx-auto" data-testid="mj-detail">

        {/* ── 1. Compact summary ──────────────────────────────────────────
            Tag, the athlete's own title, when it happened, and up to two
            chips. No large question cards above the analysis. */}
        <div className="mb-5" data-testid="mj-detail-summary">
          <span className="journal-tag" data-testid="mj-context-tag">{tagLabel}</span>
          {summaryTitle ? (
            <h2 className="text-title font-bold text-ink leading-snug mt-2.5 break-words" data-testid="mj-detail-title">
              {summaryTitle}
            </h2>
          ) : null}
          {dateLabel ? (
            <p className="text-caption text-slt mt-1.5" data-testid="mj-detail-date">{dateLabel}</p>
          ) : null}
          {summaryChips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {summaryChips.map((label, idx) => (
                <span
                  key={`${label}-${idx}`}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold bg-dark-700 text-ink border border-dark-600 max-w-full break-words"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* ── 2. Arjun's Analysis ─────────────────────────────────────────
            The stored arjunNoticed text, rendered verbatim. Prominent, but
            deliberately a normal elevated surface so the Takeaway below it
            stays the strongest thing on the screen. Omitted entirely when a
            legacy or review-failed entry has none. */}
        {isReflection && entry.arjunNoticed ? (
          <div className="journal-panel elevation-card mb-3 text-left" data-testid="mj-detail-analysis">
            <BlockHeading tone="journal">{d.analysisHeading}</BlockHeading>
            <VerbatimText>{entry.arjunNoticed}</VerbatimText>
          </div>
        ) : null}

        {/* ── 3. Takeaway — the strongest violet emphasis on this screen.
            One stored line, no raw answers inside it. */}
        {isReflection && entry.arjunTakeaway ? (
          <div className="journal-panel-strong elevation-card mb-3 text-left" data-testid="mj-detail-takeaway">
            <BlockHeading tone="journal">{d.takeawayHeading}</BlockHeading>
            <VerbatimText>{entry.arjunTakeaway}</VerbatimText>
          </div>
        ) : null}

        {/* ── 4. Pattern noticed — conditional and quieter than the
            Takeaway. Only ever the stored text; never derived here, and no
            counts or metrics are added. */}
        {isReflection && entry.arjunPattern ? (
          <Card className="p-4 mb-3 elevation-row text-left" data-testid="mj-detail-pattern">
            <BlockHeading>{d.patternHeading}</BlockHeading>
            <p className="text-caption text-slt leading-relaxed break-words whitespace-pre-wrap">
              {entry.arjunPattern}
            </p>
          </Card>
        ) : null}

        {/* ── 5. Reflection Snapshot — one compact block with short labels,
            replacing the five large question cards. */}
        {SNAPSHOT_ROWS.length > 0 ? (
          <Card className="p-4 mb-3 elevation-card text-left" data-testid="mj-detail-snapshot">
            <BlockHeading>{d.snapshotHeading}</BlockHeading>
            <dl className="space-y-2.5">
              {SNAPSHOT_ROWS.map(([label, value]) => (
                <div key={label} className="flex items-start gap-3">
                  <dt className="text-caption text-slt shrink-0 w-[7.5rem] leading-snug">{label}</dt>
                  <dd className="text-caption font-semibold text-ink flex-1 min-w-0 leading-snug break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : null}

        {/* ── 6. Show all answers — collapsed by default, visually
            secondary, and never a separate route. */}
        {FULL_ANSWERS.length > 0 ? (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setAnswersOpen(o => !o)}
              aria-expanded={answersOpen}
              aria-controls={answersId}
              data-testid="mj-answers-toggle"
              className="w-full flex items-center justify-between gap-2 min-h-[44px] px-3.5 rounded-2xl border border-dark-600 bg-dark-800 text-caption font-semibold text-slt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {answersOpen ? d.hideAnswers : d.showAnswers}
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={`shrink-0 transition-transform ${answersOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {answersOpen ? (
              <div id={answersId} className="mt-2 space-y-2" data-testid="mj-answers-panel">
                {FULL_ANSWERS.map(([question, value, testId]) => (
                  <Card key={testId} className="p-3.5 text-left" data-testid={testId}>
                    <p className="text-micro font-semibold text-slt leading-snug mb-1 break-words">{question}</p>
                    <p className="text-caption text-ink leading-relaxed break-words whitespace-pre-wrap">{value}</p>
                  </Card>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── Legacy entries — quick notes, older guided reflections and
            pre-guided rows keep their own simpler treatment. They never had
            an analysis, a takeaway or the structured answer set, so nothing
            is forced into fields they do not have. Their states already sit
            in the summary above, so only their written content follows. */}
        {!isGuided && note ? (
          <DetailSection heading={d.noteHeading} testId="mj-detail-note">
            <VerbatimText>{note}</VerbatimText>
          </DetailSection>
        ) : null}

        {isGuided && whatHappened ? (
          <DetailSection heading={mj.guided.whatHappened} testId="mj-detail-what-happened">
            <VerbatimText>{whatHappened}</VerbatimText>
          </DetailSection>
        ) : null}
        {isGuided && whatNoticed ? (
          <DetailSection heading={mj.guided.whatNoticed} testId="mj-detail-what-noticed">
            <VerbatimText>{whatNoticed}</VerbatimText>
          </DetailSection>
        ) : null}
        {isGuided && helpedOrGotInWay ? (
          <DetailSection heading={mj.guided.helpedOrGotInWay} testId="mj-detail-helped">
            <VerbatimText>{helpedOrGotInWay}</VerbatimText>
          </DetailSection>
        ) : null}
        {isGuided && takeForward ? (
          <DetailSection heading={mj.guided.takeForward} testId="mj-detail-take-forward">
            <VerbatimText>{takeForward}</VerbatimText>
          </DetailSection>
        ) : null}

        {/* ── 7. Delete — unchanged behaviour, unchanged confirmation,
            unchanged API and unchanged navigation after delete. */}
        {deleteError ? (
          <p role="alert" className="text-caption text-amber-400 leading-snug mb-3" data-testid="mj-delete-error">
            {deleteError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setConfirmOpen(true);
          }}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-[14px] border border-dark-600 bg-transparent text-body font-semibold text-red-400 hover:bg-dark-800 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          data-testid="mj-delete-trigger"
          aria-haspopup="dialog"
        >
          <Trash2 size={16} aria-hidden="true" />
          {del.action}
        </button>
      </div>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0"
          data-testid="mj-delete-confirm"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            className="bg-dark-800 border border-dark-500 rounded-2xl p-6 w-full max-w-md animate-slide-up text-left"
          >
            <h2 id={titleId} className="font-bold text-ink mb-2 text-body">
              {del.title}
            </h2>
            <p id={bodyId} className="text-slt text-sm mb-6 leading-relaxed">
              {del.body}
            </p>
            <div className="flex gap-3">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="flex-1 btn-secondary min-h-[48px]"
              >
                {del.cancel}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                data-testid="mj-delete-confirm-btn"
              >
                {deleting ? del.deleting : del.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
