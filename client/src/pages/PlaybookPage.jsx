import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Layers, Target, ClipboardList, Sparkles, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { insightText } from '../utils/insightCopy';
import SectionHeader from '../components/train/SectionHeader';

// ─── Mental Playbook — the private library / reward surface ─────────────────
// Focus Cards, saved reset cues, reflections, and one rule-based insight.
// "Progress without pressure": plain counts, no scores, no streak shame,
// no comparison. Entirely read-only over GET /api/playbook.

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
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 sticky top-0 bg-dark-900/95 backdrop-blur z-10">
        <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full bg-dark-700 active:scale-95">
          <ArrowLeft size={18} className="text-ink" />
        </button>
        <h1 className="text-xl font-bold text-ink flex-1">{hi ? 'Mental Playbook' : 'Mental Playbook'}</h1>
      </div>

      <div className="px-4 max-w-lg mx-auto">
        <p className="text-sm text-slt mb-5">
          {hi
            ? 'तुम्हारे cues, cards और reflections — सिर्फ तुम्हारे लिए, private.'
            : 'Your cues, cards, and reflections — private, just for you.'}
        </p>

        {/* ── Progress without pressure ─────────────────────────────────── */}
        {data && (
          <div className="card-surface p-4 mb-5">
            <p className="text-xs font-bold text-slt uppercase tracking-widest mb-3">{hi ? 'इस हफ्ते' : 'This week'}</p>
            <div className="space-y-1.5">
              <p className="text-sm text-ink">
                {hi ? `${data.weekRepCount} मेंटल रेप पूरे किए।` : `You've completed ${data.weekRepCount} mental rep${data.weekRepCount === 1 ? '' : 's'} this week.`}
              </p>
              {data.weekResetCount > 0 && (
                <p className="text-sm text-ink">
                  {hi ? `Pressure Reset ${data.weekResetCount} बार practice किया।` : `Pressure Reset practiced ${data.weekResetCount} time${data.weekResetCount === 1 ? '' : 's'}.`}
                </p>
              )}
              {data.topCue && (
                <p className="text-sm text-ink">
                  {hi ? `सबसे ज्यादा use हुआ cue: "${data.topCue.value}"` : `Your most-used cue: "${data.topCue.value}"`}
                </p>
              )}
              {data.weekRepCount === 0 && !data.topCue && (
                <p className="text-sm text-slt">
                  {hi ? 'पहला मेंटल रेप करते ही तुम्हारा Playbook भरना शुरू हो जाएगा।' : 'Your Playbook starts filling up after your first mental rep.'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Recent insight ────────────────────────────────────────────── */}
        {insight && (
          <div className="card-surface p-4 mb-5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
              <Sparkles size={15} className="text-brand-400" />
            </div>
            <p className="text-sm text-slt leading-relaxed">{insight}</p>
          </div>
        )}

        {/* ── Focus Cards ───────────────────────────────────────────────── */}
        <SectionHeader>{hi ? 'Focus Cards' : 'Focus Cards'}</SectionHeader>
        {data?.focusCards?.length ? (
          <div className="space-y-2.5 mb-2">
            {data.focusCards.slice(0, 3).map(c => (
              <button
                key={c.id}
                onClick={() => navigate('/focus-deck')}
                className="card-elevated w-full p-4 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="text-lg font-black" style={{ color: '#185FA5' }}>{c.focusWord}</span>
                  <span className="text-xs text-muted">·</span>
                  <span className="text-sm font-bold" style={{ color: '#D98B2B' }}>{c.resetWord}</span>
                </div>
                <p className="text-xs text-slt italic truncate">"{c.powerLine}"</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slt mb-2">{hi ? 'अभी कोई Focus Card नहीं।' : 'No Focus Cards yet.'}</p>
        )}
        <button onClick={() => navigate(data?.focusCards?.length ? '/focus-deck' : '/self-talk')} className="text-xs font-semibold text-brand-400 active:opacity-70 mb-6">
          {data?.focusCards?.length
            ? (hi ? 'सारे Focus Cards देखो →' : 'View all Focus Cards →')
            : (hi ? 'पहला Focus Card बनाओ →' : 'Build your first Focus Card →')}
        </button>

        {/* ── Saved reset cues ──────────────────────────────────────────── */}
        <SectionHeader>{hi ? 'Saved cues' : 'Saved cues'}</SectionHeader>
        {data?.savedCues?.length ? (
          <div className="flex flex-wrap gap-2 mb-6">
            {data.savedCues.map((c, i) => (
              <span key={i} className="chip">"{c.cue}"</span>
            ))}
          </div>
        ) : (
          <div className="mb-6">
            <p className="text-sm text-slt mb-2">{hi ? 'अभी कोई saved cue नहीं।' : 'No saved cues yet.'}</p>
            <button onClick={() => navigate('/mental-rep')} className="text-xs font-semibold text-brand-400 active:opacity-70">
              {hi ? 'आज का मेंटल रेप करो →' : "Do today's mental rep →"}
            </button>
          </div>
        )}

        {/* ── Reflections ───────────────────────────────────────────────── */}
        <SectionHeader>{hi ? 'Reflections' : 'Reflections'}</SectionHeader>
        {data?.reflections?.length ? (
          <div className="space-y-2.5 mb-2">
            {data.reflections.map(r => (
              <div key={r.id} className="card-surface p-4">
                <p className="text-[11px] text-muted mb-1">
                  {new Date(r.createdAt).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}
                  {r.eventType ? ` · ${r.eventType}` : ''}{r.resultType ? ` · ${r.resultType}` : ''}
                </p>
                {r.nextFocus && (
                  <p className="text-sm text-ink font-medium mb-1">
                    {hi ? 'अगला फोकस: ' : 'Next focus: '}{r.nextFocus}
                  </p>
                )}
                {r.arjunInsight && <p className="text-xs text-slt leading-relaxed">{r.arjunInsight}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slt mb-2">{hi ? 'अभी कोई reflection नहीं।' : 'No reflections yet.'}</p>
        )}
        <button onClick={() => navigate('/debrief')} className="text-xs font-semibold text-brand-400 active:opacity-70 mb-6 flex items-center gap-1">
          {hi ? 'नया reflection शुरू करो' : 'Start a reflection'} <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
