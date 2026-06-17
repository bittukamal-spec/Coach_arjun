import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { LogOut, Trash2, ChevronRight, Shield, Bell, User } from 'lucide-react';

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

  const isPremium = user?.tier === 'premium';
  const trialDaysRemaining = getTrialDaysRemaining(user);

  // Language toggle
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 pt-24 pb-28 animate-fade-in">

        {/* Profile header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-2xl font-bold flex items-center justify-center ring-2 ring-brand-600/40">
            {user?.name?.charAt(0)?.toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{user?.name}</h1>
            <p className="text-slate-500 text-sm">{user?.email}</p>
            {memberSince && (
              <p className="text-slate-600 text-xs mt-0.5">{t.memberSince} {memberSince}</p>
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

        {/* Language preference */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t.editProfile}</h2>
          </div>
          <div className="card">
            <p className="text-sm font-medium text-slate-300 mb-3">
              {language === 'hi' ? 'कोचिंग भाषा' : 'Coaching language'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleLanguageChange('en')}
                disabled={saving}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  user?.language === 'en'
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-dark-700 text-slate-400 border-dark-500 hover:border-brand-600'
                }`}
              >
                English
              </button>
              <button
                onClick={() => handleLanguageChange('hi')}
                disabled={saving}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  user?.language === 'hi'
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-dark-700 text-slate-400 border-dark-500 hover:border-brand-600'
                }`}
              >
                हिंदी
              </button>
            </div>
            {savedMsg && (
              <p className="text-win-400 text-xs mt-2 text-center">{savedMsg}</p>
            )}
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
