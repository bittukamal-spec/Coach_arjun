import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Info, Zap, PlayCircle, Eye, Wind, ClipboardList, Target, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArjunLogo } from '../components/ArjunLogo';
import { useTheme } from '../hooks/useTheme';
import { parseArjunMessage, APP_TOOL_CONFIG } from '../utils/parseArjunMessage';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr, t) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return t.timeAgoToday;
  if (diff === 1) return t.timeAgoYesterday;
  return t.timeAgoDays(diff);
}

function extractSuggestions(text) {
  const match = text.match(/\[SUGGEST:\s*([^\]]+)\]/);
  if (!match) return { clean: text, suggestions: [] };
  const suggestions = match[1].split('|').map(s => s.trim()).filter(Boolean);
  const clean = text.replace(/\n?\[SUGGEST:[^\]]+\]/, '').trimEnd();
  return { clean, suggestions };
}


// ─── Sub-components ───────────────────────────────────────────────────────────

function SessionDivider({ sessionKey, date, t }) {
  const def = t.sessions[sessionKey];
  if (!def) return null;
  return (
    <div className="flex items-center gap-2 my-1 animate-fade-in">
      <div className="flex-1 h-px bg-dark-600" />
      <span className="text-[11px] text-slt whitespace-nowrap">
        {def.icon} {def.title} · {timeAgo(date, t)}
      </span>
      <div className="flex-1 h-px bg-dark-600" />
    </div>
  );
}

function MessageBubble({ message, isStreaming }) {
  if (message.role === 'assistant') {
    return <ArjunBubble message={message} isStreaming={isStreaming} />;
  }
  return (
    <div className="flex justify-end">
      <div className="max-w-[92%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words bg-brand-600 text-white rounded-2xl rounded-br-md">
        {message.content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-dark-400 border border-dark-600 shadow-sm rounded-2xl rounded-bl-md px-4 py-3">
        <span className="inline-flex gap-1">
          <span className="w-2 h-2 bg-slt rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-slt rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-slt rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      </div>
    </div>
  );
}

function SummaryBubble({ summary, label }) {
  const sentences = summary.split(/(?<=\.)\s+/).filter(Boolean);
  return (
    <div className="animate-fade-in mb-1">
      <div className="rounded-2xl bg-brand-600/10 border border-brand-500/30 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5">
              <path d="M1.5 5L3.5 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-brand-400 font-bold">{label}</p>
        </div>
        <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap">
          {sentences.join('\n\n')}
        </p>
      </div>
    </div>
  );
}

// ─── Lucide icon lookup for APP tool cards ────────────────────────────────────

const ICON_MAP = { Zap, PlayCircle, Eye, Wind, ClipboardList, Target };

// ─── ArjunText: formats Arjun's plain-text responses ─────────────────────────

function ArjunText({ text, isStreaming }) {
  // Strip any partial or complete [APP:...] fragments before rendering
  const displayText = text.replace(/\[APP:[^\]]*\]?/g, '').trimEnd();

  const paragraphs = displayText.split(/\n\n+/);

  return (
    <div className="text-sm leading-relaxed text-ink break-words">
      {paragraphs.map((para, pIdx) => {
        if (!para.trim()) return null;
        const lines = para.split('\n');
        return (
          <div key={pIdx} style={pIdx > 0 ? { marginTop: '8px' } : {}}>
            {lines.map((line, lIdx) => {
              if (!line.trim()) return null;
              const isCue = /your cue|cue:/i.test(line);
              const numMatch = line.match(/^(\d+)\.\s+([\s\S]*)/);

              if (isCue) {
                return (
                  <div
                    key={lIdx}
                    style={{
                      background: '#FEF9F0',
                      borderLeft: '3px solid #D98B2B',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      color: '#D98B2B',
                      fontWeight: 500,
                      marginTop: lIdx > 0 ? '6px' : 0,
                    }}
                  >
                    {line}
                  </div>
                );
              }

              if (numMatch) {
                return (
                  <div
                    key={lIdx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      marginTop: lIdx > 0 ? '6px' : 0,
                    }}
                  >
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        minWidth: '20px',
                        borderRadius: '50%',
                        background: '#185FA5',
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: '1px',
                      }}
                    >
                      {numMatch[1]}
                    </div>
                    <span>{numMatch[2]}</span>
                  </div>
                );
              }

              return (
                <span key={lIdx}>
                  {lIdx > 0 && <br />}
                  {line}
                </span>
              );
            })}
          </div>
        );
      })}
      {isStreaming && (
        <span className="inline-flex ml-1 gap-0.5 align-middle">
          <span className="w-1 h-1 bg-slt rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-1 bg-slt rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-1 bg-slt rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      )}
    </div>
  );
}

