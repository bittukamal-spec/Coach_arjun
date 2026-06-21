import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { apiFetch } from '../api';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';

// ─── Constants ────────────────────────────────────────────────────────────────

const METRIC_CONFIG = [
  { key: 'mood',       color: '#0B6E4F', barClass: 'bg-brand-600', labelKey: 'mood'       },
  { key: 'focus',      color: '#2D9575', barClass: 'bg-sky-500',   labelKey: 'focus'      },
  { key: 'confidence', color: '#E2711D', barClass: 'bg-fire-500',  labelKey: 'confidence' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-3">
      {children}
    </p>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-700 border border-dark-500 shadow-xl rounded-2xl px-4 py-3 text-sm min-w-[140px]">
      <p className="font-semibold text-ink mb-2 text-xs">{label}</p>
      {payload.map(entry => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-slt capitalize text-xs">{entry.name}</span>
          </div>
          <span className="font-bold text-ink">{entry.value}/5</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function ProgressPage() {
  const { token, language } = useAuth();
  const t = translations[language].progress;

  const [data, setData]       = useState(null);
  const [days, setDays]       = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/progress/summary?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setData(d); setError(''); })
      .catch(() => setError('Failed to load progress data.'))
      .finally(() => setLoading(false));
  }, [days, token]);

  const hasEnoughData = data && data.chartData.length >= 2;

  function trendDiff(current, previous) {
    if (current === null || previous === null) return null;
    return +(current - previous).toFixed(1);
  }

  return (
    <div className="min-h-screen bg-dark-900">

      {/* ── Header ── */}
      <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <Link to="/dashboard" className="p-1 -ml-1 text-slt hover:text-ink transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <p className="font-bold text-ink">{t.title}</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-24">

        {/* Loading */}
        {loading && (
          <div className="flex justify-center pt-20">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="text-center text-red-500 text-sm py-8">{error}</div>
        )}

        {/* Content */}
        {!loading && !error && data && (
          <div className="animate-fade-in space-y-7">

            {/* ── Stats row ── */}
            <div className="flex gap-3">
              <div className="flex-1 bg-dark-800 border border-dark-600 rounded-2xl px-4 py-4 text-center">
                <p className="text-3xl font-black text-ink leading-none mb-1">{data.streak}</p>
                <p className="text-[11px] font-semibold text-slt uppercase tracking-wide">🔥 {t.streak}</p>
              </div>
              <div className="flex-1 bg-dark-800 border border-dark-600 rounded-2xl px-4 py-4 text-center">
                <p className="text-3xl font-black text-ink leading-none mb-1">{data.totalCheckIns}</p>
                <p className="text-[11px] font-semibold text-slt uppercase tracking-wide">📊 {t.totalCheckIns}</p>
              </div>
            </div>

            {/* ── Period toggle ── */}
            <div className="flex bg-dark-800 border border-dark-600 rounded-2xl p-1 gap-1">
              {[7, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    days === d
                      ? 'bg-brand-600 text-white'
                      : 'text-slt hover:text-ink'
                  }`}
                >
                  {d === 7 ? t.days7 : t.days30}
                </button>
              ))}
            </div>

            {/* ── Weekly averages ── */}
            <div>
              <SectionLabel>{t.weeklyAvg}</SectionLabel>
              <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 space-y-4">
                {METRIC_CONFIG.map(({ key, barClass, labelKey }) => {
                  const curr = data.weeklyAvg[key];
                  const prev = data.prevWeekAvg[key];
                  const diff = trendDiff(curr, prev);
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-ink">{t[labelKey]}</span>
                        <div className="flex items-center gap-2">
                          {diff !== null && (
                            <span className={`text-xs font-semibold ${
                              diff > 0.05 ? 'text-win-500' : diff < -0.05 ? 'text-red-400' : 'text-slt'
                            }`}>
                              {diff > 0.05 ? `↑ +${diff}` : diff < -0.05 ? `↓ ${diff}` : `→ ${t.same}`}
                            </span>
                          )}
                          <span className="text-sm font-bold text-ink">
                            {curr !== null ? `${curr}/5` : <span className="text-slt text-xs">—</span>}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barClass} transition-all duration-500`}
                          style={{ width: curr !== null ? `${(curr / 5) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="text-[11px] text-slt text-center pt-1">{t.vsLastWeek}</p>
              </div>
            </div>

            {/* ── Chart or empty state ── */}
            <div>
              <SectionLabel>{t.chartTitle}</SectionLabel>
              {hasEnoughData ? (
                <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={data.chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2D3B36" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: '#41524A' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={[1, 5]}
                        ticks={[1, 2, 3, 4, 5]}
                        tick={{ fontSize: 11, fill: '#41524A' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                        formatter={(value) => t[value] || value}
                      />
                      {METRIC_CONFIG.map(({ key, color, labelKey }) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          name={labelKey}
                          stroke={color}
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: color, strokeWidth: 0 }}
                          activeDot={{ r: 6, fill: color }}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="bg-dark-800 border border-dark-600 rounded-2xl px-5 py-12 text-center">
                  <div className="text-4xl mb-4">📈</div>
                  <h3 className="font-semibold text-ink mb-2">{t.noData}</h3>
                  <p className="text-sm text-slt mb-6 max-w-xs mx-auto">{t.noDataSub}</p>
                  <Link
                    to="/checkin"
                    className="inline-block bg-brand-600 text-white font-bold text-sm py-3 px-6 rounded-xl active:scale-95 transition-transform"
                  >
                    {t.startCheckin}
                  </Link>
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

export default ProgressPage;
