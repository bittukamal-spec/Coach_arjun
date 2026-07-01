import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';

const SITUATION_KEYS = [
  'before_competition', 'during_pressure', 'after_mistake',
  'selection_trials', 'being_watched', 'low_confidence',
  'technical_focus', 'fitness_effort', 'custom',
];

export default function FocusDeckPage() {
  const { token, language } = useAuth();
  const navigate = useNavigate();
  const t = translations[language]?.selfTalk?.deck || translations.en.selfTalk.deck;
  const hi = language === 'hi';

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    apiFetch('/api/self-talk/cards?filter=all', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setCards(Array.isArray(data) ? data : []))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [token]);

  const activeCount = cards.filter(c => !c.isArchived).length;

  const FILTERS = [
    { key: 'all', label: t.filterAll },
    ...SITUATION_KEYS.map(k => ({
      key: k,
      label: k.replace(/_/g, ' '),
    })),
    { key: 'archived', label: hi ? 'आर्काइव' : 'Archived' },
  ];

  const visible = cards.filter(c => {
    if (filter === 'all') return !c.isArchived;
    if (filter === 'archived') return c.isArchived;
    return c.situationCategory === filter && !c.isArchived;
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
          <p className="text-xs text-amber-400">{t.maxBanner} <button onClick={() => navigate('/self-talk')} className="underline">{hi ? 'पहले आर्काइव करो' : 'Archive one first'}</button></p>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
        {[
          { key: 'all', label: t.filterAll },
          { key: 'before_competition', label: hi ? 'competition से पहले' : 'Before competition' },
          { key: 'during_pressure', label: hi ? 'दबाव में' : 'During pressure' },
          { key: 'after_mistake', label: hi ? 'गलती के बाद' : 'After mistake' },
          { key: 'selection_trials', label: hi ? 'selection' : 'Selection' },
          { key: 'low_confidence', label: hi ? 'confidence' : 'Confidence' },
          { key: 'archived', label: hi ? 'आर्काइव' : 'Archived' },
        ].map(f => (
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
        {visible.map(card => (
          <div key={card.id} className={`rounded-3xl border p-4 ${card.isMatchDayCard ? 'bg-brand-500/10 border-brand-500/40' : 'bg-dark-800 border-dark-600'} ${card.isArchived ? 'opacity-60' : ''}`}>

            {/* Match day badge */}
            {card.isMatchDayCard && (
              <div className="flex items-center gap-1 mb-2">
                <Star size={12} className="text-amber-400 fill-amber-400" />
                <span className="text-xs font-semibold text-amber-400">{t.matchDayBadge}</span>
              </div>
            )}

            {/* Focus + reset words */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl font-black text-ink">{card.focusWord}</span>
              <span className="text-xs text-muted">·</span>
              <span className="text-base font-bold text-slt">{card.resetWord}</span>
            </div>

            {/* Power line */}
            <p className="text-sm text-slt italic mb-1">"{card.powerLine}"</p>

            {/* Situation + sport */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs bg-dark-700 text-muted px-2 py-0.5 rounded-full capitalize">
                {card.situationCategory.replace(/_/g, ' ')}
              </span>
              {card.sport && (
                <span className="text-xs bg-dark-700 text-muted px-2 py-0.5 rounded-full capitalize">{card.sport}</span>
              )}
              {card.performanceMoment && (
                <span className="text-xs text-muted truncate max-w-[140px]">{card.performanceMoment}</span>
              )}
            </div>

            {/* Usage count */}
            <p className="text-xs text-muted mb-3">
              {card.usedCount > 0 ? t.usedCount(card.usedCount) : t.notUsedYet}
            </p>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              {!card.isArchived && !card.isMatchDayCard && (
                <button
                  disabled={actionLoading === card.id}
                  onClick={() => setMatchDay(card.id)}
                  className="text-xs font-semibold text-brand-400 bg-brand-500/10 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50"
                >
                  {t.setMatchDayBtn}
                </button>
              )}
              {!card.isArchived ? (
                <button
                  disabled={actionLoading === card.id}
                  onClick={() => patch(card.id, { isArchived: true })}
                  className="text-xs font-semibold text-muted bg-dark-700 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50"
                >
                  {t.archiveBtn}
                </button>
              ) : (
                <button
                  disabled={actionLoading === card.id}
                  onClick={() => patch(card.id, { isArchived: false })}
                  className="text-xs font-semibold text-brand-400 bg-dark-700 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50"
                >
                  {t.unarchiveBtn}
                </button>
              )}
            </div>
          </div>
        ))}
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
