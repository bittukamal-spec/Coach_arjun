import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Lightbulb, BarChart3, Layers, Quote, Pencil } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';
import { Card, PageHeader } from '../components/ui';

// ─── Mental Playbook — a compact OVERVIEW, not a detailed report ───────────
// Approved-mockup pass: one card per category, one strongest takeaway each,
// no nested boxes, minimal copy, restrained per-section colour accent. Each
// section shows only its single most useful/most recent item — the full
// underlying history is unchanged and still fetched (GET /api/playbook is
// still the only, read-only call), this page simply no longer renders all
// of it. Detailed browsing of saved content lives in the relevant feature
// (Focus Deck for Focus Cards); sections with no dedicated list page (Saved
// Cues, Reflections) keep their existing single action instead of a "view
// all" link, since inventing a new destination is out of scope for a
// visual/copy pass. Mind Journal has no entry point here at all — it lives
// on Home only. No data, API call, route or action changed for any section.

// Per-section colour identity. `icon` is a text-safe token (already
// individually confirmed >=4.5:1 on every card surface this page uses);
// `wash`/`border` are decorative-only low-alpha tints, fixed RGB in both
// themes (matching the existing convention for decorative accents
// elsewhere in this app, e.g. the Focus Card word colours below).
const TONE = {
  blue: {
    icon: 'var(--brand-primary)',
    iconBg: 'rgba(23,105,170,0.12)',
    wash: 'rgba(23,105,170,0.07)',
    border: 'rgba(23,105,170,0.20)',
  },
  teal: {
    icon: 'var(--accent-teal)',
    iconBg: 'rgba(34,211,197,0.14)',
    wash: 'rgba(34,211,197,0.08)',
    border: 'rgba(34,211,197,0.25)',
  },
  amber: {
    icon: 'var(--accent-amber)',
    iconBg: 'rgba(242,155,56,0.14)',
    wash: 'rgba(242,155,56,0.08)',
    border: 'rgba(242,155,56,0.25)',
  },
};

function ToneBadge({ icon: Icon, tone, size = 34 }) {
  const t = TONE[tone];
  return (
    <span
      className="rounded-xl flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: t.iconBg }}
    >
      <Icon size={Math.round(size * 0.5)} style={{ color: t.icon }} aria-hidden="true" />
    </span>
  );
}

