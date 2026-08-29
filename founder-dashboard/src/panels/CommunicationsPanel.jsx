import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, Send, Plus, X, Check } from 'lucide-react';
import { founderFetch } from '../api';

// Pilot Communications v1 — founder surface. Reuses the exact visual
// language already established by PilotPanel/SafetyPanel (StatCard-style
// cards, #1E293B surfaces, #1769AA accent, Pill/Badge chips) rather than
// inventing new patterns.

// Same allowlist the server enforces (routes/founderPilotCommunications.js
// → services/pilotCommunications.js CTA_ROUTE_ALLOWLIST). Duplicated here
// only as a labelled picker for the founder — the server is the actual
// authority and re-validates on every create.
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

const RESPONSE_TYPES = [
  { id: 'YES_SOMEWHAT_NO', label: 'Yes / Somewhat / No' },
  { id: 'RATING_1_5', label: '1–5 rating' },
  { id: 'CUSTOM_SINGLE_CHOICE', label: 'Custom (2–5 options)' },
];

const STATUS_LABELS = {
  not_seen: 'Not seen',
  seen: 'Seen',
  deferred: 'Not now',
  dismissed: 'Dismissed',
  responded: 'Responded',
};
const STATUS_COLORS = {
  not_seen: '#64748B',
  seen: '#1769AA',
  deferred: '#F59E0B',
  dismissed: '#94A3B8',
  responded: '#22C55E',
};

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

// ── List row ─────────────────────────────────────────────────────────────

function CommRow({ comm, onOpen }) {
  return (
    <button
      onClick={() => onOpen(comm.id)}
      className="w-full text-left bg-[#1E293B] rounded-xl px-4 py-3 space-y-2 active:bg-[#334155] transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Pill color={comm.type === 'SURVEY' ? '#1769AA' : '#8B5CF6'}>{comm.type === 'SURVEY' ? 'Survey' : 'Announcement'}</Pill>
          <Pill color={comm.isActive ? '#22C55E' : '#64748B'}>{comm.isActive ? 'Active' : 'Inactive'}</Pill>
        </div>
        <ChevronRight size={18} className="text-[#475569] shrink-0" />
      </div>
      <p className="text-sm font-semibold text-[#F1F5F9] truncate">{comm.title}</p>
      <p className="text-xs text-[#64748B]">
        {comm.publishedAt ? `Published ${formatDate(comm.publishedAt)}` : 'Draft — not published'}
        {' · '}{comm.audienceMode === 'ALL' ? 'All pilot' : 'Selected'}
      </p>
      <div className="flex gap-2 flex-wrap">
        <StatChip label="Targeted" value={comm.targetCount} />
        <StatChip label="Seen" value={comm.seenCount} />
        {comm.type === 'SURVEY' && <StatChip label="Responded" value={comm.respondedCount} />}
        <StatChip label="Dismissed" value={comm.dismissedCount} />
      </div>
    </button>
  );
}

// ── Detail / results view ───────────────────────────────────────────────

