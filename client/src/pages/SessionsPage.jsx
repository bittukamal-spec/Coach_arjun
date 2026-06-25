import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import Navbar from '../components/Navbar';

const SESSION_ICONS = {
  general:         '💬',
  match_prep:      '🧘',
  post_match:      '🔄',
  build_focus:     '🎯',
  confidence:      '💪',
  handle_pressure: '😤',
  pressure_reset:  '⚡',
  setback_reset:   '🔄',
  open:            '💬',
  post_checkin:    '📊',
};

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SessionsPage() {
  const { token, language } = useAuth();
  const t  = translations[language].sessionHistory;
  const navigate = useNavigate();

  const [sessions,      setSessions]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selected,      setSelected]      = useState(null);
  const [detailMsgs,    setDetailMsgs]    = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState(null); // { id, title, isActive }
  const [toast,         setToast]         = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await apiFetch('/api/sessions', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchSessions();
  }, [token]);

  async function openDetail(session) {
    setSelected(session);
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/api/sessions/${session.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDetailMsgs(data.messages || []);
      }
    } catch { /* ignore */ }
    setDetailLoading(false);
  }

  async function continueSession(session) {
    if (session.status === 'ended') {
      await apiFetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'active' }),
      }).catch(() => {});
    }
    navigate('/coaching', { state: { chatSessionId: session.id, sessionType: session.sessionType } });
  }

  function handleDeleteClick(e, session) {
    e.stopPropagation();
    if (session.status === 'active') {
      showToast(t.deleteActive);
      return;
    }
    setDeleteTarget({ id: session.id, title: session.title || t.sessionTypes[session.sessionType] || session.sessionType });
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setSessions(prev => prev.filter(s => s.id !== id));
    try {
      await apiFetch(`/api/sessions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* already removed from UI */ }
    showToast(t.deleted);
  }

  // ── Detail view ────────────────────────────────────────────────────────────

  if (selected) {
    const icon     = SESSION_ICONS[selected.sessionType] || '💬';
    const typeName = t.sessionTypes[selected.sessionType] || selected.sessionType;
    const sentences = selected.summary
      ? selected.summary.split(/(?<=\.)\s+/).filter(Boolean)
      : [];

    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <main className="max-w-lg mx-auto pt-20 pb-28 px-4">
          <button
            onClick={() => { setSelected(null); setDetailMsgs([]); }}
            className="flex items-center gap-1 text-sm text-slt hover:text-ink transition-colors mb-4"
          >
            ← {t.title}
          </button>

          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{icon}</span>
              <h1 className="text-base font-semibold text-ink">{selected.title || typeName}</h1>
              {selected.status === 'active' && (
                <span className="text-xs bg-win-500/15 text-win-500 border border-win-500/30 px-2 py-0.5 rounded-full">{t.active}</span>
              )}
            </div>
            <p className="text-xs text-slt">{formatDate(selected.createdAt)}</p>
          </div>

          {/* Summary — distinct visual treatment */}
          {selected.summary && (
            <div className="mb-5">
              <p className="text-[11px] uppercase tracking-widest text-slt font-medium px-1 mb-1">{t.sessionSummaryLabel}</p>
              <div className="px-4 py-3 rounded-2xl rounded-bl-md border-l-[3px] border-brand-600 bg-[#EFEDE6]">
                <p className="text-sm leading-relaxed text-dark-900 whitespace-pre-wrap">
                  {sentences.join('\n\n')}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 mb-6">
            {detailLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : detailMsgs.map(msg => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    isUser
                      ? 'bg-brand-600 text-white rounded-2xl rounded-br-md'
                      : 'bg-dark-800 border border-dark-600 text-ink shadow-sm rounded-2xl rounded-bl-md'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => continueSession(selected)}
            className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors active:scale-[0.98]"
          >
            {t.continueSession}
          </button>
        </main>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <main className="max-w-lg mx-auto pt-20 pb-28 px-4 animate-fade-in">
        <h1 className="text-xl font-bold text-ink mb-4">{t.title}</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-slt">{t.noSessions}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map(session => {
              const icon     = SESSION_ICONS[session.sessionType] || '💬';
              const typeName = t.sessionTypes[session.sessionType] || session.sessionType;
              const msgCount = session._count?.messages ?? 0;
              const isActive = session.status === 'active';
              return (
                <button
                  key={session.id}
                  onClick={() => openDetail(session)}
                  className="flex items-center gap-3 bg-dark-800 border border-dark-600 hover:border-brand-500/40 hover:bg-dark-700 active:scale-[0.99] rounded-2xl p-4 text-left transition-all"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                    isActive ? 'bg-win-500/15' : 'bg-dark-700'
                  }`}>
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-ink truncate">{session.title || typeName}</p>
                      {isActive && (
                        <span className="text-[10px] bg-win-500/15 text-win-500 border border-win-500/30 px-1.5 py-0.5 rounded-full shrink-0">{t.active}</span>
                      )}
                    </div>
                    {session.summary ? (
                      <p className="text-xs text-slt line-clamp-2 leading-relaxed">{session.summary}</p>
                    ) : (
                      <p className="text-xs text-slt">{t.messages(msgCount)}</p>
                    )}
                    {!session.summary && (
                      <p className="text-[10px] text-dark-500 mt-0.5">{formatDate(session.createdAt)}</p>
                    )}
                  </div>
                  <button
                    onClick={(e) => handleDeleteClick(e, session)}
                    className="p-1.5 text-dark-500 hover:text-red-400 transition-colors rounded-lg shrink-0"
                    aria-label={t.deleteSession}
                  >
                    <Trash2 size={15} />
                  </button>
                  <ChevronRight size={16} className="text-dark-500 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Delete confirmation sheet ──────────────────────────────────────── */}
      {deleteTarget && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/60"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="fixed bottom-0 inset-x-0 z-[60] bg-dark-800 border-t border-dark-600 rounded-t-2xl px-5 pt-6 pb-12 animate-fade-in">
            <p className="text-base font-semibold text-ink mb-1">{t.deleteConfirm}</p>
            <p className="text-xs text-slt mb-5 truncate">{deleteTarget.title}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-3 rounded-2xl border border-dark-500 text-ink text-sm font-medium hover:bg-dark-700 transition-colors"
              >
                {t.deleteCancel}
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 py-3 rounded-2xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors active:scale-[0.98]"
              >
                {t.deleteConfirmBtn}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center z-60 pointer-events-none animate-fade-in">
          <div className="bg-dark-700 border border-dark-500 text-ink text-sm px-5 py-2.5 rounded-full shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
