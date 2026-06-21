import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';
import { ArjunLogo } from '../components/ArjunLogo';

function ResetPasswordPage() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get('token');

  const [password, setPassword]         = useState('');
  const [confirmPassword, setConfirm]   = useState('');
  const [busy, setBusy]                 = useState(false);
  const [success, setSuccess]           = useState(false);
  const [error, setError]               = useState('');

  const inputClass = 'w-full border border-dark-600 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition text-ink bg-dark-700 placeholder-slt';

  if (!token) {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <header className="max-w-5xl mx-auto px-4 py-5 flex items-center gap-2 w-full">
          <ArjunLogo size={28} />
          <span className="font-bold text-ink text-lg tracking-tight">Arjun</span>
        </header>
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm">
            <div className="card shadow-xl border border-dark-600 text-center">
              <div className="w-12 h-12 bg-alert/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-alert text-xl font-bold">✕</span>
              </div>
              <h1 className="text-lg font-bold text-ink mb-2">Invalid reset link</h1>
              <p className="text-sm text-slt mb-6">
                This link is missing a reset token. Please request a new password reset link.
              </p>
              <button
                onClick={() => navigate('/forgot-password')}
                className="btn-primary w-full justify-center py-3 text-sm"
              >
                Request new link
              </button>
              <button
                onClick={() => navigate('/')}
                className="block text-center text-xs text-brand-500 hover:text-brand-600 font-medium mt-4 transition-colors"
              >
                ← Back to sign in
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <header className="max-w-5xl mx-auto px-4 py-5 flex items-center gap-2 w-full">
        <ArjunLogo size={28} />
        <span className="font-bold text-ink text-lg tracking-tight">Arjun</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="card shadow-xl border border-dark-600">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-ink mb-1">Set new password</h1>
              <p className="text-sm text-slt">
                Choose a new password for your Arjun account
              </p>
            </div>

            {success ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-win-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-win-500 text-xl font-bold">✓</span>
                </div>
                <p className="text-sm font-semibold text-win-500 mb-1">Password updated!</p>
                <p className="text-xs text-slt mb-6">
                  Your password has been changed successfully.
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="btn-primary w-full justify-center py-3 text-sm"
                >
                  Sign in now
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slt mb-1">
                    New password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slt mb-1">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    required
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </div>

                {error && (
                  <p className="text-xs text-alert bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="btn-primary w-full justify-center py-3 text-sm"
                >
                  {busy ? 'Updating…' : 'Update Password'}
                </button>

                <p className="text-center text-xs text-slt pt-1">
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="text-brand-500 hover:text-brand-600 font-medium transition-colors"
                  >
                    ← Back to sign in
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default ResetPasswordPage;
