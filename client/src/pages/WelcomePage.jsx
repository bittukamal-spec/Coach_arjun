import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';
import Teer from '../components/visuals/Teer';
import MatchDaySheet from '../components/match/MatchDaySheet';
import { usePath } from '../components/path/pathData';
import { useStatusBarColour } from '../components/ui/TonePage';

// First run after the short onboarding (founder, Nov 2026):
//   1. "When's your next match?" (feeds match prep, plans and reminders)
//   2. "How strong is your mind game?" → the Mind Challenge as the first
//      reward, instead of a profile page to read.
// The starting profile is confirmed quietly in the background (the athlete
// can review and change it any time from My profile).
export default function WelcomePage() {
  const { language, token, user } = useAuth();
  const t = ((translations[language] || translations.en).welcome) || translations.en.welcome;
  const navigate = useNavigate();
  const { setMatchDay } = usePath();
  const [step, setStep] = useState('match');
  useStatusBarColour(step === 'challenge' ? { colour: '#101533' } : {});

  useEffect(() => {
    apiFetch('/api/profile/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fit: 'CONFIRMED' }),
    }).catch(() => { /* the profile page can still confirm later */ });
  }, [token]);

  const firstName = (user?.name || '').split(' ')[0];

  if (step === 'match') {
    return (
      <div className="min-h-screen bg-dark-900">
        <div className="mx-auto flex min-h-screen max-w-lg flex-col px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-slt">{t.almost}</p>
          <div className="mt-3">
            <MatchDaySheet inline open initialDay={null} saveLabel={t.saveMatch}
              onClose={() => setStep('challenge')}
              onSave={async (d) => { if (d) await setMatchDay(d); setStep('challenge'); }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-inkblock text-white">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center">
        <button type="button" onClick={() => setStep('match')} aria-label={t.back} className="flex h-11 w-11 items-center justify-center self-start rounded-2xl bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun"><ArrowLeft size={18} /></button>
        <p className="mt-6 text-[12px] font-extrabold uppercase tracking-[0.12em] text-sun">{t.lastStep}</p>
        <h1 className="mt-2 text-[30px] font-extrabold leading-[1.15]">{t.title(firstName)}</h1>
        <Teer pose="point" height={200} className="mt-6" />
        <p className="mt-4 text-[15px] text-white/80">{t.line}</p>
        <div className="flex-1" />
        <button type="button" data-testid="welcome-play" onClick={() => navigate('/mind-challenge', { replace: true, state: { firstRun: true } })}
          className="mt-6 min-h-[58px] w-full rounded-[18px] bg-sun text-[17px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{t.play}</button>
        <button type="button" onClick={() => navigate('/dashboard', { replace: true })}
          className="mt-2 min-h-[44px] w-full text-[14px] font-semibold text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun">{t.skip}</button>
      </div>
    </div>
  );
}
