import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { Card, PageHeader, SectionLabel, SaveStatus } from '../components/ui';
import {
  guidedPreview,
  mindJournalOriginState,
  stateTagsForEntry,
  contextLabelForEntry,
} from './mindJournal/constants';
import { contextIconFor } from './mindJournal/shared';

// ─── Mind Journal home — the landing screen for a personal, score-free
// record. It starts the two ways in (a guided reflection or a quick note),
// shows where the optional Arjun-context setting currently stands, and
// lists what has already been written. Nothing here is scored, ranked or
// compared, and writing happens on the dedicated screens rather than in a
// form on this page. ───────────────────────────────────────────────────────

// One recent-list row. Guided reflections and quick notes are different
// records and read differently; legacy rows (entryType null, written before
// the guided flow existed) carry only states and a note, so they render as
// the quick note they effectively are — never with empty guided sections.
//
// Each row is an accessible link to Reflection Details. No overflow menu
// and no inline edit/delete — delete lives on the detail screen only.
function EntryRow({ entry, mj, dateLabel }) {
  const r = mj.reflection;
  const isReflection = entry.entryType === 'REFLECTION';
  const isGuided = entry.entryType === 'GUIDED_REFLECTION';
  const stateTags = stateTagsForEntry(entry, mj);
  // A reflection previews Arjun's takeaway when he wrote one, falling back to
  // the athlete's own event answer. Legacy shapes are untouched.
  const preview = isReflection
    ? (entry.arjunTakeaway
      || entry.customEvent
      || (entry.eventTags?.length ? r.q2.options[entry.eventTags[0]] : null))
    : isGuided ? guidedPreview(entry) : entry.note;
  // takeForward gets its own row, and it is also last in the preview
  // precedence — so when it is the only thing written, show it once as the
  // labelled row rather than twice.
  const showPreview = preview && preview !== entry.takeForward;
  const ContextIcon = contextIconFor(entry.entryType, entry.contextType);
  const contextLabel = isReflection
    ? (entry.contextType === 'SOMETHING_ELSE' && entry.customContext
      ? entry.customContext
      : r.q1.options[entry.contextType] || null)
    : isGuided ? contextLabelForEntry(entry, mj) : null;
  const typeLabel = isReflection || isGuided
    ? (contextLabel || mj.contextTypes.SOMETHING_ELSE)
    : mj.quickNote.tag;
  const ariaLabel = [typeLabel, dateLabel, ...(stateTags || [])].filter(Boolean).join(', ');

  return (
    <Card
      as={Link}
      to={`/mind-journal/${entry.id}`}
      state={mindJournalOriginState()}
      className="block p-4 elevation-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      data-testid="mj-reflection-card"
      aria-label={ariaLabel}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <ContextIcon size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-micro font-bold text-slt uppercase max-w-full break-words">
              {typeLabel}
            </p>
            <p className="text-caption text-slt shrink-0">{dateLabel}</p>
          </div>

          {stateTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {stateTags.map((label, idx) => (
                <span
                  key={`${label}-${idx}`}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold bg-dark-700 text-ink border border-dark-600 max-w-full break-words"
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {showPreview && (
            <p className="text-caption text-slt mt-2.5 leading-relaxed break-words">{preview}</p>
          )}

          {!isReflection && isGuided && entry.takeForward && (
            <div className="mt-3 pt-3 border-t border-dark-600">
              <p className="text-caption text-slt leading-relaxed break-words">
                <span className="font-bold text-ink">{mj.takeForwardLabel}: </span>
                {entry.takeForward}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function MindJournalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, language } = useAuth();
  const t = translations[language];
  const mj = t.mindJournal;

  const [entries, setEntries] = useState(null); // null = loading, false = load error
  const [contextEnabled, setContextEnabled] = useState(false);

  // Quick Note returns here after a successful save rather than confirming
  // on its own screen; this acknowledges it once and then gets out of the way.
  const [savedJustNow, setSavedJustNow] = useState(!!location.state?.justSaved);
  useEffect(() => {
    if (!savedJustNow) return undefined;
    const timer = setTimeout(() => setSavedJustNow(false), 3000);
    return () => clearTimeout(timer);
  }, [savedJustNow]);

  const loadEntries = useCallback(() => {
    setEntries(null);
    apiFetch('/api/mind-journal', { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) { setEntries(false); return; }
        setEntries(data.entries || []);
        setContextEnabled(!!data.contextEnabled);
      })
      .catch(() => setEntries(false));
  }, [token]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <PageHeader onBack={() => navigate(-1)} title={mj.title}>
        <Link
          to="/mind-journal/context"
          state={mindJournalOriginState()}
          aria-label={mj.privacyAria}
          className="w-11 h-11 flex items-center justify-center rounded-full text-slt hover:text-brand-500 hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Shield size={18} aria-hidden="true" />
        </Link>
      </PageHeader>

      <div className="px-page pt-5 max-w-lg mx-auto pb-10">
        <div className="mb-6" data-testid="mj-intro">
          <h2 className="text-title font-bold text-ink leading-snug mb-2">{mj.introHeadline}</h2>
          <p className="text-body text-slt leading-relaxed">{mj.subtitle}</p>
        </div>

        <div className="mb-3 empty:mb-0">
          <SaveStatus
            state={savedJustNow ? 'saved' : 'idle'}
            labels={{ saving: mj.saving, saved: mj.saved, saveFailed: null, retry: mj.retry }}
          />
        </div>

        {/* ── The two ways in ──────────────────────────────────────────── */}
        {/* Narrow: icon + arrow on one row, title/desc full-width below.
            sm+: horizontal only when there is enough width for the copy. */}
        <Card
          as={Link}
          to="/mind-journal/new"
          state={mindJournalOriginState()}
          variant="hero"
          data-testid="mj-hero-new"
          aria-label={mj.newReflection.cardTitle}
          className="block p-5 mb-3 elevation-hero active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{ '--grad-from': 'var(--brand-primary)', '--grad-to': '#0C4D85' }}
        >
          {/* The whole card is one "start a guided reflection" action, so
              its title/description center. Icon and arrow stay the
              existing stacked-then-horizontal bookends (unchanged from the
              approved narrow-screen layout) but now match widths, so the
              centered copy sits at the card's true visual middle instead
              of drifting toward the icon. */}
          <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center justify-between sm:contents">
              <span
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/20 text-white flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <BookOpen size={22} />
              </span>
              <span
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/15 text-white flex items-center justify-center shrink-0 sm:order-last"
                aria-hidden="true"
              >
                <ArrowRight size={16} />
              </span>
            </div>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-title font-bold text-white" aria-hidden="true">{mj.newReflection.cardTitle}</p>
              <p className="text-caption text-white/85 mt-1.5 leading-relaxed">{mj.newReflection.cardDesc}</p>
            </div>
          </div>
        </Card>

        {/* ── Arjun context status — the control itself lives on its own
            screen, so this row only reports where the setting stands ──── */}
        <Card
          className="flex items-center justify-between gap-3 p-3.5 elevation-row"
          data-testid="mj-context-row"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${contextEnabled ? 'bg-win-500' : 'bg-dark-500'}`}
              aria-hidden="true"
            />
            <p className="text-caption text-slt">
              {mj.contextStatus.label}:{' '}
              <span className="font-bold text-ink">
                {contextEnabled ? mj.contextStatus.on : mj.contextStatus.off}
              </span>
            </p>
          </div>
          <Link
            to="/mind-journal/context"
            state={mindJournalOriginState()}
            className="inline-flex items-center min-h-[44px] px-2 text-caption font-bold shrink-0 text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
          >
            {mj.contextStatus.manage}
          </Link>
        </Card>

        {/* ── Recent entries ───────────────────────────────────────────── */}
        <div className="mt-8" data-testid="mj-recent-section">
          <SectionLabel>{mj.recentHeading}</SectionLabel>

          {entries === null && (
            <div className="space-y-2.5">
              <div className="h-24 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />
              <div className="h-24 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />
            </div>
          )}

          {entries === false && (
            <Card className="p-4 text-center elevation-card">
              <p className="text-body text-slt mb-3">{mj.loadError}</p>
              <button
                onClick={loadEntries}
                className="text-body font-bold text-brand-500 min-h-[44px] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
              >
                {mj.retryBtn}
              </button>
            </Card>
          )}

          {Array.isArray(entries) && entries.length === 0 && (
            <Card className="p-5 text-center elevation-row">
              <p className="text-body text-slt leading-relaxed">{mj.emptyState}</p>
            </Card>
          )}

          {Array.isArray(entries) && entries.length > 0 && (
            <div className="space-y-2.5">
              {entries.map(entry => (
                <EntryRow key={entry.id} entry={entry} mj={mj} dateLabel={formatDate(entry.createdAt)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
