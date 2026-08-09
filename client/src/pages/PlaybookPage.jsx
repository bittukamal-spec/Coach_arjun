import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ChevronRight, Lightbulb, Repeat, Layers, Quote, NotebookPen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';
import { insightText } from '../utils/insightCopy';
import { Card, PageHeader } from '../components/ui';

// ─── Mental Playbook — the private library / reward surface ─────────────────
// Focus Cards, saved reset cues, reflections, one rule-based insight, and
// recent prescription outcomes/lessons. "Progress without pressure": plain
// counts and short athlete-visible lessons, no scores, no streaks, no
// comparison. Entirely read-only over GET /api/playbook.
//
// Modernization pass: every section now carries its own controlled accent
// (blue = learning/practice, teal = saved cues, amber = reflections) so the
// five approved sections read as distinct categories at a glance, not one
// long run of identical pale boxes. Colour is applied to icon badges, card
// washes and borders only — never the only cue to a section's identity, and
// never a bright Train-style launch-card treatment (this content is saved/
// personal, not a grid of "open a tool" buttons). No gradient anywhere on
// this page (that stays "This week"'s one now-retired signature — the whole
// page is flat). The Mind Journal entry point that used to close this page
// out has been removed entirely; Mind Journal now lives on Home only. No
// data, API call, route or action changed for any surviving section.

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

// Per-section colour identity. Every value here is additive styling only —
// icon tint, a soft background wash, a matching border tint — layered over
// the same flat Card/border-dark-600 recipe the rest of the app uses. `icon`
// is always a text-safe token (var(--brand-primary) / var(--accent-teal) /
// var(--accent-amber), each independently confirmed >=4.5:1 on every card
// surface); `iconBg`/`wash`/`border` are decorative-only low-alpha tints and
// deliberately reuse the same fixed RGB in both themes, matching the existing
// convention for decorative accent tints elsewhere on this page (e.g. the
// Focus Card word colours below).
const TONE = {
  blue: {
    icon: 'var(--brand-primary)',
    iconBg: 'rgba(23,105,170,0.12)',
    wash: 'rgba(23,105,170,0.05)',
    border: 'rgba(23,105,170,0.22)',
  },
  teal: {
    icon: 'var(--accent-teal)',
    iconBg: 'rgba(34,211,197,0.14)',
    wash: 'rgba(34,211,197,0.06)',
    border: 'rgba(34,211,197,0.28)',
  },
  amber: {
    icon: 'var(--accent-amber)',
    iconBg: 'rgba(242,155,56,0.14)',
    wash: 'rgba(242,155,56,0.06)',
    border: 'rgba(242,155,56,0.28)',
  },
};

// Small tinted icon badge — the one consistent "this section belongs to X
// category" mark used by both SectionHeading and every empty state below.
function ToneBadge({ icon: Icon, tone, size = 24 }) {
  const t = TONE[tone];
  return (
    <span
      className="rounded-lg flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: t.iconBg }}
    >
      <Icon size={Math.round(size * 0.58)} style={{ color: t.icon }} aria-hidden="true" />
    </span>
  );
}

// Section heading — icon badge (tinted per-section) beside the quiet
// uppercase label. The label itself stays neutral (text-muted): colour
// differentiates sections through the icon/card treatment, not by turning
// the heading copy into a rainbow of accent colours.
function SectionHeading({ icon, tone = 'blue', children }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      {icon && <ToneBadge icon={icon} tone={tone} size={22} />}
      <h2 className="text-micro font-bold text-muted uppercase">{children}</h2>
    </div>
  );
}

