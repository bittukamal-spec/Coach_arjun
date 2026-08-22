import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Info, History, Eye, RotateCcw, ClipboardList, NotebookPen, MessageSquare, Target, RefreshCw, Layers, Dumbbell, GraduationCap, ChevronLeft, X, MoreVertical } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArjunLogo } from '../components/ArjunLogo';
import ConsentBanner, { needsGuardianConsent } from '../components/ConsentBanner';
import { parseArjunMessage, APP_TOOL_CONFIG } from '../utils/parseArjunMessage';
import { shouldShowAiReminder, BREAK_REMINDER_MS } from '../utils/chatReminders';
import { parseServerCardEvent, mergeUniqueServerCard } from '../utils/serverCardEvent';
import { practiceRouteFor } from '../utils/prescriptionPractice';
import { filterInternalMessages, isInternalContent, INTERNAL_CONTENT_FILTERED } from '../utils/internalContentFilter';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr, t) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return t.timeAgoToday;
  if (diff === 1) return t.timeAgoYesterday;
  return t.timeAgoDays(diff);
}

// Coach no longer generates reply chips, but messages stored before that
// change still carry a [SUGGEST: …] tag. This strips it so the marker is
// never visible; the options themselves are deliberately NOT rendered.
// Zero-or-more inside the tag so an empty [SUGGEST:] is stripped too.
function stripSuggestTag(text) {
  return String(text ?? '').replace(/\n?\[SUGGEST:[^\]]*\]/g, '').trimEnd();
}

// Read at reveal time rather than cached, so a mid-session OS change is
// honoured. Guarded for jsdom/older browsers without matchMedia.
function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}


// Progressive-reveal pacing. A calm, quick reveal — deliberately NOT a slow
// typewriter. REVEAL_BUDGET_MS caps the total time for any reply length, so a
// long message reveals several words per tick instead of dragging.
const REVEAL_TICK_MS = 45;
const REVEAL_BUDGET_MS = 1500;

// ─── Sub-components ───────────────────────────────────────────────────────────

function SessionDivider({ sessionKey, date, t }) {
  const def = t.sessions[sessionKey];
  if (!def) return null;
  return (
    <div className="flex items-center gap-2 my-1 animate-fade-in">
      <div className="flex-1 h-px bg-dark-600" />
      <span className="text-caption text-slt whitespace-nowrap">
        {def.icon} {def.title} · {timeAgo(date, t)}
      </span>
      <div className="flex-1 h-px bg-dark-600" />
    </div>
  );
}

function MessageBubble({ message, isStreaming, revealedText }) {
  if (message.role === 'assistant') {
    return <ArjunBubble message={message} isStreaming={isStreaming} revealedText={revealedText} />;
  }
  // Athlete turn: a restrained bubble on the approved selected-surface tint,
  // not the old saturated brand fill. Text stays `text-ink`, which is the
  // high-contrast pairing for this surface in both themes.
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[78%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-ink rounded-[18px] rounded-br-md border"
        style={{ background: 'var(--surface-selected)', borderColor: 'var(--border-hairline)' }}
      >
        {message.content}
      </div>
    </div>
  );
}

