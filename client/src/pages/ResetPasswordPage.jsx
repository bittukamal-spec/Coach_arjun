import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';

function ResetPasswordPage() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get('token');

  const [password, setPassword]         = useState('');
  const [confirmPassword, setConfirm]   = useState('');
  const [busy, setBusy]                 = useState(false);
  const [success, setSuccess]           = useState(false);
  const [error, setError]               = useState('');

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-calm-50 flex flex-col">
        <header className="max-w-5xl mx-auto px-4 py-5 flex items-center gap-2 w-full">
          <span className="text-2xl">🧠</span>
          <span className="font-bold text-gray-900 text-lg tracking-tight">MindGame</span>
        </header>
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm">
            <div className="card shadow-xl border border-gray-100 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-red-600 text-xl">✕</span>
              </div>
              <h1 className="text-lg font-bold text-gray-900 mb-2">Invalid reset link</h1>
              <p className="text-sm text-gray-500 mb-6">
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
                className="block text-center text-xs text-brand-600 hover:text-brand-700 font-medium mt-4 transition-colors"
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
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-calm-50 flex flex-col">
      {/* Top bar */}
      <header className="max-w-5xl mx-auto px-4 py-5 flex items-center gap-2 w-full">
        <span className="text-2xl">🧠</span>
        <span className="font-bold text-gray-900 text-lg tracking-tight">MindGame</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="card shadow-xl border border-gray-100">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Set new password</h1>
              <p className="text-sm text-gray-500">
                Choose a new password for your MindGame account
              </p>
            </div>

            {success ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-green-600 text-xl">✓</span>
                </div>
                <p className="text-sm font-semibold text-green-700 mb-1">Password updated!</p>
                <p className="text-xs text-gray-500 mb-6">
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
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    New password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    autoComplete="new-password"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    required
                    autoComplete="new-password"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
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

                <p className="text-center text-xs text-gray-400 pt-1">
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
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
