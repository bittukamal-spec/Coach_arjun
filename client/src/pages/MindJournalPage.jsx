import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import HelplineList from '../components/HelplineList';

// ─── Mind Journal — score-free replacement for the old Mental Fitness
// check-in. Select 1-2 current states, optionally write a short note, save.
// No chart, no score, no streak, no comparison, no AI interpretation —
// just a private, plain record the athlete can look back on. ───────────────

const STATE_KEYS = ['calm', 'focused', 'confident', 'motivated', 'nervous', 'frustrated', 'distracted', 'tired'];

const STATE_LABELS = {
  calm:       { en: 'Calm',       hi: 'शांत' },
  focused:    { en: 'Focused',    hi: 'केंद्रित' },
  confident:  { en: 'Confident',  hi: 'आत्मविश्वासी' },
  motivated:  { en: 'Motivated',  hi: 'प्रेरित' },
  nervous:    { en: 'Nervous',    hi: 'घबराया हुआ' },
  frustrated: { en: 'Frustrated', hi: 'निराश' },
  distracted: { en: 'Distracted', hi: 'भटका हुआ' },
  tired:      { en: 'Tired',      hi: 'थका हुआ' },
};

const MAX_NOTE_LENGTH = 500;

export default function MindJournalPage() {
  const navigate = useNavigate();
  const { token, language } = useAuth();
  const hi = language === 'hi';

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
        setSaveError(data?.error || (hi ? 'कुछ गलत हो गया' : 'Something went wrong'));
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
      setSaveError(hi ? 'नेटवर्क समस्या — दोबारा कोशिश करें' : 'Could not save — check your connection');
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
    return d.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 sticky top-0 bg-dark-900/95 backdrop-blur z-10">
        <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full bg-dark-700 active:scale-95">
          <ArrowLeft size={18} className="text-ink" />
        </button>
        <h1 className="text-xl font-bold text-ink flex-1">{hi ? 'Mind Journal' : 'Mind Journal'}</h1>
      </div>

      <div className="px-4 max-w-lg mx-auto">
        <p className="text-sm text-slt mb-6 leading-relaxed">
          {hi
            ? 'आज तुम कहाँ हो, बस उसे notice करो। यह private है और इसका कोई score नहीं है।'
            : 'Notice where you are today. This is private and not scored.'}
        </p>

        {safetyGuidance ? (
          /* ── Safety guidance — replaces the form entirely, never claims a save ── */
          <div className="card-surface p-4 mb-6">
            <h2 className="text-sm font-bold text-amber-400 mb-2">
              {hi ? 'तुम अकेले नहीं हो' : "You're not alone"}
            </h2>
            <p className="text-sm text-slt leading-relaxed mb-4">{safetyGuidance}</p>
            <div className="mb-4">
              <HelplineList />
            </div>
            <button
              onClick={() => setSafetyGuidance(null)}
              className="w-full py-3 bg-dark-700 text-ink font-semibold rounded-2xl active:scale-95"
            >
              {hi ? 'ठीक है' : 'Okay'}
            </button>
          </div>
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
                    {hi ? STATE_LABELS[key].hi : STATE_LABELS[key].en}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slt mb-6">
              {hi ? 'अधिकतम 2 चुनें' : 'Pick up to 2'}
            </p>

            {/* ── Optional note ───────────────────────────────────────────── */}
            <textarea
              value={note}
              onChange={e => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
              maxLength={MAX_NOTE_LENGTH}
              placeholder={hi ? 'कुछ और जोड़ना चाहते हो? (optional)' : 'Want to add anything? (optional)'}
              rows={3}
              className="input-field resize-none mb-1"
            />
            <p className="text-xs text-slt mb-5 text-right">{note.length}/{MAX_NOTE_LENGTH}</p>

            {saveError && <p className="text-sm text-red-500 mb-3">{saveError}</p>}
            {savedJustNow && (
              <p className="text-sm font-semibold mb-3" style={{ color: '#185FA5' }}>
                {hi ? 'सेव हो गया ✓' : 'Saved ✓'}
              </p>
            )}

            <button
              onClick={handleSave}
              disabled={selected.length === 0 || saving}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-sm active:scale-[0.98] transition-transform disabled:opacity-40"
              style={{ backgroundColor: '#185FA5' }}
            >
              {saving ? (hi ? 'सेव हो रहा है…' : 'Saving…') : (hi ? 'एंट्री सेव करें' : 'Save entry')}
            </button>

            {/* ── Optional Arjun context opt-in ───────────────────────────── */}
            <div className="card-surface p-4 mt-6 mb-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={contextEnabled}
                  disabled={contextSaving}
                  onChange={handleContextToggle}
                  className="mt-0.5 w-4 h-4 shrink-0"
                />
                <span className="text-sm text-ink font-medium leading-snug">
                  {hi
                    ? 'अर्जुन को मेरी आखिरी 5 Mind Journal एंट्री को background context के रूप में इस्तेमाल करने दें'
                    : 'Allow Arjun to use my latest 5 Mind Journal entries as background context'}
                </span>
              </label>
              <p className="text-xs text-slt mt-2 leading-relaxed">
                {hi
                  ? 'अर्जुन इन entries का उपयोग हाल का संदर्भ समझने के लिए कर सकता है। इनका उपयोग score, diagnose या automatically कोई practice prescribe करने के लिए नहीं किया जाता।'
                  : 'Arjun may use these entries to understand recent context. They are not used to score, diagnose or automatically prescribe a practice.'}
              </p>
              {contextError && (
                <p className="text-xs text-red-500 mt-2">
                  {hi ? 'सेव नहीं हो सका — दोबारा कोशिश करें' : 'Could not save — please try again'}
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Recent entries ──────────────────────────────────────────────── */}
        <div className="mt-8">
          <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-3">
            {hi ? 'हाल की एंट्री' : 'Recent entries'}
          </p>

          {entries === null && (
            <div className="space-y-2">
              <div className="h-16 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />
              <div className="h-16 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />
            </div>
          )}

          {entries === false && (
            <div className="card-surface p-4 text-center">
              <p className="text-sm text-slt mb-3">{hi ? 'लोड नहीं हो सका' : 'Could not load entries'}</p>
              <button onClick={loadEntries} className="text-sm font-bold" style={{ color: '#185FA5' }}>
                {hi ? 'दोबारा कोशिश करें' : 'Retry'}
              </button>
            </div>
          )}

          {Array.isArray(entries) && entries.length === 0 && (
            <p className="text-sm text-slt">
              {hi ? 'अभी तक कोई एंट्री नहीं — आज ही शुरू करो।' : 'No entries yet — start with today.'}
            </p>
          )}

          {Array.isArray(entries) && entries.length > 0 && (
            <div className="space-y-2">
              {entries.map(entry => (
                <div key={entry.id} className="card-surface p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {entry.states.map(k => (hi ? STATE_LABELS[k]?.hi : STATE_LABELS[k]?.en) || k).join(' · ')}
                    </p>
                    <p className="text-xs text-slt shrink-0">{formatDate(entry.createdAt)}</p>
                  </div>
                  {entry.note && <p className="text-xs text-slt mt-1.5 leading-relaxed">{entry.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