function DetailView({ id, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await founderFetch(`/api/founder/pilot-communications/${id}`);
      if (!r.ok) throw new Error(`${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function deactivate() {
    setBusy(true);
    try {
      const r = await founderFetch(`/api/founder/pilot-communications/${id}/deactivate`, { method: 'PATCH' });
      if (!r.ok) throw new Error('Could not deactivate.');
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

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

  const { communication: c, athletes, breakdown } = data;

  return (
    <div className="px-4 pt-5 pb-24 space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-[#94A3B8] active:text-[#F1F5F9]">
        <ChevronLeft size={18} /> Back
      </button>

      <div className="bg-[#1E293B] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Pill color={c.type === 'SURVEY' ? '#1769AA' : '#8B5CF6'}>{c.type === 'SURVEY' ? 'Survey' : 'Announcement'}</Pill>
          <Pill color={c.isActive ? '#22C55E' : '#64748B'}>{c.isActive ? 'Active' : 'Inactive'}</Pill>
        </div>
        <p className="text-base font-bold text-[#F1F5F9]">{c.title}</p>
        <p className="text-sm text-[#94A3B8] leading-relaxed">{c.body}</p>
        <div className="flex gap-2 flex-wrap pt-1">
          <StatChip label="Targeted" value={c.targetCount} />
          <StatChip label="Seen" value={c.seenCount} />
          {c.type === 'SURVEY' && <StatChip label="Responded" value={c.respondedCount} />}
          <StatChip label="Dismissed" value={c.dismissedCount} />
        </div>
      </div>

      {breakdown && (
        <div className="bg-[#1E293B] rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-[#F1F5F9]">Responses</p>
          {Object.entries(breakdown).map(([key, count]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-[#94A3B8]">{key}</span>
              <span className="text-[#F1F5F9] font-semibold">{count}</span>
            </div>
          ))}
        </div>
      )}

      {c.isActive && (
        <button
          onClick={deactivate}
          disabled={busy}
          className="w-full py-2.5 rounded-lg border border-[#334155] text-[#94A3B8] text-sm font-semibold active:bg-[#334155] disabled:opacity-40 transition-colors"
        >
          {busy ? 'Deactivating…' : 'Deactivate'}
        </button>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-[#F1F5F9]">Targeted athletes ({athletes.length})</p>
        {athletes.map((a) => (
          <div key={a.userId} className="bg-[#1E293B] rounded-xl px-4 py-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-[#F1F5F9] truncate">{a.firstName}{a.sport ? ` · ${a.sport}` : ''}</p>
              {a.responseValue && <p className="text-xs text-[#64748B]">Answered: {a.responseValue}</p>}
            </div>
            <Pill color={STATUS_COLORS[a.status]}>{STATUS_LABELS[a.status]}</Pill>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Create form ──────────────────────────────────────────────────────────

function CreateView({ onCancel, onCreated }) {
  const [type, setType] = useState('ANNOUNCEMENT');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ctaRoute, setCtaRoute] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [responseType, setResponseType] = useState('YES_SOMEWHAT_NO');
  const [customOptions, setCustomOptions] = useState(['', '']);
  const [audienceMode, setAudienceMode] = useState('ALL');
  const [athletes, setAthletes] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (audienceMode !== 'SELECTED' || athletes) return;
    (async () => {
      try {
        const r = await founderFetch('/api/founder/pilot-communications/athletes');
        if (r.ok) setAthletes((await r.json()).athletes);
      } catch { /* handled by disabled Publish state below */ }
    })();
  }, [audienceMode, athletes]);

  function toggleSelected(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updateOption(i, value) {
    setCustomOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addOption() {
    setCustomOptions((prev) => (prev.length < 5 ? [...prev, ''] : prev));
  }
  function removeOption(i) {
    setCustomOptions((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const trimmedOptions = customOptions.map((o) => o.trim()).filter(Boolean);
  const valid =
    title.trim().length > 0 && title.trim().length <= 100 &&
    body.trim().length > 0 && body.trim().length <= 500 &&
    (!ctaRoute || ctaLabel.trim().length > 0) &&
    (type === 'ANNOUNCEMENT' || responseType !== 'CUSTOM_SINGLE_CHOICE' || (trimmedOptions.length >= 2 && trimmedOptions.length <= 5)) &&
    (audienceMode === 'ALL' || selectedIds.length > 0);

  async function publish() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        type,
        title: title.trim(),
        body: body.trim(),
        ctaRoute: ctaRoute || undefined,
        ctaLabel: ctaRoute ? ctaLabel.trim() : undefined,
        responseType: type === 'SURVEY' ? responseType : undefined,
        responseOptions: type === 'SURVEY' && responseType === 'CUSTOM_SINGLE_CHOICE' ? trimmedOptions : undefined,
        audience: audienceMode === 'ALL' ? { mode: 'ALL' } : { mode: 'SELECTED', userIds: selectedIds },
      };
      const createRes = await founderFetch('/api/founder/pilot-communications', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        throw new Error(body.error || 'Could not create communication.');
      }
      const { communication } = await createRes.json();
      const publishRes = await founderFetch(`/api/founder/pilot-communications/${communication.id}/publish`, {
        method: 'POST',
      });
      if (!publishRes.ok) throw new Error('Created, but could not publish.');
      onCreated(communication.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const selectedAthleteLabel = audienceMode === 'ALL'
    ? 'All pilot athletes'
    : `${selectedIds.length} selected athlete${selectedIds.length === 1 ? '' : 's'}`;

  if (confirming) {
    return (
      <div className="px-4 pt-5 pb-24 space-y-5">
        <button onClick={() => setConfirming(false)} className="flex items-center gap-1 text-sm text-[#94A3B8]"><ChevronLeft size={18} /> Back</button>
        <div className="bg-[#1E293B] rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-[#F1F5F9]">Ready to publish</p>
          <p className="text-xs text-[#64748B]">Audience: <span className="text-[#F1F5F9]">{selectedAthleteLabel}</span></p>
          <p className="text-sm text-[#F1F5F9] font-semibold pt-2">{title}</p>
          <p className="text-sm text-[#94A3B8]">{body}</p>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={publish}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1769AA] text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          <Send size={16} />
          {saving ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-5 pb-24 space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="flex items-center gap-1 text-sm text-[#94A3B8]"><ChevronLeft size={18} /> Cancel</button>
        <h1 className="text-base font-bold text-[#F1F5F9]">New communication</h1>
        <span className="w-12" />
      </div>

      <div className="flex gap-2">
        {['ANNOUNCEMENT', 'SURVEY'].map((v) => (
          <button
            key={v}
            onClick={() => setType(v)}
            className="flex-1 text-sm font-semibold py-2 rounded-lg border transition-colors"
            style={{
              borderColor: type === v ? '#1769AA' : '#334155',
              background: type === v ? '#1769AA22' : 'transparent',
              color: type === v ? '#1769AA' : '#94A3B8',
            }}
          >
            {v === 'ANNOUNCEMENT' ? 'Announcement' : 'Survey'}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <label className="text-xs text-[#64748B]">Title (max 100)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          className="w-full bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9]"
          placeholder={type === 'SURVEY' ? 'How easy was signup?' : 'New feature: Focus Deck'}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-[#64748B]">Body (max 500)</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={3}
          className="w-full bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9]"
        />
      </div>

      {type === 'SURVEY' && (
        <div className="space-y-2">
          <label className="text-xs text-[#64748B]">Response format</label>
          <div className="flex flex-col gap-2">
            {RESPONSE_TYPES.map((rt) => (
              <button
                key={rt.id}
                onClick={() => setResponseType(rt.id)}
                className="text-left text-sm font-medium px-3 py-2.5 rounded-lg border transition-colors"
                style={{
                  borderColor: responseType === rt.id ? '#1769AA' : '#334155',
                  background: responseType === rt.id ? '#1769AA22' : 'transparent',
                  color: responseType === rt.id ? '#1769AA' : '#94A3B8',
                }}
              >
                {rt.label}
              </button>
            ))}
          </div>
          {responseType === 'CUSTOM_SINGLE_CHOICE' && (
            <div className="space-y-2 pt-1">
              {customOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    maxLength={40}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2 text-sm text-[#F1F5F9]"
                  />
                  {customOptions.length > 2 && (
                    <button onClick={() => removeOption(i)} className="text-[#64748B]"><X size={16} /></button>
                  )}
                </div>
              ))}
              {customOptions.length < 5 && (
                <button onClick={addOption} className="text-xs text-[#1769AA] font-semibold flex items-center gap-1">
                  <Plus size={14} /> Add option
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
            placeholder="Button label, e.g. Open Focus Deck"
            className="w-full mt-2 bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9]"
          />
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[#64748B]">Audience</label>
        <div className="flex gap-2">
          {['ALL', 'SELECTED'].map((m) => (
            <button
              key={m}
              onClick={() => setAudienceMode(m)}
              className="flex-1 text-sm font-semibold py-2 rounded-lg border transition-colors"
              style={{
                borderColor: audienceMode === m ? '#1769AA' : '#334155',
                background: audienceMode === m ? '#1769AA22' : 'transparent',
                color: audienceMode === m ? '#1769AA' : '#94A3B8',
              }}
            >
              {m === 'ALL' ? 'All pilot athletes' : 'Selected athletes'}
            </button>
          ))}
        </div>
        {audienceMode === 'SELECTED' && (
          <div className="max-h-56 overflow-y-auto space-y-1.5 pt-1">
            {!athletes && <RefreshCw size={18} className="animate-spin text-[#1769AA] mx-auto my-4" />}
            {athletes?.map((a) => {
              const isSel = selectedIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggleSelected(a.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors"
                  style={{ borderColor: isSel ? '#1769AA' : '#334155', background: isSel ? '#1769AA22' : 'transparent' }}
                >
                  <span className="text-sm text-[#F1F5F9]">{a.firstName}{a.sport ? ` · ${a.sport}` : ''}</span>
                  {isSel && <Check size={16} className="text-[#1769AA]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={() => setConfirming(true)}
        disabled={!valid}
        className="w-full py-2.5 rounded-lg bg-[#1769AA] text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
      >
        Review &amp; publish
      </button>
    </div>
  );
}

// ── Send test notification ──────────────────────────────────────────────
// Push Notifications v1 — operational testing utility only. Sends ONE
// immediate push to ONE founder-selected pilot athlete's active device(s),
// using the exact same approved curated copy (server/src/services/
// pushSend.js) and '/dashboard' destination the real 18:00 scheduler
// uses — no custom free-text content, no athlete/journal/Coach data, no
// broadcast. Never touches lastSentLocalDate, so it never consumes or
// interferes with that athlete's normal daily scheduled reminder, and it
// is entirely separate from Pilot Communications (no communication row is
// ever created by this action).

const TEST_RESULT_LABELS = {
  sent: 'Sent',
  no_subscription: 'No active notification subscription',
  failed: 'Delivery failed',
};
const TEST_RESULT_COLORS = {
  sent: '#22C55E',
  no_subscription: '#64748B',
  failed: '#EF4444',
};

function TestPushSender() {
  const [athletes, setAthletes] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await founderFetch('/api/founder/pilot-communications/athletes');
        if (r.ok) setAthletes((await r.json()).athletes);
      } catch { /* athletes stays null — picker shows "Loading…" and disables Send */ }
    })();
  }, []);

  async function send() {
    if (!selectedId || sending) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const r = await founderFetch('/api/founder/push-test', {
        method: 'POST',
        body: JSON.stringify({ userId: selectedId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Could not send test notification.');
      setResult(data.result);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-[#1E293B] rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-[#F1F5F9]">Send test notification</p>
      <p className="text-xs text-[#64748B]">
        One immediate push using the approved reminder copy. Doesn&apos;t affect the athlete&apos;s normal 18:00 reminder.
      </p>
      <select
        value={selectedId}
        onChange={(e) => { setSelectedId(e.target.value); setResult(null); setError(null); }}
        className="w-full bg-[#0F172A] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9]"
      >
        <option value="">{athletes ? 'Select an athlete…' : 'Loading athletes…'}</option>
        {athletes?.map((a) => (
          <option key={a.id} value={a.id}>{a.firstName}{a.sport ? ` · ${a.sport}` : ''}</option>
        ))}
      </select>
      <button
        onClick={send}
        disabled={!selectedId || sending}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1769AA] text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
      >
        <Send size={16} />
        {sending ? 'Sending…' : 'Send test notification'}
      </button>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {result && (
        <p className="text-sm font-semibold" style={{ color: TEST_RESULT_COLORS[result] || '#94A3B8' }}>
          {TEST_RESULT_LABELS[result] || result}
        </p>
      )}
    </div>
  );
}

// ── Panel root ───────────────────────────────────────────────────────────

export default function CommunicationsPanel() {
  const [view, setView] = useState('list'); // 'list' | 'create' | 'detail'
  const [detailId, setDetailId] = useState(null);
  const [communications, setCommunications] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await founderFetch('/api/founder/pilot-communications');
      if (!r.ok) throw new Error(`${r.status}`);
      const { communications } = await r.json();
      setCommunications(communications);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (view === 'list') load(); }, [view, load]);

  if (view === 'create') {
    return (
      <div className="flex-1 overflow-y-auto pb-24">
        <CreateView
          onCancel={() => setView('list')}
          onCreated={(id) => { setDetailId(id); setView('detail'); }}
        />
      </div>
    );
  }

  if (view === 'detail' && detailId) {
    return (
      <div className="flex-1 overflow-y-auto pb-24">
        <DetailView id={detailId} onBack={() => setView('list')} onChanged={load} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-5 space-y-4">
      <TestPushSender />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#F1F5F9]">Communications</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg bg-[#1E293B] text-[#94A3B8] active:bg-[#334155] disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setView('create')}
            className="p-2 rounded-lg bg-[#1769AA] text-white active:opacity-80 transition-opacity"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          Failed to load communications.
        </div>
      )}

      {loading && !communications && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={28} className="animate-spin text-[#1769AA]" />
        </div>
      )}

      {communications && communications.length === 0 && (
        <div className="bg-[#1E293B] rounded-xl p-6 text-center text-sm text-[#64748B]">
          No communications yet.
        </div>
      )}

      {communications && communications.length > 0 && (
        <div className="space-y-2">
          {communications.map((c) => (
            <CommRow key={c.id} comm={c} onOpen={(id) => { setDetailId(id); setView('detail'); }} />
          ))}
        </div>
      )}
    </div>
  );
}
