import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { VIZ_FALLBACKS } from '../data/vizFallbacks';
import { Zap, AlertCircle, HelpCircle, Battery, Brain, CheckCircle2 } from 'lucide-react';

const C = {
  lightBg:   '#F0F4F8',
  darkBg:    '#0F1F35',
  blue:      '#185FA5',
  amber:     '#D98B2B',
  textDark:  '#121826',
  textMuted: '#64748B',
  textLight: '#F8FAFC',
  cardBg:    '#FFFFFF',
  selBorder: '#185FA5',
  selBg:     '#EBF3FC',
};

function ArjunBubble({ children }) {
  return (
    <div style={{
      borderLeft: `4px solid ${C.blue}`,
      background: C.cardBg,
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 16,
    }}>
      <p style={{ color: C.blue, fontSize: 12, fontWeight: 600, marginBottom: 6, letterSpacing: '0.05em' }}>ARJUN</p>
      <p style={{ color: C.textDark, fontSize: 17, lineHeight: 1.5, margin: 0 }}>{children}</p>
    </div>
  );
}

function deriveSetup(state) {
  if (state === 'nervous' || state === 'overthinking') return 'CALM_SETUP';
  if (state === 'flat') return 'ACTIVATE_SETUP';
  return 'CLEAN_SETUP';
}

function lineDuration(line) {
  if (!line?.trim()) return 2000;
  if (line.startsWith('CUE:')) return 5000;
  const words = line.split(' ').length;
  if (words < 6) return 3000;
  if (words < 12) return 4000;
  return 5000;
}

