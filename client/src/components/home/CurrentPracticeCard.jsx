import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import { practiceRouteFor } from '../../utils/prescriptionPractice';
import SportArt from '../visuals/SportArt';

// "Your practice from Arjun" — Home's view of the ONE practice Coach has
// already given this athlete (spec §2: one prescription at a time).
//
// Read-only over the existing GET /api/prescriptions/active. It never picks
// or suggests a practice itself, never creates a session, and never claims
// the follow-up opener — it only shows what Coach decided, and offers the two
// real next steps: do it (when the practice has an in-app flow) or go tell
// Arjun how it went. Renders nothing while loading, on any error, when there
// is no practice, or once the athlete has reported a final result.

const FINAL_OUTCOMES = ['HELPED', 'DID_NOT_HELP'];

// True when this practice should still be on Home.
export function isPracticeOpen(p) {
  if (!p || typeof p !== 'object') return false;
  if (!p.prescriptionId || !p.practiceKey) return false;
  if (p.status === 'SUPERSEDED') return false;
  return !FINAL_OUTCOMES.includes(p.outcomeStatus);
}

export default function CurrentPracticeCard() {
  const { user, token, language } = useAuth();
  const navigate = useNavigate();
  const t = translations[language]?.home?.practice || translations.en.home.practice;

  const [practice, setPractice] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/prescriptions/active', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && isPracticeOpen(d?.prescription)) setPractice(d.prescription); })
      .catch(() => {});
    return () => { alive = false; };
  }, [token]);

  if (!practice) return null;

  const done = practice.status === 'COMPLETED';
  const route = done ? null : practiceRouteFor(practice.practiceKey);
  const name = t.names[practice.practiceKey] || t.fallbackName;
  const situation = String(practice.situation || '').trim();
  const details = String(practice.cardContent || '').trim();

  return (
    <section aria-labelledby="current-practice-title" className="mb-3">
      <div className="relative overflow-hidden rounded-[28px] bg-brand-500 text-white px-5 pt-5 pb-3">
        {/* Per-sport drawing, decorative. Sits behind the copy on the right. */}
        <SportArt sport={user?.sport} size={132} className="absolute -right-3 top-1 pointer-events-none" />

        <div className="relative">
          <p className="inline-block rounded-full bg-white text-brand-600 text-micro font-bold uppercase px-3 py-1">
            {done ? t.labelDone : t.label}
          </p>
          <h2 id="current-practice-title" className="mt-3 max-w-[11.75rem] text-[26px] leading-[1.12] font-extrabold">
            {name}
          </h2>
          {situation && (
            <p className="mt-1 max-w-[14rem] text-body text-white/90 leading-snug break-words">
              {t.forSituation(situation)}
            </p>
          )}

          {practice.cueWord && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-caption text-white/90">
              {t.cue}
              <span className="rounded-full bg-brand-600 text-white text-[13px] font-bold px-3 py-1">
                {practice.cueWord}
              </span>
            </p>
          )}

          {details && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
                className="min-h-[44px] inline-flex items-center gap-1 text-caption font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-lg"
              >
                {expanded ? t.hideSteps : t.showSteps}
                {expanded
                  ? <ChevronUp size={16} aria-hidden="true" />
                  : <ChevronDown size={16} aria-hidden="true" />}
              </button>
              {expanded && (
                <p className="rounded-2xl bg-brand-600 p-3 text-body text-white leading-relaxed whitespace-pre-wrap break-words">
                  {details}
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-1">
            {route && (
              <button
                type="button"
                onClick={() => navigate(route, {
                  state: { prescriptionId: practice.prescriptionId, practiceKey: practice.practiceKey },
                })}
                className="min-h-[54px] w-full rounded-[18px] bg-sun text-inkblock text-base font-extrabold px-4 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-500"
              >
                {t.start}
              </button>
            )}
            <Link
              to="/coaching"
              className={`min-h-[44px] w-full inline-flex items-center justify-center text-center rounded-[18px] font-bold px-4 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                route ? 'text-[13.5px] text-white' : 'min-h-[54px] bg-sun text-inkblock text-base font-extrabold'
              }`}
            >
              {t.tellArjun}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
