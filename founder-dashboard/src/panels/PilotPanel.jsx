import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { founderFetch } from '../api';
import StatCard from '../components/StatCard';

// Founder Pilot Overview — Phase 1 (funnel) + Phase 2B (engagement:
// Active 24h/7d, Returning, last-active on Recent Athletes). Aggregate,
// privacy-conscious pilot metrics derived entirely from data the product
// already records for its own operation. No page-view/click tracking, no
// third-party analytics SDK, no fake/placeholder numbers — every number
// here comes straight from GET /api/founder/pilot-overview.

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

// Concise, non-deceptive relative label for Recent Athletes. `now` is
// injectable (defaults to the real clock) purely so this stays testable —
// the panel itself always calls it with no second argument.
function formatLastActive(iso, now = Date.now()) {
  if (!iso) return 'No activity yet';
  const diffMs = now - new Date(iso).getTime();
  if (diffMs < 0) return 'Last active: just now';
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return 'Last active: just now';
  if (hours < 24) return `Last active: ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Last active: Yesterday';
  return `Last active: ${days}d ago`;
}

// Pilot Presence Tracking — deliberately the OTHER label from
// formatLastActive above. "Seen" describes mere app-open/foreground
// presence (User.lastSeenAt); it must never be confused with, or reuse the
// wording of, meaningful product activity. `now` is injectable for tests,
// same convention as formatLastActive.
function formatLastSeen(iso, now = Date.now()) {
  if (!iso) return 'Never seen';
  const diffMs = now - new Date(iso).getTime();
  if (diffMs < 0) return 'Seen just now';
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 1) return 'Seen just now';
  if (minutes < 60) return `Seen ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Seen ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Seen yesterday';
  return `Seen ${days}d ago`;
}

// Founder Dashboard auto-refresh — approximately every 45s (within the
// product's 30-60s guidance) while the Pilot view is mounted AND the
// browser tab is visible; paused (not just left running unseen) while
// hidden. No WebSocket/SSE — this pilot stays on a plain poll.
const POLL_INTERVAL_MS = 45 * 1000;

const FUNNEL_LABELS = {
  signedUp: 'Signed up',
  completedOnboarding: 'Completed onboarding',
  usedCoach: 'Used Coach',
  receivedMentalRep: 'Received Mental Rep',
  completedMentalRep: 'Completed Mental Rep',
  reportedOutcome: 'Reported outcome',
};

const GUARDIAN_LABELS = {
  not_required: 'N/A',
  pending: 'Pending',
  confirmed: 'Confirmed',
};

const GUARDIAN_COLORS = {
  not_required: '#64748B',
  pending: '#F59E0B',
  confirmed: '#22C55E',
};

function FunnelRow({ stage, count, percent }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#F1F5F9]">{FUNNEL_LABELS[stage] || stage}</span>
        <span className="text-[#94A3B8]">{count} <span className="text-[#64748B]">({percent}%)</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-[#334155] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#1769AA] transition-all"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
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

// Pilot Presence Tracking — always rendered as its own line, never merged
// into or worded like the meaningful-activity line below it.
function PresenceLine({ athlete }) {
  if (athlete.isLive) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#22C55E]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
        Live
      </span>
    );
  }
  return <span className="text-xs text-[#64748B]">{formatLastSeen(athlete.lastSeenAt)}</span>;
}

// Pilot Access (beta entitlement override) — founder-only, per-athlete.
// Grant sets a 60-day window from now; Revoke clears it immediately. Both
// hit routes/founderPilotAccess.js, the only writer of these two columns.
// `busy` disables both buttons while a request for THIS athlete is in
// flight; other rows stay interactive.
function PilotAccessRow({ athlete, busy, onGrant, onRevoke }) {
  return (
    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#334155]">
      <span className="text-xs text-[#94A3B8]">
        Pilot access:{' '}
        {athlete.pilotAccessActive
          ? <span className="text-[#22C55E] font-semibold">Active until {formatDate(athlete.pilotAccessUntil)}</span>
          : <span className="text-[#64748B]">{athlete.pilotAccessUntil ? 'Expired' : 'None'}</span>}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onGrant(athlete.id)}
          disabled={busy}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#1769AA] text-white active:bg-[#125685] disabled:opacity-40 transition-colors"
        >
          Grant 60 days
        </button>
        <button
          onClick={() => onRevoke(athlete.id)}
          disabled={busy || !athlete.pilotAccessActive}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#334155] text-[#F1F5F9] active:bg-[#3F4C63] disabled:opacity-40 transition-colors"
        >
          Revoke
        </button>
      </div>
    </div>
  );
}

function AthleteRow({ athlete, pilotActionBusyId, onGrantPilotAccess, onRevokePilotAccess }) {
  return (
    <div className="bg-[#1E293B] rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[#F1F5F9] truncate">{athlete.firstName}</span>
        <span className="text-xs text-[#64748B] shrink-0">{formatDate(athlete.signupDate)}</span>
      </div>
      <PresenceLine athlete={athlete} />
      <div className="text-xs text-[#64748B]">{formatLastActive(athlete.lastActiveAt)}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Pill color={athlete.onboardingDone ? '#22C55E' : '#64748B'}>
          {athlete.onboardingDone ? 'Onboarded' : 'Onboarding pending'}
        </Pill>
        <Pill color={athlete.coachUsed ? '#22C55E' : '#64748B'}>
          {athlete.coachUsed ? 'Coach used' : 'No Coach yet'}
        </Pill>
        {athlete.mentalRepReceived && (
          <Pill color={athlete.mentalRepCompleted ? '#22C55E' : '#F59E0B'}>
            {athlete.mentalRepCompleted ? 'Mental Rep done' : 'Mental Rep active'}
          </Pill>
        )}
        {athlete.outcomeReported && <Pill color="#22C55E">Outcome reported</Pill>}
        {athlete.isReturning && <Pill color="#1769AA">Returning</Pill>}
        <Pill color={athlete.tier === 'premium' ? '#1769AA' : '#64748B'}>
          {athlete.tier === 'premium' ? 'Premium' : 'Free'}
        </Pill>
        {athlete.pilotAccessActive && <Pill color="#22C55E">Pilot access</Pill>}
        {athlete.guardianConsentStatus !== 'not_required' && (
          <Pill color={GUARDIAN_COLORS[athlete.guardianConsentStatus]}>
            Guardian: {GUARDIAN_LABELS[athlete.guardianConsentStatus]}
          </Pill>
        )}
      </div>
      <PilotAccessRow
        athlete={athlete}
        busy={pilotActionBusyId === athlete.id}
        onGrant={onGrantPilotAccess}
        onRevoke={onRevokePilotAccess}
      />
    </div>
  );
}

