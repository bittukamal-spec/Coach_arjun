import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArjunWordmark } from '../components/ArjunLogo';

// Same light system as AuthPage/LandingPage — hard-coded to this page (not
// the shared dark-* tokens) so a visitor arriving from the public homepage
// never crosses a theme wall, and an OS dark preference can't flip a public
// screen. See LandingPage.jsx's note on the same choice.
const BODY = 'text-[#5A6B80]';
const ERROR_TEXT = 'text-[#B4443C]';

const INPUT =
  'w-full min-h-[48px] rounded-xl border border-[#D9E1EC] bg-white px-3.5 text-[15px] text-[#0F172A] placeholder-[#9AA7B8] focus:border-[#185FA5] focus:outline-none focus:ring-2 focus:ring-[#185FA5]/25 transition-colors';

// Value must match the server's REASONS enum (server/src/routes/contact.js)
// exactly — the server rejects anything else.
const REASONS = [
  { value: 'general', labelKey: 'reasonGeneral' },
  { value: 'technical', labelKey: 'reasonTechnical' },
  { value: 'billing', labelKey: 'reasonBilling' },
  { value: 'safety', labelKey: 'reasonSafety' },
  { value: 'partnership', labelKey: 'reasonPartnership' },
];

const NAME_MIN = 2;
const NAME_MAX = 80;
const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

