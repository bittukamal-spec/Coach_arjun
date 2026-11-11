import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import { practiceRouteFor } from '../../utils/prescriptionPractice';
import { Card } from '../ui';

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
  const { token, language } = useAuth();
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
    <section aria-labelledby="current-practice-title" className="mb-7">
      <Card className="p-4 border-brand-500/40">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-brand-500/10 flex items-center justify-center shrink-0">
            <ClipboardCheck size={20} className="text-brand-500" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-micro font-bold uppercase text-brand-500">
              {done ? t.labelDone : t.label}
            </p>
            <h2 id="current-practice-title" className="text-heading font-bold text-ink leading-snug">
              {name}
            </h2>
            {situation && (
              <p className="text-caption text-slt leading-snug mt-0.5 break-words">
                {t.forSituation(situation)}
              </p>
            )}
          </div>
        </div>

        {practice.cueWord && (
          <p className="mt-3 text-caption text-slt">
            {t.cue}{' '}
            <span className="inline-block rounded-full bg-brand-500/10 text-brand-500 font-bold px-2.5 py-0.5">
              {practice.cueWord}
            </span>
          </p>
        )}

        {details && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              aria-expanded={expanded}
              className="min-h-[44px] inline-flex items-center gap-1 text-caption font-semibold text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
            >
              {expanded ? t.hideSteps : t.showSteps}
              {expanded
                ? <ChevronUp size={16} aria-hidden="true" />
                : <ChevronDown size={16} aria-hidden="true" />}
            </button>
            {expanded && (
              <p className="text-body text-ink leading-relaxed whitespace-pre-wrap break-words">
                {details}
              </p>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {route && (
            <button
              type="button"
              onClick={() => navigate(route, {
                state: { prescriptionId: practice.prescriptionId, practiceKey: practice.practiceKey },
              })}
              className="min-h-[44px] flex-1 rounded-[14px] bg-brand-500 text-white text-body font-semibold px-4 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {t.start}
            </button>
          )}
          <Link
            to="/coaching"
            className={`min-h-[44px] flex-1 inline-flex items-center justify-center text-center rounded-[14px] text-body font-semibold px-4 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
              route ? 'border border-brand-600/40 text-brand-500' : 'bg-brand-500 text-white'
            }`}
          >
            {t.tellArjun}
          </Link>
        </div>
      </Card>
    </section>
  );
}
