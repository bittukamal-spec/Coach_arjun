import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { LogOut, Trash2, ChevronRight, Shield, Bell, User, Zap, Award, Camera, Star, MessageCircle, Mail, Sparkles, Sun, MessageSquare, FileX, RefreshCw, Tag, BarChart2, Layers } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { ACHIEVEMENTS, ALL_ACHIEVEMENT_KEYS } from '../data/achievements';

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

function AccountPage() {
  const { user, token, language, logout, updateUser, avatarUrl, updateAvatar } = useAuth();
  const t        = translations[language].account;
  const tp       = translations[language].pricing;
  const tprivacy = translations[language].privacy;
  const hi = language === 'hi';
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef(null);

  const isPremium = user?.tier === 'premium';
  const trialDaysRemaining = getTrialDaysRemaining(user);

  // Subscription management state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
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

  const [earnedAchievements, setEarnedAchievements] = useState(null);

  useEffect(() => {
    apiFetch('/api/achievements/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setEarnedAchievements(data?.achievements ?? []))
      .catch(() => setEarnedAchievements([]));
  }, [token]);

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 pt-20 pb-28 animate-fade-in">

        {/* Profile header with photo upload */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <div className="relative">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-full bg-brand-500 text-white text-2xl font-bold flex items-center justify-center ring-2 ring-brand-600/40 cursor-pointer overflow-hidden"
              >
                {(pendingAvatar || avatarUrl)
                  ? <img src={pendingAvatar || avatarUrl} alt="avatar" className="w-16 h-16 object-cover" />
                  : user?.name?.charAt(0)?.toUpperCase()
                }
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-dark-700 border border-dark-500 flex items-center justify-center hover:bg-dark-600 transition-colors"
                title={t.uploadPhoto}
              >
                <Camera size={12} className="text-slt" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>
            {pendingAvatar ? (
              <button
                onClick={handleSavePhoto}
                className="text-[11px] font-bold text-white bg-brand-500 hover:bg-brand-600 px-3 py-1 rounded-full transition-colors"
              >
                {hi ? 'सेव करें' : 'Save photo'}
              </button>
            ) : photoSaved ? (
              <p className="text-[11px] text-win-400 font-semibold">{hi ? 'सेव हो गया ✓' : 'Saved ✓'}</p>
            ) : null}
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">{user?.name}</h1>
            <p className="text-slt text-sm">{user?.email}</p>
            {user?.sport && (
              <p className="text-slt text-xs mt-0.5 capitalize">{user.sport}{user?.competitionLevel ? ` · ${COMPETITION_LABELS[user.competitionLevel] || user.competitionLevel}` : ''}</p>
            )}
            {memberSince && (
              <p className="text-slt text-xs mt-0.5">{t.memberSince} {memberSince}</p>
            )}
            {user?.xp !== undefined && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <Zap size={13} className="text-brand-400" />
                <span className="text-brand-400 text-xs font-semibold">{user.xp} MXP</span>
              </div>
            )}
          </div>
        </div>

        {/* Subscription card */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-slt uppercase tracking-wide">{t.subscription}</h2>
          </div>
          <div className="card p-5">
            {isPremium ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-ink flex items-center gap-1.5">
                      <Star size={14} className="text-fire-500" /> {t.premiumSince}
                    </p>
                    {user?.subscriptionPlanType && (
                      <p className="text-slt text-sm">
                        {user.subscriptionPlanType === 'yearly' ? tp.planYearly : tp.planMonthly}
                      </p>
                    )}
                    {user?.subscriptionStartDate && (
                      <p className="text-slt text-xs mt-0.5">
                        {tp.activeSince} {new Date(user.subscriptionStartDate).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-bold bg-fire-500/20 text-fire-400 border border-fire-500/30 px-3 py-1 rounded-full">Active</span>
                </div>
                {cancelSuccess ? (
                  <p className="text-sm text-win-400 text-center py-2">{tp.cancelSuccess}</p>
                ) : (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="w-full py-2.5 rounded-xl border border-dark-500 bg-dark-700 hover:bg-dark-600 text-slt text-xs font-semibold transition-colors"
                  >
                    {tp.cancelSub}
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-semibold text-ink">🆓 Free Trial</p>
                    <p className="text-slt text-sm">
                      {trialDaysRemaining === 0
                        ? 'Your trial has ended'
                        : t.trialDaysLeft(trialDaysRemaining)}
                    </p>
                  </div>
                  {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
                    <div className="w-16 h-16 relative flex-shrink-0">
                      <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#2B4157" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1769AA" strokeWidth="3"
                          strokeDasharray={`${(trialDaysRemaining / TRIAL_DAYS) * 100} 100`}
                          strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-ink">{trialDaysRemaining}d</span>
                    </div>
                  )}
                </div>
                <button onClick={() => navigate('/pricing')} className="btn-primary w-full">
                  {t.upgradeBtn} — ₹299/mo
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Appearance */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Sun size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-slt uppercase tracking-wide">{t.appearance}</h2>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{t.appearance}</p>
                <p className="text-xs text-slt mt-0.5">{t.appearanceSub}</p>
              </div>
              <div className="flex gap-1 bg-dark-700 rounded-lg p-1 shrink-0">
                {[
                  { v: 'system', label: t.themeAuto  },
                  { v: 'light',  label: t.themeLight },
                  { v: 'dark',   label: t.themeDark  },
                ].map(opt => (
                  <button
                    key={opt.v}
                    onClick={() => setTheme(opt.v)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      theme === opt.v ? 'bg-dark-400 text-ink shadow-sm' : 'text-slt hover:text-ink'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Profile edit section */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-slt uppercase tracking-wide">{t.editProfile}</h2>
          </div>
          <div className="card p-5 space-y-4">
            {/* Name */}
            <div>
              <label className="text-xs text-slt font-medium block mb-1">{t.nameLabel}</label>
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="input-field"
                placeholder={user?.name}
              />
            </div>

            {/* Age + Sport row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slt font-medium block mb-1">{t.ageLabel}</label>
                <input
                  type="number"
                  value={profileAge}
                  onChange={e => setProfileAge(e.target.value)}
                  className="input-field"
                  placeholder={t.agePlaceholder}
                  min="8" max="80"
                />
              </div>
              <div>
                <label className="text-xs text-slt font-medium block mb-1">{t.sportLabel}</label>
                <input
                  type="text"
                  value={profileSport}
                  onChange={e => setProfileSport(e.target.value)}
                  className="input-field"
                  placeholder={t.sportPlaceholder}
                />
              </div>
            </div>

            {/* Position */}
            <div>
              <label className="text-xs text-slt font-medium block mb-1">{t.positionLabel}</label>
              <input
                type="text"
                value={profilePosition}
                onChange={e => setProfilePosition(e.target.value)}
                className="input-field"
                placeholder={t.positionPlaceholder}
              />
            </div>

            {/* Experience level */}
            <div>
              <label className="text-xs text-slt font-medium block mb-2">{t.levelLabel}</label>
              <div className="grid grid-cols-2 gap-2">
                {EXPERIENCE_LEVELS.map(lv => (
                  <button
                    key={lv}
                    onClick={() => setProfileExperience(lv)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      profileExperience === lv ? 'bg-brand-500 text-white border-brand-500' : 'bg-dark-700 text-slt border-dark-500 hover:border-brand-600'
                    }`}
                  >
                    {EXPERIENCE_LABELS[lv]}
                  </button>
                ))}
              </div>
            </div>

            {/* Competition level */}
            <div>
              <label className="text-xs text-slt font-medium block mb-2">{t.competitionLabel}</label>
              <div className="grid grid-cols-2 gap-2">
                {COMPETITION_LEVELS.map(lv => (
                  <button
                    key={lv}
                    onClick={() => setProfileCompetition(lv)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      profileCompetition === lv ? 'bg-brand-500 text-white border-brand-500' : 'bg-dark-700 text-slt border-dark-500 hover:border-brand-600'
                    }`}
                  >
                    {COMPETITION_LABELS[lv]}
                  </button>
                ))}
              </div>
            </div>

            {/* Goals */}
            <div>
              <label className="text-xs text-slt font-medium block mb-2">{t.goalsLabel}</label>
              <div className="flex flex-wrap gap-2">
                {GOAL_OPTIONS.map(g => (
                  <button
                    key={g}
                    onClick={() => toggleGoal(g)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      profileGoals.includes(g) ? 'bg-brand-500 text-white border-brand-500' : 'bg-dark-700 text-slt border-dark-500 hover:border-brand-600'
                    }`}
                  >
                    {GOAL_LABELS_MAP[g]}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="text-xs text-slt font-medium block mb-2">
                {language === 'hi' ? 'कोचिंग भाषा' : 'Coaching language'}
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => handleLanguageChange('en')}
                  disabled={saving}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    user?.language === 'en' ? 'bg-brand-500 text-white border-brand-500' : 'bg-dark-700 text-slt border-dark-500 hover:border-brand-600'
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => handleLanguageChange('hi')}
                  disabled={saving}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    user?.language === 'hi' ? 'bg-brand-500 text-white border-brand-500' : 'bg-dark-700 text-slt border-dark-500 hover:border-brand-600'
                  }`}
                >
                  हिंदी
                </button>
              </div>
              {savedMsg && <p className="text-win-400 text-xs mt-2 text-center">{savedMsg}</p>}
            </div>

            {profileError && <p className="text-red-400 text-xs">{profileError}</p>}
            {profileSaved && <p className="text-win-400 text-xs text-center">{profileSaved}</p>}

            <button
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="btn-primary w-full justify-center py-3 disabled:opacity-50"
            >
              {profileSaving ? t.saving : t.saveProfile}
            </button>
          </div>
        </section>

        {/* Mental Game Profile link */}
        {user?.profileIntro && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-slt uppercase tracking-wide">
                {language === 'hi' ? 'मानसिक खेल प्रोफाइल' : 'Mental Game Profile'}
              </h2>
            </div>
            <Link
              to="/mental-game-profile"
              className="card p-5 flex items-center justify-between hover:border-brand-500/40 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-ink mb-0.5">
                  {language === 'hi' ? 'आपका शुरुआती प्रोफाइल' : 'Your starting profile'}
                </p>
                <p className="text-xs text-slt">
                  {language === 'hi' ? 'अर्जुन का पहला आकलन देखें' : 'See Arjun\'s first read on you'}
                </p>
              </div>
              <ChevronRight size={18} className="text-slt shrink-0" />
            </Link>
          </section>
        )}

        {/* My Focus Deck */}
        <section className="mb-6">
          <button
            onClick={() => navigate('/focus-deck')}
            className="card w-full p-4 flex items-center gap-3 hover:border-brand-500/40 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center flex-shrink-0">
              <Layers size={16} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">{hi ? 'मेरा Focus Deck' : 'My Focus Deck'}</p>
              <p className="text-xs text-slt">{hi ? 'अपने saved Focus Cards देखो' : 'View your saved Focus Cards'}</p>
            </div>
            <ChevronRight size={18} className="text-slt shrink-0" />
          </button>
        </section>

        {/* Body Reset History */}
        <section className="mb-6">
          <button
            onClick={() => navigate('/body-reset/history')}
            className="card w-full p-4 flex items-center gap-3 hover:border-teal-500/30 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center flex-shrink-0">
              <RefreshCw size={16} className="text-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">{hi ? 'Body Reset History' : 'Body Reset History'}</p>
              <p className="text-xs text-slt">{hi ? 'पिछले breathing resets देखो' : 'View past breathing resets'}</p>
            </div>
            <ChevronRight size={18} className="text-slt shrink-0" />
          </button>
        </section>

        {/* WhatsApp reminders placeholder */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-slt uppercase tracking-wide">{t.notifications}</h2>
          </div>
          <div className="card p-5 opacity-60">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink text-sm">{t.whatsappLabel}</p>
                <p className="text-slt text-xs mt-0.5">{t.whatsappDesc}</p>
              </div>
              <ChevronRight size={18} className="text-slt" />
            </div>
            <p className="text-xs text-slt mt-2">
              {language === 'hi' ? 'जल्द आ रहा है' : 'Coming soon'}
            </p>
          </div>
        </section>

        {/* Privacy & Data — single row, opens bottom sheet */}
        <section className="mb-6">
          <div className="card">
            <button
              onClick={() => setShowPrivacySheet(true)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-dark-700 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center flex-shrink-0">
                <Shield size={16} className="text-slt" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">{tprivacy.sectionTitle}</p>
                <p className="text-xs text-slt">{hi ? 'डेटा देखें और हटाएं' : 'View and delete your data'}</p>
              </div>
              <ChevronRight size={16} className="text-slt flex-shrink-0" />
            </button>
          </div>
        </section>

        {/* Achievements */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Award size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-slt uppercase tracking-wide">
              {language === 'hi' ? 'बैज' : 'Badges'}
            </h2>
            {earnedAchievements && (
              <span className="text-xs text-slt">{earnedAchievements.length}/{ALL_ACHIEVEMENT_KEYS.length}</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {ALL_ACHIEVEMENT_KEYS.map(key => {
              const def = ACHIEVEMENTS[key];
              const earned = earnedAchievements?.find(a => a.key === key);
              return (
                <div
                  key={key}
                  className={`card p-4 flex flex-col items-center text-center gap-1.5 transition-all ${
                    earned
                      ? 'border-brand-600/40 bg-brand-500/5 animate-badge-pop'
                      : 'opacity-35 grayscale'
                  }`}
                >
                  <span className="text-3xl">{def.icon}</span>
                  <p className="text-xs font-semibold text-ink leading-tight">{def.name}</p>
                  {earned ? (
                    <span className="text-[10px] text-brand-400 font-medium">+{def.xp} XP</span>
                  ) : (
                    <p className="text-[10px] text-slt leading-tight">{def.desc}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Help & Support */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle size={16} className="text-slt" />
            <h2 className="text-sm font-semibold text-slt uppercase tracking-wide">
              {language === 'hi' ? 'सहायता' : 'Help & Support'}
            </h2>
          </div>
          <div className="card px-4 py-4">
            <p className="text-sm text-slt mb-2">
              {language === 'hi'
                ? 'कोई सवाल या समस्या है? हम यहाँ हैं।'
                : 'Have a question or billing issue? We\'re here.'}
            </p>
            <a
              href="mailto:kamal.prabhanshu@outlook.com"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-400 hover:text-brand-300 transition-colors"
            >
              <Mail size={14} />
              kamal.prabhanshu@outlook.com
            </a>
          </div>
        </section>

        {/* Account actions */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-slt" />
            <h2 className="text-sm font-semibold text-slt uppercase tracking-wide">{t.dangerZone}</h2>
          </div>
          <div className="card space-y-1">
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-dark-700 transition-colors text-left"
            >
              <LogOut size={18} className="text-slt flex-shrink-0" />
              <span className="text-ink text-sm font-medium">{t.signOut}</span>
            </button>
            <div className="border-t border-dark-600" />
            <button
              onClick={() => { setShowDeleteModal(true); setDeleteStep(1); setDeleteConfirm(''); setDeleteError(''); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-500/10 transition-colors text-left"
            >
              <Trash2 size={18} className="text-red-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-red-400 text-sm font-medium">{tprivacy.account.label}</p>
                <p className="text-xs text-slt">{tprivacy.account.sub}</p>
              </div>
            </button>
          </div>
        </section>
      </main>

      {/* Cancel subscription confirmation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
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