function ContactPage() {
  const { language } = useAuth();
  const t = translations[language].contact;
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  // Honeypot — hidden from sighted users and screen readers alike. A real
  // visitor can never populate this; a filled value means a bot.
  const [website, setWebsite] = useState('');

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | success

  function validate() {
    const errors = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX) errors.name = t.errorName;
    if (!trimmedEmail || trimmedEmail.length > EMAIL_MAX || !EMAIL_RE.test(trimmedEmail)) errors.email = t.errorEmail;
    if (!REASONS.some(r => r.value === reason)) errors.reason = t.errorReason;
    if (trimmedMessage.length < MESSAGE_MIN || trimmedMessage.length > MESSAGE_MAX) errors.message = t.errorMessage;
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === 'sending') return; // guards against a double submit

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setStatus('sending');
    setFormError('');
    try {
      const res = await apiFetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), email: email.trim(), reason, message: message.trim(), website,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setStatus('idle');
        setFormError(t.errorRateLimit);
        return;
      }
      if (!res.ok || !data.success) {
        setStatus('idle');
        setFormError(t.errorGeneric);
        return;
      }
      setStatus('success');
    } catch {
      setStatus('idle');
      setFormError(t.errorGeneric);
    }
  }

  function sendAnother() {
    setName(''); setEmail(''); setReason(''); setMessage(''); setWebsite('');
    setFieldErrors({}); setFormError(''); setStatus('idle');
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFBFD] text-[#0F172A]">

      {/* Header */}
      <header className="mx-auto flex w-full max-w-md items-center px-5 py-5">
        <button
          onClick={() => navigate('/')}
          className="flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2"
        >
          <ArjunWordmark size="hero" />
        </button>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-14 sm:items-center">
        <div className="w-full max-w-md">
          {status === 'success' ? (
            <div
              className="rounded-3xl border border-[#E4E9F2] bg-white p-6 text-center shadow-[0_6px_24px_rgba(15,23,42,0.07)] sm:p-8"
              role="status"
              aria-live="polite"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E2F2E6]">
                <CheckCircle2 size={28} className="text-[#1F7A46]" aria-hidden="true" />
              </div>
              <h1 className="text-[22px] font-black leading-tight tracking-tight">{t.successTitle}</h1>
              <p className={`mt-2 text-[14.5px] leading-relaxed ${BODY}`}>{t.successBody}</p>
              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#185FA5] text-[15.5px] font-bold text-white shadow-[0_6px_18px_rgba(24,95,165,0.25)] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2"
                >
                  {t.backHome}
                </button>
                <button
                  type="button"
                  onClick={sendAnother}
                  className="min-h-[44px] rounded-lg text-[14px] font-bold text-[#185FA5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2"
                >
                  {t.sendAnother}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="mb-2 text-[12.5px] font-bold uppercase tracking-wide text-[#185FA5]">{t.eyebrow}</p>
                <h1 className="text-[28px] font-black leading-tight tracking-tight">{t.title}</h1>
                <p className={`mt-1.5 text-[14.5px] ${BODY}`}>{t.subtitle}</p>
              </div>

              <div className="rounded-3xl border border-[#E4E9F2] bg-white p-5 shadow-[0_6px_24px_rgba(15,23,42,0.07)] sm:p-6">
                <form onSubmit={handleSubmit} noValidate className="space-y-4">

                  {/* Honeypot field. Off-screen and out of both the tab order
                      and the accessibility tree — no sighted or assistive-
                      tech visitor can ever reach it. A populated value tells
                      the server the submission is a bot. */}
                  <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                    <label htmlFor="contact-website">Website</label>
                    <input
                      id="contact-website"
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={e => setWebsite(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="contact-name" className="mb-1.5 block text-[12.5px] font-bold text-[#5A6B80]">
                      {t.nameLabel}
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={t.namePlaceholder}
                      autoComplete="name"
                      required
                      minLength={NAME_MIN}
                      maxLength={NAME_MAX}
                      aria-invalid={!!fieldErrors.name}
                      aria-describedby={fieldErrors.name ? 'contact-name-error' : undefined}
                      className={INPUT}
                    />
                    {fieldErrors.name && (
                      <p id="contact-name-error" className={`mt-1.5 text-[12.5px] font-semibold ${ERROR_TEXT}`}>
                        {fieldErrors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="contact-email" className="mb-1.5 block text-[12.5px] font-bold text-[#5A6B80]">
                      {t.emailLabel}
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder={t.emailPlaceholder}
                      autoComplete="email"
                      required
                      maxLength={EMAIL_MAX}
                      aria-invalid={!!fieldErrors.email}
                      aria-describedby={fieldErrors.email ? 'contact-email-error' : undefined}
                      className={INPUT}
                    />
                    {fieldErrors.email && (
                      <p id="contact-email-error" className={`mt-1.5 text-[12.5px] font-semibold ${ERROR_TEXT}`}>
                        {fieldErrors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="contact-reason" className="mb-1.5 block text-[12.5px] font-bold text-[#5A6B80]">
                      {t.reasonLabel}
                    </label>
                    <div className="relative">
                      <select
                        id="contact-reason"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        required
                        aria-invalid={!!fieldErrors.reason}
                        aria-describedby={fieldErrors.reason ? 'contact-reason-error' : undefined}
                        className={`${INPUT} appearance-none pr-10`}
                      >
                        <option value="" disabled>{t.reasonPlaceholder}</option>
                        {REASONS.map(r => (
                          <option key={r.value} value={r.value}>{t[r.labelKey]}</option>
                        ))}
                      </select>
                      <ChevronDown
                        size={18}
                        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5A6B80]"
                        aria-hidden="true"
                      />
                    </div>
                    {fieldErrors.reason && (
                      <p id="contact-reason-error" className={`mt-1.5 text-[12.5px] font-semibold ${ERROR_TEXT}`}>
                        {fieldErrors.reason}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="mb-1.5 block text-[12.5px] font-bold text-[#5A6B80]">
                      {t.messageLabel}
                    </label>
                    <textarea
                      id="contact-message"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder={t.messagePlaceholder}
                      required
                      rows={5}
                      minLength={MESSAGE_MIN}
                      maxLength={MESSAGE_MAX}
                      aria-invalid={!!fieldErrors.message}
                      aria-describedby={fieldErrors.message ? 'contact-message-error' : undefined}
                      className={`${INPUT} min-h-[128px] resize-y py-3`}
                    />
                    {fieldErrors.message && (
                      <p id="contact-message-error" className={`mt-1.5 text-[12.5px] font-semibold ${ERROR_TEXT}`}>
                        {fieldErrors.message}
                      </p>
                    )}
                  </div>

                  {formError && (
                    <p
                      role="alert"
                      className="flex items-start gap-2 rounded-xl border border-[#F3C7C3] bg-[#FDF3F2] px-3 py-2.5 text-[13px] font-semibold text-[#B4443C]"
                    >
                      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[#185FA5] text-[16px] font-bold text-white shadow-[0_6px_18px_rgba(24,95,165,0.25)] transition-transform active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2"
                  >
                    {status === 'sending' ? t.sending : t.sendBtn}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default ContactPage;
