import { useEffect, useState } from 'react';
import MascotArt from '../components/visuals/MascotArt';
import { Link } from 'react-router-dom';
import { ChevronRight, CalendarRange, CircleDot, Zap, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { PageHeader, SectionLabel } from '../components/ui';

// ─── My practice — a plain look-back at what the athlete has actually done ───
// The simpler successor to the retired Playbook screen: practices Arjun gave
// and how they went, the athlete's own cues, recent reflection takeaways, and
// a way in to Weekly Reviews. Read-only over the existing GET /api/playbook
// aggregation (no AI call, nothing written). Deliberately no scores, ratings,
// streaks, charts or patterns "noticed" about the athlete — only what they
// did and what they said about it.

const OUTCOME_TONE = {
  HELPED: 'bg-brand-500 text-white',
  HELPED_A_LITTLE: 'bg-brand-500/15 text-brand-500',
  DID_NOT_HELP: 'bg-dark-600 text-ink',
  NOT_TRIED: 'bg-dark-600 text-ink',
};

// Each practice keeps its Train colour: Pressure Reset mint, reflection
// blush, everything delivered through Quick Rep sun.
export function practiceTone(practiceKey) {
  if (practiceKey === 'pressure_reset') return { bg: 'bg-mint', Icon: CircleDot };
  if (practiceKey === 'post_performance_reflection') return { bg: 'bg-blush', Icon: BookOpen };
  return { bg: 'bg-sun', Icon: Zap };
}

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

  const week = data?.thisWeek || null;
  const tw = (L.home?.thisWeek || translations.en.home.thisWeek);

  return (
    <div className="min-h-screen bg-dark-900 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
      <PageHeader backTo="/train" barClass="bg-dark-900" />

      <main className="px-page pt-1 max-w-lg mx-auto animate-fade-in">
        <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-tight text-ink">{t.title}</h1>
        <p className="text-[14px] text-slt leading-relaxed mt-1 mb-5">{t.intro}</p>

        {data === null && (
          <div className="flex justify-center pt-16" role="status" aria-label={t.loading}>
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {data === false && <p className="text-body text-slt text-center pt-10">{t.loadError}</p>}

        {/* This week — the same plain counts as Home's strip, as a blue block. */}
        {week && (
          <section aria-label={tw.title} data-testid="mp-week" className="mb-6 rounded-[24px] bg-brand-500 text-white p-4 grid grid-cols-3 gap-2">
            {[
              { label: t.weekPractices, value: week.practices },
              { label: tw.journal, value: week.reflections },
              { label: tw.helped, value: week.triedCount > 0 ? tw.helpedValue(week.helpedCount, week.triedCount) : tw.none },
            ].map(s => (
              <p key={s.label} className="flex flex-col gap-1">
                <span className="text-[26px] leading-none font-extrabold">{s.value}</span>
                <span className="text-[11.5px] leading-tight text-white/90">{s.label}</span>
              </p>
            ))}
          </section>
        )}

        {isEmpty && (
          <section className="text-center mb-6 pt-2">
            <MascotArt pose="wave" className="mb-4 h-[clamp(120px,20dvh,170px)]" />
            <p className="text-[18px] font-extrabold text-ink mb-1">{t.emptyTitle}</p>
            <p className="text-caption text-slt leading-relaxed mb-4">{t.emptySub}</p>
            <Link
              to="/coaching"
              className="inline-flex items-center justify-center min-h-[56px] px-8 rounded-[18px] bg-sun text-inkblock text-[16px] font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {t.emptyCta}
            </Link>
          </section>
        )}

        {outcomes.length > 0 && (
          <section className="mb-6">
            <SectionLabel>{t.practicesLabel}</SectionLabel>
            <ul className="space-y-2.5">
              {outcomes.map(p => {
                const tone = practiceTone(p.practiceKey);
                const Icon = tone.Icon;
                return (
                  <li key={p.prescriptionId} className="rounded-[20px] bg-dark-400 p-4 flex items-start gap-3">
                    <span className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${tone.bg}`} aria-hidden="true">
                      <Icon size={20} strokeWidth={2.4} className="text-inkblock" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[15px] font-extrabold text-ink leading-snug">
                          {names[p.practiceKey] || t.practiceFallback}
                        </p>
                        {t.outcomes[p.outcomeStatus] && (
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${OUTCOME_TONE[p.outcomeStatus] || OUTCOME_TONE.NOT_TRIED}`}>
                            {t.outcomes[p.outcomeStatus]}
                          </span>
                        )}
                      </div>
                      {(p.situation || formatDay(p.outcomeRecordedAt)) && (
                        <p className="text-caption text-slt mt-0.5 break-words">
                          {p.situation && <span>{t.forSituation(String(p.situation).trim())}</span>}
                          {p.situation && formatDay(p.outcomeRecordedAt) && <span aria-hidden="true"> · </span>}
                          {formatDay(p.outcomeRecordedAt) && <span>{formatDay(p.outcomeRecordedAt)}</span>}
                        </p>
                      )}
                      {p.lesson && (
                        <p className="text-[14px] text-ink leading-relaxed mt-1.5 break-words">{p.lesson}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {cues.length > 0 && (
          <section className="mb-6">
            <SectionLabel>{t.cuesLabel}</SectionLabel>
            <ul className="flex flex-wrap gap-2">
              {cues.map(c => (
                <li key={c} className="rounded-full bg-coral text-inkblock text-[14px] font-bold px-3.5 py-2">
                  {c}
                </li>
              ))}
            </ul>
          </section>
        )}

        {reflections.length > 0 && (
          <section className="mb-6">
            <SectionLabel>{t.reflectionsLabel}</SectionLabel>
            <ul className="space-y-2.5">
              {reflections.map(r => (
                <li key={`${r.source}-${r.id}`} className="rounded-[20px] bg-dark-400 p-4 flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center bg-blush" aria-hidden="true">
                    <BookOpen size={20} strokeWidth={2.4} className="text-inkblock" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-caption text-slt mb-0.5">{formatDay(r.createdAt)}</p>
                    <p className="text-[14px] text-ink leading-relaxed break-words">{reflectionText(r)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data !== null && (
          <Link
            to="/weekly-reviews"
            className="flex items-center gap-3 min-h-[68px] rounded-[22px] bg-dark-400 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <span className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center shrink-0" aria-hidden="true">
              <CalendarRange size={19} className="text-white" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-extrabold text-ink">{t.weeklyTitle}</span>
              <span className="block text-caption text-slt">{t.weeklySub}</span>
            </span>
            <ChevronRight size={18} className="text-slt shrink-0" aria-hidden="true" />
          </Link>
        )}
      </main>
    </div>
  );
}
