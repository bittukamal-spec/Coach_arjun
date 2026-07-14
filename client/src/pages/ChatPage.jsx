import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Info, Eye, RotateCcw, ClipboardList, MessageSquare, Target, RefreshCw, Layers, Dumbbell, GraduationCap, ChevronLeft, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArjunLogo } from '../components/ArjunLogo';
import ConsentBanner, { needsGuardianConsent } from '../components/ConsentBanner';
import { parseArjunMessage, APP_TOOL_CONFIG } from '../utils/parseArjunMessage';
import { shouldShowAiReminder, BREAK_REMINDER_MS } from '../utils/chatReminders';
import { parseServerCardEvent, mergeUniqueServerCard } from '../utils/serverCardEvent';
import { parseQuickRepliesEvent } from '../utils/quickReplyEvent';

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

const ICON_MAP = { Eye, RotateCcw, ClipboardList, MessageSquare, Target, RefreshCw, Layers, Dumbbell, GraduationCap };

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
                    className="font-medium rounded-md"
                    style={{
                      background: 'rgba(217,139,43,0.12)',
                      borderLeft: '3px solid #D98B2B',
                      padding: '8px 10px',
                      color: '#D98B2B',
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

function AppToolCard({ toolId }) {
  const config = APP_TOOL_CONFIG[toolId];
  const navigate = useNavigate();
  if (!config) return null;

  const IconComponent = ICON_MAP[config.icon];
  const tileStyle = { '--tile-fg': config.iconColor, '--tile-bg': config.iconColor + '22' };

  return (
    <div
      onClick={() => navigate(config.route)}
      className="tool-card flex-1 min-w-0 flex flex-col gap-1.5 p-2.5 cursor-pointer"
      style={{ '--tool-bg': config.bgColor, '--tool-border': config.iconColor + '22' }}
    >
      <div className="flex items-center gap-2.5">
        <div className="icon-tile w-8 h-8 rounded-lg" style={tileStyle}>
          {IconComponent && <IconComponent size={16} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink leading-tight">
            {config.label}
          </div>
          <div className="text-[11px] text-slt mt-0.5">
            {config.sub}
          </div>
        </div>
      </div>
      {config.why && (
        <div className="text-[11px] text-slt leading-snug">
          {config.why}
        </div>
      )}
      <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: config.iconColor }}>
        {config.cta || 'Open'}
        <span className="text-sm leading-none">›</span>
      </div>
    </div>
  );
}

// ─── ServerCardBubble: renders a structured server-issued Mental Rep card ──────
// (PR-9). Kept visually consistent with ArjunBubble's card container and
// ArjunText's cue-line highlight, but rendered as its own bubble — never
// merged into an assistant message's `content`, never sent back to the
// server, never added to the athlete's typed-message history.

function ServerCardBubble({ card }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] bg-dark-400 border border-dark-600 shadow-sm rounded-2xl rounded-bl-md overflow-hidden">
        <div className="px-3.5 py-2.5 flex flex-col gap-1.5">
          <p className="text-[10px] uppercase tracking-widest text-brand-400 font-bold">
            Mental Rep
          </p>
          <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap">
            {card.cardContent}
          </p>
          {card.cueWord && (
            <div
              className="font-medium rounded-md"
              style={{
                background: 'rgba(217,139,43,0.12)',
                borderLeft: '3px solid #D98B2B',
                padding: '8px 10px',
                color: '#D98B2B',
                marginTop: '2px',
              }}
            >
              {card.cueWord}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── QuickReplyChips: optional contextual reply chips + client "Write my own" ──
// Renders up to three server-offered chips (already validated: 2-3 items,
// unique ids, short non-empty labels) plus one translated "Write my own"
// chip the client always adds itself. Tapping a contextual chip reuses the
// existing normal message-submit path — only its label is ever sent, never
// its id. The text box stays visible and usable regardless.

function QuickReplyChips({ replies, onSelect, onWriteMyOwn, t }) {
  return (
    <div className="flex flex-wrap gap-1.5 pl-1">
      {replies.map(reply => (
        <button
          key={reply.id}
          type="button"
          onClick={() => onSelect(reply.label)}
          className="chip"
        >
          {reply.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onWriteMyOwn}
        className="chip"
      >
        {t.writeMyOwn}
      </button>
    </div>
  );
}

// ─── ArjunBubble: full assistant message bubble with text + tool cards ─────────

function ArjunBubble({ message, isStreaming }) {
  // Guardrail: only ever render a card for a tool id that's in the active
  // registry. An unrecognised tag (Arjun inventing a name, or a stale tag
  // from an old saved message) is dropped silently from the UI — never
  // rendered as a broken/dead-end card — but logged so it's visible.
  const appTools = (message.appTools || []).filter(id => {
    if (!APP_TOOL_CONFIG[id]) {
      if (!isStreaming) console.warn(`[ChatPage] Ignoring unknown [APP:${id}] tag — not in APP_TOOL_CONFIG`);
      return false;
    }
    return true;
  });
  const hasTools = !isStreaming && appTools.length > 0;

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] bg-dark-400 border border-dark-600 shadow-sm rounded-2xl rounded-bl-md overflow-hidden">
        <div className="px-3.5 py-2.5">
          <ArjunText text={message.content} isStreaming={isStreaming} />
        </div>
        {hasTools && (
          <>
            <div className="h-px bg-dark-600 mx-3" />
            <div className="p-2 flex gap-2">
              {appTools.map(toolId => (
                <AppToolCard key={toolId} toolId={toolId} />
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
  const { token, language, user } = useAuth();
  const consentPending = needsGuardianConsent(user);
  const t = translations[language].chat;
  const hi = language === 'hi';
  const location = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages]                   = useState([]);
  const [input, setInput]                         = useState('');
  const [loading, setLoading]                     = useState(true);
  const [initError, setInitError]                 = useState('');
  const [retryKey, setRetryKey]                   = useState(0);
  const [streaming, setStreaming]                 = useState(false);
  const [waitingForFirst, setWaitingForFirst]     = useState(false);
  const [error, setError]                         = useState('');
  const [usage, setUsage]                         = useState({ isPremium: false, trialDaysRemaining: 14 });
  const [activeSession, setActiveSession]         = useState(null);
  const [showSafety, setShowSafety]               = useState(false);
  const [chatSessionId, setChatSessionId]         = useState(null);
  const [showStartScreen, setShowStartScreen]     = useState(false);
  const [recentSessions, setRecentSessions]       = useState([]);
  const [sessionSummary, setSessionSummary]       = useState(null);
  const [chatMode, setChatMode]                   = useState('main');
  const [showBreakReminder, setShowBreakReminder] = useState(false);
  const [serverCards, setServerCards]             = useState([]);
  const [quickReplies, setQuickReplies]           = useState(null);

  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);
  const streamIdRef             = useRef(null);
  const fullStreamText          = useRef('');
  const arjunMsgCountRef        = useRef(0);
  const prefillMsgRef           = useRef(location.state?.prefillMsg ?? null);
  const pendingChatSessionIdRef = useRef(location.state?.chatSessionId ?? null);
  const chatSessionIdRef        = useRef(null);
  const chatModeRef             = useRef('main');
  // Per-entry guard: at most one claim-opener request per main ChatSession
  // for the current conversation entry, no matter how many times a
  // render/effect re-runs. Scoped to ONE entry, not the whole mount — it is
  // cleared whenever the UI genuinely returns to the chat-entry screen (see
  // the showStartScreen effect below), so a later genuine "Continue with
  // Arjun" tap can claim again for the same session (e.g. a prescription
  // that didn't exist yet on an earlier entry may exist by the next one).
  // Server atomicity (the conditional updateMany in
  // claimPrescriptionFollowUp) is the real duplicate-prevention guarantee —
  // this just avoids firing redundant browser requests within one entry.
  const followUpClaimedSessionsRef = useRef(new Set());

  // ── Load on mount ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setInitError('');
      try {
        // Fire-and-forget: end sessions from previous days
        apiFetch('/api/sessions/end-stale', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});

        // ── Usage (trial days left) — independent of sessions; a failure
        // here must not block the rest of the page from loading.
        try {
          const usageRes = await apiFetch('/api/chat/usage', { headers: { Authorization: `Bearer ${token}` } });
          if (usageRes.ok) {
            setUsage(await usageRes.json());
          } else {
            console.error('[ChatPage] GET /api/chat/usage returned', usageRes.status);
          }
        } catch (err) {
          console.error('[ChatPage] GET /api/chat/usage failed:', err);
        }

        // ── Sessions — independent of usage; a failure here must not block
        // the rest of the page from loading either.
        let sessionLoaded = false;
        try {
          const sessionsRes = await apiFetch('/api/sessions', { headers: { Authorization: `Bearer ${token}` } });
          if (sessionsRes.ok) {
            const data = await sessionsRes.json();
            const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
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
              // No follow-up claim here — this is passive discovery of an
              // already-ongoing session on mount, not the athlete explicitly
              // choosing to enter the main conversation. Claiming happens
              // only from an explicit entry action (handleContinueMain).
              await fetchSessionMessages(pendingId);
              sessionLoaded = true;
            } else if (sessions.length > 0) {
              // Auto-load the most recent main session — sessions are ordered createdAt desc
              const mainSession = sessions[0];
              setChatSessionId(mainSession.id);
              setChatMode('main');
              if (mainSession.sessionType && mainSession.sessionType !== 'general') {
                setActiveSession(mainSession.sessionType);
              }
              if (mainSession.summary) setSessionSummary(mainSession.summary);
              // No follow-up claim here either — same reasoning as above.
              await fetchSessionMessages(mainSession.id);
              sessionLoaded = true;
            }
          } else {
            console.error('[ChatPage] GET /api/sessions returned', sessionsRes.status);
          }
        } catch (err) {
          console.error('[ChatPage] GET /api/sessions failed:', err);
        }

        if (!sessionLoaded) {
          setShowStartScreen(true);
        }

        if (prefillMsgRef.current) {
          setInput(prefillMsgRef.current);
          prefillMsgRef.current = null;
        }
      } catch (err) {
        // Last-resort net for something truly unexpected outside the two
        // guarded fetches above (both of which already degrade gracefully
        // on their own and never reach here in normal operation).
        console.error('[ChatPage] init failed unexpectedly:', err);
        setInitError(t.errorRetry);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Keep refs in sync with state ─────────────────────────────────────────

  useEffect(() => { chatSessionIdRef.current = chatSessionId; }, [chatSessionId]);
  useEffect(() => { chatModeRef.current = chatMode; }, [chatMode]);

  // ── Reset temporary server-issued card / quick-reply state on session switch
  // Server cards (PR-9) and quick replies are never persisted — they only
  // live for the current loaded session, so switching sessions must not
  // leak them.
  useEffect(() => { setServerCards([]); setQuickReplies(null); }, [chatSessionId]);

  // ── Reset the per-entry follow-up-claim guard when the UI genuinely
  // returns to the chat-entry screen (PR-11 correction). Ordinary rerenders
  // while the athlete stays inside the same conversation never flip
  // showStartScreen back to true, so this effect does not fire during them
  // — only an actual return to the entry screen does. A later "Continue
  // with Arjun" tap is then free to claim again for the same chatSessionId;
  // the server's atomic claim (not this guard) is what actually prevents a
  // duplicate opener.
  useEffect(() => {
    if (showStartScreen) followUpClaimedSessionsRef.current.clear();
  }, [showStartScreen]);

  // ── Gentle break reminder — client-only, fires once ~30 min after this
  // page mounted, cleared on unmount so no timer keeps running after the
  // athlete leaves the chat. ─────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => setShowBreakReminder(true), BREAK_REMINDER_MS);
    return () => clearTimeout(timer);
  }, []);

  // ── Clear sessionStorage cache when component unmounts ────────────────────
  // Sessions are NOT ended here — end-stale handles previous-day cleanup on next mount

  useEffect(() => {
    return () => {
      const id = chatSessionIdRef.current;
      if (id) sessionStorage.removeItem(`arjun_chat_messages_${id}`);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Always fetch fresh — discard any stale cache from prior visits
    sessionStorage.removeItem(`arjun_chat_messages_${id}`);
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await apiFetch(
        `/api/sessions/${id}/messages?since=${encodeURIComponent(since)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const msgs = data.messages || [];
        const processed = msgs.map(msg => {
          if (msg.role !== 'assistant') return msg;
          const { clean, suggestions } = extractSuggestions(msg.content);
          const { cleanText, tools } = parseArjunMessage(clean);
          return { ...msg, content: cleanText, appTools: tools, suggestions };
        });
        setMessages(processed);
        // Scroll to most recent message instantly
        setTimeout(() => { bottomRef.current?.scrollIntoView({ behavior: 'auto' }); }, 50);
      }
    } catch { /* ignore */ }
  }

  // Claim the deterministic next-open prescription follow-up opener (PR-11).
  // Called ONLY from an explicit "enter the main conversation" action
  // (handleContinueMain) — never from passive session discovery on mount,
  // never for Quick Chat, never merely for viewing the entry screen, and
  // never blocks chat entry on failure.
  //
  // The in-flight guard (followUpClaimedSessionsRef) exists only to stop a
  // duplicate request during the SAME entry — the server's atomic claim
  // (the conditional updateMany in claimPrescriptionFollowUp) is the real
  // duplicate-prevention guarantee. On a network/server error the guard for
  // this session is cleared immediately so a later genuine entry can retry;
  // nothing here retries automatically within this same call. A definitive
  // server answer — claimed:true or claimed:false — leaves the guard set
  // for the REST of this entry (it cannot change again until the athlete
  // leaves and genuinely re-enters); the showStartScreen effect above is
  // what clears it once that next entry begins, so claimed:false before a
  // prescription exists can never permanently suppress a later eligible
  // claim. On a win, messages are reloaded from the server so the opener
  // renders from real persisted history — never appended locally.
  async function claimFollowUpOpener(sessionId) {
    if (!sessionId || consentPending) return;
    if (followUpClaimedSessionsRef.current.has(sessionId)) return;
    followUpClaimedSessionsRef.current.add(sessionId);
    try {
      const res = await apiFetch('/api/prescriptions/claim-opener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatSessionId: sessionId }),
      });
      if (!res.ok) {
        followUpClaimedSessionsRef.current.delete(sessionId);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.claimed) await fetchSessionMessages(sessionId);
    } catch {
      // Network/server error — never blocks chat entry, and clears the
      // guard so a later genuine entry can retry.
      followUpClaimedSessionsRef.current.delete(sessionId);
    }
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

  async function handleContinueMain() {
    // Find the most recent main session — status doesn't matter, messages persist
    const existingSession = recentSessions.find(
      s => s.mode === 'main' || !s.mode
    );
    if (existingSession) {
      setChatSessionId(existingSession.id);
      if (existingSession.sessionType && existingSession.sessionType !== 'general') {
        setActiveSession(existingSession.sessionType);
      }
      if (existingSession.summary) setSessionSummary(existingSession.summary);
      await fetchSessionMessages(existingSession.id);
      await claimFollowUpOpener(existingSession.id);
      setShowStartScreen(false);
    } else {
      const id = await createSession('general', 'main');
      await claimFollowUpOpener(id);
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
    // Clear any offered quick-reply chips immediately — whether this send
    // came from typing, tapping a contextual chip, or tapping "Write my
    // own". A new response (if any) will offer its own fresh set.
    setQuickReplies(null);

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
              const { clean, suggestions } = extractSuggestions(fullStreamText.current);
              const { cleanText, tools } = parseArjunMessage(clean);
              arjunMsgCountRef.current += 1;
              setMessages(prev =>
                prev.map(m => m.id === streamId
                  ? { ...m, content: cleanText, id: data.id, streaming: false, appTools: tools, suggestions }
                  : m)
              );
              fullStreamText.current = '';
            } else if (data.t === 'error') {
              setMessages(prev => prev.filter(m => m.id !== streamId));
              setError(data.message || t.errorRetry);
              setQuickReplies(null);
            } else if (data.t === 'card') {
              // Structured server-issued Mental Rep card (PR-9). Validated
              // and deduplicated by prescriptionId; never merged into
              // assistant text, never added to messages, never sent back.
              // A malformed/incomplete payload is silently ignored — the
              // stream keeps processing later events.
              const card = parseServerCardEvent(data);
              if (card) setServerCards(prev => mergeUniqueServerCard(prev, card));
            } else if (data.t === 'quick_replies') {
              // Structured optional reply chips. Validated (2-3 items,
              // unique non-empty ids, short non-empty labels) and stored
              // separately from messages/cards — never persisted, never
              // sent back to the server, never merged into assistant text.
              // A malformed payload is silently ignored — the stream keeps
              // processing later events.
              const replies = parseQuickRepliesEvent(data);
              if (replies) setQuickReplies(replies);
            }
          } catch { /* malformed chunk */ }
        }
      }
    } catch (err) {
      setWaitingForFirst(false);
      setMessages(prev => prev.filter(m => !m.streaming));
      setError(err.message || t.errorRetry);
      setQuickReplies(null);
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

  if (initError) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-dark-900 px-6 gap-4">
        <p className="text-sm text-red-400 text-center">{initError}</p>
        <button
          onClick={() => { setLoading(true); setRetryKey(k => k + 1); }}
          className="px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold active:scale-95 transition-all"
        >
          {hi ? 'फिर कोशिश करो' : 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-dark-900">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-dark-900 border-b border-dark-600 px-4 py-3 relative">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 text-slt hover:text-ink transition-colors rounded-lg hover:bg-dark-700 -ml-1 shrink-0"
              aria-label="Go back"
            >
              <ChevronLeft size={20} />
            </button>
            <ArjunLogo size={28} />
            <div className="min-w-0">
              <p className="font-semibold text-ink text-sm leading-none">{t.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
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

          {/* Entry choice screen — shown when no session is active */}
          {showStartScreen && !waitingForFirst && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 animate-fade-in">
              {consentPending && <div className="w-full"><ConsentBanner /></div>}
              <h2 className="text-[22px] font-bold text-ink mb-2 text-center">{t.entry.heading}</h2>
              <p className="text-[15px] text-slt text-center mb-6 leading-relaxed max-w-xs">{t.entry.description}</p>
              <div className="w-full bg-brand-500/10 border border-brand-500/30 rounded-2xl px-4 py-3 mb-6">
                <p className="text-xs text-slt leading-relaxed">{t.entryDisclosure}</p>
                <p className="text-xs text-slt leading-relaxed mt-2">{t.entryDisclosureSafety}</p>
              </div>
              <div className="w-full flex flex-col gap-2">
                <button
                  onClick={handleContinueMain}
                  disabled={atLimit || consentPending}
                  className="w-full py-4 bg-brand-600 text-white rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  {t.entry.continue.label}
                </button>
                <p className="text-[13px] text-slt text-center">{t.entry.continue.sub}</p>
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

          {/* Empty state — no messages in last 7 days */}
          {!showStartScreen && messages.length === 0 && !waitingForFirst && (
            <div className="flex items-center justify-center min-h-[50vh]">
              <p className="text-sm text-muted text-center">{t.emptyPrompt}</p>
            </div>
          )}

          {/* Message list */}
          {!showStartScreen && (() => {
            const lastArjunIdx = messages.reduce((acc, m, i) => m.role === 'assistant' ? i : acc, -1);
            let assistantReplyIndex = 0;
            return messages.map((msg, i) => {
              const prevMsg = messages[i - 1];
              const showDivider = msg.sessionType && msg.sessionType !== prevMsg?.sessionType && i > 0;
              const showChips = i === lastArjunIdx && !streaming && !waitingForFirst
                && msg.suggestions?.length > 0 && !atLimit;
              // Recurring AI-coach reminder: purely a render-time notice —
              // never added to `messages`, never sent to the server, and it
              // never touches arjunMsgCountRef (the count coaching logic
              // uses server-side).
              if (msg.role === 'assistant' && !msg.streaming) assistantReplyIndex += 1;
              const showAiReminder = msg.role === 'assistant' && !msg.streaming
                && shouldShowAiReminder(assistantReplyIndex);
              return (
                <div key={msg.id} className="flex flex-col gap-2">
                  {showDivider && <SessionDivider sessionKey={msg.sessionType} date={msg.createdAt} t={t} />}
                  <MessageBubble message={msg} isStreaming={msg.streaming} />
                  {showChips && (
                    <div className="flex flex-wrap gap-1.5 pl-1">
                      {msg.suggestions.map(s => (
                        <button
                          key={s}
                          onClick={() => sendMessage(s)}
                          className="chip"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {showAiReminder && (
                    <div className="flex justify-center my-1">
                      <p className="text-[11px] text-slt bg-dark-700/60 rounded-full px-3 py-1 text-center">
                        {t.reminderAiCoach}
                      </p>
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {/* Server-issued Mental Rep cards (PR-9) — kept separate from
              ordinary assistant text; scoped to the current session only. */}
          {!showStartScreen && serverCards.map(card => (
            <ServerCardBubble key={card.prescriptionId} card={card} />
          ))}

          {/* Structured optional reply chips — shown only once the response
              has fully finished, never mid-stream. */}
          {!showStartScreen && !streaming && !waitingForFirst && quickReplies && (
            <QuickReplyChips
              replies={quickReplies}
              onSelect={(label) => sendMessage(label)}
              onWriteMyOwn={() => { setQuickReplies(null); inputRef.current?.focus(); }}
              t={t}
            />
          )}

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

          {showBreakReminder && (
            <div className="mb-3 flex items-center gap-2 bg-dark-700 border border-dark-500 rounded-2xl px-4 py-3">
              <p className="text-xs text-slt flex-1 leading-relaxed">{t.breakReminder}</p>
              <button
                onClick={() => setShowBreakReminder(false)}
                aria-label="Dismiss"
                className="shrink-0 text-slt hover:text-ink transition-colors"
              >
                <X size={14} />
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
