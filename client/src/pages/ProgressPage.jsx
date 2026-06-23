import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Flame, Share2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { useAuth } from '../contexts/AuthContext';
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
import { translations } from '../i18n/translations';

// ─── Constants ────────────────────────────────────────────────────────────────

const METRIC_CONFIG = [
  { key: 'mood',       color: '#185FA5', barClass: 'bg-brand-600', labelKey: 'mood'       },
  { key: 'focus',      color: '#3A7FC1', barClass: 'bg-sky-500',   labelKey: 'focus'      },
  { key: 'confidence', color: '#E2711D', barClass: 'bg-fire-500',  labelKey: 'confidence' },
];

// ─── Share card quote bank ────────────────────────────────────────────────────

function getShareQuote(streak, score, hi) {
  if (streak >= 30) return hi ? '30 दिन। आप चैंपियन की तरह दिमाग ट्रेन करते हैं।' : '30 days of mental training. Elite mindset.';
  if (streak >= 14) return hi ? 'दो हफ्ते लगातार। आपका दिमाग मजबूत हो रहा है।' : 'Two weeks strong. Your mental edge is growing.';
  if (streak >= 7)  return hi ? 'एक हफ्ता लगातार। यही असली अनुशासन है।'         : 'One week of showing up. That\'s real discipline.';
  if (streak >= 3)  return hi ? 'आप आदत बना रहे हैं। जारी रखें।'               : 'You\'re building the habit. Keep going.';
  if (score >= 60)  return hi ? 'मानसिक प्रदर्शन पर काम हो रहा है।'              : 'Mental performance is a trainable skill.';
  return hi ? 'हर चैंपियन पहले दिन से शुरू हुआ।' : 'Every champion started on day one.';
}

// ─── Achievement metadata (mirrors server) ────────────────────────────────────

const ACH_META = {
  first_checkin: { icon: '🌱', name: 'First Step'     },
  streak_3:      { icon: '🏅', name: 'Rookie Mind'    },
  streak_7:      { icon: '🔥', name: 'Mental Athlete' },
  streak_14:     { icon: '⚡', name: 'Zone Master'    },
  streak_30:     { icon: '🏆', name: 'Elite Mindset'  },
  comeback:      { icon: '💪', name: 'Comeback'       },
  reflector:     { icon: '🧠', name: 'Deep Thinker'   },
  perfect_week:  { icon: '🛡️', name: 'Perfect Week'  },
  chat_10:       { icon: '💬', name: 'In the Zone'    },
};

// ─── Personalized description ─────────────────────────────────────────────────

function getPersonalDesc(user, streak, score, achievementKeys, hi) {
  const sport  = user?.sport || 'sport';
  const cap    = sport.charAt(0).toUpperCase() + sport.slice(1);
  const count  = achievementKeys.length;

  if (streak >= 30) return hi
    ? `30 दिन की मानसिक ट्रेनिंग — ${cap} में एलीट मानसिकता।`
    : `30 days of mental training — elite mindset in ${cap}.`;
  if (streak >= 14) return hi
    ? `${streak} दिन लगातार। ${cap} के लिए असली मानसिक बढ़त।`
    : `${streak} days straight. Building a real mental edge in ${cap}.`;
  if (streak >= 7) return hi
    ? `एक हफ्ता मानसिक ट्रेनिंग पूरी। ${cap} में फोकस और आत्मविश्वास बढ़ रहा है।`
    : `One week of mental training done. Focus and confidence growing in ${cap}.`;
  if (count >= 5) return hi
    ? `${count} उपलब्धियां हासिल कीं। ${cap} में मानसिक ट्रेनिंग काम कर रही है।`
    : `${count} achievements earned. Mental training is paying off in ${cap}.`;
  if (score >= 60) return hi
    ? `${cap} में मानसिक प्रदर्शन पर काम जारी है।`
    : `Actively building mental performance skills in ${cap}.`;
  return hi
    ? `${cap} में मानसिक ट्रेनिंग की शुरुआत — हर कदम मायने रखता है।`
    : `Starting the mental training journey in ${cap}. Every step counts.`;
}

// ─── ShareCard (inline styles only — required for reliable canvas capture) ────

