import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

// ─── Sub-components ───────────────────────────────────────────────────────────

function MessageBubble({ message, isStreaming }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm shrink-0 mb-1">
          🧠
        </div>
      )}

      {/* Bubble */}
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
      <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm shrink-0">
        🧠
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
  const { user, token, language } = useAuth();
  const t = translations[language].chat;

  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [waitingForFirst, setWaitingForFirst] = useState(false);
  const [error, setError]         = useState('');
  const [usage, setUsage]         = useState({ isPremium: false, trialDaysRemaining: 14 });

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const streamIdRef = useRef(null); // tracks the temp streaming message id

  // ── Load history + usage on mount ────────────────────────────────────────

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
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch { /* ignore */ }
  }

  // ── Send message with streaming ───────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    setInput('');
    setError('');

    // Add user message to UI immediately
    const tempUserId = 'user-' + Date.now();
    setMessages(prev => [...prev, { id: tempUserId, role: 'user', content: trimmed }]);
    setWaitingForFirst(true);
    setStreaming(true);

    // Trial is date-based — no optimistic count update needed

    try {
      const res = await apiFetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: trimmed }),
      });

      // Non-streaming error (e.g. 429 limit reached, 503 no API key)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) {
          setUsage(prev => ({ ...prev, trialDaysRemaining: 0 }));
        }
        throw new Error(body.error || 'Request failed');
      }

      // Create the streaming message placeholder
      const streamId = 'stream-' + Date.now();
      streamIdRef.current = streamId;
      setMessages(prev => [...prev, { id: streamId, role: 'assistant', content: '', streaming: true }]);
      setWaitingForFirst(false);

      // Read the SSE stream
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
              setMessages(prev =>
                prev.map(m =>
                  m.id === streamId ? { ...m, content: m.content + data.c } : m
                )
              );
            } else if (data.t === 'end') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === streamId ? { ...m, id: data.id, streaming: false } : m
                )
              );
            } else if (data.t === 'error') {
              setMessages(prev => prev.filter(m => m.id !== streamId));
              setError(data.message || t.errorRetry);
            }
          } catch { /* malformed SSE chunk, skip */ }
        }
      }
    } catch (err) {
      setWaitingForFirst(false);
      // Remove the streaming placeholder if it exists
      setMessages(prev => prev.filter(m => !m.streaming));
      setError(err.message || t.errorRetry);
    } finally {
      setStreaming(false);
      setWaitingForFirst(false);
      streamIdRef.current = null;
      inputRef.current?.focus();
    }
  }, [input, streaming, token, t.errorRetry]);

  // ── Send on Enter (not Shift+Enter) ──────────────────────────────────────

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const atLimit = !usage.isPremium && usage.trialDaysRemaining === 0;
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
      <header className="shrink-0 bg-dark-900 border-b border-dark-600 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              {t.backToDashboard}
            </Link>
            <div className="w-px h-4 bg-dark-600" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold">
                A
              </div>
              <div>
                <p className="font-semibold text-slate-100 text-sm leading-none">{t.title}</p>
                <p className="text-xs text-slate-500 leading-none mt-0.5">{t.subtitle}</p>
              </div>
            </div>
          </div>

          {/* Usage badge */}
          <div>
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

      {/* ── Messages area ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">

          {/* Empty state */}
          {!hasMessages && !waitingForFirst && (
            <div className="flex flex-col items-center text-center py-12 gap-3">
              <div className="w-16 h-16 rounded-full bg-brand-600 flex items-center justify-center text-2xl font-bold text-white">
                A
              </div>
              <div>
                <p className="font-semibold text-slate-100 mb-1">{t.emptyTitle}</p>
                <p className="text-sm text-slate-400 max-w-xs">{t.emptySubtitle}</p>
              </div>
              {/* Starter prompts */}
              <div className="flex flex-wrap gap-2 mt-2 justify-center">
                {[
                  language === 'hi' ? 'मैच से पहले बहुत घबराहट होती है' : 'I get really nervous before matches',
                  language === 'hi' ? 'अपना फोकस कैसे बढ़ाऊं?' : 'How do I improve my focus?',
                  language === 'hi' ? 'हार के बाद कैसे उबरें?' : 'How to recover after a bad loss?',
                ].map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                    className="text-xs bg-dark-700 border border-dark-500 text-slate-400 px-3 py-1.5 rounded-full hover:border-brand-500 hover:text-brand-400 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} isStreaming={msg.streaming} />
          ))}

          {/* Typing indicator (before first token arrives) */}
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
      <div className="shrink-0 bg-dark-900 border-t border-dark-600 px-4 py-3 safe-area-bottom">
        <div className="max-w-2xl mx-auto">

          {/* Limit reached banner */}
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
              placeholder={atLimit ? '🔒 ' + t.limitReached : t.placeholder}
              disabled={atLimit || streaming}
              rows={1}
              className="flex-1 resize-none bg-dark-700 border border-dark-500 text-slate-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed max-h-32 overflow-y-auto"
              style={{ minHeight: '44px' }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming || atLimit}
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
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
