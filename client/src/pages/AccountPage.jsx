import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { PageHeader } from '../components/ui';
import HelplineList from '../components/HelplineList';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { HINDI_ENABLED } from '../i18n/languages';
import { apiFetch } from '../api';
import { LogOut, Trash2, ChevronRight, Shield, User, Zap, Award, Camera, Star, MessageCircle, Mail, Sparkles, Sun, MessageSquare, FileX, RefreshCw, Tag, BarChart2, Layers, Bell, ListChecks } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { usePushNotifications } from '../hooks/usePushNotifications';

const EXPERIENCE_LEVELS = ['beginner', 'amateur', 'competitive', 'professional'];
const COMPETITION_LEVELS = ['recreational', 'local', 'state', 'national', 'international'];
const CHALLENGE_OPTIONS = ['nerves', 'failure', 'focus', 'family_pressure', 'injury', 'consistency'];
const GOAL_OPTIONS = ['focus', 'pressure', 'nerves', 'confidence', 'resilience', 'motivation', 'communication', 'injury'];

const EXPERIENCE_LABELS = { beginner: 'Beginner', amateur: 'Amateur', competitive: 'Competitive', professional: 'Professional' };
const COMPETITION_LABELS = { recreational: 'Recreational', local: 'Local / Club', state: 'State Level', national: 'National', international: 'International' };
const CHALLENGE_LABELS = { nerves: 'Pre-match nerves', failure: 'Handling losses', focus: 'Losing focus', family_pressure: 'Family/coach pressure', injury: 'Injury recovery', consistency: 'Staying consistent' };
const GOAL_LABELS_MAP = { focus: 'Focus', pressure: 'Pressure', nerves: 'Nerves', confidence: 'Confidence', resilience: 'Resilience', motivation: 'Motivation', communication: 'Team Communication', injury: 'Injuries' };

const TRIAL_DAYS = 14;

