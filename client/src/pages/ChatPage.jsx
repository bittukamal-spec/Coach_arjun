import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

// ─── Session definitions ───────────────────────────────────────────────────────

const SESSIONS = [
  { key: 'match_prep',      color: 'text-violet-700', activeBg: 'bg-violet-500/15 border-violet-500/60' },
  { key: 'post_match',      color: 'text-blue-700',   activeBg: 'bg-blue-500/15 border-blue-500/60'   },
  { key: 'build_focus',     color: 'text-orange-700', activeBg: 'bg-orange-500/15 border-orange-500/60' },
  { key: 'confidence',      color: 'text-brand-600',  activeBg: 'bg-brand-500/15 border-brand-500/60' },
  { key: 'handle_pressure', color: 'text-red-700',    activeBg: 'bg-red-500/15 border-red-500/60'     },
  { key: 'open',            color: 'text-win-500',    activeBg: 'bg-win-500/15 border-win-500/60'     },
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
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[92%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-brand-600 text-white rounded-2xl rounded-br-md'
            : 'bg-dark-800 border border-dark-600 text-ink shadow-sm rounded-2xl rounded-bl-md'
        }`}
      >
        {message.content}
        {isStreaming && (
          <span className="inline-flex ml-1 gap-0.5 align-middle">
            <span className="w-1 h-1 bg-slt rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 bg-slt rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 bg-slt rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-dark-800 border border-dark-600 shadow-sm rounded-2xl rounded-bl-md px-4 py-3">
        <span className="inline-flex gap-1">
          <span className="w-2 h-2 bg-slt rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-slt rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-slt rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
  const [showIntro, setShowIntro]           = useState(() => !localStorage.getItem('arjun_chat_intro_seen'));
  const [showSafety, setShowSafety]         = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);

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
              <p className="font-semibold text-ink text-sm leading-none">{t.title}</p>
              {activeSession ? (
                <p className="text-xs text-brand-600 leading-none mt-0.5 truncate">
                  {t.sessions[activeSession].icon} {t.sessions[activeSession].title}
                </p>
              ) : (
                <p className="text-xs text-slt leading-none mt-0.5">{t.aiLabel}</p>
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
              <span className="text-xs font-semibold text-slt bg-dark-700 border border-dark-500 px-2 py-1 rounded-full">
                {t.trialLabel(usage.trialDaysRemaining)}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Topic + Safety bar ──────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-dark-600 bg-dark-900 px-4 py-2 relative">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <button
            onClick={() => setShowSessionPicker(s => !s)}
            disabled={atLimit || streaming}
            className={`flex-1 flex items-center gap-2 text-xs font-medium rounded-xl border px-3 py-1.5 transition-colors disabled:opacity-40 min-w-0 ${
              activeSession
                ? 'bg-dark-800 border-dark-600 text-ink'
                : 'bg-dark-800 border-dark-500 text-slt'
            }`}
          >
            {activeSession ? (
              <>
                <span className="shrink-0">{t.sessions[activeSession].icon}</span>
                <span className="truncate">{t.sessions[activeSession].title}</span>
              </>
            ) : (
              <span className="truncate">{language === 'hi' ? 'विषय चुनें…' : 'Choose a focus…'}</span>
            )}
            <ChevronDown size={13} className={`ml-auto shrink-0 transition-transform ${showSessionPicker ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={() => setShowSafety(s => !s)}
            className="shrink-0 text-[13px] text-slt hover:text-ink transition-colors px-2 py-1.5"
            aria-label="Safety info"
          >
            ℹ
          </button>
        </div>

        {showSessionPicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowSessionPicker(false)} />
            <div className="absolute left-4 right-4 top-full mt-1 z-20 bg-dark-800 border border-dark-600 rounded-xl shadow-lg overflow-hidden">
              {SESSIONS.map(({ key, color }) => {
                const def = t.sessions[key];
                const isActive = activeSession === key;
                return (
                  <button
                    key={key}
                    onClick={() => { handleSessionSelect(key); setShowSessionPicker(false); }}
                    disabled={atLimit || streaming}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-dark-700 transition-colors disabled:opacity-40 ${
                      isActive ? 'bg-dark-700' : ''
                    }`}
                  >
                    <span className="text-base shrink-0">{def.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${isActive ? color : 'text-ink'}`}>{def.title}</p>
                      <p className="text-xs text-slt truncate">{def.desc}</p>
                    </div>
                    {isActive && <span className="ml-auto text-brand-600 shrink-0 text-sm">✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {showSafety && (
          <div className="mt-2 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 max-w-2xl mx-auto">
            <p className="text-xs text-slt">{t.safetyNote}</p>
            <p className="text-xs text-slt mt-1">{t.safetyHelpline}</p>
          </div>
        )}
      </div>

      {/* ── Messages area ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 py-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">

          {/* One-time AI intro banner */}
          {showIntro && (
            <div className="bg-dark-800 border border-brand-500/30 rounded-2xl p-4 animate-fade-in">
              <p className="font-bold text-ink text-sm mb-1">{t.aiIntroTitle}</p>
              <p className="text-xs text-slt leading-relaxed mb-3">{t.aiIntroBody}</p>
              <button
                onClick={() => { localStorage.setItem('arjun_chat_intro_seen', '1'); setShowIntro(false); }}
                className="text-xs font-semibold text-brand-600 bg-brand-500/10 border border-brand-500/20 px-3 py-1.5 rounded-full hover:bg-brand-500/20 transition-colors"
              >
                {t.aiIntroDismiss}
              </button>
            </div>
          )}

          {/* No session selected yet */}
          {!hasMessages && !activeSession && !waitingForFirst && (
            <div className="flex flex-col items-center text-center py-10 gap-3 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-brand-600/20 border-2 border-brand-600/30 flex items-center justify-center text-2xl font-bold text-brand-600">
                A
              </div>
              <div>
                <p className="font-bold text-ink mb-1">{t.sessionTitle}</p>
                <p className="text-sm text-slt max-w-xs leading-relaxed">{t.emptySubtitle}</p>
              </div>
              <p className="text-xs text-brand-500 bg-brand-500/10 border border-brand-500/20 rounded-full px-3 py-1.5">
                {language === 'hi' ? '👆 ऊपर एक विषय चुनें' : '👆 Select a topic above to begin'}
              </p>
            </div>
          )}

          {/* Session selected, no messages yet — show context card */}
          {!hasMessages && activeSession && !waitingForFirst && (
            <div className="animate-fade-in bg-dark-800 border border-dark-600 rounded-2xl p-4 text-sm text-slt text-center">
              <p className="text-2xl mb-2">{t.sessions[activeSession].icon}</p>
              <p className="font-semibold text-ink mb-0.5">{t.sessions[activeSession].title}</p>
              <p className="text-xs text-slt">{t.sessions[activeSession].desc}</p>
            </div>
          )}

          {/* Message list */}
          {messages.map(msg => {
            const isLastArjun = msg.role === 'assistant' && msg.id === lastArjunMsgId;
            return (
              <div key={msg.id} className="flex flex-col gap-2">
                <MessageBubble message={msg} isStreaming={msg.streaming} />
                {isLastArjun && !msg.streaming && quickReplies.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {quickReplies.map(reply => (
                      <button
                        key={reply}
                        onClick={() => sendMessage(reply)}
                        className="text-xs bg-dark-700 border border-brand-600/40 text-brand-500 px-3 py-1.5 rounded-full hover:bg-brand-600/20 hover:border-brand-500 active:scale-95 transition-all"
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
              className="flex-1 resize-none bg-dark-700 border border-dark-500 text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slt disabled:opacity-50 disabled:cursor-not-allowed max-h-32 overflow-y-auto"
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

          {needsSession && (
            <p className="text-xs text-slt mt-2 text-center">
              {language === 'hi' ? 'अर्जुन हर सत्र के लिए अलग तरह से कोचिंग देता है' : 'Arjun coaches differently for each topic'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
