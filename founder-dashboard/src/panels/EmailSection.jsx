import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, Send, Check, Mail, FileText } from 'lucide-react';
import { founderFetch } from '../api';

// Founder Email Center v1 — a compose/test-send/confirm/history tool for
// sending beta/product emails to pilot athletes. Deliberately NOT a full
// inbox: no reply threading, no incoming mail, no attachments, no search.
// Reuses the exact same visual language CommunicationsPanel already
// established (StatChip/Pill-style cards, #1E293B surfaces, #1769AA
// accent) rather than inventing new patterns — small local copies of those
// two presentational helpers live below, same convention CommunicationsPanel
// itself already uses for its own CTA_ROUTES duplication (the server is the
// actual authority on both; this is a labelled picker only).

// Same allowlist the server enforces (routes/founderEmail.js →
// services/founderEmail.js, which re-exports services/pilotCommunications.js's
// CTA_ROUTE_ALLOWLIST — one allowlist, not a second one).
const CTA_ROUTES = [
  { route: '/dashboard', label: 'Home' },
  { route: '/coaching', label: 'Coach' },
  { route: '/train', label: 'Train' },
  { route: '/account', label: 'Profile' },
  { route: '/mind-journal', label: 'Mind Journal' },
  { route: '/self-talk', label: 'Self-Talk' },
  { route: '/focus-deck', label: 'Focus Deck' },
  { route: '/body-reset', label: 'Pressure Reset' },
  { route: '/body-reset/history', label: 'Pressure Reset History' },
  { route: '/mental-rep', label: 'Mental Rep' },
  { route: '/weekly-reviews', label: 'Weekly Reviews' },
  { route: '/ritual', label: 'Ritual' },
  { route: '/visualization', label: 'Visualization' },
  { route: '/starting-profile', label: 'Starting Profile' },
  { route: '/pricing', label: 'Pricing' },
];

// One reusable draft for the current beta re-engagement objective:
// reactivation + natural usage + structured feedback. Loading this NEVER
// sends anything — it only fills the compose form; the founder still has
// to review/edit and explicitly send (Send test to myself / Review & send).
//
// Content-only refresh (v1.1) — the visual polish (logo, card, spacing) is
// the shared template renderer's job now (services/founderEmail.js's
// buildEmailHtml); this draft only supplies the copy, using the same
// "**heading**" / "- bullet" / paragraph markup the renderer has always
// supported. "BETA UPDATE" and the headline are two adjacent heading
// blocks (both render in the renderer's one heading style) rather than a
// distinct eyebrow-label style — a deliberate compromise to avoid adding
// new markup syntax to the shared renderer for one template's sake.
const BETA_UPDATE_TEMPLATE = {
  fromName: 'Arjun',
  subject: 'Arjun Beta Update — help us test the new version',
  previewText: 'Use Arjun naturally for 7 days and help us decide what we improve next.',
  body: `**BETA UPDATE**

**Help us test the latest Arjun**

You're part of a small group helping us shape Arjun before we open it to more athletes.

**What we need from you this week**

- Open Arjun a few times over the next 7 days
- Turn Notifications ON
- Use Arjun naturally around training, competition or difficult moments
- Answer the short in-app questions when they appear

**What's changed**

- Mind Journal is quicker and gives you a useful takeaway
- Home and navigation are simpler
- Push notifications can now give occasional reminders
- Feedback questions can appear directly inside Arjun

Don't try to test everything. We want to learn what you naturally choose to use — and what you ignore.

Thanks for helping us build this properly.`,
  ctaLabel: 'Open Arjun',
  ctaRoute: '/dashboard',
};

const STATUS_LABELS = { SENT: 'Sent', FAILED: 'Failed', DELIVERED: 'Delivered', BOUNCED: 'Bounced' };
const STATUS_COLORS = { SENT: '#22C55E', FAILED: '#EF4444', DELIVERED: '#1769AA', BOUNCED: '#F59E0B' };

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

function Pill({ children, color }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
      style={{ background: `${color}22`, color }}
    >
      {children}
    </span>
  );
}

function StatChip({ label, value }) {
  return (
    <div className="bg-[#0F172A] rounded-lg px-3 py-2 flex-1 min-w-[70px]">
      <div className="text-[10px] text-[#64748B] uppercase tracking-wide">{label}</div>
      <div className="text-base font-bold text-[#F1F5F9]">{value}</div>
    </div>
  );
}

