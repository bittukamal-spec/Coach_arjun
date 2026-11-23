import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import TonePage from '../components/ui/TonePage';
import MascotArt from '../components/visuals/MascotArt';
import { pathText } from '../components/path/pathData';
import { SafetyGuidanceCard, useMindJournalSave } from './mindJournal/shared';
import { MAX_NOTE_LENGTH, textOrUndefined } from './mindJournal/constants';
import { sportBlock } from '../i18n/sportExamples';

// The path's Reflect step (founder feedback, Nov 2026): one screen that
// already knows the chapter — no "What are you reflecting on?" picker.
// One tap for how it felt, one optional line, save. It is saved as a Mind
// Journal quick note (safety-screened by the journal API); the path
// recognises it as the Reflect step and the athlete goes back to Train.
const FEELINGS = ['calm', 'focused', 'confident', 'motivated', 'nervous', 'frustrated', 'distracted', 'tired'];

export default function PathReflectPage() {
  const { chapterKey } = useParams();
  const { language, user } = useAuth();
  const navigate = useNavigate();
  const t = pathText(language);
  const r = t.reflect;
  const mj = (translations[language] || translations.en).mindJournal;
  const [feel, setFeel] = useState(null);
  const [note, setNote] = useState('');
  const { saving, saveError, safety, dismissSafety, save } = useMindJournalSave();
  const ch = t.chapters[chapterKey];
  if (!ch) return <Navigate to="/train" replace />;
  const skill = t.match.skill[chapterKey] || ch.title;

  async function handleSave() {
    if (!feel || saving) return;
    const entry = await save({ entryType: 'QUICK_NOTE', states: [feel], note: textOrUndefined(note) });
    if (entry) navigate('/train', { replace: true });
  }

  return (
    <TonePage tone="blush">
      <div className="mx-auto max-w-lg px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => navigate(-1)} aria-label={r.back} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-dark-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <ArrowLeft size={18} />
        </button>

        {safety ? (
          <div className="mt-4"><SafetyGuidanceCard guidance={safety.guidance} onDismiss={dismissSafety} /></div>
        ) : (
          <>
            <MascotArt pose="notes" className="mt-1 h-[clamp(100px,16dvh,140px)]" />
            <p className="mt-3 text-center text-[12px] font-bold uppercase tracking-[0.12em] text-slt">{r.tag(ch.title)}</p>
            <h1 className="mt-1 text-center text-[24px] font-extrabold leading-tight text-ink">{r.title(skill)}</h1>

            <p id="reflect-feel" className="mt-5 mb-2 text-[15px] font-extrabold text-ink">{r.feelQ}</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="reflect-feel">
              {FEELINGS.map(k => (
                <button key={k} type="button" role="radio" aria-checked={feel === k} onClick={() => setFeel(k)}
                  className={`min-h-[48px] rounded-[14px] text-[14px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${feel === k ? 'bg-brand-500 text-white' : 'bg-dark-400 text-ink'}`}>
                  {mj.states[k]}
                </button>
              ))}
            </div>

            <label htmlFor="reflect-note" className="mt-5 mb-2 block text-[15px] font-extrabold text-ink">{r.noteQ}</label>
            <textarea id="reflect-note" rows={3} maxLength={MAX_NOTE_LENGTH} value={note}
              onChange={e => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
              placeholder={`e.g. I said “${sportBlock(user?.sport).resetWord}” and felt calmer`}
              className="input-field w-full resize-none border-0 bg-dark-400" />

            {saveError && <p className="mt-3 text-[13px] text-red-500" role="alert">{saveError}</p>}
            <button type="button" disabled={!feel || saving} onClick={handleSave} data-testid="reflect-save"
              className="mt-5 flex min-h-[56px] w-full items-center justify-center rounded-[18px] bg-sun text-[16px] font-extrabold text-inkblock disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
              {saving ? r.saving : r.save}
            </button>
          </>
        )}
      </div>
    </TonePage>
  );
}
