import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Compass, Info, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArjunLogo } from '../components/ArjunLogo';

// ─── Session definitions ───────────────────────────────────────────────────────

const SESSIONS = [
  { key: 'match_prep',      color: 'text-violet-700', activeBg: 'bg-violet-500/15 border-violet-500/60' },
  { key: 'post_match',      color: 'text-blue-700',   activeBg: 'bg-blue-500/15 border-blue-500/60'   },
  { key: 'build_focus',     color: 'text-orange-700', activeBg: 'bg-orange-500/15 border-orange-500/60' },
  { key: 'confidence',      color: 'text-brand-600',  activeBg: 'bg-brand-500/15 border-brand-500/60' },
  { key: 'handle_pressure', color: 'text-red-700',    activeBg: 'bg-red-500/15 border-red-500/60'     },
  { key: 'pressure_reset',  color: 'text-brand-600',  activeBg: 'bg-brand-500/15 border-brand-500/60' },
  { key: 'setback_reset',   color: 'text-fire-600',   activeBg: 'bg-fire-500/15 border-fire-500/60'   },
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
  pressure_reset: {
    en: ['Feeling nervous', 'My stomach is tight', "Can't focus", 'Heart is racing'],
    hi: ['नर्वस हूं', 'पेट में घबराहट', 'ध्यान नहीं लग रहा', 'दिल तेज़ धड़क रहा'],
  },
  setback_reset: {
    en: ['Made a big mistake', 'We lost badly', 'Feel like giving up', "I let everyone down"],
    hi: ['बड़ी गलती हुई', 'बुरी हार हुई', 'छोड़ने का मन है', 'सबको निराश किया'],
  },
};

// ─── Starter cards ────────────────────────────────────────────────────────────

