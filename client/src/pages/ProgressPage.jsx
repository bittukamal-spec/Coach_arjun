import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  { key: 'mood',       color: '#7C3AED', labelKey: 'mood' },
  { key: 'focus',      color: '#2563EB', labelKey: 'focus' },
  { key: 'confidence', color: '#EA580C', labelKey: 'confidence' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, value, label, trend, trendLabel }) {
  const trendColor =
    trend === null  ? 'text-gray-400' :
    trend > 0.05   ? 'text-green-600' :
    trend < -0.05  ? 'text-red-500'   : 'text-gray-400';

  const trendArrow =
    trend === null  ? '—' :
    trend > 0.05   ? '↑' :
    trend < -0.05  ? '↓' : '→';

  return (
    <div className="card flex flex-col gap-1">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900 leading-none">
        {value ?? <span className="text-gray-300 text-xl">—</span>}
      </p>
      {trendLabel !== undefined && (
        <p className={`text-xs font-medium mt-1 ${trendColor}`}>
          {trendArrow} {trend !== null ? `${Math.abs(trend).toFixed(1)} ${trendLabel}` : trendLabel}
        </p>
      )}
    </div>
  );
}

function CustomTooltip({ active, payload, label, t }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-xl rounded-2xl px-4 py-3 text-sm min-w-[140px]">
      <p className="font-semibold text-gray-700 mb-2 text-xs">{label}</p>
      {payload.map(entry => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-500 capitalize text-xs">{entry.name}</span>
          </div>
          <span className="font-bold text-gray-900">{entry.value}/5</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function ProgressPage() {
  const { token, language } = useAuth();
  const t = translations[language].progress;

  const [data, setData]     = useState(null);
  const [days, setDays]     = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link to="/dashboard" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            {t.backToDashboard}
          </Link>
          <p className="font-semibold text-gray-900">{t.title}</p>
          <div className="w-20" /> {/* spacer to centre the title */}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

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
          <div className="animate-fade-in space-y-6">

            {/* ── Top stat row: streak + total ── */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                icon="🔥"
                value={data.streak}
                label={t.streak}
              />
              <StatCard
                icon="📊"
                value={data.totalCheckIns}
                label={t.totalCheckIns}
              />
            </div>

            {/* ── Weekly average cards ── */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {t.weeklyAvg}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {METRIC_CONFIG.map(({ key, color, labelKey }) => {
                  const curr = data.weeklyAvg[key];
                  const prev = data.prevWeekAvg[key];
                  const diff = trendDiff(curr, prev);
                  return (
                    <div
                      key={key}
                      className="card py-4 flex flex-col items-center text-center gap-1"
                      style={{ borderTopColor: color, borderTopWidth: '3px' }}
                    >
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                        {t[labelKey]}
                      </p>
                      <p className="text-2xl font-bold text-gray-900">
                        {curr ?? <span className="text-gray-300 text-lg">—</span>}
                        {curr && <span className="text-xs font-normal text-gray-400">/5</span>}
                      </p>
                      {/* Trend */}
                      {diff !== null && (
                        <p className={`text-xs font-medium ${
                          diff > 0.05 ? 'text-green-600' : diff < -0.05 ? 'text-red-500' : 'text-gray-400'
                        }`}>
                          {diff > 0.05 ? `↑ +${diff}` : diff < -0.05 ? `↓ ${diff}` : `→ ${t.same}`}
                        </p>
                      )}
                      {diff === null && prev === null && curr !== null && (
                        <p className="text-xs text-gray-300">new</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 text-center mt-2">{t.vsLastWeek}</p>
            </div>

            {/* ── Period toggle ── */}
            <div className="flex gap-2 justify-center">
              {[7, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                    days === d
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-brand-300'
                  }`}
                >
                  {d === 7 ? t.days7 : t.days30}
                </button>
              ))}
            </div>

            {/* ── Chart or empty state ── */}
            {hasEnoughData ? (
              <div className="card">
                <p className="text-sm font-semibold text-gray-700 mb-4">{t.chartTitle}</p>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#9CA3AF' }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[1, 5]}
                      ticks={[1, 2, 3, 4, 5]}
                      tick={{ fontSize: 11, fill: '#9CA3AF' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip t={t} />} />
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
              <div className="card text-center py-12">
                <div className="text-4xl mb-4">📈</div>
                <h3 className="font-semibold text-gray-900 mb-2">{t.noData}</h3>
                <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">{t.noDataSub}</p>
                <Link to="/checkin" className="btn-primary justify-center">
                  {t.startCheckin}
                </Link>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}

export default ProgressPage;