// Section eyebrow — icon badge + small uppercase coloured label, sitting
// directly inside the section's one card (not a separate heading above a
// separate content box — the "nested box" pattern the previous pass had).
function SectionHeading({ icon, tone = 'blue', children, right }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <ToneBadge icon={icon} tone={tone} />
      <span className="text-micro font-bold uppercase" style={{ color: TONE[tone].icon }}>{children}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

function DatePill({ children }) {
  return <span className="chip-date-pill">{children}</span>;
}

// Purely decorative "this leads somewhere" mark — aria-hidden, never a
// button. Real interactive rows (Focus Cards, which already route to
// /focus-deck) render their own explicit onClick instead of this.
function DecorativeChevron() {
  return <ChevronRight size={16} className="text-muted shrink-0" aria-hidden="true" />;
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

  if (data === null) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const lesson = data?.practiceOutcomes?.[0] || null;
  const focusCard = data?.focusCards?.[0] || null;
  const cue = data?.savedCues?.[0] || null;
  const reflection = data?.reflections?.[0] || null;

  return (
    <div className="min-h-screen bg-dark-900 pb-28">
      <PageHeader onBack={() => navigate(-1)} title={pb.title} />

      <div className="px-page pt-5 max-w-lg mx-auto space-y-4">

        {/* ── Latest Lesson — the strongest card on the page. Always the
             blue-tinted surface, even empty, since it is the one section
             the athlete should notice first. ─────────────────────────── */}
        <Card className="p-4 elevation-row" style={{ background: TONE.blue.wash, borderColor: TONE.blue.border }}>
          <SectionHeading
            icon={Lightbulb}
            tone="blue"
            right={lesson && (
              <DatePill>
                {new Date(lesson.outcomeRecordedAt).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}
              </DatePill>
            )}
          >
            {pb.learningHeading}
          </SectionHeading>
          {lesson?.lesson ? (
            <p className="text-lg font-bold text-ink leading-snug break-words">{lesson.lesson}</p>
          ) : (
            <>
              <p className="text-body font-bold text-ink mb-1">{pb.learningEmptyTitle}</p>
              <p className="text-caption text-slt leading-relaxed">{pb.learningEmpty}</p>
            </>
          )}
        </Card>

        {/* ── This week — one number, one label, at most one short
             secondary line. Stays the neutral elevated surface (not a
             colour wash) — it is a summary, not a saved-content category. */}
        <Card className="p-4 elevation-card" style={{ background: 'var(--surface-elevated)' }}>
          <SectionHeading icon={BarChart3} tone="blue" right={<DecorativeChevron />}>{pb.thisWeek}</SectionHeading>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-ink">{data.weekRepCount}</span>
            <span className="text-body text-slt">{pb.weekRepsLabel(data.weekRepCount)}</span>
          </div>
          {data.weekRepCount === 0 ? (
            <p className="text-caption text-slt mt-1">{pb.emptyLearning}</p>
          ) : data.weekResetCount > 0 ? (
            <p className="text-caption text-slt mt-1">{pb.weekResets(data.weekResetCount)}</p>
          ) : null}
        </Card>

        {/* ── Focus Cards — blue accent. The single most recent card is
             the whole overview; the row itself opens Focus Deck, same
             route as the "view all" link below it. ────────────────────── */}
        <Card
          className="p-4 elevation-row"
          style={{ background: focusCard ? TONE.blue.wash : 'var(--surface-elevated)', borderColor: focusCard ? TONE.blue.border : 'var(--border-hairline)' }}
        >
          <SectionHeading icon={Layers} tone="blue">{pb.focusCardsHeading}</SectionHeading>
          {focusCard ? (
            <>
              <button
                onClick={() => navigate('/focus-deck')}
                className="w-full text-left flex items-start gap-2 mb-3 active:opacity-70"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>{focusCard.focusWord}</span>
                    <span className="text-caption text-muted">·</span>
                    <span className="text-body font-bold" style={{ color: 'var(--accent-amber)' }}>{focusCard.resetWord}</span>
                  </div>
                  {/* Athlete's own sentence — never truncated/clamped, wraps instead. */}
                  <p className="text-caption text-slt italic break-words">"{focusCard.powerLine}"</p>
                </div>
                <DecorativeChevron />
              </button>
              <button onClick={() => navigate('/focus-deck')} className="min-h-[44px] inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 text-caption font-semibold text-brand-400 active:opacity-70">
                {pb.focusCardsViewAll}
              </button>
            </>
          ) : (
            <>
              <p className="text-body font-bold text-ink mb-3">{pb.focusCardsEmpty}</p>
              <button
                onClick={() => navigate('/self-talk')}
                className="min-h-[44px] inline-flex items-center rounded-xl px-4 font-bold text-caption text-white active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                style={{ background: 'var(--brand-primary)' }}
              >
                {pb.focusCardsBuild}
              </button>
            </>
          )}
        </Card>

        {/* ── Saved cues — teal accent, the most minimal section. Read-only:
             the athlete's own words, verbatim, never a button. ─────────── */}
        <Card
          className="p-4 elevation-row"
          style={{ background: cue ? TONE.teal.wash : 'var(--surface-elevated)', borderColor: cue ? TONE.teal.border : 'var(--border-hairline)' }}
        >
          <SectionHeading icon={Quote} tone="teal">{pb.cuesHeading}</SectionHeading>
          {cue ? (
            <div className="flex items-center gap-2">
              <p className="text-body font-semibold text-ink break-words flex-1 min-w-0">"{cue.cue}"</p>
              <DecorativeChevron />
            </div>
          ) : (
            <>
              <p className="text-body font-bold text-ink mb-2">{pb.cuesEmpty}</p>
              <button onClick={() => navigate('/mental-rep')} className="min-h-[44px] inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 text-caption font-semibold text-brand-400 active:opacity-70">
                {pb.cuesCta}
              </button>
            </>
          )}
        </Card>

        {/* ── Reflections — amber accent. Date + short context + the one
             "Next focus" takeaway; athlete-written content stays verbatim.
             "Start a reflection" is the one real action either way (there
             is no separate reflection-history route to link to). ──────── */}
        <Card
          className="p-4 elevation-row"
          style={{ background: reflection ? TONE.amber.wash : 'var(--surface-elevated)', borderColor: reflection ? TONE.amber.border : 'var(--border-hairline)' }}
        >
          <SectionHeading
            icon={Pencil}
            tone="amber"
            right={reflection && (
              <DatePill>
                {new Date(reflection.createdAt).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}
              </DatePill>
            )}
          >
            {pb.reflectionsHeading}
          </SectionHeading>
          {reflection ? (
            <div className="flex items-start gap-2 mb-3">
              <div className="flex-1 min-w-0">
                {reflection.eventType && <p className="text-caption text-muted mb-1">{reflection.eventType}</p>}
                {reflection.nextFocus && (
                  <p className="text-body text-ink font-medium mb-1 break-words">
                    <span className="font-bold" style={{ color: 'var(--accent-amber)' }}>{pb.reflectionsNext}</span>
                    {reflection.nextFocus}
                  </p>
                )}
                {reflection.arjunInsight && <p className="text-caption text-slt leading-relaxed break-words">{reflection.arjunInsight}</p>}
              </div>
              <DecorativeChevron />
            </div>
          ) : (
            <p className="text-body font-bold text-ink mb-3">{pb.reflectionsEmpty}</p>
          )}
          <button onClick={() => navigate('/debrief')} className="min-h-[44px] inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 gap-1 text-caption font-semibold text-brand-400 active:opacity-70">
            {pb.reflectionsCta} <ChevronRight size={12} aria-hidden="true" />
          </button>
        </Card>
      </div>
    </div>
  );
}
