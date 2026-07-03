import { useState, useEffect, useRef } from 'react';
import BottomNav from './components/BottomNav';
import PulsePanel  from './panels/PulsePanel';
import PromptPanel from './panels/PromptPanel';
import CoachPanel  from './panels/CoachPanel';
import BuildPanel  from './panels/BuildPanel';

const PIN = import.meta.env.VITE_FOUNDER_PIN || '';

function PinScreen({ onAuth }) {
  const [value,  setValue]  = useState('');
  const [shake,  setShake]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleChange(e) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    setValue(v);
    if (v.length === 4) {
      if (v === PIN) {
        sessionStorage.setItem('fd_auth', '1');
        onAuth();
      } else {
        setShake(true);
        setTimeout(() => { setShake(false); setValue(''); }, 600);
      }
    }
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

        {/* Hidden input — triggers mobile numeric keyboard */}
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={value}
          onChange={handleChange}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          autoComplete="off"
        />
      </div>

      <p className="text-[#475569] text-sm">Enter your 4-digit PIN</p>

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
};

function Dashboard() {
  const [active, setActive] = useState('pulse');
  const Panel = PANELS[active];

  return (
    <div className="min-h-dvh flex flex-col bg-[#0F172A]">
      <div className="flex-1 flex flex-col overflow-hidden">
        <Panel />
      </div>
      <BottomNav active={active} onChange={setActive} />
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('fd_auth') === '1');

  // If no PIN is configured in env, auto-auth (dev/preview mode)
  if (!PIN) return <Dashboard />;

  return authed
    ? <Dashboard />
    : <PinScreen onAuth={() => setAuthed(true)} />;
}
