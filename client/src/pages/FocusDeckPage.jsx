import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';
import FocusWordChip from '../components/train/FocusWordChip';

const MATCH_CONTEXTS = [
  { key: 'pre_match',    labelEn: 'Pre-match',    labelHi: 'Match से पहले' },
  { key: 'during_match', labelEn: 'During match',  labelHi: 'Match के दौरान' },
  { key: 'training',     labelEn: 'Training',      labelHi: 'Training में' },
  { key: 'after_match',  labelEn: 'After match',   labelHi: 'Match के बाद' },
];

// Display-only examples of strong Focus Words — short, action-first cues.
const POPULAR_FOCUS_WORDS = ['Next action', 'Watch', 'Steady', 'Attack', 'Reset', 'Lock in'];

export default function FocusDeckPage() {
  const { token, language } = useAuth();
  const navigate = useNavigate();
  const t = translations[language]?.selfTalk?.deck || translations.en.selfTalk.deck;
  const hi = language === 'hi';

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [contextMenuId, setContextMenuId] = useState(null);

  useEffect(() => {
    apiFetch('/api/self-talk/cards?filter=active', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setCards(Array.isArray(data) ? data : []))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [token]);

  const activeCount = cards.length;

  const patch = async (id, data) => {
    setActionLoading(id);
    try {
      const r = await apiFetch(`/api/self-talk/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const res = await r.json();
      if (res.card) {
        setCards(prev => prev.map(c => c.id === id ? res.card : c));
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  const setMatchDay = async (id, context) => {
    setActionLoading(id);
    setContextMenuId(null);
    try {
      const r = await apiFetch(`/api/self-talk/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isMatchDayCard: true, matchDayContext: context }),
      });
      const res = await r.json();
      if (res.card) {
        setCards(prev => prev.map(c => ({
          ...c,
          isMatchDayCard: c.id === id,
          matchDayContext: c.id === id ? context : c.matchDayContext,
        })));
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  const deleteCard = async (id) => {
    setActionLoading(id);
    try {
      const r = await apiFetch(`/api/self-talk/cards/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await r.json();
      if (res.success) {
        setCards(prev => prev.filter(c => c.id !== id));
        if (expandedId === id) setExpandedId(null);
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
      setDeleteConfirmId(null);
    }
  };

  const contextLabel = (ctx) => {
    const found = MATCH_CONTEXTS.find(c => c.key === ctx);
    if (!found) return t.matchDayBadge;
    return hi ? found.labelHi : found.labelEn;
  };

  if (loading) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 sticky top-0 bg-dark-900/95 backdrop-blur z-10">
        <button onClick={() => navigate('/train')} className="w-9 h-9 flex items-center justify-center rounded-full bg-dark-700 active:scale-95">
          <ArrowLeft size={18} className="text-ink" />
        </button>
        <h1 className="text-xl font-bold text-ink flex-1">{t.title}</h1>
        {activeCount >= 5 && (
          <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-1 rounded-full font-semibold">5/5</span>
        )}
        {activeCount < 5 && (
          <button
            onClick={() => navigate('/self-talk')}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-brand-500 active:scale-95"
          >
            <Plus size={18} className="text-white" />
          </button>
        )}
      </div>

      {/* Hero */}
      <div className="px-4 pb-5">
        <span className="tag-pill inline-block mb-3" style={{ '--tile-fg': '#185FA5', '--tile-bg': 'rgb(var(--brand-50))' }}>
          {hi ? 'Focus Words' : 'Focus Words'}
        </span>
        <h2 className="text-2xl font-black text-ink leading-tight mb-2">
          {hi ? 'Power words से अपना focus ट्रेन करो।' : 'Train your focus with power words.'}
        </h2>
        <p className="text-sm text-slt leading-relaxed mb-4">
          {hi
            ? 'एक Focus Word तुम्हारे मन को वापस अगले एक्शन पर लाता है — ट्रेनिंग में भी, कॉम्पिटिशन में भी।'
            : 'A Focus Word brings your mind back to the next action — in training and in competition.'}
        </p>

        {/* Popular focus words */}
        <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
          {hi ? 'लोकप्रिय Focus Words' : 'Popular Focus Words'}
        </p>
        <div className="flex flex-wrap gap-2">
          {POPULAR_FOCUS_WORDS.map(w => <FocusWordChip key={w} word={w} />)}
        </div>
      </div>

      {/* How it works — shown until the athlete has cards of their own */}
      {cards.length === 0 && (
        <div className="mx-4 mb-5 card-surface p-4">
          <p className="text-xs font-bold text-slt uppercase tracking-widest mb-3">
            {hi ? 'यह कैसे काम करता है' : 'How it works'}
          </p>
          <div className="space-y-2.5">
            {[
              hi ? 'Focus Card Builder में अपनी situation डालो।' : 'Build a Focus Card from your own pressure situation.',
              hi ? 'अपने Focus Word और Reset Word के साथ card save करो।' : 'Save it with your Focus Word, Reset Word, and mantra.',
              hi ? 'Focus Lock में अपने word को distraction के बीच ट्रेन करो।' : 'Train your word under distraction in Focus Lock.',
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
                  <span className="text-brand-400 text-xs font-bold">{i + 1}</span>
                </div>
                <p className="text-sm text-slt leading-snug">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Max cards banner */}
      {activeCount >= 5 && (
        <div className="mx-4 mb-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
          <p className="text-xs text-amber-400">{t.maxBanner} {hi ? 'पहले एक हटाओ।' : 'Delete one first.'}</p>
        </div>
      )}

      {/* Empty state */}
      {cards.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
          <h3 className="text-base font-bold text-ink mb-2">{t.emptyTitle}</h3>
          <button
            onClick={() => navigate('/self-talk')}
            className="btn-gradient mt-4 py-3 px-8"
            style={{ minHeight: '48px' }}
          >
            {t.emptyBtn}
          </button>
        </div>
      )}

      {/* Cards */}
      {cards.length > 0 && (
        <p className="section-label px-4">{hi ? 'Saved Focus Cards' : 'Saved Focus Cards'}</p>
      )}
      <div className="px-4 space-y-3">
        {cards.map(card => {
          const isExpanded = expandedId === card.id;
          const showContextMenu = contextMenuId === card.id;
          return (
            <div key={card.id} className={`rounded-3xl border ${card.isMatchDayCard ? 'bg-brand-500/10 border-brand-500/40' : 'bg-dark-800 border-dark-600'}`}>

              {/* Tappable card header */}
              <button
                className="w-full text-left p-4"
                onClick={() => {
                  setExpandedId(isExpanded ? null : card.id);
                  if (showContextMenu) setContextMenuId(null);
                }}
              >
                {/* Match day badge with context */}
                {card.isMatchDayCard && (
                  <div className="flex items-center gap-1 mb-2">
                    <Star size={12} className="text-amber-400 fill-amber-400" />
                    <span className="text-xs font-semibold text-amber-400">
                      {contextLabel(card.matchDayContext)}
                    </span>
                  </div>
                )}

                {/* Focus + reset words */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl font-black" style={{ color: '#185FA5' }}>{card.focusWord}</span>
                  <span className="text-xs text-muted">·</span>
                  <span className="text-base font-bold" style={{ color: '#D98B2B' }}>{card.resetWord}</span>
                </div>

                {/* Power line */}
                <p className="text-sm text-slt italic">"{card.powerLine}"</p>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-3 space-y-3 border-t border-dark-600/50 pt-3">
                  {card.performanceReminder && (
                    <div>
                      <p className="text-[10px] font-semibold text-slt uppercase tracking-wider mb-1">{hi ? 'Performance Reminder' : 'Performance Reminder'}</p>
                      <p className="text-sm text-slt">{card.performanceReminder}</p>
                    </div>
                  )}
                  {card.arjunNote && (
                    <div>
                      <p className="text-[10px] font-semibold text-brand-400 uppercase tracking-wider mb-1">{hi ? "Arjun का नोट" : "Arjun's Note"}</p>
                      <p className="text-sm text-slt leading-relaxed">{card.arjunNote}</p>
                    </div>
                  )}
                  {card.performanceMoment && (
                    <div>
                      <p className="text-[10px] font-semibold text-slt uppercase tracking-wider mb-1">{hi ? 'Moment' : 'Moment'}</p>
                      <p className="text-xs text-muted">{card.performanceMoment}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="px-4 pb-4 pt-1">
                {/* Match day context picker */}
                {card.isMatchDayCard ? (
                  <button
                    disabled={actionLoading === card.id}
                    onClick={() => patch(card.id, { isMatchDayCard: false, matchDayContext: null })}
                    className="text-xs font-semibold text-muted bg-dark-700 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50 mr-2"
                  >
                    {hi ? 'Match Day से हटाओ' : 'Remove from match day'}
                  </button>
                ) : showContextMenu ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                      {hi ? 'Context चुनो' : 'Select context'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {MATCH_CONTEXTS.map(ctx => (
                        <button
                          key={ctx.key}
                          disabled={actionLoading === card.id}
                          onClick={() => setMatchDay(card.id, ctx.key)}
                          className="text-xs font-semibold text-brand-400 bg-brand-500/10 border border-brand-500/30 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50"
                        >
                          {hi ? ctx.labelHi : ctx.labelEn}
                        </button>
                      ))}
                      <button
                        onClick={() => setContextMenuId(null)}
                        className="text-xs font-semibold text-muted bg-dark-700 px-3 py-1.5 rounded-xl active:scale-95"
                      >
                        {hi ? 'रद्द' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      disabled={actionLoading === card.id}
                      onClick={() => setContextMenuId(card.id)}
                      className="text-xs font-semibold text-brand-400 bg-brand-500/10 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50"
                    >
                      {hi ? 'Match day के लिए use करो' : 'Use for match day'}
                    </button>

                    {/* Delete */}
                    {deleteConfirmId === card.id ? (
                      <>
                        <span className="text-xs text-red-400 self-center">{hi ? 'हटाएं?' : 'Delete?'}</span>
                        <button
                          disabled={actionLoading === card.id}
                          onClick={() => deleteCard(card.id)}
                          className="text-xs font-semibold text-white bg-red-600 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50"
                        >
                          {hi ? 'हाँ' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-xs font-semibold text-muted bg-dark-700 px-3 py-1.5 rounded-xl active:scale-95"
                        >
                          {hi ? 'नहीं' : 'No'}
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={actionLoading === card.id}
                        onClick={() => setDeleteConfirmId(card.id)}
                        className="text-xs font-semibold text-red-400 bg-dark-700 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50"
                      >
                        {hi ? 'हटाओ' : 'Delete'}
                      </button>
                    )}
                  </div>
                )}

                {/* Delete row when match day card */}
                {card.isMatchDayCard && (
                  <div className="mt-2 flex gap-2">
                    {deleteConfirmId === card.id ? (
                      <>
                        <span className="text-xs text-red-400 self-center">{hi ? 'हटाएं?' : 'Delete?'}</span>
                        <button disabled={actionLoading === card.id} onClick={() => deleteCard(card.id)} className="text-xs font-semibold text-white bg-red-600 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50">{hi ? 'हाँ' : 'Yes'}</button>
                        <button onClick={() => setDeleteConfirmId(null)} className="text-xs font-semibold text-muted bg-dark-700 px-3 py-1.5 rounded-xl active:scale-95">{hi ? 'नहीं' : 'No'}</button>
                      </>
                    ) : (
                      <button disabled={actionLoading === card.id} onClick={() => setDeleteConfirmId(card.id)} className="text-xs font-semibold text-red-400 bg-dark-700 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50">{hi ? 'हटाओ' : 'Delete'}</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
