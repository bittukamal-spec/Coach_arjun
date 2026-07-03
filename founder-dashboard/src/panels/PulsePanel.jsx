import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import StatCard from '../components/StatCard';
import { founderFetch } from '../api';

export default function PulsePanel() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [ts, setTs]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await founderFetch('/api/founder/pulse');
      if (!r.ok) throw new Error(`${r.status}`);
      setData(await r.json());
      setTs(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#F1F5F9]">Pulse</h1>
          {ts && <p className="text-xs text-[#64748B]">Updated {ts}</p>}
        </div>
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
          Failed to load: {error}. Check FOUNDER_TOKEN and API URL.
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={28} className="animate-spin text-[#1769AA]" />
        </div>
      )}

      {data && (
        <>
          {/* Users */}
          <section>
            <h2 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-widest mb-3">Users</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Total"        value={data.users.total}       accent="#F1F5F9" />
              <StatCard label="Paid"         value={data.users.paid}        accent="#22C55E" />
              <StatCard label="Active trial" value={data.users.activeTrial} accent="#1769AA" />
              <StatCard label="Expired trial" value={data.users.expiredTrial} accent="#94A3B8" />
            </div>
            <div className="mt-3">
              <StatCard
                label="Onboarded"
                value={data.users.onboarded}
                sub={`${data.users.total ? Math.round(data.users.onboarded / data.users.total * 100) : 0}% of total`}
              />
            </div>
          </section>

          {/* Today */}
          <section>
            <h2 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-widest mb-3">
              Today · {data.today.date}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Check-ins" value={data.today.checkins}  accent="#F29B38" />
              <StatCard label="Sessions"  value={data.today.sessions}  accent="#1769AA" />
              <StatCard label="Messages"  value={data.today.messages}  accent="#F1F5F9" />
            </div>
          </section>

          {/* This week */}
          <section>
            <h2 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-widest mb-3">Last 7 days</h2>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Messages" value={data.week.messages}  accent="#F1F5F9" />
              <StatCard label="Debriefs" value={data.week.debriefs}  accent="#F29B38" />
              <StatCard label="New users" value={data.week.newUsers} accent="#22C55E" />
            </div>
          </section>

          {/* Expiring soon */}
          {data.expiringSoon.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-[#F59E0B] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <AlertTriangle size={13} />
                Trials expiring ≤ 3 days
              </h2>
              <div className="space-y-2">
                {data.expiringSoon.map((u, i) => (
                  <div key={i} className="bg-[#1E293B] rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-[#F1F5F9]">{u.name}</span>
                      <span className="text-xs text-[#94A3B8] ml-2">{u.sport}</span>
                    </div>
                    <span
                      className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{
                        background: u.daysLeft <= 1 ? '#7F1D1D' : '#78350F',
                        color: u.daysLeft <= 1 ? '#FCA5A5' : '#FCD34D',
                      }}
                    >
                      {u.daysLeft}d left
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Safety */}
          <section>
            <h2 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-widest mb-3">Safety</h2>
            <div
              className="bg-[#1E293B] rounded-xl px-4 py-3 flex items-center justify-between"
            >
              <span className="text-sm text-[#F1F5F9]">Self-talk safety flags</span>
              <span
                className="text-lg font-bold"
                style={{ color: data.safety.flaggedCards > 0 ? '#EF4444' : '#22C55E' }}
              >
                {data.safety.flaggedCards}
              </span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
