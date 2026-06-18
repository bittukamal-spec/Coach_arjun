import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

// ─── Session definitions ───────────────────────────────────────────────────────

const SESSIONS = [
  { key: 'match_prep',      color: 'text-violet-400', activeBg: 'bg-violet-500/15 border-violet-500/60' },
  { key: 'post_match',      color: 'text-blue-400',   activeBg: 'bg-blue-500/15 border-blue-500/60'   },
  { key: 'build_focus',     color: 'text-orange-400', activeBg: 'bg-orange-500/15 border-orange-500/60' },
  { key: 'confidence',      color: 'text-brand-400',  activeBg: 'bg-brand-500/15 border-brand-500/60' },
  { key: 'handle_pressure', color: 'text-red-400',    activeBg: 'bg-red-500/15 border-red-500/60'     },
  { key: 'open',            color: 'text-win-400',    activeBg: 'bg-win-500/15 border-win-500/60'     },
];

// Reliable hardcoded initial chips per session (shown after Arjun's first reply)
const INITIAL_CHIPS = {
  match_prep: {
    en: ['Tomorrow', 'Today', 'In a few days', 'Next week'],
    hi: ['कल', 'आज', 'कुछ दिनों में', 'अगले हफ्ते'],
  },
  post_match: {
    en: ['We won', 'We lost', 'I played okay', 'Mixed result'],
    hi: ['जीते', 'हारे', 'ठीक खेला', 'मिला-जुला'],
  },
  build_focus: {
    en: ['In matches', 'In training', 'Both', 'Before I play'],
    hi: ['मैच में', 'ट्रेनिंग में', 'दोनों में', 'शुरुआत में'],
  },
  confidence: {
    en: ['Before a big match', 'After a mistake', 'Around selection', 'Always'],
    hi: ['बड़े मैच से पहले', 'गलती के बाद', 'सिलेक्शन पर', 'हमेशा'],
  },
  handle_pressure: {
    en: ['From family', 'From coach', 'Self-imposed', 'Selection pressure'],
    hi: ['परिवार से', 'कोच से', 'खुद से', 'सिलेक्शन का'],
  },
  open: {
    en: ['Feeling off today', 'Need motivation', 'Something happened', 'Just want to talk'],
    hi: ['कुछ ठीक नहीं', 'हौसला चाहिए', 'कुछ हुआ है', 'बस बात करनी है'],
  },
  post_checkin: {
    en: ['Tell me more', 'What should I focus on?', 'Felt this before', "It's getting better"],
    hi: ['और बताइए', 'किस पर ध्यान दूं?', 'पहले भी हुआ', 'बेहतर हो रहा है'],
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractSuggestions(text) {
  const match = text.match(/\[SUGGEST:\s*([^\]]+)\]/);
  if (!match) return { clean: text, suggestions: [] };
  const suggestions = match[1].split('|').map(s => s.trim()).filter(Boolean);
  const clean = text.replace(/\n?\[SUGGEST:[^\]]+\]/, '').trimEnd();
  return { clean, suggestions };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MessageBubble({ message, isStreaming }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0 mb-1">
          A
        </div>
      )}
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-brand-600 text-white rounded-br-sm'
            : 'bg-dark-800 border border-dark-600 text-slate-200 shadow-sm rounded-bl-sm'
        }`}
      >
        {message.content}
        {isStreaming && (
          <span className="inline-flex ml-1 gap-0.5">
            <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-end">
      <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
        A
      </div>
      <div className="bg-dark-800 border border-dark-600 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
        <span className="inline-flex gap-1">
          <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function ChatPage() {
  const { token, language } = useAuth();
  const t = translations[language].chat;
  const location = useLocation();

  const [messages, setMessages]             = useState([]);
  const [input, setInput]                   = useState('');
  const [loading, setLoading]               = useState(true);
  const [streaming, setStreaming]           = useState(false);
  const [waitingForFirst, setWaitingForFirst] = useState(false);
  const [error, setError]                   = useState('');
  const [usage, setUsage]                   = useState({ isPremium: false, trialDaysRemaining: 14 });
  const [quickReplies, setQuickReplies]     = useState([]);
  const [activeSession, setActiveSession]   = useState(null);

  const bottomRef          = useRef(null);
  const inputRef           = useRef(null);
  const streamIdRef        = useRef(null);
  const fullStreamText     = useRef('');
  const arjunMsgCountRef   = useRef(0);  // counts Arjun messages in current session
  const pendingSessionRef  = useRef(location.state?.sessionType ?? null);

  // ── Load on mount ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      await Promise.all([fetchMessages(), fetchUsage()]);
      setLoading(false);
    }
    init();
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, waitingForFirst]);

  // ── Auto-start when navigated from check-in (location.state) ─────────────

  useEffect(() => {
    if (!loading && pendingSessionRef.current) {
      const key = pendingSessionRef.current;
      pendingSessionRef.current = null;
      arjunMsgCountRef.current = 0;
      setActiveSession(key);
      if (messages.length === 0) {
        sendMessage(`__SESSION:${key}__`, key);
      }
    }
  }, [loading, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API helpers ───────────────────────────────────────────────────────────

  async function fetchMessages() {
    try {
      const res = await apiFetch('/api/chat/messages', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch { /* ignore */ }
  }

  async function fetchUsage() {
    try {
      const res = await apiFetch('/api/chat/usage', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setUsage(await res.json());
    } catch { /* ignore */ }
  }

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (overrideContent = null, forceSessionType = undefined) => {
    const trimmed = (overrideContent != null ? overrideContent : input).trim();
    if (!trimmed || streaming) return;

    const isSessionStart = trimmed.startsWith('__SESSION:');
    const sessionType = forceSessionType !== undefined ? forceSessionType : activeSession;

    if (!overrideContent) setInput('');
    setError('');
    setQuickReplies([]);

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
        body: JSON.stringify({ content: trimmed, sessionType }),
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
              const { clean, suggestions } = extractSuggestions(fullStreamText.current);
              setMessages(prev =>
                prev.map(m => m.id === streamId ? { ...m, content: clean, id: data.id, streaming: false } : m)
              );
              fullStreamText.current = '';

              // Show chips: prefer AI-generated [SUGGEST:] tags, fall back to hardcoded initial chips
              arjunMsgCountRef.current += 1;
              const isFirstReply = arjunMsgCountRef.current === 1 && sessionType;
              const chips = suggestions.length > 0
                ? suggestions
                : (isFirstReply ? (INITIAL_CHIPS[sessionType]?.[language] ?? []) : []);
              setQuickReplies(chips);
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
  }, [input, streaming, token, t.errorRetry, activeSession, language]);

  // ── Session selection (always-visible picker) ─────────────────────────────

  function handleSessionSelect(key) {
    if (streaming) return;
    if (activeSession === key) return;
    setQuickReplies([]);
    arjunMsgCountRef.current = 0;
    setActiveSession(key);
    // Auto-start the session if no messages yet
    if (messages.length === 0) {
      sendMessage(`__SESSION:${key}__`, key);
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const atLimit = !usage.isPremium && usage.trialDaysRemaining === 0;
  const hasMessages = messages.length > 0;
  const lastArjunMsgId = [...messages].reverse().find(m => m.role === 'assistant')?.id;
  const needsSession = !activeSession && !hasMessages;

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-dark-900">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] sm:h-dvh bg-dark-900">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-dark-900 border-b border-dark-600 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
              A
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-100 text-sm leading-none">{t.title}</p>
              {activeSession ? (
                <p className="text-xs text-brand-400 leading-none mt-0.5 truncate">
                  {t.sessions[activeSession].icon} {t.sessions[activeSession].title}
                </p>
              ) : (
                <p className="text-xs text-slate-500 leading-none mt-0.5">{t.subtitle}</p>
              )}
            </div>
          </div>
          <div className="shrink-0">
            {usage.isPremium ? (
              <span className="text-xs font-semibold text-amber-400 bg-amber-950/40 border border-amber-700/40 px-2 py-1 rounded-full">
                ⭐ {t.usagePremium}
              </span>
            ) : atLimit ? (
              <span className="text-xs font-semibold text-red-400 bg-red-950/30 border border-red-800/30 px-2 py-1 rounded-full">
                Trial ended
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-400 bg-dark-700 border border-dark-500 px-2 py-1 rounded-full">
                {t.trialLabel(usage.trialDaysRemaining)}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Session picker bar (always visible) ─────────────────────────── */}
      <div className="shrink-0 border-b border-dark-600 bg-dark-900/80">
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex gap-2 px-4 py-2 max-w-2xl mx-auto w-max min-w-full">
            {SESSIONS.map(({ key, color, activeBg }) => {
              const def = t.sessions[key];
              const isActive = activeSession === key;
              return (
                <button
                  key={key}
                  onClick={() => handleSessionSelect(key)}
                  disabled={atLimit || streaming}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                    isActive
                      ? `${activeBg} ${color}`
                      : 'bg-dark-800 border-dark-600 text-slate-500 hover:border-dark-400 hover:text-slate-300'
                  }`}
                >
                  <span className="text-sm">{def.icon}</span>
                  <span className="whitespace-nowrap">{def.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Messages area ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">

          {/* No session selected yet */}
          {!hasMessages && !activeSession && !waitingForFirst && (
            <div className="flex flex-col items-center text-center py-10 gap-3 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-brand-600/20 border-2 border-brand-600/30 flex items-center justify-center text-2xl font-bold text-brand-400">
                A
              </div>
              <div>
                <p className="font-bold text-slate-100 mb-1">{t.sessionTitle}</p>
                <p className="text-sm text-slate-500 max-w-xs leading-relaxed">{t.emptySubtitle}</p>
              </div>
              <p className="text-xs text-brand-500 bg-brand-500/10 border border-brand-500/20 rounded-full px-3 py-1.5">
                {language === 'hi' ? '👆 ऊपर एक विषय चुनें' : '👆 Select a topic above to begin'}
              </p>
            </div>
          )}

          {/* Session selected, no messages yet — show context card */}
          {!hasMessages && activeSession && !waitingForFirst && (
            <div className="animate-fade-in bg-dark-800 border border-dark-600 rounded-2xl p-4 text-sm text-slate-400 text-center">
              <p className="text-2xl mb-2">{t.sessions[activeSession].icon}</p>
              <p className="font-semibold text-slate-200 mb-0.5">{t.sessions[activeSession].title}</p>
              <p className="text-xs text-slate-500">{t.sessions[activeSession].desc}</p>
            </div>
          )}

          {/* Message list */}
          {messages.map(msg => {
            const isLastArjun = msg.role === 'assistant' && msg.id === lastArjunMsgId;
            return (
              <div key={msg.id} className="flex flex-col gap-2">
                <MessageBubble message={msg} isStreaming={msg.streaming} />
                {isLastArjun && !msg.streaming && quickReplies.length > 0 && (
                  <div className="flex flex-wrap gap-2 ml-11">
                    {quickReplies.map(reply => (
                      <button
                        key={reply}
                        onClick={() => sendMessage(reply)}
                        className="text-xs bg-dark-700 border border-brand-600/40 text-brand-300 px-3 py-1.5 rounded-full hover:bg-brand-600/20 hover:border-brand-500 active:scale-95 transition-all"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}
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
      <div className="shrink-0 bg-dark-900 border-t border-dark-600 px-4 py-3">
        <div className="max-w-2xl mx-auto">
          {atLimit && (
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2 bg-amber-950/30 border border-amber-800/30 rounded-2xl px-4 py-3">
              <p className="text-sm text-amber-400 flex-1">
                🔒 {t.limitReached} {t.upgradePrompt}.
              </p>
              <button className="text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-xl transition-colors whitespace-nowrap">
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
                : needsSession ? (language === 'hi' ? 'पहले ऊपर से एक विषय चुनें…' : 'Select a topic above to start…')
                : t.placeholder
              }
              disabled={atLimit || streaming || needsSession}
              rows={1}
              className="flex-1 resize-none bg-dark-700 border border-dark-500 text-slate-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed max-h-32 overflow-y-auto"
              style={{ minHeight: '44px' }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || streaming || atLimit || needsSession}
              className="w-11 h-11 bg-brand-600 text-white rounded-2xl flex items-center justify-center hover:bg-brand-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 shrink-0"
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

          <p className="text-xs text-slate-600 mt-2 text-center">
            {needsSession
              ? (language === 'hi' ? 'अर्जुन हर सत्र के लिए अलग तरह से कोचिंग देता है' : 'Arjun coaches differently for each topic')
              : 'Enter to send · Shift+Enter for new line'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
