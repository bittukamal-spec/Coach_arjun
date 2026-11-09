import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api';
import { SafetyGuidanceCard } from '../../pages/mindJournal/shared';

// A routine Arjun offered in Coach (Nov 2026). Nothing is saved until the
// athlete taps Save, which goes through the normal routines API — validated
// and safety-screened server-side like any Ritual save:
//   mode "update" → PATCH /api/routines/:id with the new steps (name and
//                   category stay as the athlete set them)
//   mode "create" → POST /api/routines as a new routine
// Steps are saved as origin "suggested", so an athlete edit later marks
// them as their own.

const DEFAULT_CATEGORY = 'own_situation';

function RoutineProposalCard({ proposal, token, t, onDismiss }) {
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState('');
  const [safety, setSafety] = useState(null);

  const updating = proposal.mode === 'update' && proposal.routineId;
  const title = updating ? t.updateTitle(proposal.routineName || t.defaultName) : t.newTitle;
  const steps = proposal.steps.map((instruction) => ({ kind: 'custom', instruction, origin: 'suggested' }));

  async function save() {
    if (state === 'saving' || state === 'saved') return;
    setState('saving');
    setError('');
    setSafety(null);
    try {
      const res = await apiFetch(updating ? `/api/routines/${proposal.routineId}` : '/api/routines', {
        method: updating ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updating
          ? { steps }
          : { name: proposal.name || t.defaultName, category: proposal.category || DEFAULT_CATEGORY, steps }),
      });
      const data = await res.json().catch(() => null);
      // A flagged save is a 200 with no routine — check it first.
      if (data?.safetyFlag === 'needs_support') {
        setSafety({ guidance: data.guidance || null });
        setState('idle');
        return;
      }
      if (!res.ok || !data?.routine) {
        setError(data?.error === 'routine_limit_reached' ? t.limit
          : res.status === 404 ? t.missing
          : t.error);
        setState('error');
        return;
      }
      setState('saved');
    } catch {
      setError(t.error);
      setState('error');
    }
  }

  return (
    <div className="flex justify-start px-1">
      <div className="max-w-[92%] w-full card-elevated overflow-hidden">
        <div className="px-3.5 py-3 flex flex-col gap-2">
          {safety && <SafetyGuidanceCard guidance={safety.guidance} onDismiss={() => setSafety(null)} />}
          <p className="text-micro uppercase text-brand-400 font-bold">{t.label}</p>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <ol className="flex flex-col gap-1.5">
            {proposal.steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug text-ink">
                <span className="w-5 h-5 shrink-0 rounded-full bg-brand-500 text-white text-[11px] font-bold flex items-center justify-center" aria-hidden="true">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {state === 'saved' ? (
            <p role="status" className="text-sm font-semibold text-win-400">
              {t.saved}{' '}
              <Link to="/ritual" className="text-brand-400 underline-offset-2 hover:underline">{t.view}</Link>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={save}
                disabled={state === 'saving'}
                className="min-h-[44px] px-4 rounded-[14px] bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {state === 'saving' ? t.saving : updating ? t.saveTo(proposal.routineName || t.defaultName) : t.saveNew}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                disabled={state === 'saving'}
                className="min-h-[44px] px-4 rounded-[14px] text-sm font-semibold text-slt hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {t.notNow}
              </button>
            </div>
          )}
          {error && <p role="alert" className="text-caption text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export default RoutineProposalCard;
