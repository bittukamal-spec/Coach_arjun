import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CalendarRange } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { Card, PageHeader, SectionLabel } from '../components/ui';

// ─── My practice — a plain look-back at what the athlete has actually done ───
// The simpler successor to the retired Playbook screen: practices Arjun gave
// and how they went, the athlete's own cues, recent reflection takeaways, and
// a way in to Weekly Reviews. Read-only over the existing GET /api/playbook
// aggregation (no AI call, nothing written). Deliberately no scores, ratings,
// streaks, charts or patterns "noticed" about the athlete — only what they
// did and what they said about it.

const OUTCOME_TONE = {
  HELPED: 'bg-win-500/10 text-win-500',
  HELPED_A_LITTLE: 'bg-brand-500/10 text-brand-500',
  DID_NOT_HELP: 'bg-dark-600 text-slt',
  NOT_TRIED: 'bg-dark-600 text-slt',
};

function formatDay(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// Unique, non-empty cue words from Focus Cards first, then saved Quick Rep cues.
export function collectCues(data) {
  const out = [];
  const add = (w) => {
    const word = typeof w === 'string' ? w.trim() : '';
    if (word && !out.some(x => x.toLowerCase() === word.toLowerCase())) out.push(word);
  };
  for (const c of data?.focusCards || []) { add(c?.focusWord); add(c?.resetWord); }
  for (const c of data?.savedCues || []) add(c?.cue);
  return out.slice(0, 10);
}

function reflectionText(r) {
  const text = r?.source === 'mind_journal' ? r?.takeaway : (r?.nextFocus || r?.arjunInsight);
  return typeof text === 'string' ? text.trim() : '';
}

export default function MyPracticePage() {
  const { token, language } = useAuth();
  const L = translations[language] || translations.en;
  const t = L.myPractice || translations.en.myPractice;
  const names = (L.home?.practice || translations.en.home.practice).names;

  const [data, setData] = useState(null); // null = loading, false = error

  useEffect(() => {
    let alive = true;
    apiFetch('/api/playbook', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (alive) setData(d && typeof d === 'object' ? d : {}); })
      .catch(() => { if (alive) setData(false); });
    return () => { alive = false; };
  }, [token]);

  const outcomes = (data && Array.isArray(data.practiceOutcomes)) ? data.practiceOutcomes : [];
  const cues = data ? collectCues(data) : [];
  const reflections = (data && Array.isArray(data.reflections) ? data.reflections : [])
    .filter(r => reflectionText(r));
  const reps = Number(data?.weekRepCount) || 0;
  const resets = Number(data?.weekResetCount) || 0;
  const isEmpty = data && !outcomes.length && !cues.length && !reflections.length && !reps && !resets;

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      <PageHeader backTo="/train" title={t.title} />

      <main className="px-page pt-4 max-w-lg mx-auto animate-fade-in">
        <p className="text-body text-slt leading-relaxed mb-6">{t.intro}</p>

        {data === null && (
          <div className="flex justify-center pt-16" role="status" aria-label={t.loading}>
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {data === false && <p className="text-body text-slt text-center pt-10">{t.loadError}</p>}

        {isEmpty && (
          <Card className="p-5 text-center mb-6">
            <p className="text-body font-bold text-ink mb-1">{t.emptyTitle}</p>
            <p className="text-caption text-slt leading-relaxed mb-4">{t.emptySub}</p>
            <Link
              to="/coaching"
              className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-[14px] bg-brand-500 text-white text-body font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {t.emptyCta}
            </Link>
          </Card>
        )}

        {data && (reps > 0 || resets > 0) && (
          <section className="mb-6">
            <SectionLabel>{t.weekLabel}</SectionLabel>
            <Card className="p-4">
              <p className="text-body text-ink">{t.weekLine(reps, resets)}</p>
            </Card>
          </section>
        )}

        {outcomes.length > 0 && (
          <section className="mb-6">
            <SectionLabel>{t.practicesLabel}</SectionLabel>
            <ul className="space-y-2.5">
              {outcomes.map(p => (
                <li key={p.prescriptionId}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-body font-bold text-ink leading-snug">
                        {names[p.practiceKey] || t.practiceFallback}
                      </p>
                      {t.outcomes[p.outcomeStatus] && (
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-micro font-bold ${OUTCOME_TONE[p.outcomeStatus] || OUTCOME_TONE.NOT_TRIED}`}>
                          {t.outcomes[p.outcomeStatus]}
                        </span>
                      )}
                    </div>
                    {p.situation && (
                      <p className="text-caption text-slt mt-0.5 break-words">{t.forSituation(String(p.situation).trim())}</p>
                    )}
                    {p.lesson && (
                      <p className="text-body text-ink leading-relaxed mt-2 break-words">{p.lesson}</p>
                    )}
                    {formatDay(p.outcomeRecordedAt) && (
                      <p className="text-micro text-muted mt-2">{formatDay(p.outcomeRecordedAt)}</p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        {cues.length > 0 && (
          <section className="mb-6">
            <SectionLabel>{t.cuesLabel}</SectionLabel>
            <Card className="p-4">
              <ul className="flex flex-wrap gap-2">
                {cues.map(c => (
                  <li key={c} className="rounded-full bg-brand-500/10 text-brand-500 text-caption font-bold px-3 py-1">
                    {c}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        {reflections.length > 0 && (
          <section className="mb-6">
            <SectionLabel>{t.reflectionsLabel}</SectionLabel>
            <ul className="space-y-2.5">
              {reflections.map(r => (
                <li key={`${r.source}-${r.id}`}>
                  <Card className="p-4">
                    <p className="text-micro text-muted mb-1">{formatDay(r.createdAt)}</p>
                    <p className="text-body text-ink leading-relaxed break-words">{reflectionText(r)}</p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data !== null && (
          <Link
            to="/weekly-reviews"
            className="flex items-center gap-3 min-h-[56px] rounded-2xl border border-dark-600 bg-dark-800 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <span className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center shrink-0">
              <CalendarRange size={18} className="text-brand-500" aria-hidden="true" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-body font-bold text-ink">{t.weeklyTitle}</span>
              <span className="block text-caption text-slt">{t.weeklySub}</span>
            </span>
            <ChevronRight size={18} className="text-slt shrink-0" aria-hidden="true" />
          </Link>
        )}
      </main>
    </div>
  );
}