// Arjun's turns are plain text, so the waiting indicator is plain too — no
// bubble, aligned with where his reply will appear.
function TypingIndicator() {
  return (
    <div className="flex justify-start px-1">
      <span className="inline-flex gap-1 py-2">
        <span className="w-2 h-2 bg-slt rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-slt rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-slt rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}

// ─── Lucide icon lookup for APP tool cards ────────────────────────────────────

const ICON_MAP = { Eye, RotateCcw, ClipboardList, NotebookPen, MessageSquare, Target, RefreshCw, Layers, Dumbbell, GraduationCap };

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
                      borderLeft: '3px solid var(--accent-amber)',
                      padding: '8px 10px',
                      color: 'var(--accent-amber)',
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
                        background: 'var(--brand-primary)',
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
          <div className="text-body font-semibold text-ink leading-tight">
            {config.label}
          </div>
          <div className="text-caption text-slt mt-0.5">
            {config.sub}
          </div>
        </div>
      </div>
      {config.why && (
        <div className="text-caption text-slt leading-snug">
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

function ServerCardBubble({ card, t }) {
  const navigate = useNavigate();
  // Only practice keys with a real, existing completion flow (PR-12) get a
  // launch link — see prescriptionPractice.js for exactly which ones and
  // why the rest are intentionally absent. Carries the real persisted
  // prescriptionId + practiceKey via route state, the smallest mechanism
  // already used elsewhere in this app (e.g. pendingChatSessionIdRef).
  const practiceRoute = practiceRouteFor(card.practiceKey);

  return (
    <div className="flex justify-start px-1">
      <div className="max-w-[92%] card-elevated overflow-hidden">
        <div className="px-3.5 py-2.5 flex flex-col gap-1.5">
          <p className="text-micro uppercase text-brand-400 font-bold">
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
                borderLeft: '3px solid var(--accent-amber)',
                padding: '8px 10px',
                color: 'var(--accent-amber)',
                marginTop: '2px',
              }}
            >
              {card.cueWord}
            </div>
          )}
          {practiceRoute && (
            <button
              onClick={() => navigate(practiceRoute, {
                state: { prescriptionId: card.prescriptionId, practiceKey: card.practiceKey },
              })}
              className="mt-1 self-start text-xs font-bold text-brand-400 hover:text-brand-300"
            >
              {t.startPractice} ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── QuickReplyChips: deterministic structured choices + "Write my own" ──────
// Renders a small server-issued set of choices (validated: unique ids, short
// non-empty labels) plus one translated "Write my own" chip the client always
// adds itself. Its only remaining caller is the prescription-outcome
// follow-up (PR-13) — Coach's AI-generated reply chips were removed, so
// nothing here is ever model-authored. Tapping a chip reuses the normal
// message-submit path — only its label is ever sent, never its id. The text
// box stays visible and usable regardless.

function QuickReplyChips({ replies, onSelect, onWriteMyOwn, t }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-1">
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

function ArjunBubble({ message, isStreaming, revealedText }) {
  // While a reply is still revealing, paint only the words released so far.
  // `message.content` always holds the complete approved text.
  const revealing = typeof revealedText === 'string';
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
  // Tool cards wait for the full reveal, so a card never appears beside a
  // half-painted sentence.
  const hasTools = !isStreaming && !revealing && appTools.length > 0;

  // Arjun speaks as plain text — no bubble, no avatar, generous spacing
  // between turns. Tool cards keep their own card surface and sit beneath
  // the text rather than inside a shared bubble container.
  return (
    <div className="flex flex-col gap-2 px-1">
      {/* Mid-reveal the partial text is hidden from assistive tech — a single
          complete announcement is made when the reveal finishes, so nothing is
          read out word by word. */}
      <div aria-hidden={revealing ? 'true' : undefined}>
        <ArjunText text={revealing ? revealedText : message.content} isStreaming={isStreaming} />
      </div>
      {hasTools && (
        <div className="flex gap-2 max-w-[92%]">
          {appTools.map(toolId => (
            <AppToolCard key={toolId} toolId={toolId} />
          ))}
        </div>
      )}
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
  const [menuOpen, setMenuOpen]                   = useState(false);
  // Single polite announcement of a COMPLETE reply — never per word.
  const [liveAnnouncement, setLiveAnnouncement]   = useState('');
  // Progressive reveal of an ALREADY-APPROVED reply: { id, words, shown }.
  // Never holds unchecked model output — it is populated only after the
  // stream's `end` event has run the existing content checks.
  const [reveal, setReveal]                       = useState(null);
  const [chatSessionId, setChatSessionId]         = useState(null);
  const [showStartScreen, setShowStartScreen]     = useState(false);
  const [recentSessions, setRecentSessions]       = useState([]);
  const [chatMode, setChatMode]                   = useState('main');
  const [showBreakReminder, setShowBreakReminder] = useState(false);
  const [serverCards, setServerCards]             = useState([]);
  // Deterministic prescription-outcome follow-up choices (PR-13) — a
  // structured control, never an AI-generated reply suggestion. These come
  // from claim-opener's response, never from the model, and are rendered
  // with the QuickReplyChips component. Coach's own AI-generated chips were
  // removed; this control deliberately stays.
  const [outcomeChoices, setOutcomeChoices]       = useState(null);

  const bottomRef               = useRef(null);
  const scrollerRef             = useRef(null);
  // Whether the athlete is parked at the bottom. Captured from their OWN
  // scrolling, before any content growth, so growth never flips it by itself.
  const stickToBottomRef        = useRef(true);
  const scrollRafRef            = useRef(null);
  const inputRef                = useRef(null);
  const streamIdRef             = useRef(null);
  const revealTimerRef          = useRef(null);
  const menuRef                 = useRef(null);
  const menuBtnRef              = useRef(null);
  // Mirrors `reveal` for the send guard, so a reveal in progress blocks a
  // second send without rebuilding the sendMessage callback.
  const revealingRef            = useRef(false);
  const fullStreamText          = useRef('');
  const arjunMsgCountRef        = useRef(0);
  const prefillMsgRef           = useRef(location.state?.prefillMsg ?? null);
  const pendingChatSessionIdRef = useRef(location.state?.chatSessionId ?? null);
  // Entered from the Starting Performance Profile: the athlete already
  // finished confirming it, so Back must not drop them back into that flow.
  // Captured once at mount — every other entry path keeps plain history back.
  const backOverrideRef = useRef(
    location.state?.enteredFromStartingProfile ? (location.state?.returnTo || '/dashboard') : null
  );
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

  // ── Composer visibility ───────────────────────────────────────────────────
  // Arjun is working: generating, or painting an approved reply. The composer
  // is absent for the whole of it, so there is nothing to type into and no
  // second send is possible. Declared above the scroll effects because the
  // layout-aware scroll below depends on the composer re-mounting.
  const busy = streaming || waitingForFirst || !!reveal;
  // The composer SLOT (used to reserve scroll space) vs. whether it is
  // currently mounted. Keeping the reserve constant is what stops the
  // conversation jumping when the composer hides and returns.
  const showComposerArea = !!chatSessionId && !showStartScreen;
  const showComposer     = showComposerArea && !busy;

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  // The conversation is only followed while the athlete is at (or near) the
  // bottom. Scrolling up during a long conversation parks them there; the next
  // reply will not yank them down.
  const NEAR_BOTTOM_PX = 120;

  function handleConversationScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
  }

  // Two frames, deliberately: the first lets React's commit paint, the second
  // reads a settled scrollHeight — so this measures AFTER the revealed text has
  // grown and after the composer has re-mounted, not before. That is the whole
  // fix: the old effect only ran on [messages, waitingForFirst], neither of
  // which changes while a reply reveals or when the composer returns, so the
  // last scroll happened while the message was still empty and the finished
  // reply ended up under the composer.
  const scrollToLatest = useCallback((behavior = 'smooth') => {
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        // Re-checked HERE, not at request time: the athlete may have scrolled
        // away during the two frames spent waiting for layout, and a scroll
        // queued before that must not still yank them down.
        if (!stickToBottomRef.current) return;
        // The bottom sentinel sits above the composer's reserved footprint, so
        // landing on it clears the floating composer and the safe area.
        bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
      });
    });
  }, []);

  // Cancel any pending frame on unmount or when a new request supersedes it.
  useEffect(() => () => {
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
  }, []);

  // New turns and the thinking indicator.
  useEffect(() => {
    scrollToLatest('smooth');
  }, [messages, waitingForFirst, scrollToLatest]);

  // Follows the reply as it reveals, and — the case this fixes — runs once
  // more when `reveal` clears and `showComposer` flips back on, after the
  // browser has applied that layout.
  useLayoutEffect(() => {
    scrollToLatest(reveal ? 'auto' : 'smooth');
  }, [reveal, showComposer, scrollToLatest]);

  // ── Persist messages (with tags) to sessionStorage on every change ────────

  useEffect(() => {
    if (chatSessionId && messages.length > 0) {
      sessionStorage.setItem(`arjun_chat_messages_${chatSessionId}`, JSON.stringify(messages));
    }
  }, [messages, chatSessionId]);

  // ── Keep refs in sync with state ─────────────────────────────────────────

  useEffect(() => { chatSessionIdRef.current = chatSessionId; }, [chatSessionId]);
  useEffect(() => { chatModeRef.current = chatMode; }, [chatMode]);

  // ── Reset temporary server-issued card / outcome-choice state on session
  // switch. Server cards (PR-9) and the deterministic outcome choices
  // (PR-13) are never persisted — they only
  // live for the current loaded session, so switching sessions must not
  // leak them.
  useEffect(() => { setServerCards([]); setOutcomeChoices(null); }, [chatSessionId]);

  // ── Reset the per-entry follow-up-claim guard, and any still-showing
  // outcome choices, when the UI genuinely returns to the chat-entry screen
  // (PR-11 correction / PR-13). Ordinary rerenders while the athlete stays
  // inside the same conversation never flip showStartScreen back to true,
  // so this effect does not fire during them — only an actual return to the
  // entry screen does. A later "Continue with Arjun" tap is then free to
  // claim again for the same chatSessionId; the server's atomic claim (not
  // this guard) is what actually prevents a duplicate opener.
  useEffect(() => {
    if (showStartScreen) {
      followUpClaimedSessionsRef.current.clear();
      setOutcomeChoices(null);
    }
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
        // Secondary defence: hide any assistant message that is unmistakably
        // internal server orchestration. The server never persists these now
        // (validateAthleteText.js); this covers rows stored before that
        // shipped, so scrolling back can't surface one. Logs a fixed code
        // only — never message or athlete content.
        const visible = filterInternalMessages(msgs, (code) => console.warn(`[chat] ${code}`));
        const processed = visible.map(msg => {
          if (msg.role !== 'assistant') return msg;
          const { cleanText, tools } = parseArjunMessage(stripSuggestTag(msg.content));
          return { ...msg, content: cleanText, appTools: tools };
        });
        setMessages(processed);
        // Open at the most recent message, after layout settles.
        stickToBottomRef.current = true;
        scrollToLatest('auto');
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
      // Deterministic prescription-outcome choices (PR-13) — present
      // whenever an outcome is still pending for the opener just claimed,
      // OR for an opener claimed earlier this entry that the athlete
      // hasn't answered yet. Never present once a final outcome has been
      // recorded server-side.
      if (data.outcomePending && Array.isArray(data.outcomeChoices)) {
        setOutcomeChoices(data.outcomeChoices);
      }
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
    // Blocked while generating AND while an approved reply is still revealing.
    if (!trimmed || streaming || revealingRef.current) return;

    const isSessionStart = trimmed.startsWith('__SESSION:');
    const sessionType = forceSessionType !== undefined ? forceSessionType : activeSession;
    const sessionIdToUse = overrideChatSessionId !== undefined ? overrideChatSessionId : chatSessionId;

    if (!overrideContent) setInput('');
    setError('');
    setReveal(null);
    // The athlete just acted, so re-attach to the bottom even if they had
    // scrolled up to re-read something before sending.
    stickToBottomRef.current = true;
    // Clear any deterministic outcome choices immediately — whether this send
    // came from typing, tapping an outcome choice, or tapping "Write my own".
    // A new response (if any) will offer its own fresh set.
    setOutcomeChoices(null);

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
      // Deliberately NO placeholder bubble here. Deltas accumulate off-screen
      // and the thinking indicator stays up until the `end` event has run the
      // content checks below — the athlete never sees unchecked model text.

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
              // Accumulate only — nothing is rendered from a raw delta.
              fullStreamText.current += data.c;
            } else if (data.t === 'end') {
              const { cleanText, tools } = parseArjunMessage(stripSuggestTag(fullStreamText.current));
              // Secondary defence on the live stream too: the server rejects
              // internal orchestration text before it is ever sent, so this
              // should never fire — if it somehow does, drop the bubble
              // rather than render it, and log a fixed code only.
              if (isInternalContent(cleanText)) {
                console.warn(`[chat] ${INTERNAL_CONTENT_FILTERED}`);
                setMessages(prev => prev.filter(m => m.id !== streamId));
                fullStreamText.current = '';
                continue;
              }
              arjunMsgCountRef.current += 1;
              const finalId = data.id ?? streamId;
              // The message carries the COMPLETE approved text from the start,
              // so persistence, copy and assistive tech always see the whole
              // reply; `reveal` only limits how much of it is painted.
              setMessages(prev => [...prev, {
                id: finalId, role: 'assistant', content: cleanText, streaming: false, appTools: tools,
              }]);
              setWaitingForFirst(false);
              const words = cleanText.split(/(\s+)/).filter(w => w.length > 0);
              if (prefersReducedMotion() || words.length === 0) {
                // Reduced motion: the complete approved reply, immediately.
                setLiveAnnouncement(cleanText);
              } else {
                setReveal({ id: finalId, words, shown: 0 });
              }
              fullStreamText.current = '';
            } else if (data.t === 'error') {
              setMessages(prev => prev.filter(m => m.id !== streamId));
              setReveal(null);
              setError(data.message || t.errorRetry);
              setOutcomeChoices(null);
            } else if (data.t === 'card') {
              // Structured server-issued Mental Rep card (PR-9). Validated
              // and deduplicated by prescriptionId; never merged into
              // assistant text, never added to messages, never sent back.
              // A malformed/incomplete payload is silently ignored — the
              // stream keeps processing later events.
              const card = parseServerCardEvent(data);
              if (card) setServerCards(prev => mergeUniqueServerCard(prev, card));
            } else if (data.t === 'quick_replies') {
              // AI-generated reply chips were removed from Coach chat. The
              // branch stays so an event from an older server build is
              // ignored rather than falling through as an unknown chunk.
              // Nothing is parsed, stored or rendered from it.
            }
          } catch { /* malformed chunk */ }
        }
      }
    } catch (err) {
      setWaitingForFirst(false);
      setMessages(prev => prev.filter(m => !m.streaming));
      // A failed generation must never leave a half-revealed reply behind —
      // and the composer comes back so the athlete can retry.
      setReveal(null);
      setError(err.message || t.errorRetry);
      setOutcomeChoices(null);
    } finally {
      setStreaming(false);
      setWaitingForFirst(false);
      streamIdRef.current = null;
      inputRef.current?.focus();
    }
  }, [input, streaming, token, t.errorRetry, activeSession, language, chatSessionId]);

  // ── Progressive reveal ────────────────────────────────────────────────────
  // Presentation only. `reveal` is set exclusively by the stream's `end`
  // handler, AFTER the existing content checks have passed, so nothing
  // unchecked is ever timed onto the screen. The message itself already holds
  // the complete approved text; this only controls how much of it is painted.
  //
  // Pace: a calm reveal that is bounded, not a slow typewriter. Long replies
  // reveal several words per tick so the whole message lands within about a
  // second and a half however long it is.
  const stopReveal = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  // One self-scheduling timeout per step rather than a repeating interval, so
  // there is never a timer left running after the reveal (or the page) ends.
  useEffect(() => {
    if (!reveal || reveal.shown >= reveal.words.length) return undefined;
    const remaining = reveal.words.length - reveal.shown;
    // Bound the whole reveal to ~1.5s: step up the batch size for long replies.
    const step = Math.max(1, Math.ceil(remaining / (REVEAL_BUDGET_MS / REVEAL_TICK_MS)));
    revealTimerRef.current = setTimeout(() => {
      setReveal(cur => {
        if (!cur) return cur;
        const next = Math.min(cur.shown + step, cur.words.length);
        return next === cur.shown ? cur : { ...cur, shown: next };
      });
    }, REVEAL_TICK_MS);
    return stopReveal;
  }, [reveal, stopReveal]);

  // Reveal finished → drop the reveal state so the message renders normally
  // (tools, AI reminder and the composer all key off this) and announce the
  // complete message once, rather than word by word.
  useEffect(() => {
    if (reveal && reveal.shown >= reveal.words.length) {
      stopReveal();
      // join('') — the split keeps its whitespace tokens, so the words
      // reassemble into the exact approved text, not a re-spaced copy.
      setLiveAnnouncement(reveal.words.join(''));
      setReveal(null);
    }
  }, [reveal, stopReveal]);

  useEffect(() => { revealingRef.current = !!reveal; }, [reveal]);

  // Timers must not outlive the page or a session change.
  useEffect(() => stopReveal, [stopReveal]);

  // ── Overflow menu ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setMenuOpen(false); menuBtnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

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
          {t.retryBtn}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-dark-900 relative">

      {/* ── Header ──────────────────────────────────────────────────────────
          Minimal and integrated: the header sits ON the chat background in
          both themes rather than on the near-black nav surface, so Coach reads
          as one calm space instead of a heavy bar above a page. Because the
          surface now follows the theme, foregrounds use the ordinary theme
          tokens. No divider — separation comes from spacing alone.
          History and Info keep their exact behaviour; they moved into the
          overflow menu so the header carries one action, not three. */}
      <header className="shrink-0 bg-dark-900 px-4 py-2.5 relative pt-[calc(0.625rem+env(safe-area-inset-top))]">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => (backOverrideRef.current
                ? navigate(backOverrideRef.current, { replace: true })
                : navigate(-1))}
              className="w-11 h-11 -ml-2.5 flex items-center justify-center shrink-0 rounded-full text-slt hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label={t.backAria}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <ArjunLogo size={32} ariaLabel="Arjun logo" className="shrink-0" />
            <div className="min-w-0">
              <h1 className="text-[21px] font-extrabold leading-none tracking-[-0.02em] text-ink">{t.title}</h1>
            </div>
          </div>

          {/* Overflow menu — one control, keyboard operable, closes on Escape
              (returning focus to the trigger) and on an outside click. */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              ref={menuBtnRef}
              onClick={() => { setMenuOpen(o => !o); setShowSafety(false); }}
              aria-label={t.moreOptionsAria}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              className="w-11 h-11 -mr-2.5 flex items-center justify-center rounded-full text-slt hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <MoreVertical size={18} aria-hidden="true" />
            </button>

            {/* A plain disclosure popover, deliberately NOT role="menu": that
                role overrides the native link/button roles and promises
                arrow-key menu navigation. Keeping the native elements means
                Tab order, Enter/Space and screen-reader roles all behave the
                way they already did in the header. */}
            {menuOpen && (
              <div
                aria-label={t.moreOptionsAria}
                className="absolute right-0 top-full mt-1 z-30 min-w-[200px] rounded-2xl border py-1.5 shadow-card animate-fade-in"
                style={{ background: 'var(--surface-card)', borderColor: 'var(--border-hairline)' }}
              >
                {/* Weekly Reviews — same destination and behaviour as before. */}
                <Link
                  to="/weekly-reviews"
                  onClick={() => setMenuOpen(false)}
                  className="w-full min-h-[44px] flex items-center gap-3 px-4 text-sm text-ink hover:bg-dark-700 focus-visible:outline-none focus-visible:bg-dark-700"
                  aria-label={t.weeklyReviewsLabel}
                >
                  <History size={16} className="shrink-0 text-slt" aria-hidden="true" />
                  <span>{t.weeklyReviewsLabel}</span>
                </Link>
                {/* Safety info — same popover content as before. */}
                <button
                  type="button"
                  onClick={() => { setShowSafety(v => !v); setMenuOpen(false); }}
                  aria-label={t.safetyInfoAria}
                  className="w-full min-h-[44px] flex items-center gap-3 px-4 text-sm text-ink hover:bg-dark-700 focus-visible:outline-none focus-visible:bg-dark-700"
                >
                  <Info size={16} className="shrink-0 text-slt" aria-hidden="true" />
                  <span>{t.safetyInfoAria}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {showSafety && (
          <div className="absolute left-4 right-4 top-full mt-1 z-20 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 shadow-lg">
            <p className="text-xs text-slt">{t.safetyNote}</p>
            <p className="text-xs text-slt mt-1">{t.safetyHelpline}</p>
          </div>
        )}
      </header>

      {/* ── Messages area ────────────────────────────────────────────────
          Edge-to-edge: the conversation owns the full width inside the page
          gutter, with generous vertical space between turns now that Arjun's
          replies are plain text rather than bubbles. */}
      <div
        ref={scrollerRef}
        onScroll={handleConversationScroll}
        className="flex-1 overflow-y-auto px-3 py-4 relative"
      >
        <div className="max-w-2xl mx-auto flex flex-col gap-5">

          {/* Entry choice screen — shown when no session is active */}
          {showStartScreen && !waitingForFirst && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 animate-fade-in">
              {consentPending && <div className="w-full"><ConsentBanner /></div>}
              <h2 className="text-title font-bold text-ink mb-2 text-center">{t.entry.heading}</h2>
              <p className="text-body text-slt text-center mb-6 leading-relaxed max-w-xs">{t.entry.description}</p>
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
                <p className="text-caption text-slt text-center">{t.entry.continue.sub}</p>
              </div>
            </div>
          )}

          {/* No weekly report or summary card is ever rendered inside the
              live message stream — weekly coaching reviews live on their
              own /weekly-reviews page (reached from the header icon), so
              the stream opens at the most recent active-cycle message. */}

          {/* Empty state — no messages in last 7 days */}
          {!showStartScreen && messages.length === 0 && !waitingForFirst && (
            <div className="flex items-center justify-center min-h-[50vh]">
              <p className="text-sm text-muted text-center">{t.emptyPrompt}</p>
            </div>
          )}

          {/* Message list */}
          {!showStartScreen && (() => {
            let assistantReplyIndex = 0;
            return messages.map((msg, i) => {
              const prevMsg = messages[i - 1];
              const showDivider = msg.sessionType && msg.sessionType !== prevMsg?.sessionType && i > 0;
              // Recurring AI-coach reminder: purely a render-time notice —
              // never added to `messages`, never sent to the server, and it
              // never touches arjunMsgCountRef (the count coaching logic
              // uses server-side).
              if (msg.role === 'assistant' && !msg.streaming) assistantReplyIndex += 1;
              const isRevealing = reveal?.id === msg.id;
              // The reminder waits for the complete reply, like the tool cards.
              const showAiReminder = msg.role === 'assistant' && !msg.streaming && !isRevealing
                && shouldShowAiReminder(assistantReplyIndex);
              return (
                <div key={msg.id} className="flex flex-col gap-2">
                  {showDivider && <SessionDivider sessionKey={msg.sessionType} date={msg.createdAt} t={t} />}
                  <MessageBubble
                    message={msg}
                    isStreaming={msg.streaming}
                    revealedText={isRevealing ? reveal.words.slice(0, reveal.shown).join('') : undefined}
                  />
                  {showAiReminder && (
                    <div className="flex justify-center my-1">
                      <p className="text-caption text-slt bg-dark-700/60 rounded-full px-3 py-1 text-center">
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
            <ServerCardBubble key={card.prescriptionId} card={card} t={t} />
          ))}

          {/* Deterministic prescription-outcome choices (PR-13) — a structured
              control, not an AI reply suggestion; tapping one sends only its
              label through the normal chat path. Coach's AI-generated chips
              were removed; this deliberately stays. */}
          {!showStartScreen && !streaming && !waitingForFirst && !reveal && outcomeChoices && (
            <QuickReplyChips
              replies={outcomeChoices}
              onSelect={(label) => sendMessage(label)}
              onWriteMyOwn={() => { setOutcomeChoices(null); inputRef.current?.focus(); }}
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

          {/* One polite announcement per COMPLETE reply. Never per word, and
              never a partial sentence — this is the only live region in the
              conversation, so there is no announcement spam. */}
          <p className="sr-only" role="status" aria-live="polite">{liveAnnouncement}</p>

          {/* Reserves the floating composer's footprint (pill + gutters + safe
              area) INSIDE the scroll area, placed ABOVE the bottom sentinel so
              scrolling the sentinel into view lands past it. As page padding
              it sat BELOW the sentinel, so the scroll stopped short and the
              finished reply hid behind the composer. The reserve is constant
              whether or not the composer is mounted, so it never jumps. */}
          {showComposerArea && (
            <div
              aria-hidden="true"
              className="shrink-0"
              style={{ height: 'calc(5.25rem + env(safe-area-inset-bottom))' }}
            />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input area ────────────────────────────────────────────────────
           A minimal control floating over the conversation: no separator
           line, no panel. It is absolutely positioned so mounting and
           unmounting it never reflows the message list — the scroll area
           already reserves its footprint above.
           Hidden entirely while Arjun is generating or a reply is revealing;
           it returns as soon as the reply completes or an error is shown. */}
      {chatSessionId && !showStartScreen && showComposer && (
      <div className="absolute left-0 right-0 bottom-0 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 pointer-events-none">
        <div className="max-w-2xl mx-auto relative pointer-events-auto">

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

          {/* One rounded pill holds both the input and the send affordance,
              so there is a single composer surface rather than a boxed field
              plus a detached button. Send state logic below is unchanged. */}
          <div
            className="flex gap-2 items-end rounded-[24px] border pl-4 pr-1.5 py-1.5 focus-within:ring-2 focus-within:ring-brand-500 transition-shadow"
            style={{ background: 'var(--surface-card)', borderColor: 'var(--border-hairline)' }}
          >
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
              className="flex-1 resize-none bg-transparent border-0 text-ink py-2.5 text-sm focus:outline-none focus:ring-0 placeholder:text-muted disabled:opacity-50 disabled:cursor-not-allowed max-h-32 overflow-y-auto"
              style={{ minHeight: '38px' }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
            />
            {/* Send — inline inside the pill. Disabled while empty, sending
                or at limit, exactly as before. */}
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || streaming || atLimit}
              className="w-11 h-11 bg-brand-500 text-white rounded-full flex items-center justify-center hover:bg-brand-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              aria-label={t.send}
            >
              {streaming ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
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
