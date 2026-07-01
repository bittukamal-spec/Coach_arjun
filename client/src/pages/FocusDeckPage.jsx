import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';

export default function FocusDeckPage() {
  const { token, language } = useAuth();
  const navigate = useNavigate();
  const t = translations[language]?.selfTalk?.deck || translations.en.selfTalk.deck;
  const hi = language === 'hi';

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

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

  const FILTERS = [
    { key: 'all', label: t.filterAll },
    { key: 'before_competition', label: hi ? 'competition से पहले' : 'Before competition' },
    { key: 'during_pressure', label: hi ? 'दबाव में' : 'During pressure' },
    { key: 'after_mistake', label: hi ? 'गलती के बाद' : 'After mistake' },
    { key: 'selection_trials', label: hi ? 'selection' : 'Selection' },
    { key: 'low_confidence', label: hi ? 'confidence' : 'Confidence' },
  ];

  const visible = cards.filter(c => {
    if (filter === 'all') return true;
    return c.situationCategory === filter;
  });

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

  const setMatchDay = async (id) => {
    setActionLoading(id);
    try {
      const r = await apiFetch(`/api/self-talk/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isMatchDayCard: true }),
      });
      const res = await r.json();
      if (res.card) {
        setCards(prev => prev.map(c => ({
          ...c,
          isMatchDayCard: c.id === id ? true : false,
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
      </div>

      {/* Max cards banner */}
      {activeCount >= 5 && (
        <div className="mx-4 mb-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
          <p className="text-xs text-amber-400">{t.maxBanner} {hi ? 'पहले एक हटाओ।' : 'Delete one first.'}</p>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === f.key ? 'bg-brand-500 text-white' : 'bg-dark-800 text-slt border border-dark-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="text-4xl mb-4">🎯</div>
          <h3 className="text-base font-bold text-ink mb-2">{t.emptyTitle}</h3>
          <button
            onClick={() => navigate('/self-talk')}
            className="mt-4 bg-brand-500 text-white font-bold py-3 px-8 rounded-2xl active:scale-95"
          >
            {t.emptyBtn}
          </button>
        </div>
      )}

      {/* Cards */}
      <div className="px-4 space-y-3">
        {visible.map(card => {
          const isExpanded = expandedId === card.id;
          return (
            <div key={card.id} className={`rounded-3xl border ${card.isMatchDayCard ? 'bg-brand-500/10 border-brand-500/40' : 'bg-dark-800 border-dark-600'}`}>

              {/* Tappable card header */}
              <button
                className="w-full text-left p-4"
                onClick={() => setExpandedId(isExpanded ? null : card.id)}
              >
                {/* Match day badge */}
                {card.isMatchDayCard && (
                  <div className="flex items-center gap-1 mb-2">
                    <Star size={12} className="text-amber-400 fill-amber-400" />
                    <span className="text-xs font-semibold text-amber-400">{t.matchDayBadge}</span>
                  </div>
                )}

                {/* Focus + reset words */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl font-black" style={{ color: '#185FA5' }}>{card.focusWord}</span>
                  <span className="text-xs text-muted">·</span>
                  <span className="text-base font-bold" style={{ color: '#D98B2B' }}>{card.resetWord}</span>
                </div>

                {/* Power line */}
                <p className="text-sm text-slt italic mb-2">"{card.powerLine}"</p>

                {/* Situation + sport */}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-xs bg-dark-700 text-muted px-2 py-0.5 rounded-full capitalize">
                    {card.situationCategory.replace(/_/g, ' ')}
                  </span>
                  {card.sport && (
                    <span className="text-xs bg-dark-700 text-muted px-2 py-0.5 rounded-full capitalize">{card.sport}</span>
                  )}
                </div>

                {/* Usage count */}
                <p className="text-xs text-muted">
                  {card.usedCount > 0 ? t.usedCount(card.usedCount) : t.notUsedYet}
                </p>
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
              <div className="flex gap-2 flex-wrap px-4 pb-4 pt-1">
                {/* Match day actions */}
                {card.isMatchDayCard ? (
                  <button
                    disabled={actionLoading === card.id}
                    onClick={() => patch(card.id, { isMatchDayCard: false })}
                    className="text-xs font-semibold text-muted bg-dark-700 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50"
                  >
                    {hi ? 'Remove' : 'Remove'}
                  </button>
                ) : (
                  <button
                    disabled={actionLoading === card.id}
                    onClick={() => setMatchDay(card.id)}
                    className="text-xs font-semibold text-brand-400 bg-brand-500/10 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50"
                  >
                    {t.setMatchDayBtn}
                  </button>
                )}

                {/* Delete */}
                {deleteConfirmId === card.id ? (
                  <>
                    <span className="text-xs text-red-400 self-center">{hi ? 'Card हटाएं?' : 'Delete this card?'}</span>
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
            </div>
          );
        })}
      </div>

      {/* FAB — build card */}
      {activeCount < 5 && (
        <button
          onClick={() => navigate('/self-talk')}
          className="fixed bottom-24 right-4 bg-brand-500 text-white font-bold px-5 py-3 rounded-full shadow-lg active:scale-95 text-sm z-20"
        >
          + {hi ? 'नया card' : 'New card'}
        </button>
      )}
    </div>
  );
}
