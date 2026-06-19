import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { LogOut, Trash2, ChevronRight, Shield, Bell, User, Zap, Award, Camera, Brain } from 'lucide-react';
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
  const { user, token, language, logout, updateUser } = useAuth();
  const t = translations[language].account;
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const isPremium = user?.tier === 'premium';
  const trialDaysRemaining = getTrialDaysRemaining(user);

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
  const [avatar, setAvatar] = useState(() => localStorage.getItem(`arjun_avatar_${user?.id}`) || null);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setAvatar(dataUrl);
      localStorage.setItem(`arjun_avatar_${user.id}`, dataUrl);
    };
    reader.readAsDataURL(file);
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
        logout();
        navigate('/');
      } else {
        const data = await res.json();
        setDeleteError(data.error || 'Something went wrong');
      }
    } catch {
      setDeleteError('Network error. Please try again.');
    } finally {
      setDeleting(false);
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

      <main className="max-w-2xl mx-auto px-4 pt-24 pb-28 animate-fade-in">

        {/* Profile header with photo upload */}
        <div className="flex items-center gap-4 mb-8">
          <div className="relative flex-shrink-0">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-2xl font-bold flex items-center justify-center ring-2 ring-brand-600/40 cursor-pointer overflow-hidden"
            >
              {avatar
                ? <img src={avatar} alt="avatar" className="w-16 h-16 object-cover" />
                : user?.name?.charAt(0)?.toUpperCase()
              }
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-dark-700 border border-dark-500 flex items-center justify-center hover:bg-dark-600 transition-colors"
              title={t.uploadPhoto}
            >
              <Camera size={12} className="text-slate-400" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{user?.name}</h1>
            <p className="text-slate-500 text-sm">{user?.email}</p>
            {user?.sport && (
              <p className="text-slate-600 text-xs mt-0.5 capitalize">{user.sport}{user?.competitionLevel ? ` · ${COMPETITION_LABELS[user.competitionLevel] || user.competitionLevel}` : ''}</p>
            )}
            {memberSince && (
              <p className="text-slate-600 text-xs mt-0.5">{t.memberSince} {memberSince}</p>
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
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t.subscription}</h2>
          </div>
          <div className="card">
            {isPremium ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">⭐ {t.premiumSince}</p>
                  <p className="text-slate-500 text-sm">Unlimited coaching with Arjun</p>
                </div>
                <span className="text-xs font-bold bg-fire-500/20 text-fire-400 border border-fire-500/30 px-3 py-1 rounded-full">Active</span>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-semibold text-white">🆓 Free Trial</p>
                    <p className="text-slate-500 text-sm">
                      {trialDaysRemaining === 0
                        ? 'Your trial has ended'
                        : t.trialDaysLeft(trialDaysRemaining)}
                    </p>
                  </div>
                  {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
                    <div className="w-16 h-16 relative flex-shrink-0">
                      <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#2A2A50" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#8B5CF6" strokeWidth="3"
                          strokeDasharray={`${(trialDaysRemaining / TRIAL_DAYS) * 100} 100`}
                          strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">{trialDaysRemaining}d</span>
                    </div>
                  )}
                </div>
                <button className="btn-primary w-full">
                  {t.upgradeBtn} — ₹299/mo
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Profile edit section */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t.editProfile}</h2>
          </div>
          <div className="card space-y-4">
            {/* Name */}
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1">{t.nameLabel}</label>
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
                <label className="text-xs text-slate-500 font-medium block mb-1">{t.ageLabel}</label>
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
                <label className="text-xs text-slate-500 font-medium block mb-1">{t.sportLabel}</label>
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
              <label className="text-xs text-slate-500 font-medium block mb-1">{t.positionLabel}</label>
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
              <label className="text-xs text-slate-500 font-medium block mb-2">{t.levelLabel}</label>
              <div className="grid grid-cols-2 gap-2">
                {EXPERIENCE_LEVELS.map(lv => (
                  <button
                    key={lv}
                    onClick={() => setProfileExperience(lv)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      profileExperience === lv ? 'bg-brand-500 text-white border-brand-500' : 'bg-dark-700 text-slate-400 border-dark-500 hover:border-brand-600'
                    }`}
                  >
                    {EXPERIENCE_LABELS[lv]}
                  </button>
                ))}
              </div>
            </div>

            {/* Competition level */}
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-2">{t.competitionLabel}</label>
              <div className="grid grid-cols-2 gap-2">
                {COMPETITION_LEVELS.map(lv => (
                  <button
                    key={lv}
                    onClick={() => setProfileCompetition(lv)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      profileCompetition === lv ? 'bg-brand-500 text-white border-brand-500' : 'bg-dark-700 text-slate-400 border-dark-500 hover:border-brand-600'
                    }`}
                  >
                    {COMPETITION_LABELS[lv]}
                  </button>
                ))}
              </div>
            </div>

            {/* Goals */}
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-2">{t.goalsLabel}</label>
              <div className="flex flex-wrap gap-2">
                {GOAL_OPTIONS.map(g => (
                  <button
                    key={g}
                    onClick={() => toggleGoal(g)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      profileGoals.includes(g) ? 'bg-brand-500 text-white border-brand-500' : 'bg-dark-700 text-slate-400 border-dark-500 hover:border-brand-600'
                    }`}
                  >
                    {GOAL_LABELS_MAP[g]}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-2">
                {language === 'hi' ? 'कोचिंग भाषा' : 'Coaching language'}
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => handleLanguageChange('en')}
                  disabled={saving}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    user?.language === 'en' ? 'bg-brand-500 text-white border-brand-500' : 'bg-dark-700 text-slate-400 border-dark-500 hover:border-brand-600'
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => handleLanguageChange('hi')}
                  disabled={saving}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    user?.language === 'hi' ? 'bg-brand-500 text-white border-brand-500' : 'bg-dark-700 text-slate-400 border-dark-500 hover:border-brand-600'
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

        {/* Mental DNA — OCEAN personality */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t.dnaTitle}</h2>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500 mb-4">{t.dnaSubtitle}</p>
            {user?.oceanO != null ? (
              <div className="space-y-3 mb-4">
                {Object.entries(t.dnaTraits).map(([key, traitName]) => {
                  const val = user[`ocean${key}`];
                  return (
                    <div key={key}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-slate-400 font-medium">{traitName}</span>
                        <span className="text-xs text-brand-400 font-bold">{val}/5</span>
                      </div>
                      <div className="w-full bg-dark-600 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
                          style={{ width: `${(val / 5) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-600 text-sm mb-4">
                {language === 'hi' ? 'अभी तक परीक्षण नहीं लिया।' : 'No personality test taken yet.'}
              </p>
            )}
            <button
              onClick={() => navigate('/personality-test')}
              className="btn-secondary w-full justify-center py-2.5 text-sm"
            >
              {user?.oceanO != null ? t.dnaRetake : t.dnaTake}
            </button>
          </div>
        </section>

        {/* WhatsApp reminders placeholder */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t.notifications}</h2>
          </div>
          <div className="card opacity-60">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-white text-sm">{t.whatsappLabel}</p>
                <p className="text-slate-500 text-xs mt-0.5">{t.whatsappDesc}</p>
              </div>
              <ChevronRight size={18} className="text-slate-600" />
            </div>
            <p className="text-xs text-slate-600 mt-2">
              {language === 'hi' ? 'जल्द आ रहा है' : 'Coming soon'}
            </p>
          </div>
        </section>

        {/* Achievements */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Award size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
              {language === 'hi' ? 'बैज' : 'Badges'}
            </h2>
            {earnedAchievements && (
              <span className="text-xs text-slate-600">{earnedAchievements.length}/{ALL_ACHIEVEMENT_KEYS.length}</span>
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
                  <p className="text-xs font-semibold text-white leading-tight">{def.name}</p>
                  {earned ? (
                    <span className="text-[10px] text-brand-400 font-medium">+{def.xp} XP</span>
                  ) : (
                    <p className="text-[10px] text-slate-600 leading-tight">{def.desc}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Help & Support */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-slate-500 text-base">💬</span>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
              {language === 'hi' ? 'सहायता' : 'Help & Support'}
            </h2>
          </div>
          <div className="card px-4 py-4">
            <p className="text-sm text-slate-400 mb-2">
              {language === 'hi'
                ? 'कोई सवाल या समस्या है? हम यहाँ हैं।'
                : 'Have a question or billing issue? We\'re here.'}
            </p>
            <a
              href="mailto:kamal.prabhanshu@outlook.com"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-400 hover:text-brand-300 transition-colors"
            >
              <span>✉</span>
              kamal.prabhanshu@outlook.com
            </a>
          </div>
        </section>

        {/* Account actions */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t.dangerZone}</h2>
          </div>
          <div className="card space-y-1">
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-dark-700 transition-colors text-left"
            >
              <LogOut size={18} className="text-slate-400 flex-shrink-0" />
              <span className="text-slate-300 text-sm font-medium">{t.signOut}</span>
            </button>
            <div className="border-t border-dark-600" />
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-500/10 transition-colors text-left"
            >
              <Trash2 size={18} className="text-red-500 flex-shrink-0" />
              <span className="text-red-400 text-sm font-medium">{t.deleteAccount}</span>
            </button>
          </div>
        </section>
      </main>

      {/* Delete account modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
          <div className="bg-dark-800 border border-dark-500 rounded-2xl p-6 w-full max-w-md animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <h3 className="font-bold text-white">{t.deleteConfirmTitle}</h3>
            </div>
            <p className="text-slate-400 text-sm mb-5">{t.deleteConfirmDesc}</p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={t.deleteConfirmPlaceholder}
              className="input-field mb-4 font-mono tracking-widest"
            />
            {deleteError && <p className="text-red-400 text-sm mb-3">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteError(''); }}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== 'DELETE' || deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? t.deleting : t.deleteConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountPage;
