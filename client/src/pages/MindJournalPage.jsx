import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { Card, PageHeader, SectionLabel, SaveStatus } from '../components/ui';
import AiAccessPopover from '../components/mindJournal/AiAccessPopover';
import {
  guidedPreview,
  mindJournalOriginState,
  stateTagsForEntry,
  contextLabelForEntry,
} from './mindJournal/constants';

// ─── Mind Journal home — the landing screen for a personal, score-free
// record. It opens the reflection flow, and lists what has already been
// written. Nothing here is scored, ranked or compared, and writing happens on
// the dedicated screens rather than in a form on this page.
//
// The coaching-consent setting is reached from the header's icon-only control
// and its small anchored popover (AiAccessPopover) — the one place this page
// exposes it. The value itself still comes from this page's single existing
// GET /api/mind-journal, and the popover writes through the same
// PATCH /api/mind-journal/context contract the dedicated screen uses. That
// screen stays routed for old deep links. ──────────────────────────────────

// One recent-list row, built for scanning rather than reading: context tag and
// date, then a short title, then up to two state chips, then Arjun's takeaway
// when one exists.
//
// Guided reflections, quick notes and legacy rows (entryType null, written
// before the guided flow existed) are different records and degrade
// gracefully — a legacy row simply has fewer of these parts. Nothing is
// invented for an entry that never had it: no takeaway is fabricated, and an
// entry with no title line just shows its tag, date and chips.
//
// Each row is an accessible link to Reflection Details. No overflow menu and
// no inline edit/delete — delete lives on the detail screen only.
function EntryRow({ entry, mj, dateLabel }) {
  const r = mj.reflection;
  const isReflection = entry.entryType === 'REFLECTION';
  const isGuided = entry.entryType === 'GUIDED_REFLECTION';

  // The context tag. Every category renders through the same `.journal-tag`
  // treatment — the label says which context it is, the colour never does.
  const contextLabel = isReflection
    ? (entry.contextType === 'SOMETHING_ELSE' && entry.customContext
      ? entry.customContext
      : r.q1.options[entry.contextType] || null)
    : isGuided ? contextLabelForEntry(entry, mj) : null;
  const tagLabel = isReflection || isGuided
    ? (contextLabel || mj.contextTypes.SOMETHING_ELSE)
    : mj.quickNote.tag;

  // The title is what the athlete said happened — their own words when they
  // wrote any, otherwise the option they picked. Never Arjun's text.
  const title = isReflection
    ? (entry.customEvent
      || (entry.eventTags?.length ? r.q2.options[entry.eventTags[0]] : null))
    : isGuided ? guidedPreview(entry) : entry.note;

  // Two chips at most, so the row height stays predictable while scanning.
  const stateTags = stateTagsForEntry(entry, mj).slice(0, 2);

  // Only a real, stored takeaway ever previews here.
  const takeaway = isReflection && entry.arjunTakeaway ? entry.arjunTakeaway : null;

  const ariaLabel = [tagLabel, dateLabel, title, ...stateTags].filter(Boolean).join(', ');

  return (
    <Card
      as={Link}
      to={`/mind-journal/${entry.id}`}
      state={mindJournalOriginState()}
      className="block p-3.5 elevation-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      data-testid="mj-reflection-card"
      aria-label={ariaLabel}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="journal-tag" data-testid="mj-context-tag">{tagLabel}</span>
            <span className="text-micro text-slt shrink-0">{dateLabel}</span>
          </div>

          {title ? (
            <p className="text-body font-semibold text-ink leading-snug mt-2 break-words" data-testid="mj-card-title">
              {title}
            </p>
          ) : null}

          {stateTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {stateTags.map((label, idx) => (
                <span
                  key={`${label}-${idx}`}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-micro font-semibold bg-dark-700 text-slt border border-dark-600 max-w-full break-words"
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {takeaway ? (
            <p className="text-caption text-slt leading-relaxed mt-2 break-words" data-testid="mj-card-takeaway">
              <span className="font-bold" style={{ color: 'var(--journal-accent)' }}>{mj.detail.takeawayHeading}: </span>
              {takeaway}
            </p>
          ) : null}
        </div>

        <ChevronRight size={18} className="text-slt shrink-0 mt-0.5" aria-hidden="true" />
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
        <AiAccessPopover
          token={token}
          mj={mj}
          contextEnabled={contextEnabled}
          onContextEnabledChange={setContextEnabled}
        />
      </PageHeader>

      <div className="px-page pt-5 max-w-lg mx-auto pb-10">
        <div className="mb-3 empty:mb-0">
          <SaveStatus
            state={savedJustNow ? 'saved' : 'idle'}
            labels={{ saving: mj.saving, saved: mj.saved, saveFailed: null, retry: mj.retry }}
          />
        </div>

        {/* ── Hero — the one way in ─────────────────────────────────────────
            The journal's violet identity, carrying the heading, one line of
            supporting copy, the effort micro-line and a single CTA. The whole
            card is one action to the existing /mind-journal/new route, with
            the same origin state as before. Nothing on this screen counts,
            ranks or compares anything. */}
        <Card
          as={Link}
          to="/mind-journal/new"
          state={mindJournalOriginState()}
          variant="hero"
          data-testid="mj-hero-new"
          aria-label={mj.hero.heading}
          className="block p-5 elevation-hero active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{ '--grad-from': 'var(--journal-hero-from)', '--grad-to': 'var(--journal-hero-to)' }}
        >
          <p className="text-title font-bold text-white leading-snug" aria-hidden="true">{mj.hero.heading}</p>
          <p className="text-caption text-white/85 leading-relaxed mt-2">{mj.hero.sub}</p>
          <p className="text-micro font-semibold text-white/75 mt-3" data-testid="mj-hero-effort">{mj.hero.effort}</p>
          <span className="inline-flex items-center gap-2 mt-4 min-h-[44px] px-page rounded-[14px] bg-white/20 text-white text-body font-bold">
            {mj.hero.cta}
            <ArrowRight size={16} aria-hidden="true" />
          </span>
        </Card>

        {/* ── Recent entries ───────────────────────────────────────────────
            Nothing sits between the hero and this list any more: the coaching
            consent control lives in the header icon only, so the reflections
            are the next thing the athlete sees. */}
        <div className="mt-7" data-testid="mj-recent-section">
          <SectionLabel>{mj.recentHeading}</SectionLabel>

          {entries === null && (
            <div className="space-y-2">
              <div className="h-20 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />
              <div className="h-20 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />
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
            <div className="space-y-2">
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