// Small switcher shown at the top of each tool's own "list" root view —
// lets the founder move between Pilot Communications and Email without a
// new bottom-nav tab (Email lives inside the existing Comms tab).
function ToolSwitcher({ active, onSwitch }) {
  return (
    <div className="flex gap-2 bg-[#0F172A] rounded-lg p-1">
      {[{ id: 'comms', label: 'Pilot Comms' }, { id: 'email', label: 'Email' }].map((t) => (
        <button
          key={t.id}
          onClick={() => onSwitch(t.id)}
          className="flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors"
          style={{
            background: active === t.id ? '#1769AA' : 'transparent',
            color: active === t.id ? '#FFFFFF' : '#94A3B8',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Sent history list ──────────────────────────────────────────────────

function CampaignRow({ campaign, onOpen }) {
  return (
    <button
      onClick={() => onOpen(campaign.id)}
      className="w-full text-left bg-[#1E293B] rounded-xl px-4 py-3 space-y-2 active:bg-[#334155] transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#F1F5F9] truncate">{campaign.subject}</p>
        <ChevronRight size={18} className="text-[#475569] shrink-0" />
      </div>
      <p className="text-xs text-[#64748B]">
        Sent {formatDate(campaign.sentAt)} · {campaign.recipientCount} recipient{campaign.recipientCount === 1 ? '' : 's'}
      </p>
      <div className="flex gap-2 flex-wrap">
        <StatChip label="Sent" value={campaign.sentCount} />
        <StatChip label="Failed" value={campaign.failedCount} />
        {campaign.deliveredCount > 0 && <StatChip label="Delivered" value={campaign.deliveredCount} />}
        {campaign.bouncedCount > 0 && <StatChip label="Bounced" value={campaign.bouncedCount} />}
      </div>
    </button>
  );
}

// ── Detail / delivery status view ─────────────────────────────────────

function DetailView({ id, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await founderFetch(`/api/founder/email/${id}`);
      if (!r.ok) throw new Error(`${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className="px-4 pt-5 pb-24 space-y-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-[#94A3B8]"><ChevronLeft size={18} /> Back</button>
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">Failed to load.</div>
      </div>
    );
  }
  if (!data) {
    return <div className="flex items-center justify-center py-16"><RefreshCw size={24} className="animate-spin text-[#1769AA]" /></div>;
  }

  const { campaign: c, deliveries } = data;

  return (
    <div className="px-4 pt-5 pb-24 space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-[#94A3B8] active:text-[#F1F5F9]">
        <ChevronLeft size={18} /> Back
      </button>

      <div className="bg-[#1E293B] rounded-xl p-4 space-y-3">
        <p className="text-base font-bold text-[#F1F5F9]">{c.subject}</p>
        <p className="text-xs text-[#64748B]">
          Sent {formatDate(c.sentAt)} · {c.audienceMode === 'ALL' ? 'All pilot athletes' : 'Selected athletes'}
        </p>
        {c.ctaRoute && <p className="text-xs text-[#64748B]">CTA: <span className="text-[#F1F5F9]">{c.ctaLabel}</span> → {c.ctaRoute}</p>}
        <div className="flex gap-2 flex-wrap pt-1">
          <StatChip label="Sent" value={c.sentCount} />
          <StatChip label="Failed" value={c.failedCount} />
          {c.deliveredCount > 0 && <StatChip label="Delivered" value={c.deliveredCount} />}
          {c.bouncedCount > 0 && <StatChip label="Bounced" value={c.bouncedCount} />}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-[#F1F5F9]">Recipients ({deliveries.length})</p>
        {deliveries.map((d) => (
          <div key={d.userId} className="bg-[#1E293B] rounded-xl px-4 py-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-[#F1F5F9] truncate">{d.name || 'Athlete'}</p>
              <p className="text-xs text-[#64748B] truncate">{d.email}</p>
              <p className="text-[10px] text-[#475569]">{formatDate(d.sentAt || d.failedAt)}{d.resendMessageId ? ` · ${d.resendMessageId}` : ''}</p>
            </div>
            <Pill color={STATUS_COLORS[d.status] || '#64748B'}>{STATUS_LABELS[d.status] || d.status}</Pill>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compose form ────────────────────────────────────────────────────────

function ComposeView({ onCancel, onSent }) {
  const [fromName, setFromName] = useState('Arjun');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [body, setBody] = useState('');
  const [ctaRoute, setCtaRoute] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [audienceUiMode, setAudienceUiMode] = useState('SELECTED'); // 'ONE' | 'SELECTED' | 'ALL'
  const [selectedIds, setSelectedIds] = useState([]);
  const [athletes, setAthletes] = useState(null);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (audienceUiMode === 'ALL' || athletes) return;
    (async () => {
      try {
        const r = await founderFetch('/api/founder/email/athletes');
        if (r.ok) setAthletes((await r.json()).athletes);
      } catch { /* athletes stays null — picker shows "Loading…" */ }
    })();
  }, [audienceUiMode, athletes]);

  function loadTemplate() {
    setFromName(BETA_UPDATE_TEMPLATE.fromName);
    setSubject(BETA_UPDATE_TEMPLATE.subject);
    setPreviewText(BETA_UPDATE_TEMPLATE.previewText);
    setBody(BETA_UPDATE_TEMPLATE.body);
    setCtaLabel(BETA_UPDATE_TEMPLATE.ctaLabel);
    setCtaRoute(BETA_UPDATE_TEMPLATE.ctaRoute);
  }

  function selectAthlete(id) {
    if (audienceUiMode === 'ONE') {
      setSelectedIds((prev) => (prev[0] === id ? [] : [id]));
    } else {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }
  }

  const draft = {
    fromName: fromName.trim(),
    subject: subject.trim(),
    previewText: previewText.trim() || undefined,
    body: body.trim(),
    ctaRoute: ctaRoute || undefined,
    ctaLabel: ctaRoute ? ctaLabel.trim() : undefined,
  };

  const contentValid =
    draft.fromName.length > 0 && draft.fromName.length <= 40 &&
    draft.subject.length > 0 && draft.subject.length <= 150 &&
    draft.body.length > 0 && draft.body.length <= 4000 &&
    (!ctaRoute || ctaLabel.trim().length > 0);

  const audienceValid =
    audienceUiMode === 'ALL' ||
    (audienceUiMode === 'ONE' && selectedIds.length === 1) ||
    (audienceUiMode === 'SELECTED' && selectedIds.length > 0);

  const valid = contentValid && audienceValid;

  async function sendTest() {
    if (!contentValid || testSending) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const r = await founderFetch('/api/founder/email/test', { method: 'POST', body: JSON.stringify(draft) });
      const data = await r.json().catch(() => ({}));
      setTestResult(r.ok ? data.result : 'failed');
    } catch {
      setTestResult('failed');
    } finally {
      setTestSending(false);
    }
  }

  async function sendReal() {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    try {
      const audience = audienceUiMode === 'ALL' ? { mode: 'ALL' } : { mode: 'SELECTED', userIds: selectedIds };
      const r = await founderFetch('/api/founder/email/send', { method: 'POST', body: JSON.stringify({ ...draft, audience }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Could not send.');
      onSent(data.campaign.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  const audienceLabel = audienceUiMode === 'ALL'
    ? 'All pilot athletes'
    : audienceUiMode === 'ONE'
      ? (athletes?.find((a) => a.id === selectedIds[0])?.name || 'No athlete chosen')
      : `${selectedIds.length} selected athlete${selectedIds.length === 1 ? '' : 's'}`;
  const audienceCount = audienceUiMode === 'ALL' ? (athletes?.length ?? null) : selectedIds.length;

  if (confirming) {
    return (
      <div className="px-4 pt-5 pb-24 space-y-5">
        <button onClick={() => setConfirming(false)} className="flex items-center gap-1 text-sm text-[#94A3B8]"><ChevronLeft size={18} /> Back</button>
        <div className="bg-[#1E293B] rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-[#F1F5F9]">Ready to send</p>
          <p className="text-xs text-[#64748B]">Subject: <span className="text-[#F1F5F9]">{draft.subject}</span></p>
          <p className="text-xs text-[#64748B]">
            Audience: <span className="text-[#F1F5F9]">{audienceLabel}</span>
            {audienceCount !== null && <span className="text-[#F1F5F9]"> ({audienceCount})</span>}
          </p>
          {ctaRoute && <p className="text-xs text-[#64748B]">CTA: <span className="text-[#F1F5F9]">{ctaLabel}</span> → {ctaRoute}</p>}
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={sendReal}
          disabled={sending}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1769AA] text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          <Send size={16} />
          {sending ? 'Sending…' : 'Send email'}
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-5 pb-24 space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="flex items-center gap-1 text-sm text-[#94A3B8]"><ChevronLeft size={18} /> Cancel</button>
        <h1 className="text-base font-bold text-[#F1F5F9]">New email</h1>
        <span className="w-12" />
      </div>

      <button
        onClick={loadTemplate}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[#334155] text-[#94A3B8] text-xs font-semibold active:bg-[#334155] transition-colors"
      >
        <FileText size={14} /> Load Beta Update template
      </button>

      <div className="space-y-1">
        <label className="text-xs text-[#64748B]">From name</label>
        <input
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
          maxLength={40}
          className="w-full bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9]"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-[#64748B]">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={150}
          className="w-full bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9]"
          placeholder="Arjun beta update"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-[#64748B]">Preview text (optional)</label>
        <input
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          maxLength={150}
          className="w-full bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9]"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-[#64748B]">Body — paragraphs, "**heading**" lines, and "- " bullets only</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={10}
          className="w-full bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9] font-mono"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-[#64748B]">CTA (optional — internal destination only)</label>
        <select
          value={ctaRoute}
          onChange={(e) => setCtaRoute(e.target.value)}
          className="w-full bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9]"
        >
          <option value="">No CTA</option>
          {CTA_ROUTES.map((r) => (
            <option key={r.route} value={r.route}>{r.label} ({r.route})</option>
          ))}
        </select>
        {ctaRoute && (
          <input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            maxLength={30}
            placeholder="Button label, e.g. Open Arjun"
            className="w-full mt-2 bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9]"
          />
        )}
      </div>

      <div className="bg-[#1E293B] rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-[#F1F5F9]">Send test to myself</p>
        <p className="text-xs text-[#64748B]">Sends the exact draft above to your own configured test address only — never a pilot athlete.</p>
        <button
          onClick={sendTest}
          disabled={!contentValid || testSending}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[#334155] text-[#F1F5F9] text-sm font-semibold disabled:opacity-40 active:bg-[#334155] transition-colors"
        >
          <Mail size={14} />
          {testSending ? 'Sending test…' : 'Send test to myself'}
        </button>
        {testResult && (
          <p className="text-sm font-semibold" style={{ color: testResult === 'sent' ? '#22C55E' : '#EF4444' }}>
            {testResult === 'sent' ? 'Test sent' : 'Test failed'}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[#64748B]">Audience</label>
        <div className="flex gap-2">
          {[{ id: 'ONE', label: 'One athlete' }, { id: 'SELECTED', label: 'Selected' }, { id: 'ALL', label: 'All pilot' }].map((m) => (
            <button
              key={m.id}
              onClick={() => { setAudienceUiMode(m.id); setSelectedIds([]); }}
              className="flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors"
              style={{
                borderColor: audienceUiMode === m.id ? '#1769AA' : '#334155',
                background: audienceUiMode === m.id ? '#1769AA22' : 'transparent',
                color: audienceUiMode === m.id ? '#1769AA' : '#94A3B8',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        {audienceUiMode !== 'ALL' && (
          <div className="max-h-56 overflow-y-auto space-y-1.5 pt-1">
            {!athletes && <RefreshCw size={18} className="animate-spin text-[#1769AA] mx-auto my-4" />}
            {athletes?.map((a) => {
              const isSel = selectedIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => selectAthlete(a.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors"
                  style={{ borderColor: isSel ? '#1769AA' : '#334155', background: isSel ? '#1769AA22' : 'transparent' }}
                >
                  <span className="text-left min-w-0">
                    <span className="block text-sm text-[#F1F5F9] truncate">{a.name}{a.sport ? ` · ${a.sport}` : ''}</span>
                    <span className="block text-xs text-[#64748B] truncate">{a.email}</span>
                  </span>
                  {isSel && <Check size={16} className="text-[#1769AA] shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={() => setConfirming(true)}
        disabled={!valid}
        className="w-full py-2.5 rounded-lg bg-[#1769AA] text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
      >
        Review &amp; send
      </button>
    </div>
  );
}

// ── Section root ─────────────────────────────────────────────────────────

export default function EmailSection({ onSwitchTool }) {
  const [view, setView] = useState('list'); // 'list' | 'compose' | 'detail'
  const [detailId, setDetailId] = useState(null);
  const [campaigns, setCampaigns] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await founderFetch('/api/founder/email');
      if (!r.ok) throw new Error(`${r.status}`);
      const { campaigns } = await r.json();
      setCampaigns(campaigns);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (view === 'list') load(); }, [view, load]);

  if (view === 'compose') {
    return (
      <div className="flex-1 overflow-y-auto pb-24">
        <ComposeView
          onCancel={() => setView('list')}
          onSent={(id) => { setDetailId(id); setView('detail'); }}
        />
      </div>
    );
  }

  if (view === 'detail' && detailId) {
    return (
      <div className="flex-1 overflow-y-auto pb-24">
        <DetailView id={detailId} onBack={() => setView('list')} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-5 space-y-4">
      <ToolSwitcher active="email" onSwitch={onSwitchTool} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#F1F5F9]">Email</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg bg-[#1E293B] text-[#94A3B8] active:bg-[#334155] disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setView('compose')}
            className="px-3 py-2 rounded-lg bg-[#1769AA] text-white text-sm font-semibold flex items-center gap-1.5 active:opacity-80 transition-opacity"
          >
            <Mail size={16} /> Compose
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          Failed to load sent emails.
        </div>
      )}

      {loading && !campaigns && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={28} className="animate-spin text-[#1769AA]" />
        </div>
      )}

      {campaigns && campaigns.length === 0 && (
        <div className="bg-[#1E293B] rounded-xl p-6 text-center text-sm text-[#64748B]">
          No emails sent yet.
        </div>
      )}

      {campaigns && campaigns.length > 0 && (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <CampaignRow key={c.id} campaign={c} onOpen={(id) => { setDetailId(id); setView('detail'); }} />
          ))}
        </div>
      )}
    </div>
  );
}

export { ToolSwitcher };
