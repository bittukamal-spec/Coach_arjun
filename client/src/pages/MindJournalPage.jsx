import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import HelplineList from '../components/HelplineList';
import { Card, PageHeader, SectionLabel } from '../components/ui';

// ─── Mind Journal — score-free replacement for the old Mental Fitness
// check-in. Select 1-2 current states, optionally write a short note, save.
// No chart, no score, no streak, no comparison, no AI interpretation —
// just a private, plain record the athlete can look back on. ───────────────

// Stable internal state keys — never shown to the athlete directly.
// Translated labels live in translations.js under mindJournal.states.
const STATE_KEYS = ['calm', 'focused', 'confident', 'motivated', 'nervous', 'frustrated', 'distracted', 'tired'];

const MAX_NOTE_LENGTH = 500;

export default function MindJournalPage() {
  const navigate = useNavigate();
  const { token, language } = useAuth();
  const t = translations[language];
  const mj = t.mindJournal;

  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedJustNow, setSavedJustNow] = useState(false);
  const [safetyGuidance, setSafetyGuidance] = useState(null);

  const [entries, setEntries] = useState(null); // null = loading, false = load error
  const [contextEnabled, setContextEnabled] = useState(false);
  const [contextSaving, setContextSaving] = useState(false);
  const [contextError, setContextError] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadEntries = useCallback(() => {
    setEntries(null);
    apiFetch('/api/mind-journal', { headers: authHeaders })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) { setEntries(false); return; }
        setEntries(data.entries || []);
        setContextEnabled(!!data.contextEnabled);
      })
      .catch(() => setEntries(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  function toggleState(key) {
    setSelected(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 2) return prev;
      return [...prev, key];
    });
  }

  async function handleSave() {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    setSavedJustNow(false);
    try {
      const res = await apiFetch('/api/mind-journal', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ states: selected, note: note.trim() ? note : undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(data?.error || mj.errorGeneric);
      } else if (data?.safetyFlag === 'needs_support') {
        setSafetyGuidance(data.guidance || null);
      } else if (data?.entry) {
        setSelected([]);
        setNote('');
        setSavedJustNow(true);
        setEntries(prev => (Array.isArray(prev) ? [data.entry, ...prev].slice(0, 20) : [data.entry]));
        setTimeout(() => setSavedJustNow(false), 3000);
      }
    } catch {
      setSaveError(mj.errorNetwork);
    }
    setSaving(false);
  }

  async function handleContextToggle() {
    const next = !contextEnabled;
    const previous = contextEnabled;
    setContextEnabled(next);
    setContextError(false);
    setContextSaving(true);
    try {
      const res = await apiFetch('/api/mind-journal/context', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.contextEnabled !== 'boolean') {
        setContextEnabled(previous);
        setContextError(true);
      } else {
        setContextEnabled(data.contextEnabled);
      }
    } catch {
      setContextEnabled(previous);
      setContextError(true);
    }
    setContextSaving(false);
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      <PageHeader onBack={() => navigate(-1)} title={mj.title} />

      <div className="px-page pt-4 max-w-lg mx-auto">
        <p className="text-body text-slt mb-6 leading-relaxed">{mj.subtitle}</p>

        {safetyGuidance ? (
          /* ── Safety guidance — replaces the form entirely, never claims a save ── */
          <Card className="p-4 mb-6">
            <h2 className="text-body font-bold text-amber-400 mb-2">{mj.safety.heading}</h2>
            <p className="text-body text-slt leading-relaxed mb-4">{safetyGuidance}</p>
            <div className="mb-4">
              <HelplineList />
            </div>
            <button
              onClick={() => setSafetyGuidance(null)}
              className="w-full py-3 bg-dark-700 text-ink font-semibold rounded-2xl active:scale-95"
            >
              {mj.safety.okBtn}
            </button>
          </Card>
        ) : (
          <>
            {/* ── State chips ─────────────────────────────────────────────── */}
            <div className="mb-4 flex flex-wrap gap-2">
              {STATE_KEYS.map(key => {
                const isSelected = selected.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleState(key)}
                    className="chip"
                    style={isSelected ? { borderColor: '#185FA5', backgroundColor: 'rgba(24,95,165,0.15)', color: '#185FA5' } : undefined}
                  >
                    {mj.states[key]}
                  </button>
                );
              })}
            </div>
            <p className="text-caption text-slt mb-6">{mj.pickHint}</p>

            {/* ── Optional note ───────────────────────────────────────────── */}
            <textarea
              value={note}
              onChange={e => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
              maxLength={MAX_NOTE_LENGTH}
              placeholder={mj.notePlaceholder}
              rows={3}
              className="input-field resize-none mb-1"
            />
            <p className="text-caption text-slt mb-5 text-right">{note.length}/{MAX_NOTE_LENGTH}</p>

            {saveError && <p className="text-body text-red-500 mb-3">{saveError}</p>}
            {savedJustNow && (
              <p className="text-body font-semibold mb-3" style={{ color: '#185FA5' }}>{mj.saved}</p>
            )}

            <button
              onClick={handleSave}
              disabled={selected.length === 0 || saving}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-body active:scale-[0.98] transition-transform disabled:opacity-40"
              style={{ backgroundColor: '#185FA5' }}
            >
              {saving ? mj.saving : mj.saveBtn}
            </button>

            {/* ── Optional Arjun context opt-in ───────────────────────────── */}
            <Card className="p-4 mt-6 mb-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={contextEnabled}
                  disabled={contextSaving}
                  onChange={handleContextToggle}
                  className="mt-0.5 w-4 h-4 shrink-0"
                />
                <span className="text-body text-ink font-medium leading-snug">{mj.contextLabel}</span>
              </label>
              <p className="text-caption text-slt mt-2 leading-relaxed">{mj.contextDisclosure}</p>
              {contextError && <p className="text-caption text-red-500 mt-2">{mj.contextError}</p>}
            </Card>
          </>
        )}

        {/* ── Recent entries ──────────────────────────────────────────────── */}
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
              <button onClick={loadEntries} className="text-body font-bold" style={{ color: '#185FA5' }}>
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
                <Card key={entry.id} className="p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-body font-semibold text-ink">
                      {entry.states.map(k => mj.states[k]).join(' · ')}
                    </p>
                    <p className="text-caption text-slt shrink-0">{formatDate(entry.createdAt)}</p>
                  </div>
                  {entry.note && <p className="text-caption text-slt mt-1.5 leading-relaxed">{entry.note}</p>}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
