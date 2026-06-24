import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { CheckCircle2, ArrowLeft } from 'lucide-react';

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload  = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

export default function PricingPage() {
  const { user, token, language } = useAuth();
  const navigate   = useNavigate();
  const t          = translations[language].pricing;
  const hi         = language === 'hi';

  const [loadingPlan, setLoadingPlan] = useState(null); // 'monthly' | 'yearly' | null
  const [error,       setError]       = useState('');

  async function handleSubscribe(planType) {
    setError('');
    setLoadingPlan(planType);
    try {
      // 1. Create subscription on backend
      const res = await apiFetch('/api/payments/create-subscription', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ planType }),
      });

      if (!res.ok) {
        setError(t.errorGeneric);
        return;
      }

      const { subscriptionId } = await res.json();

      // 2. Load Razorpay checkout script
      await loadRazorpayScript();

      // 3. Open Razorpay checkout
      const options = {
        key:             import.meta.env.VITE_RAZORPAY_KEY_ID,
        subscription_id: subscriptionId,
        name:            'Arjun',
        description:     planType === 'monthly'
          ? 'Mental Performance Coaching — Monthly'
          : 'Mental Performance Coaching — Yearly',
        handler: function () {
          // Payment captured — navigate to success page.
          // Tier upgrade happens only when webhook fires (backend).
          navigate('/payment-success');
        },
        prefill: {
          name:  user?.name  ?? '',
          email: user?.email ?? '',
        },
        theme: { color: '#185FA5' },
        modal: {
          ondismiss: () => setLoadingPlan(null),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch {
      setError(t.errorGeneric);
    } finally {
      // Keep loadingPlan set until checkout opens (dismissed handler resets it)
      // Only clear on error
      if (error) setLoadingPlan(null);
    }
  }

  const FEATURES = [
    t.feature1, t.feature2, t.feature3,
    t.feature4, t.feature5, t.feature6,
  ];

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header */}
      <div className="max-w-lg mx-auto px-4 pt-5 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-dark-800 border border-dark-600 text-slt hover:text-ink transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-lg font-bold text-ink">{t.pageTitle}</h1>
      </div>

      <main className="max-w-lg mx-auto px-4 pb-16 animate-fade-in">

        {/* Plan cards */}
        <div className="grid grid-cols-2 gap-3 mb-8 mt-2">

          {/* Yearly — highlighted */}
          <div className="bg-brand-600/10 border-2 border-brand-500 rounded-2xl p-4 flex flex-col relative overflow-hidden">
            {/* Best value badge */}
            <span className="absolute top-0 left-0 right-0 text-center text-[10px] font-bold text-white bg-brand-600 py-1">
              {t.bestValue} · {t.save590}
            </span>
            <div className="mt-5">
              <p className="text-xs font-bold text-brand-400 uppercase tracking-wide mb-1">{t.yearly}</p>
              <p className="text-2xl font-black text-ink leading-none mb-0.5">{t.yearlyPrice}</p>
              <p className="text-[11px] text-brand-400 font-semibold">{t.monthlyEquiv} · {t.twoMonthsFree}</p>
              <p className="text-[10px] text-slt mt-1">{t.billedYearly}</p>
            </div>
            <button
              onClick={() => handleSubscribe('yearly')}
              disabled={!!loadingPlan}
              className="mt-4 w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
            >
              {loadingPlan === 'yearly' ? t.loading : t.startYearly}
            </button>
          </div>

          {/* Monthly */}
          <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 flex flex-col">
            <div>
              <p className="text-xs font-bold text-slt uppercase tracking-wide mb-1">{t.monthly}</p>
              <p className="text-2xl font-black text-ink leading-none mb-0.5">{t.monthlyPrice}</p>
              <p className="text-[11px] text-slt">&nbsp;</p>
              <p className="text-[10px] text-slt mt-1">{t.billedMonthly}</p>
            </div>
            <button
              onClick={() => handleSubscribe('monthly')}
              disabled={!!loadingPlan}
              className="mt-4 w-full py-2.5 rounded-xl bg-dark-700 border border-dark-500 hover:bg-dark-600 text-ink text-xs font-bold transition-colors disabled:opacity-60"
            >
              {loadingPlan === 'monthly' ? t.loading : t.startMonthly}
            </button>
          </div>

        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-fire-500 text-center mb-5">{error}</p>
        )}

        {/* Features list */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5 mb-5">
          <p className="text-xs font-bold text-slt uppercase tracking-wide mb-4">{t.featuresTitle}</p>
          <div className="space-y-3">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <CheckCircle2 size={14} className="text-win-500 shrink-0" />
                <span className="text-sm text-ink">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reassurance */}
        <p className="text-xs text-slt text-center leading-relaxed">{t.securePayment}</p>

      </main>
    </div>
  );
}