export default function PilotPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Pilot Access grant/revoke — tracks the one athlete id currently being
  // acted on so only that row's buttons disable; a request failure surfaces
  // as a transient inline error rather than silently doing nothing.
  const [pilotActionBusyId, setPilotActionBusyId] = useState(null);
  const [pilotActionError, setPilotActionError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await founderFetch('/api/founder/pilot-overview');
      if (!r.ok) throw new Error(`${r.status}`);
      const body = await r.json();
      setData(body);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Grant/Revoke both hit routes/founderPilotAccess.js for exactly one
  // athlete id, then re-fetch the overview so the row reflects the real
  // stored state rather than an optimistic local guess.
  const runPilotAction = useCallback(async (id, action) => {
    setPilotActionError(null);
    setPilotActionBusyId(id);
    try {
      const r = await founderFetch(`/api/founder/pilot-access/${id}/${action}`, { method: 'POST' });
      if (!r.ok) throw new Error(`${r.status}`);
      await load();
    } catch (e) {
      setPilotActionError(`Failed to ${action === 'grant' ? 'grant' : 'revoke'} pilot access: ${e.message}`);
    } finally {
      setPilotActionBusyId(null);
    }
  }, [load]);

  const handleGrantPilotAccess = useCallback((id) => runPilotAction(id, 'grant'), [runPilotAction]);
  const handleRevokePilotAccess = useCallback((id) => runPilotAction(id, 'revoke'), [runPilotAction]);

  // Auto-refresh while this view is mounted AND the tab is visible; paused
  // (interval cleared, not just ignored) while hidden, and cleaned up on
  // unmount — mounting/unmounting PilotPanel itself already stops this
  // when the founder switches to a different panel.
  useEffect(() => {
    let intervalId = null;
    function startPolling() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') load();
      }, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        load();
        startPolling();
      } else {
        stopPolling();
      }
    }

    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [load]);

  return (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#F1F5F9]">Pilot</h1>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg bg-[#1E293B] text-[#94A3B8] active:bg-[#334155] disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          Failed to load pilot overview.
        </div>
      )}

      {pilotActionError && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          {pilotActionError}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={28} className="animate-spin text-[#1769AA]" />
        </div>
      )}

      {data && (
        <>
          {/* Pilot Presence Tracking — compact "Live now" metric, top of view. */}
          <div className="flex items-center gap-2 bg-[#1E293B] rounded-xl px-4 py-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#22C55E]" />
            </span>
            <span className="text-sm font-semibold text-[#F1F5F9]">Live now</span>
            <span className="ml-auto text-xl font-bold text-[#22C55E]">{data.metrics.liveNow}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total athletes" value={data.metrics.totalAthletes} />
            <StatCard label="New today" value={data.metrics.signupsToday} />
            <StatCard label="New 7 days" value={data.metrics.signupsLast7Days} />
            <StatCard
              label="Onboarding completed"
              value={data.metrics.onboardingCompleted}
              sub={`${data.metrics.onboardingStarted} started`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Used Coach"
              value={data.metrics.coachUsedAthletes}
              sub={`${data.metrics.coachSessionsTotal} sessions logged`}
            />
            <StatCard
              label="Mental Rep received"
              value={data.metrics.mentalRepReceivedAthletes}
              sub={`${data.metrics.mentalRepsReceived} total prescribed`}
            />
            <StatCard label="Mental Rep completed" value={data.metrics.mentalRepsCompleted} />
            <StatCard label="Outcomes reported" value={data.metrics.outcomesReported} />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-[#F1F5F9]">Engagement</p>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Active 24h" value={data.metrics.activeLast24Hours} />
              <StatCard label="Active 7d" value={data.metrics.activeLast7Days} />
              <StatCard
                label="Returning"
                value={data.metrics.returningAthletes}
                sub={`${data.metrics.returningPercentage}%`}
              />
            </div>
          </div>

          <div className="bg-[#1E293B] rounded-xl p-4 space-y-4">
            <p className="text-sm font-semibold text-[#F1F5F9]">Pilot funnel</p>
            <div className="space-y-3">
              {data.funnel.map((f) => (
                <FunnelRow key={f.stage} stage={f.stage} count={f.count} percent={f.percent} />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-[#F1F5F9]">Recent athletes</p>
            {data.recentAthletes.length === 0 ? (
              <div className="bg-[#1E293B] rounded-xl p-6 text-center text-sm text-[#64748B]">
                No athletes yet.
              </div>
            ) : (
              <div className="space-y-2">
                {data.recentAthletes.map((a) => (
                  <AthleteRow
                    key={a.id}
                    athlete={a}
                    pilotActionBusyId={pilotActionBusyId}
                    onGrantPilotAccess={handleGrantPilotAccess}
                    onRevokePilotAccess={handleRevokePilotAccess}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
