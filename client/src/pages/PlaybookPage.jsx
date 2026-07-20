import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { insightText } from '../utils/insightCopy';
import { Card, PageHeader, SectionLabel } from '../components/ui';

// ─── Mental Playbook — the private library / reward surface ─────────────────
// Focus Cards, saved reset cues, reflections, one rule-based insight, and
// (PR-13) recent prescription outcomes/lessons. "Progress without
// pressure": plain counts and short athlete-visible lessons, no scores, no
// streak shame, no comparison. Entirely read-only over GET /api/playbook.

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
        <p className="text-body text-slt mb-5">
          {hi
            ? 'तुम्हारे cues, cards और reflections — सिर्फ तुम्हारे लिए, private.'
            : 'Your cues, cards, and reflections — private, just for you.'}
        </p>

        {/* ── What I'm learning (prescription outcomes, PR-13) — the first
             thing an athlete sees on Playbook, ahead of the weekly summary ── */}
        <SectionLabel>{hi ? 'मैं क्या सीख रहा हूँ' : "What I'm learning"}</SectionLabel>
        {data?.practiceOutcomes?.length ? (
          <div className="space-y-2.5 mb-2">
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
          <p className="text-body text-slt mb-6">
            {hi ? 'अभी कोई सीख दर्ज नहीं हुई।' : "You haven't recorded any lessons yet."}
          </p>
        )}

        {/* ── Progress without pressure — the page's one gradient hero ──── */}
        {data && (
          <Card variant="hero" className="p-4 mb-5">
            <p className="text-micro font-bold text-white/70 uppercase mb-3">{hi ? 'इस हफ्ते' : 'This week'}</p>
            <div className="space-y-1.5">
              <p className="text-body text-white">
                {hi ? `${data.weekRepCount} मेंटल रेप पूरे किए।` : `You've completed ${data.weekRepCount} mental rep${data.weekRepCount === 1 ? '' : 's'} this week.`}
              </p>
              {data.weekResetCount > 0 && (
                <p className="text-body text-white">
                  {hi ? `Pressure Reset ${data.weekResetCount} बार practice किया।` : `Pressure Reset practiced ${data.weekResetCount} time${data.weekResetCount === 1 ? '' : 's'}.`}
                </p>
              )}
              {data.topCue && (
                <p className="text-body text-white">
                  {hi ? `सबसे ज्यादा use हुआ cue: "${data.topCue.value}"` : `Your most-used cue: "${data.topCue.value}"`}
                </p>
              )}
              {data.weekRepCount === 0 && !data.topCue && (
                <p className="text-body text-white/80">
                  {hi ? 'पहला मेंटल रेप करते ही तुम्हारा Playbook भरना शुरू हो जाएगा।' : 'Your Playbook starts filling up after your first mental rep.'}
                </p>
              )}
            </div>
          </Card>
        )}

        {/* ── Recent insight ────────────────────────────────────────────── */}
        {insight && (
          <Card className="p-4 mb-5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
              <Sparkles size={15} className="text-brand-400" />
            </div>
            <p className="text-body text-slt leading-relaxed">{insight}</p>
          </Card>
        )}

        {/* ── Focus Cards ───────────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'Focus Cards' : 'Focus Cards'}</SectionLabel>
        {data?.focusCards?.length ? (
          <div className="space-y-2.5 mb-2">
            {data.focusCards.slice(0, 3).map(c => (
              <Card
                as="button"
                key={c.id}
                onClick={() => navigate('/focus-deck')}
                className="w-full p-4 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="text-lg font-black" style={{ color: '#185FA5' }}>{c.focusWord}</span>
                  <span className="text-caption text-muted">·</span>
                  <span className="text-body font-bold" style={{ color: '#D98B2B' }}>{c.resetWord}</span>
                </div>
                <p className="text-caption text-slt italic truncate">"{c.powerLine}"</p>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-body text-slt mb-2">{hi ? 'अभी कोई Focus Card नहीं।' : 'No Focus Cards yet.'}</p>
        )}
        <button onClick={() => navigate(data?.focusCards?.length ? '/focus-deck' : '/self-talk')} className="text-caption font-semibold text-brand-400 active:opacity-70 mb-6">
          {data?.focusCards?.length
            ? (hi ? 'सारे Focus Cards देखो →' : 'View all Focus Cards →')
            : (hi ? 'पहला Focus Card बनाओ →' : 'Build your first Focus Card →')}
        </button>

        {/* ── Saved reset cues ──────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'Saved cues' : 'Saved cues'}</SectionLabel>
        {data?.savedCues?.length ? (
          <div className="flex flex-wrap gap-2 mb-6">
            {data.savedCues.map((c, i) => (
              <span key={i} className="chip">"{c.cue}"</span>
            ))}
          </div>
        ) : (
          <div className="mb-6">
            <p className="text-body text-slt mb-2">{hi ? 'अभी कोई saved cue नहीं।' : 'No saved cues yet.'}</p>
            <button onClick={() => navigate('/mental-rep')} className="text-caption font-semibold text-brand-400 active:opacity-70">
              {hi ? 'आज का मेंटल रेप करो →' : "Do today's mental rep →"}
            </button>
          </div>
        )}

        {/* ── Reflections ───────────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'Reflections' : 'Reflections'}</SectionLabel>
        {data?.reflections?.length ? (
          <div className="space-y-2.5 mb-2">
            {data.reflections.map(r => (
              <Card key={r.id} className="p-4">
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
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-body text-slt mb-2">{hi ? 'अभी कोई reflection नहीं।' : 'No reflections yet.'}</p>
        )}
        <button onClick={() => navigate('/debrief')} className="text-caption font-semibold text-brand-400 active:opacity-70 mb-6 flex items-center gap-1">
          {hi ? 'नया reflection शुरू करो' : 'Start a reflection'} <ChevronRight size={12} />
        </button>

        {/* ── Mind Journal — a quiet entry point, not a primary feature ───── */}
        <button
          onClick={() => navigate('/mind-journal')}
          className="w-full flex items-center justify-between gap-2 py-3 text-left active:opacity-70"
        >
          <span className="text-caption text-slt">
            {hi ? 'मन की डायरी में एक एंट्री जोड़ो' : 'Add an entry to your Mind Journal'}
          </span>
          <ChevronRight size={13} className="text-muted shrink-0" />
        </button>
      </div>
    </div>
  );
}
