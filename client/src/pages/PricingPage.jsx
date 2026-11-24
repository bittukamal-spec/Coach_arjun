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
        theme: { color: '#1B4DFF' },
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

  // Playbook look (Nov 2026): yearly = the brand-blue block with a sun
  // button, monthly = a card, then what's included. Prices, payment flow and
  // copy are unchanged (they must match the live Razorpay plans).
  return (
    <div className="min-h-screen bg-dark-900">
      <div className="max-w-lg mx-auto px-4 pt-4 pb-2 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="w-11 h-11 flex items-center justify-center rounded-2xl bg-dark-400 text-ink active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      <main className="max-w-lg mx-auto px-page pb-16 animate-fade-in">
        <h1 className="mt-2 text-[30px] leading-tight font-extrabold text-ink">{t.pageTitle}</h1>

        <div className="mt-5 space-y-3">
          {/* Yearly — the main choice */}
          <section className="rounded-[28px] bg-brand-500 p-5 text-white" data-testid="plan-yearly">
            <span className="inline-flex items-center rounded-full bg-sun px-3 py-1 text-[12px] font-extrabold text-inkblock">
              {t.bestValue} · {t.saveYearly}
            </span>
            <p className="mt-4 text-[13px] font-extrabold uppercase tracking-[0.1em] text-white/80">{t.yearly}</p>
            <p className="mt-1 text-[34px] leading-none font-extrabold">{t.yearlyPrice}</p>
            <p className="mt-2 text-[14px] font-bold">{t.monthlyEquiv}</p>
            <p className="text-[13px] text-white/80">{t.billedYearly}</p>
            <button
              onClick={() => handleSubscribe('yearly')}
              disabled={!!loadingPlan}
              className="mt-5 w-full min-h-[56px] rounded-[18px] bg-sun text-inkblock text-base font-extrabold active:scale-[0.98] transition-transform disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {loadingPlan === 'yearly' ? t.loading : t.startYearly}
            </button>
          </section>

          {/* Monthly */}
          <section className="rounded-[28px] bg-dark-400 p-5" data-testid="plan-monthly">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-slt">{t.monthly}</p>
            <p className="mt-1 text-[30px] leading-none font-extrabold text-ink">{t.monthlyPrice}</p>
            <p className="mt-2 text-[13px] text-slt">{t.billedMonthly}</p>
            <button
              onClick={() => handleSubscribe('monthly')}
              disabled={!!loadingPlan}
              className="mt-5 w-full min-h-[52px] rounded-[18px] bg-inkblock text-white text-base font-extrabold active:scale-[0.98] transition-transform disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {loadingPlan === 'monthly' ? t.loading : t.startMonthly}
            </button>
          </section>
        </div>

        {error && <p role="alert" className="mt-4 text-[13px] text-red-500 text-center">{error}</p>}

        {/* What's included */}
        <section className="mt-6 rounded-[28px] bg-dark-400 p-5">
          <h2 className="text-[16px] font-extrabold text-ink">{t.featuresTitle}</h2>
          <ul className="mt-3 space-y-3">
            {FEATURES.map((f, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-500" aria-hidden="true" />
                <span className="text-[14.5px] leading-snug text-ink">{f}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-5 text-[13px] text-slt text-center leading-relaxed">{t.securePayment}</p>
      </main>
    </div>
  );
}
