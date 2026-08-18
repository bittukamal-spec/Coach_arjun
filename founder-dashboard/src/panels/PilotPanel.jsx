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

function AthleteRow({ athlete }) {
  return (
    <div className="bg-[#1E293B] rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[#F1F5F9] truncate">{athlete.firstName}</span>
        <span className="text-xs text-[#64748B] shrink-0">{formatDate(athlete.signupDate)}</span>
      </div>
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
        {athlete.guardianConsentStatus !== 'not_required' && (
          <Pill color={GUARDIAN_COLORS[athlete.guardianConsentStatus]}>
            Guardian: {GUARDIAN_LABELS[athlete.guardianConsentStatus]}
          </Pill>
        )}
      </div>
    </div>
  );
}

export default function PilotPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={28} className="animate-spin text-[#1769AA]" />
        </div>
      )}

      {data && (
        <>
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
                {data.recentAthletes.map((a) => <AthleteRow key={a.id} athlete={a} />)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
