import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { Card, PageHeader, SectionLabel, SaveStatus } from '../components/ui';
import { guidedPreview } from './mindJournal/constants';

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
// Rows are deliberately inert: opening a single entry is a separate change,
// so there is no chevron, no overflow menu and no edit or delete affordance
// that would not actually do anything.
function EntryRow({ entry, mj, dateLabel }) {
  const isGuided = entry.entryType === 'GUIDED_REFLECTION';
  const stateTags = entry.states?.length ? entry.states.map(k => mj.states[k]).join(' · ') : null;
  const preview = isGuided ? guidedPreview(entry) : entry.note;
  // takeForward gets its own row, and it is also last in the preview
  // precedence — so when it is the only thing written, show it once as the
  // labelled row rather than twice.
  const showPreview = preview && preview !== entry.takeForward;

  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-micro font-bold text-slt uppercase">
          {isGuided
            ? (mj.contextTypes[entry.contextType] || mj.contextTypes.SOMETHING_ELSE)
            : mj.quickNote.tag}
        </p>
        <p className="text-caption text-slt shrink-0">{dateLabel}</p>
      </div>

      {stateTags && <p className="text-body font-semibold text-ink mt-1.5">{stateTags}</p>}

      {showPreview && <p className="text-caption text-slt mt-1.5 leading-relaxed">{preview}</p>}

      {isGuided && entry.takeForward && (
        <p className="text-caption text-slt mt-2 leading-relaxed">
          <span className="font-bold text-ink">{mj.takeForwardLabel}: </span>
          {entry.takeForward}
        </p>
      )}
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
    <div className="min-h-screen bg-dark-900 pb-24">
      <PageHeader onBack={() => navigate(-1)} title={mj.title} />

      <div className="px-page pt-4 max-w-lg mx-auto">
        <p className="text-body text-slt mb-6 leading-relaxed">{mj.subtitle}</p>

        <div className="mb-3 empty:mb-0">
          <SaveStatus
            state={savedJustNow ? 'saved' : 'idle'}
            labels={{ saving: mj.saving, saved: mj.saved, saveFailed: null, retry: mj.retry }}
          />
        </div>

        {/* ── The two ways in ──────────────────────────────────────────── */}
        <Card as={Link} to="/mind-journal/new" className="block p-4 mb-3 active:scale-[0.99] transition-transform">
          <p className="text-body font-bold text-ink">{mj.newReflection.cardTitle}</p>
          <p className="text-caption text-slt mt-1 leading-relaxed">{mj.newReflection.cardDesc}</p>
          <p className="text-caption font-bold mt-3" style={{ color: 'var(--brand-primary)' }}>
            {mj.newReflection.cta}
          </p>
        </Card>

        <Link
          to="/mind-journal/quick"
          className="flex items-center min-h-[44px] text-body font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
          style={{ color: 'var(--brand-primary)' }}
        >
          {mj.quickNote.action}
        </Link>

        {/* ── Arjun context status — the control itself lives on its own
            screen, so this row only reports where the setting stands ──── */}
        <Card className="flex items-center justify-between gap-3 p-3.5 mt-5">
          <p className="text-caption text-slt">
            {mj.contextStatus.label}:{' '}
            <span className="font-bold text-ink">
              {contextEnabled ? mj.contextStatus.on : mj.contextStatus.off}
            </span>
          </p>
          <Link
            to="/mind-journal/context"
            className="inline-flex items-center min-h-[44px] text-caption font-bold shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            style={{ color: 'var(--brand-primary)' }}
          >
            {mj.contextStatus.manage}
          </Link>
        </Card>

        {/* ── Recent entries ───────────────────────────────────────────── */}
        <div className="mt-8">
          <SectionLabel>{mj.recentHeading}</SectionLabel>

          {entries === null && (
            <div className="space-y-2">
              <div className="h-16 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />
              <div className="h-16 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />
            </div>
          )}

          {entries === false && (
            <Card className="p-4 text-center">
              <p className="text-body text-slt mb-3">{mj.loadError}</p>
              <button onClick={loadEntries} className="text-body font-bold" style={{ color: 'var(--brand-primary)' }}>
                {mj.retryBtn}
              </button>
            </Card>
          )}

          {Array.isArray(entries) && entries.length === 0 && (
            <p className="text-body text-slt">{mj.emptyState}</p>
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
