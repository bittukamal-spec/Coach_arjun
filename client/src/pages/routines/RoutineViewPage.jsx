import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import { PageHeader, Card, SectionLabel } from '../../components/ui';

// /ritual/:id — read-only view of one saved routine.
export default function RoutineViewPage() {
  const { id } = useParams();
  const { token, language } = useAuth();
  const t = (translations[language] || translations.en).routineBuilder;

  const [routine, setRoutine] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | notFound | error

  useEffect(() => {
    let active = true;
    apiFetch(`/api/routines/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (!active) return;
        if (res.status === 404) { setState('notFound'); return; }
        if (!res.ok) { setState('error'); return; }
        const data = await res.json();
        if (!active) return;
        setRoutine(data.routine);
        setState('ready');
      })
      .catch(() => active && setState('error'));
    return () => { active = false; };
  }, [id, token]);

  const title = routine ? (routine.name || t.situations[routine.category]) : t.hubTitle;

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      <PageHeader backTo="/ritual" title={title} />
      <main className="max-w-lg mx-auto px-4 py-6 animate-fade-in">
        {state === 'loading' && (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {(state === 'notFound' || state === 'error') && (
          <div>
            <p className="text-sm text-slt mb-4" role="alert">{state === 'notFound' ? t.notFound : t.loadError}</p>
            <Link to="/ritual" className="btn-secondary">{t.backToRoutines}</Link>
          </div>
        )}
        {state === 'ready' && routine && (
          <>
            <p className="text-caption text-slt mb-4">{t.situations[routine.category]}</p>
            {routine.moment && (
              <div className="mb-4">
                <SectionLabel>{t.viewMoment}</SectionLabel>
                <p className="text-sm text-ink">{routine.moment}</p>
              </div>
            )}
            {routine.purpose && (
              <div className="mb-4">
                <SectionLabel>{t.viewPurpose}</SectionLabel>
                <p className="text-sm text-ink">{routine.purpose}</p>
              </div>
            )}
            <SectionLabel>{t.viewSteps}</SectionLabel>
            <ol className="flex flex-col gap-3">
              {routine.steps.map((step, i) => (
                <li key={step.id}>
                  <Card className="px-4 py-3.5 flex items-start gap-3">
                    <span className="w-7 h-7 rounded-full bg-dark-700 border border-dark-500 flex items-center justify-center shrink-0 text-xs font-bold text-slt">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-ink leading-snug">{step.instruction}</p>
                      {step.origin === 'existing' && (
                        <p className="text-caption text-brand-400 mt-1">{t.youAlreadyDoThis}</p>
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>
    </div>
  );
}
