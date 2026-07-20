import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ChevronRight, Lightbulb, Layers, Quote, NotebookPen, Pencil } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
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

// Translated outcome labels for practiceOutcomes[].outcomeStatus — deliberately
// no percentage/score language, just a plain result label.
const OUTCOME_LABELS = {
  HELPED: { en: 'It helped', hi: 'इससे मदद मिली' },
  HELPED_A_LITTLE: { en: 'Helped a little', hi: 'थोड़ी मदद मिली' },
  DID_NOT_HELP: { en: 'Did not help', hi: 'मदद नहीं मिली' },
  NOT_TRIED: { en: 'Not tried yet', hi: 'अभी कोशिश नहीं की' },
};

function outcomeLabel(status, hi) {
  const entry = OUTCOME_LABELS[status];
  if (!entry) return status;
  return hi ? entry.hi : entry.en;
}

// Section heading — one visual level: small icon tile + bold body-size
// title. Visibly heavier than card copy, visibly lighter than the page
// title in the PageHeader.
function SectionHeading({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      {Icon && (
        <div className="w-7 h-7 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
          <Icon size={14} className="text-brand-400" aria-hidden="true" />
        </div>
      )}
      <h2 className="text-body font-bold text-ink uppercase tracking-wide text-[13px]">{children}</h2>
    </div>
  );
}

