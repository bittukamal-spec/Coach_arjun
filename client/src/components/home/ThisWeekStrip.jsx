import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';

// Home's "This week" strip (founder-approved Nov 2026): plain counts from
// records that already exist — practices finished, Mind Journal entries,
// and how many reported practices helped in play — plus seven day dots.
// No streak, no score, no points: a missed day is just an empty dot and
// nothing breaks or resets. Reads `thisWeek` from GET /api/playbook (the
// same read-only data My practice uses) and opens My practice on tap.

function localDayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// The last seven local days, oldest first, ending today.
export function lastSevenDays(now = new Date()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return { key: localDayKey(d), date: d, isToday: i === 6 };
  });
}

export function activeDayKeys(activityAt = []) {
  return new Set(activityAt.map(iso => localDayKey(new Date(iso))));
}

export default function ThisWeekStrip() {
  const { token, language } = useAuth();
  const t = (translations[language] || translations.en).home.thisWeek;
  const [week, setWeek] = useState(null);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/playbook', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d?.thisWeek) setWeek(d.thisWeek); })
      .catch(() => {});
    return () => { alive = false; };
  }, [token]);

  if (!week) return null;

  const days = lastSevenDays();
  const active = activeDayKeys(week.activityAt);
  const helped = week.triedCount > 0 ? t.helpedValue(week.helpedCount, week.triedCount) : t.none;
  const stats = [
    { label: t.practices, value: week.practices },
    { label: t.journal, value: week.reflections },
    { label: t.helped, value: helped },
  ];

  return (
    <Link
      to="/my-practice"
      aria-label={`${t.title}: ${stats.map(s => `${s.value} ${s.label}`).join(', ')}. ${t.open}`}
      data-testid="home-this-week"
      className="mb-3 block rounded-[24px] bg-dark-400 px-4 pt-3.5 pb-4 active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-ink">{t.title}</span>
        <ChevronRight size={18} strokeWidth={2.4} className="text-slt" aria-hidden="true" />
      </span>

      <span className="mt-2 grid grid-cols-3 gap-2" aria-hidden="true">
        {stats.map(s => (
          <span key={s.label} className="flex flex-col">
            <span className="text-[24px] leading-none font-extrabold text-ink">{s.value}</span>
            <span className="mt-1 text-[11.5px] leading-tight text-slt">{s.label}</span>
          </span>
        ))}
      </span>

      <span className="mt-3.5 grid grid-cols-7 gap-1.5" aria-hidden="true">
        {days.map(d => {
          const done = active.has(d.key);
          return (
            <span key={d.key} className="flex flex-col items-center gap-1">
              <span
                data-day-done={done ? 'true' : 'false'}
                className={`w-full h-2 rounded-full ${done ? 'bg-brand-500' : 'bg-dark-600'}`}
              />
              <span className={`text-[10.5px] leading-none ${d.isToday ? 'font-bold text-ink' : 'text-slt'}`}>
                {d.date.toLocaleDateString('en-IN', { weekday: 'narrow' })}
              </span>
            </span>
          );
        })}
      </span>
    </Link>
  );
}