// Compact empty-state row — icon badge + short copy, optionally with one
// action. Replaces the old "big pale box with one line of text" pattern so
// an empty section still reads as an intentional, understandable card.
function EmptyState({ icon, tone, body, actionLabel, onAction, actionStyle = 'link' }) {
  return (
    <div className="flex items-start gap-3">
      <ToneBadge icon={icon} tone={tone} />
      <div className="flex-1 min-w-0">
        <p className="text-body text-slt leading-relaxed">{body}</p>
        {actionLabel && actionStyle === 'button' && (
          <button
            onClick={onAction}
            className="mt-3 min-h-[44px] inline-flex items-center rounded-xl px-4 font-bold text-caption text-white active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            style={{ background: 'var(--brand-primary)' }}
          >
            {actionLabel}
          </button>
        )}
        {actionLabel && actionStyle === 'link' && (
          <button
            onClick={onAction}
            className="mt-2 min-h-[44px] inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 text-caption font-semibold text-brand-400 active:opacity-70"
          >
            {actionLabel}
          </button>
        )}
      </div>
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

        {/* ── 1. What I'm learning — the most important section on the page:
             the athlete's own recorded lessons from prescription outcomes.
             Populated entries carry the strongest visual weight of any card
             here (tinted wash, left accent, the lesson itself as the biggest
             text); the empty state stays compact rather than a big pale box.
             No lesson is ever generated here — entries exist only when the
             athlete recorded one. ─────────────────────────────────────── */}
        <section className="mb-6">
          <SectionHeading icon={Lightbulb} tone="blue">{pb.learningHeading}</SectionHeading>
          {data?.practiceOutcomes?.length ? (
            <div className="space-y-2.5">
              {data.practiceOutcomes.map(o => (
                <Card
                  key={o.prescriptionId}
                  className="p-4 elevation-row border-l-[3px]"
                  style={{ background: TONE.blue.wash, borderColor: TONE.blue.border, borderLeftColor: 'var(--brand-primary)' }}
                >
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
                  {o.lesson && <p className="text-body font-semibold text-ink leading-relaxed">{o.lesson}</p>}
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-4">
              <EmptyState icon={Lightbulb} tone="blue" body={pb.learningEmpty} />
            </Card>
          )}
        </section>

        {/* ── 2. This week — a compact, easy-to-scan practice summary. Its
             calculation, eligibility, timing, text and data source are
             untouched from before the redesign; only the container gained
             an icon badge for visual anchoring. Still no score or rating
             anywhere. ─────────────────────────────────────────────────── */}
        {data && (
          <section className="mb-6">
            <div
              className="rounded-2xl border border-dark-600 p-4 elevation-card"
              style={{ background: 'var(--surface-elevated)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <ToneBadge icon={Repeat} tone="blue" size={22} />
                <p className="text-micro font-bold text-muted uppercase">{pb.thisWeek}</p>
              </div>
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

        {/* ── 3. Focus Cards — blue accent, matching Learning/This week.
             Saved cards stay left-aligned content (not a CTA card); the
             empty state gets a clearer, more visually obvious build action
             since there is nothing else to look at yet. ─────────────────── */}
        <section className="mb-6">
          <SectionHeading icon={Layers} tone="blue">{pb.focusCardsHeading}</SectionHeading>
          {data?.focusCards?.length ? (
            <Card className="p-4" style={{ background: TONE.blue.wash, borderColor: TONE.blue.border }}>
              <div className="space-y-2.5 mb-3">
                {data.focusCards.slice(0, 3).map(c => (
                  <button
                    key={c.id}
                    onClick={() => navigate('/focus-deck')}
                    className="w-full p-3 text-left rounded-xl border border-dark-600 bg-dark-400 active:scale-[0.98] transition-transform"
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
              <button onClick={() => navigate('/focus-deck')} className="min-h-[44px] inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 text-caption font-semibold text-brand-400 active:opacity-70">
                {pb.focusCardsViewAll}
              </button>
            </Card>
          ) : (
            <Card className="p-4">
              <EmptyState
                icon={Layers}
                tone="blue"
                body={pb.focusCardsEmpty}
                actionLabel={pb.focusCardsBuild}
                actionStyle="button"
                onAction={() => navigate('/self-talk')}
              />
            </Card>
          )}
        </section>

        {/* ── 4. Saved cues — teal accent, the one section carried by
             short athlete-authored phrases. Populated cues sit inside a
             teal-tinted wash so the cue text itself becomes the visual
             focal point; they stay QUIET pills (never the interactive
             `.chip` class, never buttons — the athlete's own saved words,
             rendered verbatim). ─────────────────────────────────────────── */}
        <section className="mb-6">
          <SectionHeading icon={Quote} tone="teal">{pb.cuesHeading}</SectionHeading>
          {data?.savedCues?.length ? (
            <div
              className="rounded-2xl p-4 elevation-row border"
              style={{ background: TONE.teal.wash, borderColor: TONE.teal.border }}
            >
              <div className="flex flex-wrap gap-2">
                {/* The approved chip/fact recipe: read-only, never
                    focusable, never a button — the athlete's own words,
                    rendered verbatim and free to wrap onto several lines. */}
                {data.savedCues.map((c, i) => (
                  <span key={i} className="chip-fact break-words max-w-full" style={{ borderColor: TONE.teal.border }}>
                    "{c.cue}"
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <Card className="p-4">
              <EmptyState
                icon={Quote}
                tone="teal"
                body={pb.cuesEmpty}
                actionLabel={pb.cuesCta}
                onAction={() => navigate('/mental-rep')}
              />
            </Card>
          )}
        </section>

        {/* ── 5. Reflections — warm amber accent. Each saved reflection
             clearly separates date, context/situation and the "Next focus"
             takeaway; athlete-written content stays left-aligned and
             verbatim, never summarised. "Start a reflection" stays a quiet
             secondary action, same as before. ─────────────────────────── */}
        <section className="mb-6">
          <SectionHeading icon={NotebookPen} tone="amber">{pb.reflectionsHeading}</SectionHeading>
          {data?.reflections?.length ? (
            <Card className="p-4" style={{ background: TONE.amber.wash, borderColor: TONE.amber.border }}>
              <div className="space-y-2.5 mb-3">
                {data.reflections.map(r => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl border border-dark-600 bg-dark-400 border-l-[3px]"
                    style={{ borderLeftColor: 'var(--accent-amber)' }}
                  >
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
                        <span className="font-bold" style={{ color: 'var(--accent-amber)' }}>{pb.reflectionsNext}</span>
                        {r.nextFocus}
                      </p>
                    )}
                    {r.arjunInsight && <p className="text-caption text-slt leading-relaxed">{r.arjunInsight}</p>}
                  </div>
                ))}
              </div>
              <button onClick={() => navigate('/debrief')} className="min-h-[44px] inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 gap-1 text-caption font-semibold text-brand-400 active:opacity-70">
                {pb.reflectionsCta} <ChevronRight size={12} aria-hidden="true" />
              </button>
            </Card>
          ) : (
            <Card className="p-4">
              <EmptyState
                icon={NotebookPen}
                tone="amber"
                body={pb.reflectionsEmpty}
                actionLabel={pb.reflectionsCta}
                onAction={() => navigate('/debrief')}
              />
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