export default function PlaybookPage() {
  const { token, language } = useAuth();
  const navigate = useNavigate();
  const hi = language === 'hi';

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
    <div className="min-h-screen bg-dark-900 pb-24">
      {/* Header */}
      <PageHeader onBack={() => navigate(-1)} title={hi ? 'Mental Playbook' : 'Mental Playbook'} />

      <div className="px-page pt-4 max-w-lg mx-auto">
        {/* Page introduction — quiet secondary copy directly under the title */}
        <p className="text-body text-slt leading-relaxed mb-6">
          {hi
            ? 'तुम्हारे cues, cards और reflections — सिर्फ तुम्हारे लिए, private.'
            : 'Your cues, cards, and reflections — private, just for you.'}
        </p>

        {/* ── What I'm learning (prescription outcomes, PR-13) — the first
             thing an athlete sees on Playbook, ahead of the weekly summary.
             Now a clear lesson card: entries and the empty state both live
             inside the section's own container so an empty week still looks
             intentional, never like loose text. No lesson is ever generated
             here — entries exist only when the athlete recorded one. ────── */}
        <section className="mb-6">
          <SectionHeading icon={Lightbulb}>{hi ? 'मैं क्या सीख रहा हूँ' : "What I'm learning"}</SectionHeading>
          {data?.practiceOutcomes?.length ? (
            <div className="space-y-2.5">
              {data.practiceOutcomes.map(o => (
                <Card key={o.prescriptionId} className="p-4">
                  <p className="text-micro text-muted mb-1">
                    {new Date(o.outcomeRecordedAt).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}
                    {' · '}{o.practiceName}
                  </p>
                  {o.situation && <p className="text-caption text-slt mb-1">{o.situation}</p>}
                  <p className="text-body font-bold mb-1" style={{ color: '#185FA5' }}>{outcomeLabel(o.outcomeStatus, hi)}</p>
                  {o.lesson && <p className="text-body text-ink leading-relaxed">{o.lesson}</p>}
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-4">
              <p className="text-body text-slt leading-relaxed">
                {hi
                  ? 'अभी कोई सीख दर्ज नहीं हुई। जब तुम किसी practice का नतीजा Arjun को बताओगे, वह सीख यहाँ दिखेगी।'
                  : "You haven't recorded any lessons yet. When you tell Arjun how a practice went, the lesson lands here."}
              </p>
            </Card>
          )}
        </section>

        {/* ── This week — the page's ONE signature-gradient hero. White text
             on the gradient, wraps cleanly at narrow widths, no score or
             rating anywhere. ─────────────────────────────────────────────── */}
        {data && (
          <section className="mb-6">
            <Card variant="hero" className="p-4">
              <p className="text-micro font-bold text-white/70 uppercase mb-3">{hi ? 'इस हफ्ते' : 'This week'}</p>
              <div className="space-y-1.5">
                <p className="text-body text-white break-words">
                  {hi ? `${data.weekRepCount} मेंटल रेप पूरे किए।` : `You've completed ${data.weekRepCount} mental rep${data.weekRepCount === 1 ? '' : 's'} this week.`}
                </p>
                {data.weekResetCount > 0 && (
                  <p className="text-body text-white break-words">
                    {hi ? `Pressure Reset ${data.weekResetCount} बार practice किया।` : `Pressure Reset practiced ${data.weekResetCount} time${data.weekResetCount === 1 ? '' : 's'}.`}
                  </p>
                )}
                {data.topCue && (
                  <p className="text-body text-white break-words">
                    {hi ? `सबसे ज्यादा use हुआ cue: "${data.topCue.value}"` : `Your most-used cue: "${data.topCue.value}"`}
                  </p>
                )}
                {data.weekRepCount === 0 && !data.topCue && (
                  <p className="text-body text-white/80 break-words">
                    {hi ? 'पहला मेंटल रेप करते ही तुम्हारा Playbook भरना शुरू हो जाएगा।' : 'Your Playbook starts filling up after your first mental rep.'}
                  </p>
                )}
              </div>
            </Card>
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
          <SectionHeading icon={Layers}>{hi ? 'Focus Cards' : 'Focus Cards'}</SectionHeading>
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
                      <span className="text-lg font-black" style={{ color: '#185FA5' }}>{c.focusWord}</span>
                      <span className="text-caption text-muted">·</span>
                      <span className="text-body font-bold" style={{ color: '#D98B2B' }}>{c.resetWord}</span>
                    </div>
                    <p className="text-caption text-slt italic truncate">"{c.powerLine}"</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-body text-slt mb-3">{hi ? 'अभी कोई Focus Card नहीं।' : 'No Focus Cards yet.'}</p>
            )}
            <button onClick={() => navigate(data?.focusCards?.length ? '/focus-deck' : '/self-talk')} className="text-caption font-semibold text-brand-400 active:opacity-70">
              {data?.focusCards?.length
                ? (hi ? 'सारे Focus Cards देखो →' : 'View all Focus Cards →')
                : (hi ? 'पहला Focus Card बनाओ →' : 'Build your first Focus Card →')}
            </button>
          </Card>
        </section>

        {/* ── Saved reset cues — a clearly grouped collection of QUIET pills.
             Deliberately not the interactive `.chip` class: these are the
             athlete's own saved words (never translated), not buttons, and
             must never look like the Dashboard's day-context selector. ───── */}
        <section className="mb-6">
          <SectionHeading icon={Quote}>{hi ? 'Saved cues' : 'Saved cues'}</SectionHeading>
          <Card className="p-4">
            {data?.savedCues?.length ? (
              <div className="flex flex-wrap gap-2">
                {data.savedCues.map((c, i) => (
                  <span
                    key={i}
                    className="text-caption font-medium px-3 py-1.5 rounded-full bg-dark-700 border border-dark-600 text-ink break-words"
                  >
                    "{c.cue}"
                  </span>
                ))}
              </div>
            ) : (
              <>
                <p className="text-body text-slt mb-2">{hi ? 'अभी कोई saved cue नहीं।' : 'No saved cues yet.'}</p>
                <button onClick={() => navigate('/mental-rep')} className="text-caption font-semibold text-brand-400 active:opacity-70">
                  {hi ? 'आज का मेंटल रेप करो →' : "Do today's mental rep →"}
                </button>
              </>
            )}
          </Card>
        </section>

        {/* ── Reflections — its own section container ────────────────────── */}
        <section className="mb-6">
          <SectionHeading icon={NotebookPen}>{hi ? 'Reflections' : 'Reflections'}</SectionHeading>
          <Card className="p-4">
            {data?.reflections?.length ? (
              <div className="space-y-2.5 mb-3">
                {data.reflections.map(r => (
                  <div key={r.id} className="p-3 rounded-xl border border-dark-600 bg-dark-700/50">
                    <p className="text-micro text-muted mb-1">
                      {new Date(r.createdAt).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}
                      {r.eventType ? ` · ${r.eventType}` : ''}{r.resultType ? ` · ${r.resultType}` : ''}
                    </p>
                    {r.nextFocus && (
                      <p className="text-body text-ink font-medium mb-1">
                        {hi ? 'अगला फोकस: ' : 'Next focus: '}{r.nextFocus}
                      </p>
                    )}
                    {r.arjunInsight && <p className="text-caption text-slt leading-relaxed">{r.arjunInsight}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-body text-slt mb-3">{hi ? 'अभी कोई reflection नहीं।' : 'No reflections yet.'}</p>
            )}
            <button onClick={() => navigate('/debrief')} className="text-caption font-semibold text-brand-400 active:opacity-70 flex items-center gap-1">
              {hi ? 'नया reflection शुरू करो' : 'Start a reflection'} <ChevronRight size={12} aria-hidden="true" />
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
            <Pencil size={15} style={{ color: '#D98B2B' }} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-body font-bold text-ink">{hi ? 'माइंड जर्नल' : 'Mind Journal'}</p>
            <p className="text-caption text-slt">
              {hi ? 'निजी जगह, कोई स्कोर नहीं — एक एंट्री जोड़ो।' : 'Private, no scores — add an entry.'}
            </p>
          </div>
          <ChevronRight size={13} className="text-muted shrink-0" aria-hidden="true" />
        </Card>
      </div>
    </div>
  );
}