const STARTERS = [
  { key: 'pressure_reset',  icon: '⚡', to: '/reset' }, // navigates to toolkit page
  { key: 'handle_pressure', icon: '😤' },
  { key: 'open',            icon: '💬' },
];

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
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[92%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-brand-600 text-white rounded-2xl rounded-br-md'
            : 'bg-white border border-brand-100 text-ink shadow-sm rounded-2xl rounded-bl-md'
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
      <div className="bg-white border border-brand-100 shadow-sm rounded-2xl rounded-bl-md px-4 py-3">
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
      <div className="rounded-2xl bg-brand-50 border border-brand-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5">
              <path d="M1.5 5L3.5 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-brand-600 font-bold">{label}</p>
        </div>
        <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap">
          {sentences.join('\n\n')}
        </p>
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
  const [replyStyle, setReplyStyle]               = useState(() => localStorage.getItem('arjun_reply_style') || 'thoughtful');
  const [activeSession, setActiveSession]         = useState(null);
  const [showSafety, setShowSafety]               = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showStylePicker, setShowStylePicker]     = useState(false);
  const [chatSessionId, setChatSessionId]         = useState(null);
  const [showStartScreen, setShowStartScreen]     = useState(false);
  const [recentSessions, setRecentSessions]       = useState([]);
  const [summarising, setSummarising]             = useState(false);
  const [sessionSummary, setSessionSummary]       = useState(null);

  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);
  const streamIdRef             = useRef(null);
  const fullStreamText          = useRef('');
  const arjunMsgCountRef        = useRef(0);
  const pendingSessionRef       = useRef(location.state?.sessionType ?? null);
  const prefillMsgRef           = useRef(location.state?.prefillMsg ?? null);
  const pendingChatSessionIdRef = useRef(location.state?.chatSessionId ?? null);
  const forceNewSessionRef      = useRef(location.state?.newSession ?? false);
  const arjunReportRef          = useRef(location.state?.arjunReport ?? null);

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
          pendingSessionRef.current = null; // don't auto-start a new greeting on an existing session
          setChatSessionId(pendingId);
          const sess = sessions.find(s => s.id === pendingId);
          if (sess?.sessionType && sess.sessionType !== 'general') {
            setActiveSession(sess.sessionType);
          }
          if (sess?.summary) setSessionSummary(sess.summary);
          await fetchSessionMessages(pendingId);
          sessionLoaded = true;
        } else if (!forceNewSessionRef.current) {
          // Resume the most recent unended session (regardless of when it was created).
          // end-stale auto-closes sessions from previous days; if the user didn't
          // explicitly end today's session, we pick it back up.
          const existingActive = sessions.find(s => s.status === 'active');
          if (existingActive) {
            setChatSessionId(existingActive.id);
            if (existingActive.sessionType && existingActive.sessionType !== 'general') {
              setActiveSession(existingActive.sessionType);
            }
            if (existingActive.summary) setSessionSummary(existingActive.summary);
            await fetchSessionMessages(existingActive.id);
            sessionLoaded = true;
          }
        }
      }

      if (!sessionLoaded) {
        if (forceNewSessionRef.current) {
          // Auto-start immediately — skip the start screen; preserve any specific sessionType
          if (!pendingSessionRef.current) pendingSessionRef.current = 'general';
        } else {
          setShowStartScreen(true);
        }
      }

      setLoading(false);

      if (prefillMsgRef.current) {
        setInput(prefillMsgRef.current);
        prefillMsgRef.current = null;
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist reply style ───────────────────────────────────────────────────

  useEffect(() => {
    localStorage.setItem('arjun_reply_style', replyStyle);
  }, [replyStyle]);

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

  // ── Intercept mobile back — always go to /sessions ────────────────────────

  useEffect(() => {
    const handlePop = () => {
      navigate('/sessions', { replace: true });
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [navigate]);

  // ── Auto-start when navigated from another page with a sessionType ────────
  // If there is already an active session loaded, resume it — don't inject a new
  // greeting on top of existing messages. Only start fresh when there is no session.

  useEffect(() => {
    if (!loading && pendingSessionRef.current) {
      const key = pendingSessionRef.current;
      pendingSessionRef.current = null;

      const bridge = language === 'hi'
        ? 'मैंने अभी अपना मैच रिव्यू किया। इस पर बात करें।'
        : 'I just finished my match review. Can we talk about it?';

      if (!chatSessionId) {
        arjunMsgCountRef.current = 0;
        setActiveSession(key);
        if (arjunReportRef.current) {
          // New session, coming from debrief — send the bridge message directly.
          // Arjun's system prompt has the full review context (fromToolSection).
          // Don't send __SESSION:post_match__ since it tells Arjun to ask basic
          // questions the user already answered in the review.
          createSession(key).then(id => sendMessage(bridge, key, id));
        } else {
          // New session, no tool context — normal session start
          createSession(key).then(id => sendMessage(`__SESSION:${key}__`, key, id));
        }
      } else if (arjunReportRef.current) {
        // Existing active session + debrief context — auto-send bridge message
        // so Arjun picks up the context immediately.
        setTimeout(() => sendMessage(bridge), 400);
      }
      // Otherwise (existing session, no tool context): resume silently.
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

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
        let lastAsstIdx = -1;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') { lastAsstIdx = i; break; }
        }
        const processed = msgs.map((msg, i) => {
          if (msg.role !== 'assistant') return msg;
          const { clean, suggestions } = extractSuggestions(msg.content);
          return { ...msg, content: clean, tags: i === lastAsstIdx ? suggestions : [] };
        });
        setMessages(processed);
      }
    } catch { /* ignore */ }
  }

  async function createSession(type = 'general') {
    const res = await apiFetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionType: type }),
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
    navigate('/sessions');
  }

  async function handleContinueYesterday() {
    const recent = recentSessions.find(s => s.status === 'ended');
    if (!recent) return;
    const res = await apiFetch(`/api/sessions/${recent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'active' }),
    });
    if (res.ok) {
      setChatSessionId(recent.id);
      setShowStartScreen(false);
      if (recent.sessionType && recent.sessionType !== 'general') {
        setActiveSession(recent.sessionType);
      }
      await fetchSessionMessages(recent.id);
    }
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
        body: JSON.stringify({ content: trimmed, sessionType, arjunMsgCount: arjunMsgCountRef.current, replyStyle, chatSessionId: sessionIdToUse, arjunReport: arjunReportRef.current }),
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
              arjunMsgCountRef.current += 1;
              const isFirstReply = arjunMsgCountRef.current === 1 && sessionType;
              const chips = suggestions.length > 0
                ? suggestions
                : (isFirstReply ? (INITIAL_CHIPS[sessionType]?.[language] ?? []) : []);
              setMessages(prev =>
                prev.map(m => m.id === streamId
                  ? { ...m, content: clean, id: data.id, streaming: false, ...(chips.length > 0 ? { tags: chips } : {}) }
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
  }, [input, streaming, token, t.errorRetry, activeSession, language, replyStyle, chatSessionId]);

  // ── Session selection ─────────────────────────────────────────────────────

  async function handleSessionSelect(key) {
    if (streaming) return;
    if (activeSession === key) return;
    arjunMsgCountRef.current = 0;
    setActiveSession(key);
    let sessionId = chatSessionId;
    if (!sessionId) {
      sessionId = await createSession(key);
    }
    if (messages.length === 0) {
      sendMessage(`__SESSION:${key}__`, key, sessionId);
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

  const atLimit          = !usage.isPremium && usage.trialDaysRemaining === 0;
  const hasMessages      = messages.length > 0;
  const hasEndedSessions = recentSessions.some(s => s.status === 'ended');

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
              <p className="text-xs text-slt leading-none mt-0.5">{t.aiLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {chatSessionId && !showStartScreen && (
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

          {/* Arjun welcome bubble — shown on start screen or empty session */}
          {!hasMessages && !waitingForFirst && (
            <div className="flex justify-start animate-fade-in">
              <div className="max-w-[92%] px-3.5 py-2.5 text-sm leading-relaxed bg-white border border-brand-100 text-ink shadow-sm rounded-2xl rounded-bl-md">
                {t.arjunWelcome}
              </div>
            </div>
          )}

          {/* Start screen — shown when no session is loaded yet and not auto-starting */}
          {showStartScreen && !waitingForFirst && (
            <div className="flex flex-col gap-3 mt-2 animate-fade-in">
              {hasEndedSessions && (
                <button
                  onClick={handleContinueYesterday}
                  disabled={atLimit}
                  className="flex items-center gap-3 bg-dark-800 border border-dark-600 hover:border-brand-500/50 hover:bg-dark-700 active:scale-[0.98] rounded-2xl p-4 text-left transition-all disabled:opacity-40"
                >
                  <span className="text-lg shrink-0">🕐</span>
                  <span className="text-sm font-medium text-ink">{t.continueYesterday}</span>
                </button>
              )}
              <button
                onClick={() => createSession('general')}
                disabled={atLimit}
                className="w-full py-3 rounded-2xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors active:scale-[0.98] disabled:opacity-40"
              >
                {t.startFresh}
              </button>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {STARTERS.map(({ key, icon, to }) => (
                  <button
                    key={key}
                    onClick={() => to ? navigate(to) : handleSessionSelect(key)}
                    disabled={!to && (atLimit || streaming)}
                    className="flex items-center gap-2 bg-dark-800 border border-dark-600 hover:border-brand-500/50 hover:bg-dark-700 active:scale-95 rounded-2xl px-3 py-3 text-left transition-all disabled:opacity-40"
                  >
                    <span className="text-lg shrink-0">{icon}</span>
                    <span className="text-sm font-medium text-ink leading-tight">{t.starters[key]}</span>
                  </button>
                ))}
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
          {!showStartScreen && (() => {
            const lastAsstIdx = messages.reduce((acc, m, i) => m.role === 'assistant' && !m.streaming ? i : acc, -1);
            const elseLabel = language === 'hi' ? 'Kuch aur…' : 'Something else…';
            return messages.map((msg, i) => {
              const prevMsg = messages[i - 1];
              const showDivider = msg.sessionType && msg.sessionType !== prevMsg?.sessionType && i > 0;
              const isLastAsst = i === lastAsstIdx && !streaming;
              return (
                <div key={msg.id} className="flex flex-col gap-2">
                  {showDivider && <SessionDivider sessionKey={msg.sessionType} date={msg.createdAt} t={t} />}
                  <MessageBubble message={msg} isStreaming={msg.streaming} />
                  {msg.role === 'assistant' && !msg.streaming && (msg.tags?.length > 0 || isLastAsst) && (
                    <div className="flex flex-wrap gap-2">
                      {msg.tags?.map(reply => (
                        <button
                          key={reply}
                          onClick={() => sendMessage(reply)}
                          className="text-xs bg-dark-700 border border-brand-600/40 text-brand-500 px-3 py-1.5 rounded-full hover:bg-brand-600/20 hover:border-brand-500 active:scale-95 transition-all"
                        >
                          {reply}
                        </button>
                      ))}
                      {isLastAsst && (
                        <button
                          onClick={() => inputRef.current?.focus()}
                          className="text-xs bg-transparent border border-dashed border-dark-500 text-slt px-3 py-1.5 rounded-full hover:border-brand-400 hover:text-brand-400 active:scale-95 transition-all"
                        >
                          {elseLabel}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            });
          })()}

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
        <div className="max-w-2xl mx-auto relative">

          {/* ── Session picker dropdown ─────────────────────────── */}
          {showSessionPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSessionPicker(false)} />
              <div className="absolute bottom-full mb-2 right-0 z-20 bg-dark-800 border border-dark-600 rounded-xl shadow-lg overflow-hidden w-60 max-h-72 overflow-y-auto">
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

          {/* ── Style picker dropdown ─────────────────────────────── */}
          {showStylePicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowStylePicker(false)} />
              <div className="absolute bottom-full mb-2 right-0 z-20 bg-dark-800 border border-dark-600 rounded-xl shadow-lg overflow-hidden w-44">
                <p className="text-[11px] uppercase tracking-widest text-slt font-medium px-4 pt-3 pb-1">{t.styleLabel}</p>
                {['short', 'honest', 'thoughtful', 'motivating'].map(style => (
                  <button
                    key={style}
                    onClick={() => { setReplyStyle(style); setShowStylePicker(false); }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-dark-700 transition-colors ${
                      replyStyle === style ? 'text-brand-600 font-medium bg-brand-50' : 'text-ink'
                    }`}
                  >
                    {t.replyStyles[style]}
                    {replyStyle === style && <span className="text-brand-600 text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          {atLimit && (
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <p className="text-sm text-amber-700 flex-1">
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
              className="flex-1 resize-none bg-dark-700 border border-dark-500 text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slt disabled:opacity-50 disabled:cursor-not-allowed max-h-32 overflow-y-auto"
              style={{ minHeight: '44px' }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
            />
            {/* Style + Focus icon buttons */}
            <div className="flex gap-1 self-end pb-0.5">
              <button
                onClick={() => { setShowStylePicker(s => !s); setShowSessionPicker(false); }}
                title={t.styleLabel}
                className={`p-2 rounded-xl transition-colors ${
                  showStylePicker ? 'bg-brand-100 text-brand-600' : 'text-slt hover:text-ink hover:bg-dark-700'
                }`}
              >
                <SlidersHorizontal size={16} />
              </button>
              <button
                onClick={() => { setShowSessionPicker(s => !s); setShowStylePicker(false); }}
                disabled={atLimit || streaming}
                title={t.chooseFocus}
                className={`p-2 rounded-xl transition-colors disabled:opacity-40 ${
                  showSessionPicker || activeSession ? 'bg-brand-100 text-brand-600' : 'text-slt hover:text-ink hover:bg-dark-700'
                }`}
              >
                <Compass size={16} />
              </button>
            </div>
            <button
              onClick={() => sendMessage()}
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

        </div>
      </div>
    </div>
  );
}

export default ChatPage;