export default function VisualizationPage() {
  const navigate = useNavigate();
  const { user, token, language, updateUser } = useAuth();
  const t = translations[language].viz;

  const [screen, setScreen]               = useState('entry');
  const [specificMoment, setSpecificMoment] = useState('');
  const [currentState, setCurrentState]   = useState('');
  const [setupType, setSetupType]         = useState('CLEAN_SETUP');
  const [script, setScript]               = useState(null);
  const [scriptReady, setScriptReady]     = useState(false);
  const [lineIndex, setLineIndex]         = useState(0);
  const [lineVisible, setLineVisible]     = useState(true);
  const [paused, setPaused]               = useState(false);
  const [deliveryMode, setDeliveryMode]   = useState('auto');
  const [soundOn, setSoundOn]             = useState(false);
  const [step3Phase, setStep3Phase]       = useState(0);
  const [step3Done, setStep3Done]         = useState(false);
  const [xpResult, setXpResult]           = useState(null);

  const audioCtxRef    = useRef(null);
  const oscRef         = useRef(null);
  const lineTimerRef   = useRef(null);
  const step3TimerRef  = useRef(null);
  const reducedMotionRef = useRef(false);

  // Check prefers-reduced-motion on mount
  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Stop drone on unmount
  useEffect(() => {
    return () => {
      try { oscRef.current?.stop(); audioCtxRef.current?.close(); } catch {}
    };
  }, []);

  // Fade-in when lineIndex changes
  useEffect(() => {
    setLineVisible(false);
    const t = setTimeout(() => setLineVisible(true), 50);
    return () => clearTimeout(t);
  }, [lineIndex]);

  // Auto mode timer
  useEffect(() => {
    if (screen !== 'step4' || deliveryMode !== 'auto' || paused) return;
    if (!script?.lines?.length) return;
    if (lineIndex >= script.lines.length) { setScreen('step5'); return; }
    clearTimeout(lineTimerRef.current);
    const dur = lineDuration(script.lines[lineIndex]);
    lineTimerRef.current = setTimeout(() => setLineIndex(i => i + 1), dur);
    return () => clearTimeout(lineTimerRef.current);
  }, [lineIndex, paused, deliveryMode, screen, script]);

  // Step 3 timed sequence
  useEffect(() => {
    if (screen !== 'step3') return;
    setStep3Phase(0);
    setStep3Done(false);
    const cues = setupType === 'CALM_SETUP' ? 3 : setupType === 'ACTIVATE_SETUP' ? 3 : 1;
    const dur  = setupType === 'ACTIVATE_SETUP' ? 3000 : setupType === 'CLEAN_SETUP' ? 3000 : 4000;
    let phase = 0;
    function next() {
      phase++;
      if (phase < cues) {
        setStep3Phase(phase);
        step3TimerRef.current = setTimeout(next, dur);
      } else {
        setStep3Done(true);
      }
    }
    step3TimerRef.current = setTimeout(next, dur);
    return () => clearTimeout(step3TimerRef.current);
  }, [screen, setupType]);

  async function fetchScript(stateKey, setup, moment) {
    setScriptReady(false);
    const sport = user?.sport || 'default';
    const cueWord = user?.cueWord || null;
    try {
      const res = await apiFetch('/api/chat/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          wizardType: 'visualization',
          specificMoment: moment,
          currentState: stateKey,
          setupType: setup,
          sport,
          cueWord,
          language,
          userName: user?.name?.split(' ')[0] || 'athlete',
          oceanProfile: {
            O: user?.oceanO, C: user?.oceanC, E: user?.oceanE,
            A: user?.oceanA, N: user?.oceanN,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.lines?.length > 0) {
          setScript({ lines: data.lines, totalDurationSeconds: data.totalDurationSeconds || 150, cueWordLine: data.cueWordLine ?? -1 });
          if (data.xp !== undefined && updateUser) updateUser({ xp: data.xp });
          if (data.xpEarned) setXpResult({ xpEarned: data.xpEarned, xp: data.xp });
        } else throw new Error('empty');
      } else throw new Error('api error');
    } catch {
      const fb = VIZ_FALLBACKS[user?.sport?.toLowerCase()] || VIZ_FALLBACKS.default;
      setScript(fb);
    } finally {
      setScriptReady(true);
    }
  }

  function handleStateSelect(stateKey) {
    const setup = deriveSetup(stateKey);
    setCurrentState(stateKey);
    setSetupType(setup);
    setScreen('step3');
    fetchScript(stateKey, setup, specificMoment);
  }

  function toggleDrone() {
    if (soundOn) {
      try { oscRef.current?.stop(); audioCtxRef.current?.close(); } catch {}
      setSoundOn(false);
    } else {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 40;
        gain.gain.value = 0.03;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        audioCtxRef.current = ctx;
        oscRef.current = osc;
        setSoundOn(true);
      } catch {}
    }
  }

  // ── ENTRY SCREEN ─────────────────────────────────────────────────────────────
  if (screen === 'entry') {
    return (
      <div style={{ minHeight: '100vh', background: C.lightBg, padding: '0 16px 40px' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 0' }}>
          <button
            onClick={() => navigate('/train')}
            style={{ color: C.textMuted, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕ Exit
          </button>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 24 }}>
          <ArjunBubble>{t.entry.arjun}</ArjunBubble>

          <p style={{ color: C.textMuted, fontSize: 14, marginBottom: 24 }}>{t.entry.sub}</p>

          {/* Cue word card */}
          {user?.cueWord ? (
            <div style={{
              borderLeft: `3px solid ${C.amber}`,
              background: C.cardBg,
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 32,
            }}>
              <p style={{ color: C.amber, fontSize: 15, margin: 0 }}>
                {t.entry.cue_label} <strong>{user.cueWord}</strong>
              </p>
              <p style={{ color: C.textMuted, fontSize: 13, margin: '6px 0 0' }}>{t.entry.cue.found}</p>
            </div>
          ) : (
            <div style={{
              borderLeft: `3px solid ${C.blue}`,
              background: C.cardBg,
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 32,
            }}>
              <p style={{ color: C.textMuted, fontSize: 14, margin: 0 }}>{t.entry.cue.missing}</p>
            </div>
          )}

          <button
            onClick={() => setScreen('step1')}
            style={{
              width: '100%',
              height: 56,
              background: C.blue,
              color: '#fff',
              border: 'none',
              borderRadius: 14,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t.entry.cta}
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 1 ───────────────────────────────────────────────────────────────────
  if (screen === 'step1') {
    return (
      <div style={{ minHeight: '100vh', background: C.lightBg, padding: '0 16px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
          <span style={{ color: C.textMuted, fontSize: 14 }}>{t.step1.progress}</span>
          <button
            onClick={() => navigate('/train')}
            style={{ color: C.textMuted, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕ Exit
          </button>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 16 }}>
          <p style={{ fontSize: 22, fontWeight: 600, color: C.textDark, marginBottom: 8 }}>{t.step1.prompt}</p>
          <p style={{ fontSize: 14, color: C.textMuted, marginBottom: 24 }}>{t.step1.sub}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {t.step1.options.map((opt) => (
              <button
                key={opt}
                onClick={() => { setSpecificMoment(opt); setScreen('step2'); }}
                style={{
                  width: '100%',
                  minHeight: 48,
                  background: specificMoment === opt ? C.selBg : C.cardBg,
                  border: `1px solid ${specificMoment === opt ? C.selBorder : '#E2E8F0'}`,
                  borderRadius: 12,
                  fontSize: 16,
                  color: C.textDark,
                  textAlign: 'left',
                  padding: '12px 16px',
                  cursor: 'pointer',
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2 ───────────────────────────────────────────────────────────────────
  if (screen === 'step2') {
    const STATES = [
      { key: 'confident',    icon: Zap,         color: C.blue      },
      { key: 'nervous',      icon: AlertCircle,  color: C.amber     },
      { key: 'uncertain',    icon: HelpCircle,   color: C.textMuted },
      { key: 'flat',         icon: Battery,      color: C.textMuted },
      { key: 'overthinking', icon: Brain,        color: '#6B7280'   },
    ];

    return (
      <div style={{ minHeight: '100vh', background: C.lightBg, padding: '0 16px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
          <span style={{ color: C.textMuted, fontSize: 14 }}>{t.step2.progress}</span>
          <button
            onClick={() => navigate('/train')}
            style={{ color: C.textMuted, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕ Exit
          </button>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 16 }}>
          <p style={{ fontSize: 22, fontWeight: 600, color: C.textDark, marginBottom: 24 }}>{t.step2.prompt}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STATES.map(({ key, icon: Icon, color }, idx) => (
              <button
                key={key}
                onClick={() => handleStateSelect(key)}
                style={{
                  width: '100%',
                  minHeight: 56,
                  background: C.cardBg,
                  border: `1px solid #E2E8F0`,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Icon size={24} style={{ color, flexShrink: 0 }} />
                <span style={{ fontSize: 16, color: C.textDark }}>{t.step2.states[idx]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 3 ───────────────────────────────────────────────────────────────────
  if (screen === 'step3') {
    const cfg = setupType === 'CALM_SETUP'
      ? t.step3.calm
      : setupType === 'ACTIVATE_SETUP'
      ? t.step3.activate
      : t.step3.clean;

    const cues = setupType === 'CALM_SETUP'
      ? t.step3.calm.cues
      : setupType === 'ACTIVATE_SETUP'
      ? t.step3.activate.cues
      : [t.step3.clean.cue];

    return (
      <div style={{ minHeight: '100vh', background: C.lightBg, padding: '0 16px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
          <span style={{ color: C.textMuted, fontSize: 14 }}>{t.step3.progress}</span>
          <button
            onClick={() => navigate('/train')}
            style={{ color: C.textMuted, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕ Exit
          </button>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 16 }}>
          <ArjunBubble>{cfg.arjun}</ArjunBubble>

          {/* Timed cue sequence */}
          <div style={{ minHeight: 120, marginBottom: 32 }}>
            {cues.slice(0, step3Phase + 1).map((cue, idx) => (
              <p
                key={idx}
                style={{
                  fontSize: 17,
                  color: C.textDark,
                  marginBottom: 12,
                  opacity: idx === step3Phase ? 1 : 0.5,
                  transition: 'opacity 0.4s ease',
                }}
              >
                {cue}
              </p>
            ))}
            {step3Done && (
              <p style={{ fontSize: 15, color: C.textMuted, marginTop: 8 }}>
                {cfg.after}
              </p>
            )}
          </div>

          {step3Done && scriptReady && (
            <button
              onClick={() => { setLineIndex(0); setLineVisible(false); setPaused(false); setScreen('step4'); }}
              style={{
                width: '100%',
                height: 56,
                background: C.blue,
                color: '#fff',
                border: 'none',
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {cfg.cta}
            </button>
          )}

          {!scriptReady && (
            <p style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', marginTop: 16 }}>
              {t.step3.loading}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── STEP 4 — DARK SCREEN ─────────────────────────────────────────────────────
  if (screen === 'step4') {
    const lines = script?.lines || [];
    const currentLine = lines[lineIndex] || '';
    const isCueLine = currentLine.startsWith('CUE:');
    const displayLine = isCueLine ? currentLine.replace(/^CUE:\s*/, '') : currentLine;
    const isEmpty = !currentLine.trim();

    const handleTapArea = () => {
      if (deliveryMode === 'auto') {
        setPaused(p => !p);
      } else {
        if (lineIndex >= lines.length) {
          setScreen('step5');
        } else {
          setLineIndex(i => i + 1);
        }
      }
    };

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: C.darkBg,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '16px 20px 8px',
          flexShrink: 0,
        }}>
          <div>
            <p style={{ color: '#94A3B8', fontSize: 12, margin: 0 }}>
              {t.step4.progress} — {specificMoment}
            </p>
            {/* Mode selector */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {['auto', 'tap'].map(m => (
                <button
                  key={m}
                  onClick={() => setDeliveryMode(m)}
                  style={{
                    background: deliveryMode === m ? C.blue : 'transparent',
                    color: deliveryMode === m ? '#fff' : '#94A3B8',
                    border: `1px solid ${deliveryMode === m ? C.blue : '#334155'}`,
                    borderRadius: 20,
                    padding: '4px 16px',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {m === 'auto' ? t.step4.mode.auto : t.step4.mode.tap}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Sound toggle */}
            <button
              onClick={toggleDrone}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}
              aria-label={soundOn ? 'Mute drone' : 'Enable drone'}
            >
              {soundOn ? '🔊' : '🔇'}
            </button>
            {/* Exit */}
            <button
              onClick={() => navigate('/train')}
              style={{ color: '#94A3B8', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Main content area */}
        <div
          onClick={handleTapArea}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: '0 32px',
            position: 'relative',
          }}
        >
          {reducedMotionRef.current ? (
            /* Reduced motion: show all lines as scrollable list */
            <div style={{ width: '100%', maxHeight: '70vh', overflowY: 'auto' }}>
              {lines.map((line, idx) => (
                line.trim() ? (
                  <p
                    key={idx}
                    style={{
                      color: line.startsWith('CUE:') ? C.amber : C.textLight,
                      fontSize: line.startsWith('CUE:') ? 24 : 20,
                      fontWeight: line.startsWith('CUE:') ? 600 : 400,
                      textAlign: 'center',
                      marginBottom: 16,
                    }}
                  >
                    {line.startsWith('CUE:') ? line.replace(/^CUE:\s*/, '') : line}
                  </p>
                ) : (
                  <div key={idx} style={{ height: 24 }} />
                )
              ))}
            </div>
          ) : isEmpty ? (
            <div style={{ height: 24 }} />
          ) : (
            <p
              style={{
                color: isCueLine ? C.amber : C.textLight,
                fontSize: isCueLine ? 24 : 20,
                fontWeight: isCueLine ? 600 : 400,
                textAlign: 'center',
                opacity: lineVisible ? 1 : 0,
                transition: isCueLine ? 'opacity 700ms ease' : 'opacity 500ms ease',
                maxWidth: 360,
                lineHeight: 1.6,
              }}
            >
              {displayLine}
            </p>
          )}

          {paused && deliveryMode === 'auto' && (
            <p style={{ color: '#94A3B8', fontSize: 14, position: 'absolute', bottom: 48, textAlign: 'center' }}>
              {t.step4.pause}
            </p>
          )}
        </div>

        {/* Hint text */}
        {!paused && (
          <p style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center', paddingBottom: 20, flexShrink: 0 }}>
            {deliveryMode === 'auto' ? t.step4.hint.auto : t.step4.hint.tap}
          </p>
        )}

        {/* Progress bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: '#1E3A5F' }}>
          <div style={{
            height: '100%',
            background: C.blue,
            width: `${lines.length ? (lineIndex / lines.length) * 100 : 0}%`,
            transition: 'width 0.5s linear',
          }} />
        </div>
      </div>
    );
  }

  // ── STEP 5 ───────────────────────────────────────────────────────────────────
  if (screen === 'step5') {
    const vizContextStr = `Athlete just completed a visualization rehearsal. Moment rehearsed: "${specificMoment}". Sport: ${user?.sport || 'unspecified'}. Mental state going in: ${currentState}. Cue word: ${user?.cueWord || 'none set'}.`;
    const vizBridgeMsg = language === 'hi'
      ? 'Visualization complete ho gayi. Baat karte hain?'
      : 'I just finished my visualization. Can we talk about it?';

    const arjunLine = t.step5.arjun[
      currentState === 'nervous' ? 'nervous' :
      currentState === 'flat' ? 'flat' :
      currentState === 'overthinking' ? 'uncertain' :
      currentState === 'uncertain' ? 'uncertain' : 'confident'
    ];

    return (
      <div style={{ minHeight: '100vh', background: C.lightBg, padding: '0 16px 40px' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 0' }}>
          <button
            onClick={() => navigate('/train')}
            style={{ color: C.textMuted, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕ Exit
          </button>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 16 }}>
          {/* Icon + heading */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <CheckCircle2 size={40} style={{ color: C.blue, marginBottom: 12 }} />
            <h2 style={{ fontSize: 22, fontWeight: 700, color: C.textDark, margin: 0 }}>{t.step5.heading}</h2>
          </div>

          {/* XP badge */}
          {xpResult && (
            <div style={{
              textAlign: 'center',
              marginBottom: 16,
              animation: 'fadeIn 0.5s ease 0.5s both',
            }}>
              <span style={{
                background: '#FEF3C7',
                color: C.amber,
                fontSize: 13,
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 20,
              }}>
                {t.step5.xp}
              </span>
            </div>
          )}

          {/* Summary card */}
          <div style={{
            background: C.cardBg,
            borderLeft: `4px solid ${C.blue}`,
            borderRadius: 12,
            padding: '16px',
            marginBottom: 20,
          }}>
            {/* Row 1: moment */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 4px' }}>{t.step5.moment.label}</p>
              <p style={{ fontSize: 16, color: C.textDark, margin: 0 }}>{specificMoment}</p>
            </div>

            {/* Row 2: cue */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 4px' }}>{t.step5.cue.label}</p>
              {user?.cueWord ? (
                <p style={{ fontSize: 16, color: C.amber, fontWeight: 700, margin: 0 }}>{user.cueWord}</p>
              ) : (
                <button
                  onClick={() => navigate('/before-you-play')}
                  style={{ background: 'none', border: 'none', padding: 0, color: C.blue, fontSize: 14, cursor: 'pointer' }}
                >
                  {t.step5.cue_missing_cta}
                </button>
              )}
            </div>

            {/* Row 3: pressure response */}
            <div>
              <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 4px' }}>{t.step5.response.label}</p>
              <p style={{ fontSize: 16, color: C.textDark, margin: 0 }}>
                {user?.cueWord ? t.step5.response.text(user.cueWord) : t.step5.response.noCue}
              </p>
            </div>
          </div>

          {/* Arjun line */}
          <ArjunBubble>{arjunLine}</ArjunBubble>

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Primary */}
            <button
              onClick={() => navigate('/train')}
              style={{
                width: '100%',
                height: 52,
                background: C.blue,
                color: '#fff',
                border: 'none',
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t.step5.primary}
            </button>

            {/* Secondary */}
            <button
              onClick={() => { setLineIndex(0); setLineVisible(false); setPaused(false); setScreen('step4'); }}
              style={{
                width: '100%',
                height: 52,
                background: C.cardBg,
                color: C.blue,
                border: `1px solid ${C.blue}`,
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {t.step5.replay}
            </button>

            {/* Tertiary */}
            <button
              onClick={() => navigate('/coaching', { state: { sessionType: null, newSession: true, arjunReport: vizContextStr, bridgeMsg: vizBridgeMsg } })}
              style={{
                width: '100%',
                height: 48,
                background: 'none',
                color: C.textMuted,
                border: 'none',
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              {t.step5.talk}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