// ─── AppToolCard: tappable tool card rendered below Arjun's text ──────────────

function AppToolCard({ toolId, isDark }) {
  const config = APP_TOOL_CONFIG[toolId];
  const navigate = useNavigate();
  if (!config) return null;

  const IconComponent = ICON_MAP[config.icon];

  return (
    <div
      onClick={() => navigate(config.route)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        background: isDark ? 'rgba(255,255,255,0.05)' : config.bgColor,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : config.iconColor + '22'}`,
        borderRadius: '10px',
        cursor: 'pointer',
        flex: 1,
        minWidth: 0,
        minHeight: '48px',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          minWidth: '32px',
          borderRadius: '8px',
          background: config.iconColor + (isDark ? '26' : '22'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {IconComponent && <IconComponent size={16} color={config.iconColor} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: isDark ? 'var(--ink)' : '#172033', lineHeight: 1.2 }}>
          {config.label}
        </div>
        <div style={{ fontSize: '11px', color: isDark ? 'var(--slt)' : '#64748B', marginTop: '2px' }}>
          {config.sub}
        </div>
      </div>
      <div style={{ marginLeft: 'auto', color: config.iconColor, fontSize: '16px', flexShrink: 0, lineHeight: 1 }}>
        ›
      </div>
    </div>
  );
}

// ─── ArjunBubble: full assistant message bubble with text + tool cards ─────────

function ArjunBubble({ message, isStreaming }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const appTools = (message.appTools || []).filter(id => APP_TOOL_CONFIG[id]);
  const hasTools = !isStreaming && appTools.length > 0;

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] bg-dark-400 border border-dark-600 shadow-sm rounded-2xl rounded-bl-md overflow-hidden">
        <div className="px-3.5 py-2.5">
          <ArjunText text={message.content} isStreaming={isStreaming} />
        </div>
        {hasTools && (
          <>
            <div style={{ height: '1px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', margin: '0 12px' }} />
            <div style={{ padding: '8px 10px', display: 'flex', gap: '8px' }}>
              {appTools.map(toolId => (
                <AppToolCard key={toolId} toolId={toolId} isDark={isDark} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function ChatPage() {
  const { token, language } = useAuth();
  const t = translations[language].chat;
  const location = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages]                   = useState([]);
  const [input, setInput]                         = useState('');
  const [loading, setLoading]                     = useState(true);
  const [streaming, setStreaming]                 = useState(false);
  const [waitingForFirst, setWaitingForFirst]     = useState(false);
  const [error, setError]                         = useState('');
  const [usage, setUsage]                         = useState({ isPremium: false, trialDaysRemaining: 14 });
  const [activeSession, setActiveSession]         = useState(null);
  const [showSafety, setShowSafety]               = useState(false);
  const [chatSessionId, setChatSessionId]         = useState(null);
  const [showStartScreen, setShowStartScreen]     = useState(false);
  const [recentSessions, setRecentSessions]       = useState([]);
  const [summarising, setSummarising]             = useState(false);
  const [sessionSummary, setSessionSummary]       = useState(null);
  const [chatMode, setChatMode]                   = useState('main');

  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);
  const streamIdRef             = useRef(null);
  const fullStreamText          = useRef('');
  const arjunMsgCountRef        = useRef(0);
  const prefillMsgRef           = useRef(location.state?.prefillMsg ?? null);
  const pendingChatSessionIdRef = useRef(location.state?.chatSessionId ?? null);

  // ── Load on mount ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      // Fire-and-forget: end sessions from previous days
      apiFetch('/api/sessions/end-stale', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});

      const [sessionsRes, usageRes] = await Promise.all([
        apiFetch('/api/sessions',    { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch('/api/chat/usage',  { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (usageRes.ok) setUsage(await usageRes.json());

      let sessionLoaded = false;
      if (sessionsRes.ok) {
        const { sessions } = await sessionsRes.json();
        setRecentSessions(sessions);

        const pendingId = pendingChatSessionIdRef.current;
        if (pendingId) {
          pendingChatSessionIdRef.current = null;
          setChatSessionId(pendingId);
          const sess = sessions.find(s => s.id === pendingId);
          if (sess?.sessionType && sess.sessionType !== 'general') {
            setActiveSession(sess.sessionType);
          }
          if (sess?.summary) setSessionSummary(sess.summary);
          await fetchSessionMessages(pendingId);
          sessionLoaded = true;
        }
      }

      if (!sessionLoaded) {
        setShowStartScreen(true);
      }

      setLoading(false);

      if (prefillMsgRef.current) {
        setInput(prefillMsgRef.current);
        prefillMsgRef.current = null;
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, waitingForFirst]);

  // ── Persist messages (with tags) to sessionStorage on every change ────────

  useEffect(() => {
    if (chatSessionId && messages.length > 0) {
      sessionStorage.setItem(`arjun_chat_messages_${chatSessionId}`, JSON.stringify(messages));
    }
  }, [messages, chatSessionId]);

  // ── Quick chat cleanup: delete session on tab hide or unmount ────────────

  useEffect(() => {
    if (chatMode !== 'quick') return;
    const cleanup = () => {
      if (chatSessionId) {
        apiFetch(`/api/sessions/${chatSessionId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') cleanup();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [chatMode, chatSessionId, token]);

  // ── API helpers ───────────────────────────────────────────────────────────

  async function fetchSessionMessages(id) {
    // Load from cache immediately so tags survive navigation
    const cached = sessionStorage.getItem(`arjun_chat_messages_${id}`);
    if (cached) {
      try { setMessages(JSON.parse(cached)); } catch { /* ignore */ }
    }
    // Fetch from DB in background to sync
    try {
      const res = await apiFetch(`/api/sessions/${id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const msgs = data.messages || [];
        const processed = msgs.map(msg => {
          if (msg.role !== 'assistant') return msg;
          const { clean } = extractSuggestions(msg.content);
          const { cleanText, tools } = parseArjunMessage(clean);
          return { ...msg, content: cleanText, appTools: tools };
        });
        setMessages(processed);
      }
    } catch { /* ignore */ }
  }

  async function createSession(type = 'general', mode = chatMode) {
    const res = await apiFetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionType: type, mode }),
    });
    const data = await res.json();
    const id = data.session.id;
    setChatSessionId(id);
    setShowStartScreen(false);
    setSessionSummary(null);
    return id;
  }

  async function endSession() {
    if (!chatSessionId || summarising) return;
    setSummarising(true);
    sessionStorage.removeItem(`arjun_chat_messages_${chatSessionId}`);
    await apiFetch(`/api/sessions/${chatSessionId}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    setSummarising(false);
    // Return to entry choice screen without leaving /coaching
    setChatSessionId(null);
    setMessages([]);
    setActiveSession(null);
    setSessionSummary(null);
    arjunMsgCountRef.current = 0;
    setChatMode('main');
    setShowStartScreen(true);
  }

  async function handleContinueMain() {
    const existingSession = recentSessions.find(
      s => s.status === 'active' && (s.mode === 'main' || !s.mode)
    );
    if (existingSession) {
      setChatSessionId(existingSession.id);
      if (existingSession.sessionType && existingSession.sessionType !== 'general') {
        setActiveSession(existingSession.sessionType);
      }
      if (existingSession.summary) setSessionSummary(existingSession.summary);
      await fetchSessionMessages(existingSession.id);
      setShowStartScreen(false);
    } else {
      await createSession('general', 'main');
    }
  }

  async function handleStartQuick() {
    setChatMode('quick');
    await createSession('general', 'quick');
  }

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (overrideContent = null, forceSessionType = undefined, overrideChatSessionId = undefined) => {
    const trimmed = (overrideContent != null ? overrideContent : input).trim();
    if (!trimmed || streaming) return;

    const isSessionStart = trimmed.startsWith('__SESSION:');
    const sessionType = forceSessionType !== undefined ? forceSessionType : activeSession;
    const sessionIdToUse = overrideChatSessionId !== undefined ? overrideChatSessionId : chatSessionId;

    if (!overrideContent) setInput('');
    setError('');

    if (!isSessionStart) {
      setMessages(prev => [...prev, { id: 'user-' + Date.now(), role: 'user', content: trimmed }]);
    }

    setWaitingForFirst(true);
    setStreaming(true);
    fullStreamText.current = '';

    try {
      const res = await apiFetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: trimmed, sessionType, arjunMsgCount: arjunMsgCountRef.current, chatSessionId: sessionIdToUse, chatMode }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) setUsage(prev => ({ ...prev, trialDaysRemaining: 0 }));
        throw new Error(body.error || 'Request failed');
      }

      const streamId = 'stream-' + Date.now();
      streamIdRef.current = streamId;
      setMessages(prev => [...prev, { id: streamId, role: 'assistant', content: '', streaming: true }]);
      setWaitingForFirst(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.t === 'd') {
              fullStreamText.current += data.c;
              setMessages(prev =>
                prev.map(m => m.id === streamId ? { ...m, content: m.content + data.c } : m)
              );
            } else if (data.t === 'end') {
              const { clean } = extractSuggestions(fullStreamText.current);
              const { cleanText, tools } = parseArjunMessage(clean);
              arjunMsgCountRef.current += 1;
              setMessages(prev =>
                prev.map(m => m.id === streamId
                  ? { ...m, content: cleanText, id: data.id, streaming: false, appTools: tools }
                  : m)
              );
              fullStreamText.current = '';
            } else if (data.t === 'error') {
              setMessages(prev => prev.filter(m => m.id !== streamId));
              setError(data.message || t.errorRetry);
            }
          } catch { /* malformed chunk */ }
        }
      }
    } catch (err) {
      setWaitingForFirst(false);
      setMessages(prev => prev.filter(m => !m.streaming));
      setError(err.message || t.errorRetry);
    } finally {
      setStreaming(false);
      setWaitingForFirst(false);
      streamIdRef.current = null;
      inputRef.current?.focus();
    }
  }, [input, streaming, token, t.errorRetry, activeSession, language, chatSessionId]);

  // ── Keyboard ──────────────────────────────────────────────────────────────

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const atLimit     = !usage.isPremium && usage.trialDaysRemaining === 0;
  const hasMessages = messages.length > 0;

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-dark-900">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-dark-900">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-dark-900 border-b border-dark-600 px-4 py-3 relative">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ArjunLogo size={28} />
            <div className="min-w-0">
              <p className="font-semibold text-ink text-sm leading-none">{t.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {chatSessionId && !showStartScreen && chatMode === 'main' && (
              <button
                onClick={endSession}
                disabled={summarising || streaming}
                className="text-xs text-slt hover:text-ink transition-colors px-2 py-1.5 rounded-lg hover:bg-dark-700 disabled:opacity-40"
              >
                {summarising ? t.summarising : t.endSession}
              </button>
            )}
            <button
              onClick={() => setShowSafety(s => !s)}
              className="p-1.5 text-slt hover:text-ink transition-colors rounded-lg hover:bg-dark-700"
              aria-label="Safety info"
            >
              <Info size={16} />
            </button>
          </div>
        </div>

        {showSafety && (
          <div className="absolute left-4 right-4 top-full mt-1 z-20 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 shadow-lg">
            <p className="text-xs text-slt">{t.safetyNote}</p>
            <p className="text-xs text-slt mt-1">{t.safetyHelpline}</p>
          </div>
        )}
      </header>

      {/* ── Messages area ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 py-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">

          {/* Quick chat — not saved banner */}
          {chatMode === 'quick' && (
            <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-dark-700 border border-dark-600 text-xs text-slt">
              <EyeOff size={11} className="shrink-0" />
              <span>{t.mode.notSaved}</span>
            </div>
          )}

          {/* Entry choice screen — shown when no session is active */}
          {showStartScreen && !waitingForFirst && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 animate-fade-in">
              <h2 className="text-[22px] font-bold text-ink mb-2 text-center">{t.entry.heading}</h2>
              <p className="text-[15px] text-slt text-center mb-8 leading-relaxed max-w-xs">{t.entry.description}</p>
              <div className="w-full flex flex-col gap-2">
                <button
                  onClick={handleContinueMain}
                  disabled={atLimit}
                  className="w-full py-4 bg-brand-600 text-white rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  {t.entry.continue.label}
                </button>
                <p className="text-[13px] text-slt text-center">{t.entry.continue.sub}</p>
                <div className="h-3" />
                <button
                  onClick={handleStartQuick}
                  disabled={atLimit}
                  className="w-full py-4 border border-dark-500 text-ink rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  {t.entry.quick.label}
                </button>
                <p className="text-[13px] text-slt text-center">{t.entry.quick.sub}</p>
              </div>
            </div>
          )}

          {/* Session summary — shown when loading an existing session that has been summarised */}
          {!showStartScreen && sessionSummary && (
            <SummaryBubble
              summary={sessionSummary}
              label={translations[language].sessionHistory.sessionSummaryLabel}
            />
          )}

          {/* Message list */}
          {!showStartScreen && messages.map((msg, i) => {
            const prevMsg = messages[i - 1];
            const showDivider = msg.sessionType && msg.sessionType !== prevMsg?.sessionType && i > 0;
            return (
              <div key={msg.id} className="flex flex-col gap-2">
                {showDivider && <SessionDivider sessionKey={msg.sessionType} date={msg.createdAt} t={t} />}
                <MessageBubble message={msg} isStreaming={msg.streaming} />
              </div>
            );
          })}

          {/* Typing indicator */}
          {waitingForFirst && <TypingIndicator />}

          {/* Error */}
          {error && (
            <div className="text-center">
              <p className="text-sm text-red-400 bg-red-950/20 border border-red-900/20 rounded-xl px-4 py-2 inline-block">
                ⚠️ {error}
              </p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input area ──────────────────────────────────────────────────── */}
      {chatSessionId && !showStartScreen && (
      <div className="shrink-0 bg-dark-800 border-t border-dark-600 px-4 py-3">
        <div className="max-w-2xl mx-auto relative">

          {atLimit && (
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2 bg-amber-950/30 border border-amber-700/40 rounded-2xl px-4 py-3">
              <p className="text-sm text-amber-400 flex-1">
                🔒 {t.limitReached} {t.upgradePrompt}.
              </p>
              <button onClick={() => navigate('/pricing')} className="text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-xl transition-colors whitespace-nowrap">
                {t.upgrade}
              </button>
            </div>
          )}

          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                atLimit ? '🔒 ' + t.limitReached
                : !hasMessages ? t.emptyInputHint
                : t.placeholder
              }
              disabled={atLimit || streaming}
              rows={1}
              className="flex-1 resize-none bg-dark-700 border border-dark-600 text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder:text-muted disabled:opacity-50 disabled:cursor-not-allowed max-h-32 overflow-y-auto"
              style={{ minHeight: '44px' }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
            />
            {/* Send — highlighted primary action */}
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || streaming || atLimit}
              className="w-11 h-11 bg-brand-600 text-white rounded-2xl flex items-center justify-center hover:bg-brand-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 shrink-0 shadow-md"
              aria-label={t.send}
            >
              {streaming ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                  <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </div>

        </div>
      </div>
      )}
    </div>
  );
}

export default ChatPage;
