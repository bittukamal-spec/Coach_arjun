import { useState, useEffect, useRef, useCallback } from 'react';
import { LogOut } from 'lucide-react';
import BottomNav from './components/BottomNav';
import PulsePanel  from './panels/PulsePanel';
import PromptPanel from './panels/PromptPanel';
import CoachPanel  from './panels/CoachPanel';
import BuildPanel  from './panels/BuildPanel';
import SafetyPanel from './panels/SafetyPanel';
import {
  founderLogin,
  founderValidateSession,
  clearFounderSession,
  getFounderSession,
  setOnUnauthorized,
} from './api';

function LoginScreen({ onAuth, expiredNotice }) {
  const [value, setValue] = useState('');
  const [shake, setShake] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(pin) {
    setSubmitting(true);
    setError('');
    try {
      await founderLogin(pin);
      onAuth();
    } catch (e) {
      setError(e.message || 'Incorrect PIN.');
      setShake(true);
      setTimeout(() => { setShake(false); setValue(''); }, 600);
    } finally {
      setSubmitting(false);
    }
  }

  function handleChange(e) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    setValue(v);
    setError('');
    if (v.length === 4 && !submitting) submit(v);
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#0F172A] px-8">
      <div className="mb-8 text-center">
        <div className="text-4xl font-bold text-[#1769AA] mb-1">Arjun</div>
        <div className="text-sm text-[#64748B]">Founder Command Centre</div>
      </div>

      <div
        className="relative"
        style={{
          animation: shake ? 'shake 0.5s ease-in-out' : 'none',
        }}
      >
        {/* PIN dots */}
        <div className="flex gap-4 mb-6">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="w-4 h-4 rounded-full border-2 transition-colors"
              style={{
                borderColor: value.length > i ? '#1769AA' : '#334155',
                background:  value.length > i ? '#1769AA' : 'transparent',
              }}
            />
          ))}
        </div>

        {/* Hidden input — triggers mobile numeric keyboard, PIN stays masked */}
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={value}
          onChange={handleChange}
          disabled={submitting}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          autoComplete="off"
        />
      </div>

      <p className="text-[#475569] text-sm">
        {submitting ? 'Checking…' : 'Enter your 4-digit PIN'}
      </p>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      {!error && expiredNotice && (
        <p className="text-[#F59E0B] text-sm mt-2">Session expired. Please log in again.</p>
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-10px); }
          40%       { transform: translateX(10px); }
          60%       { transform: translateX(-10px); }
          80%       { transform: translateX(10px); }
        }
      `}</style>
    </div>
  );
}

const PANELS = {
  pulse:  PulsePanel,
  prompt: PromptPanel,
  coach:  CoachPanel,
  build:  BuildPanel,
  safety: SafetyPanel,
};

function Dashboard({ onLogout }) {
  const [active, setActive] = useState('pulse');
  const Panel = PANELS[active];

  return (
    <div className="min-h-dvh flex flex-col bg-[#0F172A]">
      <div className="flex items-center justify-end px-4 pt-3">
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-xs text-[#64748B] active:text-[#94A3B8] transition-colors"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Panel />
      </div>
      <BottomNav active={active} onChange={setActive} />
    </div>
  );
}

export default function App() {
  // 'checking' | 'authed' | 'unauthed'
  const [status, setStatus] = useState('checking');
  const [expiredNotice, setExpiredNotice] = useState(false);

  useEffect(() => {
    setOnUnauthorized(() => {
      setExpiredNotice(true);
      setStatus('unauthed');
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getFounderSession()) {
        if (!cancelled) setStatus('unauthed');
        return;
      }
      const valid = await founderValidateSession();
      if (cancelled) return;
      if (valid) {
        setStatus('authed');
      } else {
        clearFounderSession();
        setStatus('unauthed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = useCallback(() => {
    clearFounderSession();
    setExpiredNotice(false);
    setStatus('unauthed');
  }, []);

  if (status === 'checking') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0F172A]">
        <div className="text-[#64748B] text-sm">Checking session…</div>
      </div>
    );
  }

  return status === 'authed'
    ? <Dashboard onLogout={handleLogout} />
    : <LoginScreen expiredNotice={expiredNotice} onAuth={() => { setExpiredNotice(false); setStatus('authed'); }} />;
}