function getTrialDaysRemaining(user) {
  if (user?.tier === 'premium') return null;
  const start = user?.trialStarted || null;
  if (!start) return TRIAL_DAYS;
  const daysSince = Math.floor((Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, TRIAL_DAYS - daysSince);
}

function chipClass(on) {
  return `min-h-[44px] px-3.5 rounded-[14px] text-[13.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${on ? 'bg-brand-500 text-white' : 'bg-dark-400 text-ink'}`;
}

function getInitials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

// view: 'main' = the short settings list (/account); 'profile' = the
// Edit profile screen (/account/profile). Same component, so the profile
// save, photo, privacy and delete logic is shared and unchanged.
function AccountPage({ view = 'main' }) {
  const { user, token, language, logout, updateUser, avatarUrl, updateAvatar } = useAuth();
  const t        = translations[language].account;
  const tp       = translations[language].pricing;
  const tprivacy = translations[language].privacy;
  const hi = language === 'hi';
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef(null);
  const tpush = t.pushNotifications;
  const push = usePushNotifications();
  function handleTogglePush() {
    if (push.busy) return;
    if (push.status === 'enabled') push.disable();
    else push.enable();
  }

  // Smallest section-anchor mechanism this page has: the Home quick-
  // settings Notifications shortcut links to /account#notifications so it
  // lands directly on this section instead of merely opening the top of
  // Account. No routing library/config beyond the hash React Router
  // already gives us for free — just scroll + move focus to the section
  // that hash names.
  const notificationsSectionRef = useRef(null);
  useEffect(() => {
    if (location.hash === '#notifications' && notificationsSectionRef.current) {
      notificationsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      notificationsSectionRef.current.focus({ preventScroll: true });
    }
  }, [location.hash]);

  const isPremium = user?.tier === 'premium';
  const trialDaysRemaining = getTrialDaysRemaining(user);

  // Subscription management state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showHelplines, setShowHelplines] = useState(false);
  const [cancelLoading,     setCancelLoading]     = useState(false);
  const [cancelSuccess,     setCancelSuccess]     = useState(false);

  // Language toggle
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Profile edit state
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileAge, setProfileAge] = useState(user?.age ? String(user.age) : '');
  const [profileSport, setProfileSport] = useState(user?.sport || '');
  const [profileExperience, setProfileExperience] = useState(user?.experienceLevel || '');
  const [profileCompetition, setProfileCompetition] = useState(user?.competitionLevel || '');
  const [profileChallenge, setProfileChallenge] = useState(user?.primaryChallenge || '');
  const [profileGoals, setProfileGoals] = useState(Array.isArray(user?.goals) ? user.goals : []);
  const [profilePosition, setProfilePosition] = useState(user?.position || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState('');
  const [profileError, setProfileError] = useState('');

  // Photo upload
  const [pendingAvatar, setPendingAvatar] = useState(null); // selected but not yet saved
  const [photoSaved, setPhotoSaved] = useState(false);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep]           = useState(1);
  const [deleteConfirm, setDeleteConfirm]     = useState('');
  const [deleting, setDeleting]               = useState(false);
  const [deleteError, setDeleteError]         = useState('');

  // Privacy & selective data deletion state
  const [showPrivacySheet, setShowPrivacySheet] = useState(false);
  const [showDataConfirm, setShowDataConfirm]   = useState(null);
  const [privacyLoading, setPrivacyLoading]     = useState(null);
  const [privacyToast, setPrivacyToast]         = useState('');

  async function cancelSubscription() {
    setCancelLoading(true);
    try {
      const res = await apiFetch('/api/payments/cancel', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCancelSuccess(true);
        setShowCancelConfirm(false);
      }
    } catch {
      // fail silently — keep dialog open
    } finally {
      setCancelLoading(false);
    }
  }

  function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 300;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        setPendingAvatar(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function handleSavePhoto() {
    if (!pendingAvatar) return;
    updateAvatar(pendingAvatar);
    setPendingAvatar(null);
    setPhotoSaved(true);
    setTimeout(() => setPhotoSaved(false), 2000);
  }

  function toggleGoal(goal) {
    setProfileGoals(prev => {
      if (prev.includes(goal)) return prev.filter(g => g !== goal);
      if (prev.length >= 3) return prev;
      return [...prev, goal];
    });
  }

  async function handleSaveProfile() {
    setProfileSaving(true);
    setProfileError('');
    setProfileSaved('');
    try {
      const body = {};
      if (profileName.trim()) body.name = profileName.trim();
      if (profileAge) body.age = parseInt(profileAge, 10);
      if (profileSport.trim()) body.sport = profileSport.trim();
      if (profileExperience) body.experienceLevel = profileExperience;
      if (profileCompetition) body.competitionLevel = profileCompetition;
      if (profileChallenge) body.primaryChallenge = profileChallenge;
      if (profileGoals.length > 0) body.goals = profileGoals;
      body.position = profilePosition;

      const res = await apiFetch('/api/auth/me/profile', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        updateUser(data.user);
        setProfileSaved(t.saved);
        setTimeout(() => setProfileSaved(''), 2000);
      } else {
        setProfileError(data.error || 'Something went wrong');
      }
    } catch {
      setProfileError('Network error. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleLanguageChange(lang) {
    setSaving(true);
    try {
      const res = await apiFetch('/api/auth/me/language', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
      if (res.ok) {
        updateUser({ language: lang });
        setSavedMsg(t.saved);
        setTimeout(() => setSavedMsg(''), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'DELETE') return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await apiFetch('/api/auth/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        localStorage.clear();
        sessionStorage.clear();
        logout();
        navigate('/');
      } else {
        const data = await res.json();
        setDeleteError(data.error || tprivacy.account.error);
      }
    } catch {
      setDeleteError(tprivacy.account.error);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSelectiveDelete(type) {
    setPrivacyLoading(type);
    try {
      const res = await apiFetch(`/api/user/data/${type}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPrivacyToast(tprivacy.deleted.toast);
      } else {
        setPrivacyToast(tprivacy.errorToast);
      }
    } catch {
      setPrivacyToast(tprivacy.errorToast);
    } finally {
      setPrivacyLoading(null);
      setShowDataConfirm(null);
      setTimeout(() => setPrivacyToast(''), 3000);
    }
  }


  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric' })
    : '';

  const isProfileView = view === 'profile';
  const rowClass = 'w-full min-h-[56px] px-4 flex items-center justify-between gap-3 text-left text-[15px] font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500';

  return (
    <div className="min-h-screen bg-dark-900 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
      <PageHeader
        backTo={isProfileView ? '/account' : undefined}
        onBack={isProfileView ? undefined : () => navigate(-1)}
        barClass="bg-dark-900"
      />

      <main className="max-w-lg mx-auto px-page pt-1 animate-fade-in">
      {isProfileView ? (
        <>
          <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-tight text-ink mb-5">{t.editProfile}</h1>

          <div className="space-y-4">
            <div>
              <label htmlFor="acc-name" className="text-[13px] text-slt font-bold block mb-1.5">{t.nameLabel}</label>
              <input id="acc-name" type="text" value={profileName} onChange={e => setProfileName(e.target.value)}
                className="w-full min-h-[52px] rounded-2xl bg-dark-400 px-4 text-[15px] text-ink placeholder:text-slt focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                placeholder={user?.name} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="acc-age" className="text-[13px] text-slt font-bold block mb-1.5">{t.ageLabel}</label>
                <input id="acc-age" type="number" value={profileAge} onChange={e => setProfileAge(e.target.value)}
                  className="w-full min-h-[52px] rounded-2xl bg-dark-400 px-4 text-[15px] text-ink placeholder:text-slt focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  placeholder={t.agePlaceholder} min="8" max="80" />
              </div>
              <div>
                <label htmlFor="acc-sport" className="text-[13px] text-slt font-bold block mb-1.5">{t.sportLabel}</label>
                <input id="acc-sport" type="text" value={profileSport} onChange={e => setProfileSport(e.target.value)}
                  className="w-full min-h-[52px] rounded-2xl bg-dark-400 px-4 text-[15px] text-ink placeholder:text-slt focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  placeholder={t.sportPlaceholder} />
              </div>
            </div>

            <div>
              <label htmlFor="acc-position" className="text-[13px] text-slt font-bold block mb-1.5">{t.positionLabel}</label>
              <input id="acc-position" type="text" value={profilePosition} onChange={e => setProfilePosition(e.target.value)}
                className="w-full min-h-[52px] rounded-2xl bg-dark-400 px-4 text-[15px] text-ink placeholder:text-slt focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                placeholder={t.positionPlaceholder} />
            </div>

            <fieldset>
              <legend className="text-[13px] text-slt font-bold mb-2">{t.levelLabel}</legend>
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_LEVELS.map(lv => (
                  <button key={lv} type="button" aria-pressed={profileExperience === lv} onClick={() => setProfileExperience(lv)}
                    className={chipClass(profileExperience === lv)}>
                    {EXPERIENCE_LABELS[lv]}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-[13px] text-slt font-bold mb-2">{t.competitionLabel}</legend>
              <div className="flex flex-wrap gap-2">
                {COMPETITION_LEVELS.map(lv => (
                  <button key={lv} type="button" aria-pressed={profileCompetition === lv} onClick={() => setProfileCompetition(lv)}
                    className={chipClass(profileCompetition === lv)}>
                    {COMPETITION_LABELS[lv]}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-[13px] text-slt font-bold mb-2">{t.goalsLabel}</legend>
              <div className="flex flex-wrap gap-2">
                {GOAL_OPTIONS.map(g => (
                  <button key={g} type="button" aria-pressed={profileGoals.includes(g)} onClick={() => toggleGoal(g)}
                    className={chipClass(profileGoals.includes(g))}>
                    {GOAL_LABELS_MAP[g]}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Language — hidden while Hindi is switched off (i18n/languages.js) */}
            {HINDI_ENABLED && (
              <fieldset>
                <legend className="text-[13px] text-slt font-bold mb-2">
                  {language === 'hi' ? 'कोचिंग भाषा' : 'Coaching language'}
                </legend>
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleLanguageChange('en')} disabled={saving} aria-pressed={user?.language === 'en'} className={chipClass(user?.language === 'en')}>English</button>
                  <button type="button" onClick={() => handleLanguageChange('hi')} disabled={saving} aria-pressed={user?.language === 'hi'} className={chipClass(user?.language === 'hi')}>हिंदी</button>
                </div>
                {savedMsg && <p className="text-win-400 text-xs mt-2">{savedMsg}</p>}
              </fieldset>
            )}

            {profileError && <p className="text-red-500 text-[13px]" role="alert">{profileError}</p>}
            {profileSaved && <p className="text-ink text-[13px] font-bold text-center" role="status">{profileSaved}</p>}

            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="w-full min-h-[56px] rounded-[18px] bg-sun text-inkblock text-[16px] font-extrabold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {profileSaving ? t.saving : t.saveProfile}
            </button>
          </div>
        </>
      ) : (
        <>
        {/* Name, sport and photo */}
        <div className="flex items-center gap-4 mb-5">
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t.uploadPhoto}
                className="w-16 h-16 rounded-[22px] bg-sun text-inkblock text-[22px] font-extrabold flex items-center justify-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {(pendingAvatar || avatarUrl)
                  ? <img src={pendingAvatar || avatarUrl} alt="" className="w-16 h-16 object-cover" />
                  : getInitials(user?.name)}
              </button>
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center pointer-events-none" aria-hidden="true">
                <Camera size={12} className="text-white" />
              </span>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </div>
            {pendingAvatar ? (
              <button onClick={handleSavePhoto} className="text-[11px] font-bold text-white bg-brand-500 px-3 py-1 rounded-full">
                {hi ? 'सेव करें' : 'Save photo'}
              </button>
            ) : photoSaved ? (
              <p className="text-[11px] text-ink font-bold">{hi ? 'सेव हो गया ✓' : 'Saved ✓'}</p>
            ) : null}
          </div>
          <div className="min-w-0">
            <h1 className="text-[24px] leading-[1.1] font-extrabold tracking-tight text-ink break-words">{user?.name}</h1>
            <p className="text-[13px] text-slt mt-1 capitalize">
              {[user?.sport, memberSince ? `${t.memberSince} ${memberSince}` : ''].filter(Boolean).join(' · ')}
            </p>
            <p className="text-[12px] text-slt truncate">{user?.email}</p>
          </div>
        </div>

        {/* Plan — the blue block */}
        <section aria-label={t.subscription} className="mb-3 rounded-[22px] bg-brand-500 text-white p-4">
          {isPremium ? (
            <div className="flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-extrabold">{t.premiumSince}</span>
                <span className="block text-[12.5px] text-white/90">
                  {[user?.subscriptionPlanType ? (user.subscriptionPlanType === 'yearly' ? tp.planYearly : tp.planMonthly) : '',
                    user?.subscriptionStartDate ? `${tp.activeSince} ${new Date(user.subscriptionStartDate).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { month: 'short', year: 'numeric' })}` : '']
                    .filter(Boolean).join(' · ')}
                </span>
              </span>
              {cancelSuccess ? (
                <span className="text-[12px] font-bold">{tp.cancelSuccess}</span>
              ) : (
                <button onClick={() => setShowCancelConfirm(true)} className="min-h-[44px] px-3.5 rounded-[14px] bg-white text-brand-700 text-[13px] font-extrabold">
                  {tp.cancelSub}
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-extrabold">{t.freeTrial}</span>
                <span className="block text-[12.5px] text-white/90">
                  {trialDaysRemaining === 0 ? t.trialEnded : t.trialDaysLeft(trialDaysRemaining)}
                </span>
              </span>
              <button onClick={() => navigate('/pricing')} className="min-h-[44px] px-3.5 rounded-[14px] bg-white text-brand-700 text-[13px] font-extrabold">
                {t.planDetails}
              </button>
            </div>
          )}
        </section>

        {/* Settings rows */}
        <div className="mb-3 rounded-[22px] bg-dark-400 overflow-hidden divide-y divide-dark-600">
          <Link to="/account/profile" className={rowClass}>
            {t.editProfile}
            <ChevronRight size={18} className="text-slt shrink-0" aria-hidden="true" />
          </Link>
          <div className="min-h-[56px] px-4 flex items-center justify-between gap-3">
            <span className="text-[15px] font-bold text-ink">{t.appearance}</span>
            <div className="flex gap-0.5 bg-dark-900 rounded-xl p-[3px] shrink-0" role="group" aria-label={t.appearance}>
              {[
                { v: 'system', label: t.themeAuto  },
                { v: 'light',  label: t.themeLight },
                { v: 'dark',   label: t.themeDark  },
              ].map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  aria-pressed={theme === opt.v}
                  onClick={() => setTheme(opt.v)}
                  className={`min-h-[36px] px-2.5 text-[12px] rounded-[9px] font-bold transition-colors ${
                    theme === opt.v ? 'bg-brand-500 text-white' : 'text-slt'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {/* Push Notifications v1 — id="notifications" is the anchor target
              for the Home quick-settings shortcut (Navbar.jsx). */}
          <section id="notifications" ref={notificationsSectionRef} tabIndex={-1} aria-label={tpush.title} className="px-4 py-3 outline-none">
            {push.status === 'loading' ? (
              <p className="text-[15px] font-bold text-ink">{tpush.title}</p>
            ) : push.status === 'unsupported' ? (
              <><p className="text-[15px] font-bold text-ink">{tpush.title}</p><p className="text-[12.5px] text-slt mt-0.5">{tpush.unsupported}</p></>
            ) : push.status === 'ios-unsupported' ? (
              <><p className="text-[15px] font-bold text-ink">{tpush.title}</p><p className="text-[12.5px] text-slt mt-0.5">{tpush.iosUnsupported}</p></>
            ) : push.status === 'consent-required' ? (
              <><p className="text-[15px] font-bold text-ink">{tpush.consentRequiredTitle}</p><p className="text-[12.5px] text-slt mt-0.5">{tpush.consentRequiredBody}</p></>
            ) : push.status === 'denied' ? (
              <><p className="text-[15px] font-bold text-ink">{tpush.deniedTitle}</p><p className="text-[12.5px] text-slt mt-0.5">{tpush.deniedBody}</p></>
            ) : (
              <label className="flex items-center justify-between gap-3 cursor-pointer min-h-[44px]">
                <span className="flex-1 min-w-0 pr-2">
                  <span className="block text-[15px] font-bold text-ink">{tpush.promptTitle}</span>
                  <span className="block text-[12.5px] text-slt mt-0.5">{tpush.promptBody}</span>
                  <span className="block text-[11px] font-bold text-slt mt-0.5">
                    {push.status === 'enabled' ? tpush.onLabel : tpush.offLabel}
                  </span>
                </span>
                <span className="relative inline-flex items-center shrink-0">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={push.status === 'enabled'}
                    disabled={push.busy}
                    onChange={handleTogglePush}
                    aria-label={tpush.promptTitle}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                  />
                  <span className={`w-11 h-6 rounded-full transition-colors pointer-events-none ${push.busy ? 'opacity-60' : ''} ${push.status === 'enabled' ? 'bg-brand-500' : 'bg-dark-600'}`} aria-hidden="true" />
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform pointer-events-none ${push.status === 'enabled' ? 'translate-x-5' : 'translate-x-0'}`} aria-hidden="true" />
                </span>
              </label>
            )}
            {push.error && <p className="text-red-500 text-xs mt-2">{tpush.error}</p>}
          </section>
        </div>

        <div className="mb-3 rounded-[22px] bg-dark-400 overflow-hidden divide-y divide-dark-600">
          {user?.onboardingDone && (
            <Link to="/starting-profile" state={{ entryMode: 'saved-profile' }} className={rowClass}>
              {language === 'hi' ? 'आपका शुरुआती प्रोफाइल' : 'Your starting profile'}
              <ChevronRight size={18} className="text-slt shrink-0" aria-hidden="true" />
            </Link>
          )}
          <Link to="/focus-deck" className={rowClass}>
            {hi ? 'मेरा Focus Deck' : 'My Focus Deck'}
            <ChevronRight size={18} className="text-slt shrink-0" aria-hidden="true" />
          </Link>
          <Link to="/body-reset/history" className={rowClass}>
            Pressure Reset History
            <ChevronRight size={18} className="text-slt shrink-0" aria-hidden="true" />
          </Link>
        </div>

        {/* Help & Support — privacy, contact, support contacts */}
        <div className="mb-3 rounded-[22px] bg-dark-400 overflow-hidden divide-y divide-dark-600">
          <button type="button" onClick={() => setShowPrivacySheet(true)} className={rowClass}>
            {tprivacy.sectionTitle}
            <ChevronRight size={18} className="text-slt shrink-0" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => navigate('/contact')} className={rowClass}>
            {t.contactSupportTitle}
            <ChevronRight size={18} className="text-slt shrink-0" aria-hidden="true" />
          </button>
          <button type="button" aria-expanded={showHelplines} onClick={() => setShowHelplines(v => !v)} className={rowClass}>
            {t.helplinesTitle}
            <ChevronRight size={18} className={`text-slt shrink-0 transition-transform ${showHelplines ? 'rotate-90' : ''}`} aria-hidden="true" />
          </button>
          {showHelplines && (
            <div className="px-4 py-3">
              <p className="text-[12.5px] text-slt mb-2">{t.helplinesSub}</p>
              <HelplineList />
            </div>
          )}
        </div>

        {/* Account actions — sign out, delete account */}
        <button
          type="button"
          onClick={logout}
          className="w-full min-h-[52px] rounded-[18px] bg-dark-400 text-ink text-[15px] font-bold flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <LogOut size={18} aria-hidden="true" />
          {t.signOut}
        </button>
        <button
          type="button"
          onClick={() => { setShowDeleteModal(true); setDeleteStep(1); setDeleteConfirm(''); setDeleteError(''); }}
          className="w-full min-h-[44px] mt-2 text-[13px] font-bold text-red-600 dark:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl"
        >
          {tprivacy.account.label}
        </button>
        </>
      )}
      </main>

      {/* Cancel subscription confirmation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
          <div className="bg-dark-800 border border-dark-500 rounded-2xl p-6 w-full max-w-md animate-slide-up">
            <h3 className="font-bold text-ink mb-3">{tp.cancelSub}</h3>
            <p className="text-slt text-sm mb-6">{tp.cancelConfirm}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelLoading}
                className="flex-1 btn-secondary"
              >
                {hi ? 'वापस' : 'Keep Plan'}
              </button>
              <button
                onClick={cancelSubscription}
                disabled={cancelLoading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-dark-700 border border-dark-500 hover:bg-dark-600 text-ink font-semibold rounded-xl transition-all disabled:opacity-50"
              >
                {cancelLoading
                  ? (hi ? 'रद्द हो रहा है…' : 'Cancelling…')
                  : (hi ? 'हाँ, रद्द करें' : 'Yes, Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy & Data bottom sheet */}
      {showPrivacySheet && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-dark-800 border border-dark-500 rounded-t-3xl w-full max-w-md animate-slide-up pb-8">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-dark-600">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-slt" />
                <h3 className="font-bold text-ink">{tprivacy.sectionTitle}</h3>
              </div>
              <button
                onClick={() => setShowPrivacySheet(false)}
                className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center text-slt hover:text-ink transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="divide-y divide-dark-600">
              {[
                { type: 'chat-history',    Icon: MessageSquare, label: tprivacy.chat.label,       sub: tprivacy.chat.sub },
                { type: 'reflections',     Icon: FileX,         label: tprivacy.reflections.label, sub: tprivacy.reflections.sub },
                { type: 'mental-profile',  Icon: RefreshCw,     label: tprivacy.profile.label,     sub: tprivacy.profile.sub },
                { type: 'cue-word',        Icon: Tag,           label: tprivacy.cue.label,         sub: tprivacy.cue.sub },
                { type: 'checkin-history', Icon: BarChart2,     label: tprivacy.checkin.label,     sub: tprivacy.checkin.sub },
                { type: 'routines',        Icon: ListChecks,    label: tprivacy.routines.label,    sub: tprivacy.routines.sub },
              ].map(({ type, Icon, label, sub }) => (
                <button
                  key={type}
                  onClick={() => { setShowDataConfirm(type); setShowPrivacySheet(false); }}
                  disabled={privacyLoading === type}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-dark-700 transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center flex-shrink-0">
                    <Icon size={15} className="text-slt" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink">{label}</p>
                    <p className="text-xs text-slt">{sub}</p>
                  </div>
                  <Trash2 size={15} className="text-red-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Selective data delete confirmation sheet */}
      {showDataConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
          <div className="bg-dark-800 border border-dark-500 rounded-2xl p-6 w-full max-w-md animate-slide-up">
            <h3 className="font-bold text-ink mb-2">{tprivacy.confirm.title}</h3>
            <p className="text-slt text-sm mb-6">{tprivacy.confirm.body}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDataConfirm(null)}
                disabled={privacyLoading === showDataConfirm}
                className="flex-1 btn-secondary"
              >
                {tprivacy.confirm.cancel}
              </button>
              <button
                onClick={() => handleSelectiveDelete(showDataConfirm)}
                disabled={privacyLoading === showDataConfirm}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {privacyLoading === showDataConfirm
                  ? (hi ? 'हट रहा है…' : 'Deleting…')
                  : tprivacy.confirm.yes}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account modal — two-step */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
          <div className="bg-dark-800 border border-dark-500 rounded-2xl p-6 w-full max-w-md animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <h3 className="font-bold text-ink">
                {deleteStep === 1 ? tprivacy.account.step1.title : tprivacy.account.step2.title}
              </h3>
            </div>

            {deleteStep === 1 ? (
              <>
                <div className="mb-5 space-y-1.5">
                  {tprivacy.account.step1.body.split('\n').map((line, i) => (
                    <p key={i} className="text-slt text-sm">{line}</p>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 btn-secondary"
                  >
                    {tprivacy.confirm.cancel}
                  </button>
                  <button
                    onClick={() => setDeleteStep(2)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 active:scale-95 transition-all"
                  >
                    {tprivacy.account.step1.confirm}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-slt text-sm mb-5">{tprivacy.account.step2.body}</p>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder={tprivacy.account.step2.placeholder}
                  className="input-field mb-4 font-mono tracking-widest"
                />
                {deleteError && <p className="text-red-400 text-sm mb-3">{deleteError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteError(''); setDeleteStep(1); }}
                    className="flex-1 btn-secondary"
                  >
                    {tprivacy.confirm.cancel}
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirm !== 'DELETE' || deleting}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting ? tprivacy.account.loading : tprivacy.account.step2.confirm}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast notification */}
      {privacyToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-dark-700 border border-dark-500 rounded-xl shadow-lg text-sm text-ink font-medium whitespace-nowrap animate-fade-in">
          {privacyToast}
        </div>
      )}
    </div>
  );
}

export default AccountPage;
