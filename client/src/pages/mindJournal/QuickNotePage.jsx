import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { PageHeader, SaveStatus } from '../../components/ui';
import { MAX_NOTE_LENGTH, textOrUndefined, toggleStateKey } from './constants';
import { StateChips, SafetyGuidanceCard, useMindJournalSave } from './shared';

// ─── Quick note — the fast way into the Mind Journal. One or two states,
// an optional line, done. No context type and none of the guided prompts:
// this is the shape the server calls QUICK_NOTE. ────────────────────────────

export default function QuickNotePage() {
  const navigate = useNavigate();
  const { language } = useAuth();
  const mj = translations[language].mindJournal;
  const qn = mj.quickNote;

  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState('');
  const { saving, saveError, safety, dismissSafety, save } = useMindJournalSave();

  const canSave = selected.length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    const entry = await save({
      entryType: 'QUICK_NOTE',
      states: selected,
      note: textOrUndefined(note),
    });
    // Only a real created entry navigates — a safety-flagged or failed
    // submission stays here rather than implying the note was kept.
    if (entry) navigate('/mind-journal', { replace: true, state: { justSaved: true } });
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      <PageHeader backTo="/mind-journal" title={qn.title} />

      <div className="px-page pt-4 max-w-lg mx-auto">
        {safety ? (
          <SafetyGuidanceCard guidance={safety.guidance} onDismiss={dismissSafety} />
        ) : (
          <>
            <p className="text-body text-slt mb-6 leading-relaxed">{qn.intro}</p>

            <p className="text-body font-semibold text-ink mb-3">{qn.statesHeading}</p>
            <StateChips selected={selected} onToggle={key => setSelected(prev => toggleStateKey(prev, key))} />
            <p className="text-caption text-slt mt-2 mb-6">{mj.pickHint}</p>

            <label htmlFor="quick-note-text" className="block text-body font-semibold text-ink mb-2">
              {qn.prompt}
            </label>
            <textarea
              id="quick-note-text"
              value={note}
              onChange={e => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
              maxLength={MAX_NOTE_LENGTH}
              placeholder={qn.notePlaceholder}
              rows={3}
              className="input-field resize-none mb-1"
            />
            <p className="text-caption text-slt mb-5 text-right">{note.length}/{MAX_NOTE_LENGTH}</p>

            <div className="mb-3 empty:mb-0">
              <SaveStatus
                state={saving ? 'saving' : saveError ? 'error' : 'idle'}
                onRetry={handleSave}
                labels={{ saving: mj.saving, saved: mj.saved, saveFailed: saveError, retry: mj.retry }}
              />
            </div>

            <button
              onClick={handleSave}
              disabled={!canSave}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-body active:scale-[0.98] transition-transform disabled:opacity-40"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {saving ? mj.saving : qn.saveBtn}
            </button>

            <p className="text-caption text-slt mt-4 leading-relaxed">{mj.disclosure}</p>
          </>
        )}
      </div>
    </div>
  );
}
