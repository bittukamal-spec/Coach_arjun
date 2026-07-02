import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wind } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';

export default function ResetHistoryPage() {
  const navigate = useNavigate();
  const { token, language } = useAuth();
  const t = translations[language]?.bodyReset || translations.en.bodyReset;
  const hi = language === 'hi';

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(null);

  useEffect(() => {
    apiFetch('/api/body-reset/', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [token]);

  async function deleteSession(id) {
    setDeleteLoading(id);
    try {
      const r = await apiFetch(`/api/body-reset/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await r.json();
      if (res.success) {
        setSessions(prev => prev.filter(s => s.id !== id));
        if (expandedId === id) setExpandedId(null);
      }
    } catch {
      // silent
    } finally {
      setDeleteLoading(null);
      setDeleteConfirmId(null);
    }
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    }) + ' · ' + d.toLocaleTimeString(hi ? 'hi-IN' : 'en-IN', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  function tensionDelta(s) {
    if (s.tensionBefore == null || s.tensionAfter == null) return null;
    const diff = s.tensionBefore - s.tensionAfter;
    const arrow = diff > 0 ? '↓' : diff < 0 ? '↑' : '→';
    const color = diff > 0 ? 'text-teal-400' : diff < 0 ? 'text-red-400' : 'text-slt';
    return { label: `${s.tensionBefore} → ${s.tensionAfter} ${arrow}`, color };
  }

  function formatDuration(secs) {
    if (!secs) return null;
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  if (loading) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 sticky top-0 bg-dark-900/95 backdrop-blur z-10">
        <button onClick={() => navigate('/train')} className="w-9 h-9 flex items-center justify-center rounded-full bg-dark-700 active:scale-95">
          <ArrowLeft size={18} className="text-ink" />
        </button>
        <h1 className="text-xl font-bold text-ink flex-1">{t.history.title}</h1>
      </div>

      {/* Empty state */}
      {sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="w-14 h-14 bg-teal-500/15 rounded-2xl flex items-center justify-center mb-4">
            <Wind size={24} className="text-teal-400" />
          </div>
          <h3 className="text-base font-bold text-ink mb-2">{t.history.emptyTitle}</h3>
          <button
            onClick={() => navigate('/body-reset')}
            className="mt-4 bg-teal-500 text-white font-bold py-3 px-8 rounded-2xl active:scale-95"
          >
            {t.history.emptyBtn}
          </button>
        </div>
      )}

      {/* Session list */}
      <div className="px-4 space-y-3">
        {sessions.map(session => {
          const isExpanded = expandedId === session.id;
          const delta = tensionDelta(session);
          const dur = formatDuration(session.durationSeconds);
          const modeBadge = session.mode === 'quick' ? t.history.modeQuick : t.history.modeTraining;
          const modeBadgeColor = session.mode === 'quick' ? 'text-teal-400 bg-teal-500/15' : 'text-brand-400 bg-brand-500/15';

          return (
            <div key={session.id} className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
              <button
                className="w-full text-left px-4 py-3.5"
                onClick={() => setExpandedId(isExpanded ? null : session.id)}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${modeBadgeColor}`}>
                    {modeBadge}
                  </span>
                  {delta && (
                    <span className={`text-xs font-semibold ${delta.color}`}>{delta.label}</span>
                  )}
                  {dur && <span className="text-[10px] text-muted">{dur}</span>}
                </div>
                <p className="text-[11px] text-muted">{formatDate(session.completedAt)}</p>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 pt-1 border-t border-dark-700/50 space-y-2">
                  {(session.feeling || session.feelingCustom) && (
                    <div>
                      <p className="text-[10px] font-semibold text-slt uppercase tracking-wider mb-0.5">{t.card.feelingLabel}</p>
                      <p className="text-sm text-slt">{session.feelingCustom || session.feeling}</p>
                    </div>
                  )}
                  {(session.context || session.contextCustom) && (
                    <div>
                      <p className="text-[10px] font-semibold text-slt uppercase tracking-wider mb-0.5">{t.card.contextLabel}</p>
                      <p className="text-sm text-slt">{session.contextCustom || session.context}</p>
                    </div>
                  )}
                  {session.focusWordUsed && (
                    <div>
                      <p className="text-[10px] font-semibold text-slt uppercase tracking-wider mb-0.5">{t.card.focusWordLabel}</p>
                      <p className="text-sm font-bold text-teal-400">{session.focusWordUsed}</p>
                    </div>
                  )}
                  {session.arjunNote && (
                    <div>
                      <p className="text-[10px] font-semibold text-brand-400 uppercase tracking-wider mb-0.5">{t.history.arjunNoteLabel}</p>
                      <p className="text-sm text-slt leading-relaxed">{session.arjunNote}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Delete */}
              <div className="px-4 pb-3 pt-1">
                {deleteConfirmId === session.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-400">{hi ? 'हटाएं?' : 'Delete?'}</span>
                    <button
                      disabled={deleteLoading === session.id}
                      onClick={() => deleteSession(session.id)}
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
                  </div>
                ) : (
                  <button
                    disabled={deleteLoading === session.id}
                    onClick={() => setDeleteConfirmId(session.id)}
                    className="text-xs font-semibold text-red-400 bg-dark-700 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50"
                  >
                    {t.history.deleteBtn}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