function ShareCard({ cardRef, user, fitnessScore, streak, xp, achievements, language }) {
  const hi           = language === 'hi';
  const score        = fitnessScore ?? 0;
  const sport        = user?.sport
    ? user.sport.charAt(0).toUpperCase() + user.sport.slice(1)
    : 'Athlete';
  const expLevel     = user?.experienceLevel
    ? user.experienceLevel.charAt(0).toUpperCase() + user.experienceLevel.slice(1)
    : null;
  const label =
    score >= 90 ? (hi ? 'एलीट'        : 'Elite')          :
    score >= 75 ? (hi ? 'तेज़'         : 'Sharp')          :
    score >= 60 ? (hi ? 'फॉर्म में'    : 'In Form')        :
    score >= 40 ? (hi ? 'बढ़ रहे हैं' : 'Building Up')    :
                  (hi ? 'शुरुआत'       : 'Getting Started');
  const ringColor =
    score >= 90 ? '#f59e0b' :
    score >= 75 ? '#10b981' :
    score >= 60 ? '#3b82f6' :
    score >= 40 ? '#38bdf8' : '#6b7280';
  const quote       = getShareQuote(streak, score, hi);
  const desc        = getPersonalDesc(user, streak, score, achievements, hi);
  const circumference = 2 * Math.PI * 54;
  const dash          = circumference * (score / 100);
  const earnedAchs    = achievements.map(k => ACH_META[k]).filter(Boolean);

  return (
    <div ref={cardRef} style={{
      width: 390, background: '#0d1f18',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '28px 28px 24px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {/* Header — personal, not brand */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <p style={{ color: '#e8f5ee', fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1 }}>
            {user?.name || 'Athlete'}
          </p>
          <p style={{ color: '#4a7c6a', fontSize: 12, fontWeight: 600, marginTop: 3 }}>
            {sport}{expLevel ? ` · ${expLevel}` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: '#4a7c6a', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Mental Fitness</p>
          <p style={{ color: ringColor, fontSize: 11, fontWeight: 700, marginTop: 1 }}>{label}</p>
        </div>
      </div>

      {/* Circular score */}
      <div style={{ position: 'relative', width: 140, height: 140, margin: '4px 0 10px' }}>
        <svg width="140" height="140" viewBox="0 0 148 148" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="74" cy="74" r="54" fill="none" stroke="#1a3028" strokeWidth="11" />
          <circle cx="74" cy="74" r="54" fill="none"
            stroke={ringColor} strokeWidth="11" strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#e8f5ee', fontSize: 40, fontWeight: 900, lineHeight: 1 }}>{score}</span>
          <span style={{ color: '#4a7c6a', fontSize: 10, fontWeight: 600, marginTop: 2 }}>/100</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, width: '100%', justifyContent: 'center' }}>
        <div style={{ background: '#1a3028', borderRadius: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>🔥</span>
          <span style={{ color: '#e8f5ee', fontSize: 16, fontWeight: 800 }}>{streak ?? 0}</span>
          <span style={{ color: '#4a7c6a', fontSize: 10, fontWeight: 600 }}>{hi ? 'दिन' : 'day streak'}</span>
        </div>
        {xp !== undefined && (
          <div style={{ background: '#1a3028', borderRadius: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>⚡</span>
            <span style={{ color: '#e8f5ee', fontSize: 16, fontWeight: 800 }}>{xp}</span>
            <span style={{ color: '#4a7c6a', fontSize: 10, fontWeight: 600 }}>MXP</span>
          </div>
        )}
      </div>

      {/* Personalized description */}
      <div style={{ width: '100%', background: '#1a3028', borderRadius: 14, padding: '12px 16px', marginBottom: 16 }}>
        <p style={{ color: '#8aab9a', fontSize: 13, fontWeight: 500, lineHeight: 1.55, textAlign: 'center', margin: 0 }}>
          {desc}
        </p>
      </div>

      {/* Badges */}
      {earnedAchs.length > 0 && (
        <div style={{ width: '100%', marginBottom: 16 }}>
          <p style={{ color: '#4a7c6a', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center', marginBottom: 10 }}>
            {hi ? 'उपलब्धियां' : 'Achievements'} · {earnedAchs.length}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {earnedAchs.map((a, i) => (
              <div key={i} style={{ background: '#1a3028', borderRadius: 10, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 14 }}>{a.icon}</span>
                <span style={{ color: '#8aab9a', fontSize: 11, fontWeight: 600 }}>{a.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quote */}
      <div style={{ width: '100%', borderTop: '1px solid #1a3028', paddingTop: 14, marginBottom: 14 }}>
        <p style={{ color: '#4a7c6a', fontSize: 12, fontWeight: 500, textAlign: 'center', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>
          "{quote}"
        </p>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#4a7c6a', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', margin: 0 }}>coacharjun.in</p>
        <p style={{ color: '#243d30', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', marginTop: 2 }}>personal mental coaching</p>
      </div>
    </div>
  );
}

// ─── Share modal ──────────────────────────────────────────────────────────────

function ShareModal({ onClose, user, fitnessScore, streak, xp, achievements, language }) {
  const t         = translations[language].progress;
  const cardRef   = useRef(null);
  const [busy,    setBusy]   = useState(false);
  const [imgUrl,  setImgUrl] = useState(null);

  async function generate() {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      const url = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      setImgUrl(url);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleShare() {
    if (!imgUrl) return;
    try {
      const blob = await (await fetch(imgUrl)).blob();
      const file = new File([blob], 'mindgame-progress.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t.shareTitle });
        return;
      }
    } catch { /* fall through to download */ }
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = 'mindgame-progress.png';
    a.click();
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/70" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[100] bg-dark-800 border-t border-dark-600 rounded-t-2xl animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-dark-700">
          <p className="font-bold text-ink text-sm">{t.shareBtn}</p>
          <button onClick={onClose} className="text-slt hover:text-ink text-xl leading-none">×</button>
        </div>

        {/* Card preview — scrollable, capped height, card centred */}
        <div style={{ maxHeight: '58vh', overflowY: 'auto', overflowX: 'hidden', padding: '12px 16px 4px' }}>
          <div style={{ width: 390, margin: '0 auto' }}>
            <ShareCard
              cardRef={cardRef}
              user={user} fitnessScore={fitnessScore}
              streak={streak} xp={xp}
              achievements={achievements}
              language={language}
            />
          </div>
        </div>

        {/* Share button — always visible, never inside the scroll area */}
        <div className="px-4 pt-3 pb-8">
          <button
            onClick={handleShare}
            disabled={busy || !imgUrl}
            className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-bold text-sm disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
          >
            <Share2 size={15} />
            {busy ? t.shareGenerating : t.shareSave}
          </button>
        </div>
      </div>
    </>
  );
}

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
  const { token, language, user } = useAuth();
  const t = translations[language].progress;
  const [showShare, setShowShare] = useState(false);

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

            {/* ── Mental Fitness Score ── */}
            {data.fitnessScore !== undefined && (() => {
              const s     = data.fitnessScore;
              const label = t.fitnessLabel(s);
              const color =
                s >= 90 ? 'text-amber-400' :
                s >= 75 ? 'text-win-400'   :
                s >= 60 ? 'text-brand-400' :
                s >= 40 ? 'text-sky-400'   : 'text-slt';
              const ring =
                s >= 90 ? 'border-amber-400/40' :
                s >= 75 ? 'border-win-500/40'   :
                s >= 60 ? 'border-brand-500/40' :
                s >= 40 ? 'border-sky-500/40'   : 'border-dark-500';
              const pct = s;
              return (
                <div className={`bg-dark-800 border ${ring} rounded-2xl p-5 flex items-center gap-5`}>
                  <div className="relative w-20 h-20 shrink-0">
                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#1e2d27" strokeWidth="8" />
                      <circle
                        cx="40" cy="40" r="34" fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 34}`}
                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct / 100)}`}
                        className={`transition-all duration-700 ${color}`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-2xl font-black leading-none ${color}`}>{s}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-0.5">{t.fitnessScore}</p>
                    <p className={`text-xl font-black ${color} leading-tight`}>{label}</p>
                    <p className="text-xs text-slt mt-1 leading-relaxed">
                      Streak · Consistency · Mental state · Achievements
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* ── Share button ── */}
            <button
              onClick={() => setShowShare(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-brand-600/40 text-brand-500 text-sm font-semibold hover:bg-brand-600/10 transition-colors active:scale-[0.99]"
            >
              <Share2 size={15} />
              {t.shareBtn}
            </button>

            {/* ── Stats row ── */}
            <div className="flex gap-3">
              <div className="flex-1 bg-dark-800 border border-dark-600 rounded-2xl px-4 py-4 text-center">
                <p className="text-3xl font-black text-ink leading-none mb-1">{data.streak}</p>
                <p className="text-[11px] font-semibold text-slt uppercase tracking-wide flex items-center justify-center gap-1"><Flame size={11} className="text-fire-500" /> {t.streak}</p>
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

      {showShare && data && (
        <ShareModal
          onClose={() => setShowShare(false)}
          user={user}
          fitnessScore={data.fitnessScore}
          streak={data.streak}
          xp={user?.xp}
          achievements={data.achievements || []}
          language={language}
        />
      )}
    </div>
  );
}

export default ProgressPage;
