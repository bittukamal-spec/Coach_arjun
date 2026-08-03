import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ChevronRight, Lightbulb, Layers, Quote, NotebookPen, Pencil } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';
import { insightText } from '../utils/insightCopy';
import { Card, PageHeader } from '../components/ui';

// ─── Mental Playbook — the private library / reward surface ─────────────────
// Focus Cards, saved reset cues, reflections, one rule-based insight, and
// (PR-13) recent prescription outcomes/lessons. "Progress without
// pressure": plain counts and short athlete-visible lessons, no scores, no
// streak shame, no comparison. Entirely read-only over GET /api/playbook.
//
// Visual hierarchy pass (Dashboard/Playbook/Weekly Reviews refinement):
// every content group now lives in its own flat Card container under an
// icon section heading, so headings, summaries, empty states and actions
// read at clearly different levels. "This week" stays the page's ONE
// signature-gradient hero; everything else stays flat. No data, API call,
// route or action changed.

// Stored outcomeStatus -> translation key. Deliberately no percentage/score
// language, just a plain result label. An unknown status falls through to the
// raw value rather than inventing a label.
const OUTCOME_KEYS = {
  HELPED: 'outcomeHelped',
  HELPED_A_LITTLE: 'outcomeHelpedALittle',
  DID_NOT_HELP: 'outcomeDidNotHelp',
  NOT_TRIED: 'outcomeNotTried',
};

function outcomeLabel(status, pb) {
  const key = OUTCOME_KEYS[status];
  return key ? pb[key] : status;
}

// Section heading (Stage F) — the approved quiet uppercase section label:
// a small unfilled icon beside 11px/700 muted type. Deliberately lighter
// than it used to be, so the athlete's own content is the loudest thing on
// the page rather than the chrome around it.
function SectionHeading({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      {Icon && <Icon size={13} className="text-muted shrink-0" aria-hidden="true" />}
      <h2 className="text-micro font-bold text-muted uppercase">{children}</h2>
    </div>
  );
}

// A date already present in the payload, rendered with the approved
// date-pill recipe. Never a new date, never a computed one.
function DatePill({ children }) {
  return <span className="chip-date-pill">{children}</span>;
}

