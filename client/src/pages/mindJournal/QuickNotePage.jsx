import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { Card, PageHeader, SaveStatus, Button } from '../../components/ui';
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
    <div className="min-h-screen bg-dark-900 pb-10">
      <PageHeader backTo="/mind-journal" title={qn.title} />

      <div className="px-page pt-5 max-w-lg mx-auto">
        {safety ? (
          <SafetyGuidanceCard guidance={safety.guidance} onDismiss={dismissSafety} />
        ) : (
          <>
            <h2 className="text-title font-bold text-ink mb-2">{qn.statesHeading}</h2>
            <p className="text-body text-slt mb-5 leading-relaxed">{qn.intro}</p>

            <StateChips selected={selected} onToggle={key => setSelected(prev => toggleStateKey(prev, key))} />
            <p className="text-caption text-slt mt-2.5 mb-6">{mj.pickHint}</p>

            <Card className="p-4 mb-5 elevation-card" data-testid="mj-writing-card">
              <div className="flex items-center gap-2.5 mb-3">
                <span
                  className="w-9 h-9 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <PenLine size={16} />
                </span>
                <label htmlFor="quick-note-text" className="text-body font-bold text-ink">
                  {qn.prompt}
                </label>
              </div>
              <textarea
                id="quick-note-text"
                value={note}
                onChange={e => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                maxLength={MAX_NOTE_LENGTH}
                placeholder={qn.notePlaceholder}
                rows={4}
                className="input-field resize-none mb-1 border-0 bg-dark-700/80"
              />
              <p className="text-caption text-slt text-right tabular-nums">{note.length}/{MAX_NOTE_LENGTH}</p>
            </Card>

            <div className="mb-3 empty:mb-0">
              <SaveStatus
                state={saving ? 'saving' : saveError ? 'error' : 'idle'}
                onRetry={handleSave}
                labels={{ saving: mj.saving, saved: mj.saved, saveFailed: saveError, retry: mj.retry }}
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={!canSave}
              className="w-full"
            >
              {saving ? mj.saving : qn.saveBtn}
            </Button>

            <p className="text-caption text-slt mt-5 leading-relaxed text-center">{mj.disclosure}</p>
          </>
        )}
      </div>
    </div>
  );
}
