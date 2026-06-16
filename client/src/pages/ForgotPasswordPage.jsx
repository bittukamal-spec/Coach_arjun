import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
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
      <header className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          <span className="font-bold text-gray-900 text-lg tracking-tight">MindGame</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="card shadow-xl border border-gray-100">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Forgot password?</h1>
              <p className="text-sm text-gray-500">
                We'll send a reset link to your email
              </p>
            </div>

            {success ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-green-600 text-xl">✓</span>
                </div>
                <p className="text-sm font-semibold text-green-700 mb-1">Check your email</p>
                <p className="text-xs text-gray-500 mb-6">
                  If that email is registered, we've sent a reset link. Check your inbox (and spam folder).
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  ← Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
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
                  {busy ? 'Sending…' : 'Send Reset Link'}
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

export default ForgotPasswordPage;