export default function PlaybookPage() {
  const { token, language } = useAuth();
  const navigate = useNavigate();
  const hi = language === 'hi';
  const pb = (translations[language] || translations.en).playbook;

  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch('/api/playbook', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d || false))
      .catch(() => setData(false));
  }, [token]);

  const insight = data ? insightText(data.insight, hi) : null;

  if (data === null) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-900 pb-28">
      {/* Header */}
      <PageHeader onBack={() => navigate(-1)} title={pb.title} />

      <div className="px-page pt-5 max-w-lg mx-auto">
        {/* Page introduction — quiet secondary copy directly under the title */}
        <p className="text-body text-slt leading-relaxed mb-7">
          {pb.intro}
        </p>

        {/* ── What I'm learning (prescription outcomes, PR-13) — the first
             thing an athlete sees on Playbook, ahead of the weekly summary.
             Now a clear lesson card: entries and the empty state both live
             inside the section's own container so an empty week still looks
             intentional, never like loose text. No lesson is ever generated
             here — entries exist only when the athlete recorded one. ────── */}
        <section className="mb-6">
          <SectionHeading icon={Lightbulb}>{pb.learningHeading}</SectionHeading>
          {data?.practiceOutcomes?.length ? (
            <div className="space-y-2.5">
              {data.practiceOutcomes.map(o => (
                <Card key={o.prescriptionId} className="p-4 elevation-row">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <DatePill>
                      {new Date(o.outcomeRecordedAt).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}
                    </DatePill>
                    <span className="text-caption text-muted">{o.practiceName}</span>
                  </div>
                  {o.situation && <p className="text-caption text-slt mb-1.5">{o.situation}</p>}
                  {/* Outcome label — the approved status-label recipe. Still
                      the stored outcomeStatus, never a score or rating. */}
                  <p className="chip-status-label mb-1.5">{outcomeLabel(o.outcomeStatus, pb)}</p>
                  {o.lesson && <p className="text-body text-ink leading-relaxed">{o.lesson}</p>}
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-4">
              <p className="text-body text-slt leading-relaxed">
                {pb.learningEmpty}
              </p>
            </Card>
          )}
        </section>

        {/* ── This week — restyled OFF the signature gradient onto the
             approved flat elevated surface (Stage F redesigns this
             surface). Its calculation, eligibility, timing, text and data
             source are untouched; only the container changed. Still no
             score or rating anywhere. ───────────────────────────────────── */}
        {data && (
          <section className="mb-6">
            <div
              className="rounded-2xl border border-dark-600 p-4 elevation-card"
              style={{ background: 'var(--surface-elevated)' }}
            >
              <p className="text-micro font-bold text-muted uppercase mb-3">{pb.thisWeek}</p>
              <div className="space-y-1.5">
                <p className="text-body text-ink break-words">
                  {pb.weekReps(data.weekRepCount)}
                </p>
                {data.weekResetCount > 0 && (
                  <p className="text-body text-ink break-words">
                    {pb.weekResets(data.weekResetCount)}
                  </p>
                )}
                {data.topCue && (
                  <p className="text-body text-ink break-words">
                    {pb.topCue(data.topCue.value)}
                  </p>
                )}
                {data.weekRepCount === 0 && !data.topCue && (
                  <p className="text-body text-slt break-words">
                    {pb.emptyLearning}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Recent insight ────────────────────────────────────────────── */}
        {insight && (
          <Card className="p-4 mb-6 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
              <Sparkles size={15} className="text-brand-400" aria-hidden="true" />
            </div>
            <p className="text-body text-slt leading-relaxed">{insight}</p>
          </Card>
        )}

        {/* ── Focus Cards — grouped inside one section container ─────────── */}
        <section className="mb-6">
          <SectionHeading icon={Layers}>{pb.focusCardsHeading}</SectionHeading>
          <Card className="p-4">
            {data?.focusCards?.length ? (
              <div className="space-y-2.5 mb-3">
                {data.focusCards.slice(0, 3).map(c => (
                  <button
                    key={c.id}
                    onClick={() => navigate('/focus-deck')}
                    className="w-full p-3 text-left rounded-xl border border-dark-600 bg-dark-700/50 active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>{c.focusWord}</span>
                      <span className="text-caption text-muted">·</span>
                      <span className="text-body font-bold" style={{ color: 'var(--accent-amber)' }}>{c.resetWord}</span>
                    </div>
                    {/* The power line is the athlete's own sentence — `truncate`
                        cut it mid-thought, which is exactly the part worth
                        reading. It wraps instead; `break-words` keeps a long
                        unbroken token from forcing horizontal overflow. */}
                    <p className="text-caption text-slt italic break-words">"{c.powerLine}"</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-body text-slt mb-3">{pb.focusCardsEmpty}</p>
            )}
            <button onClick={() => navigate(data?.focusCards?.length ? '/focus-deck' : '/self-talk')} className="min-h-[44px] inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 text-caption font-semibold text-brand-400 active:opacity-70">
              {data?.focusCards?.length
                ? pb.focusCardsViewAll
                : pb.focusCardsBuild}
            </button>
          </Card>
        </section>

        {/* ── Saved reset cues — a clearly grouped collection of QUIET pills.
             Deliberately not the interactive `.chip` class: these are the
             athlete's own saved words (never translated), not buttons, and
             must never look like the Dashboard's day-context selector. ───── */}
        <section className="mb-6">
          <SectionHeading icon={Quote}>{pb.cuesHeading}</SectionHeading>
          <Card className="p-4">
            {data?.savedCues?.length ? (
              <div className="flex flex-wrap gap-2">
                {/* The approved chip/fact recipe: read-only, never
                    focusable, never a button — the athlete's own words,
                    rendered verbatim and free to wrap onto several lines. */}
                {data.savedCues.map((c, i) => (
                  <span key={i} className="chip-fact break-words max-w-full">
                    "{c.cue}"
                  </span>
                ))}
              </div>
            ) : (
              <>
                <p className="text-body text-slt mb-2">{pb.cuesEmpty}</p>
                <button onClick={() => navigate('/mental-rep')} className="min-h-[44px] inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 text-caption font-semibold text-brand-400 active:opacity-70">
                  {pb.cuesCta}
                </button>
              </>
            )}
          </Card>
        </section>

        {/* ── Reflections — its own section container ────────────────────── */}
        <section className="mb-6">
          <SectionHeading icon={NotebookPen}>{pb.reflectionsHeading}</SectionHeading>
          <Card className="p-4">
            {data?.reflections?.length ? (
              <div className="space-y-2.5 mb-3">
                {data.reflections.map(r => (
                  <div key={r.id} className="p-3 rounded-xl border border-dark-600 bg-dark-700/50">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <DatePill>
                        {new Date(r.createdAt).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}
                      </DatePill>
                      {(r.eventType || r.resultType) && (
                        <span className="text-caption text-muted">
                          {[r.eventType, r.resultType].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    {r.nextFocus && (
                      <p className="text-body text-ink font-medium mb-1">
                        {pb.reflectionsNext}{r.nextFocus}
                      </p>
                    )}
                    {r.arjunInsight && <p className="text-caption text-slt leading-relaxed">{r.arjunInsight}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-body text-slt mb-3">{pb.reflectionsEmpty}</p>
            )}
            <button onClick={() => navigate('/debrief')} className="min-h-[44px] inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 gap-1 text-caption font-semibold text-brand-400 active:opacity-70">
              {pb.reflectionsCta} <ChevronRight size={12} aria-hidden="true" />
            </button>
          </Card>
        </section>

        {/* ── Mind Journal — a proper quiet card (flat, never the hero):
             title, a short privacy/no-score line, and one clear action. ──── */}
        <Card
          as="button"
          onClick={() => navigate('/mind-journal')}
          className="w-full p-4 text-left flex items-center gap-3 active:scale-[0.98] transition-transform"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(217,139,43,0.12)' }}
          >
            <Pencil size={15} style={{ color: 'var(--accent-amber)' }} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-body font-bold text-ink">{pb.journalTitle}</p>
            <p className="text-caption text-slt">
              {pb.journalDesc}
            </p>
          </div>
          <ChevronRight size={13} className="text-muted shrink-0" aria-hidden="true" />
        </Card>
      </div>
    </div>
  );
}
