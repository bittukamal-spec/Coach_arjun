import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import { PageHeader, Card } from '../../components/ui';
import { SafetyGuidanceCard } from '../mindJournal/shared';
import { readRoutineResponse } from './builderDraft';

// /ritual — the athlete's saved routines and the one way to build a new one.
// The classic single-ritual page is offered only to athletes who already
// have a legacy ritual; its import into routines happens only on an explicit
// tap (POST /api/routines/import-legacy is idempotent server-side).
export default function RoutinesHubPage() {
  const { token, language } = useAuth();
  const t = (translations[language] || translations.en).routineBuilder;

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null); // 'limit' | 'importError'
  const [safety, setSafety] = useState(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiFetch('/api/routines', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('load');
      setData(await res.json());
    } catch {
      setLoadError(true);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleImport() {
    if (importing) return;
    setImporting(true);
    setNotice(null);
    setSafety(null);
    try {
      const res = await apiFetch('/api/routines/import-legacy', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const outcome = await readRoutineResponse(res);
      if (outcome.type === 'safety') setSafety({ guidance: outcome.guidance });
      else if (outcome.type === 'limit') setNotice('limit');
      else if (outcome.type === 'ok') await load();
      else setNotice('importError');
    } catch {
      setNotice('importError');
    } finally {
      setImporting(false);
    }
  }

  const routines = data?.routines || [];
  const limit = data?.limit ?? 5;
  const atLimit = routines.length >= limit;
  const legacyStatus = data?.legacy?.status;
  const showLegacy = legacyStatus === 'available' || legacyStatus === 'linked';

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      <PageHeader backTo="/train" title={t.hubTitle} />
      <main className="max-w-lg mx-auto px-4 py-6 animate-fade-in">
        <p className="text-sm text-slt mb-5 leading-relaxed">{t.hubIntro}</p>

        {safety && <SafetyGuidanceCard guidance={safety.guidance} onDismiss={() => setSafety(null)} />}

        {loadError && (
          <div className="mb-4">
            <p className="text-sm text-red-400 mb-2" role="alert">{t.loadError}</p>
            <button type="button" onClick={load} className="btn-secondary">{t.retry}</button>
          </div>
        )}

        {data && (
          <>
            {atLimit ? (
              <button type="button" disabled className="btn-primary w-full justify-center py-3.5 opacity-50 cursor-not-allowed">
                {t.buildNew}
              </button>
            ) : (
              <Link to="/ritual/new" className="btn-primary w-full justify-center py-3.5">{t.buildNew}</Link>
            )}
            {(atLimit || notice === 'limit') && (
              <p className="text-sm text-slt mt-2" role="status">{t.limitReached(limit)}</p>
            )}

            <section className="mt-6 flex flex-col gap-3">
              {routines.length === 0 && <p className="text-sm text-slt">{t.empty}</p>}
              {routines.map(r => (
                <Link key={r.id} to={`/ritual/${r.id}`} className="block">
                  <Card className="px-4 py-3.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{r.name || t.situations[r.category]}</p>
                      <p className="text-caption text-slt mt-0.5">
                        {t.situations[r.category]} · {t.stepsCount(r.steps.length)}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-slt shrink-0" aria-hidden="true" />
                  </Card>
                </Link>
              ))}
            </section>

            {showLegacy && (
              <Card className="mt-6 p-4">
                <h2 className="text-body font-bold text-ink mb-1">{t.legacyTitle}</h2>
                <p className="text-sm text-slt mb-3 leading-relaxed">
                  {legacyStatus === 'available' ? t.legacyAvailable : t.legacyLinked}
                </p>
                <div className="flex flex-col gap-2">
                  <Link to="/ritual/classic" className="btn-secondary justify-center">{t.legacyOpen}</Link>
                  {legacyStatus === 'available' && (
                    <button type="button" onClick={handleImport} disabled={importing} className="btn-secondary justify-center">
                      {importing ? t.legacyImporting : t.legacyImport}
                    </button>
                  )}
                </div>
                {notice === 'importError' && <p className="text-sm text-red-400 mt-2" role="alert">{t.legacyImportError}</p>}
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
