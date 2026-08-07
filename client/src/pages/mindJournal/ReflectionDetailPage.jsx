import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import { Card, PageHeader } from '../../components/ui';
import { stateTagsForEntry, contextLabelForEntry } from './constants';
import { useMindJournalBack } from './shared';

// ─── Reflection details — read-only view of one owned Mind Journal entry.
// Opens from Recent reflections. No editing in this pilot. Delete reuses the
// existing ownership-scoped DELETE /api/mind-journal/:id after confirmation. ─

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

function DetailSection({ heading, children, testId }) {
  return (
    <Card className="p-4 mb-3 elevation-card text-left" data-testid={testId}>
      {heading ? (
        <h2 className="text-micro font-bold text-slt uppercase tracking-wide mb-2">{heading}</h2>
      ) : null}
      {children}
    </Card>
  );
}

function VerbatimText({ children }) {
  return (
    <p className="text-body text-ink leading-relaxed break-words whitespace-pre-wrap">{children}</p>
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
  const cancelRef = useRef(null);

  const [entry, setEntry] = useState(null); // null loading, false not found/error, object ok
  const [loadError, setLoadError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

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

  const isGuided = entry.entryType === 'GUIDED_REFLECTION';
  const typeLabel = isGuided ? mj.guided.title : mj.quickNote.tag;
  const dateLabel = formatDetailDateTime(entry.createdAt, language);
  const contextLabel = isGuided ? contextLabelForEntry(entry, mj) : null;
  const stateTags = stateTagsForEntry(entry, mj);
  const note = typeof entry.note === 'string' && entry.note.trim() ? entry.note : null;
  const whatHappened = entry.whatHappened || null;
  const whatNoticed = entry.whatNoticed || null;
  const helpedOrGotInWay = entry.helpedOrGotInWay || null;
  const takeForward = entry.takeForward || null;

  return (
    <div className="min-h-screen bg-dark-900 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <PageHeader onBack={handleBack} title={d.title} />

      <div className="px-page pt-5 max-w-lg mx-auto" data-testid="mj-detail">
        <p className="text-micro font-bold text-slt uppercase tracking-wide mb-1">{typeLabel}</p>
        {dateLabel ? (
          <p className="text-caption text-slt mb-5" data-testid="mj-detail-date">{dateLabel}</p>
        ) : null}

        {contextLabel ? (
          <DetailSection heading={d.contextHeading} testId="mj-detail-context">
            <VerbatimText>{contextLabel}</VerbatimText>
          </DetailSection>
        ) : null}

        {stateTags.length > 0 ? (
          <DetailSection heading={d.statesHeading} testId="mj-detail-states">
            <div className="flex flex-wrap gap-1.5">
              {stateTags.map((label, idx) => (
                <span
                  key={`${label}-${idx}`}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold bg-dark-700 text-ink border border-dark-600 max-w-full break-words"
                >
                  {label}
                </span>
              ))}
            </div>
          </DetailSection>
        ) : null}

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
