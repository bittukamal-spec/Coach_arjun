import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { pathText, dayKey, dayFromKey, weekdayOf } from '../path/pathData';

// "Which day is your match?" (Hook fix 2 — investment). The athlete picks a
// day in the next week, a later date, or "No match soon" (clears it). The
// day is theirs to change or clear any time; nothing is assumed.
export default function MatchDaySheet({ open, initialDay = null, initialType = null, onSave, onClose, inline = false, saveLabel = null }) {
  const { language } = useAuth();
  const t = pathText(language).match;
  const [day, setDay] = useState(initialDay);
  const [type, setType] = useState(initialType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { if (open) { setDay(initialDay); setType(initialType); setError(false); } }, [open, initialDay, initialType]);

  const week = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const today = week[0];

  async function save(value) {
    setBusy(true); setError(false);
    try { await onSave(value, value ? type : null); } catch { setError(true); } finally { setBusy(false); }
  }

  const outer = inline
    ? 'w-full'
    : 'fixed inset-0 z-[70] flex items-end justify-center bg-inkblock/50';
  const inner = inline
    ? 'w-full text-ink'
    : 'w-full max-w-lg rounded-t-[28px] bg-dark-900 px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-ink';
  return (
    <div className={outer} {...(inline ? {} : { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'match-sheet-title' })} data-testid="match-sheet">
      <div className={inner}>
        {!inline && (
          <div className="flex justify-end">
            <button type="button" onClick={onClose} aria-label={t.close} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-dark-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><X size={18} /></button>
          </div>
        )}
        {inline
          ? <h1 id="match-sheet-title" className="text-[25px] font-extrabold leading-tight">{t.sheetTitle}</h1>
          : <h2 id="match-sheet-title" className="-mt-2 text-center text-[22px] font-extrabold">{t.sheetTitle}</h2>}
        <p className={`mt-1 text-[14px] text-slt ${inline ? '' : 'text-center'}`}>{t.sheetLine}</p>

        <p className="mt-5 mb-2 text-[13px] font-extrabold">{t.thisWeek}</p>
        <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label={t.thisWeek}>
          {week.map(k => {
            const on = day === k;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setDay(k)}
                aria-label={dayFromKey(k).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                className={`flex min-h-[58px] flex-col items-center justify-center rounded-[14px] text-[12px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${on ? 'bg-brand-500 text-white' : 'bg-dark-400 text-ink'}`}>
                {weekdayOf(k, 'short')}
                <span className="text-[16px] font-extrabold">{dayFromKey(k).getDate()}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className={`relative flex min-h-[48px] cursor-pointer items-center justify-center rounded-[14px] px-2 text-[14px] font-bold focus-within:ring-2 focus-within:ring-brand-500 ${day && !week.includes(day) ? 'bg-brand-500 text-white' : 'bg-dark-400 text-ink'}`}>
            {day && !week.includes(day) ? dayFromKey(day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : t.later}
            <input type="date" min={today} aria-label={t.later} className="absolute inset-0 opacity-0" value={day && !week.includes(day) ? day : ''} onChange={e => e.target.value && setDay(e.target.value)} />
          </label>
          <button type="button" disabled={busy} onClick={() => save(null)} className="min-h-[48px] rounded-[14px] bg-dark-400 text-[14px] font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{t.none}</button>
        </div>

        {/* What kind of match (founder, Nov 2026) — optional */}
        <p id="match-type-q" className="mt-5 text-[13px] font-extrabold">{t.typeQ}</p>
        <p className="mb-2 text-[12px] text-slt">{t.typeHint}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="match-type-q" data-testid="match-types">
          {Object.entries(t.types).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(type === k ? null : k)}
              className={`min-h-[44px] rounded-full px-4 text-[13.5px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${type === k ? 'bg-brand-500 text-white' : 'bg-dark-400 text-ink'}`}>{label}</button>
          ))}
        </div>

        {error && <p className="mt-3 text-center text-[13px] text-red-400" role="alert">{t.saveError}</p>}
        <button type="button" disabled={!day || busy} onClick={() => save(day)} data-testid="match-save"
          className="mt-4 flex min-h-[56px] w-full items-center justify-center rounded-[18px] bg-sun text-[16px] font-extrabold text-inkblock disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
          {day ? (saveLabel || t.save(weekdayOf(day))) : t.saveEmpty}
        </button>
      </div>
    </div>
  );
}
