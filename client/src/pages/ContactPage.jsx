import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronLeft, LifeBuoy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArjunLogo } from '../components/ArjunLogo';
import { HELPLINES } from '../constants/helplines';

// Same light system as AuthPage/LandingPage — hard-coded to this page (not
// the shared dark-* tokens) so a visitor arriving from the public homepage
// never crosses a theme wall, and an OS dark preference can't flip a public
// screen. See LandingPage.jsx's note on the same choice.
const BODY = 'text-slt';
const ERROR_TEXT = 'text-[#B4443C]';
const LABEL = 'mb-1.5 block text-[13px] text-slt';

const INPUT =
  'w-full min-h-[48px] rounded-[14px] bg-dark-400 px-3.5 text-[15px] text-ink placeholder:text-slt focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors';

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
    <div className="flex min-h-screen flex-col bg-dark-900 text-ink">

      {/* Header */}
      <header className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-5">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          aria-label={t.back}
          className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-dark-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => navigate('/')} aria-label="Arjun home" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <ArjunLogo size={28} />
        </button>
        <span className="w-11" aria-hidden="true" />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-14 pt-3">
        <div className="w-full max-w-md">
          {status === 'success' ? (
            <div
              className="pt-10 text-center"
              role="status"
              aria-live="polite"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-mint">
                <CheckCircle2 size={30} className="text-inkblock" aria-hidden="true" />
              </div>
              <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em]">{t.successTitle}</h1>
              <p className={`mt-2 text-[15px] leading-relaxed ${BODY}`}>{t.successBody}</p>
              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-sun text-[15px] font-bold text-inkblock transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  {t.backHome}
                </button>
                <button
                  type="button"
                  onClick={sendAnother}
                  className="min-h-[44px] rounded-lg text-[14px] text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  {t.sendAnother}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em]">{t.title}</h1>
                <p className={`mt-1.5 text-[15px] ${BODY}`}>{t.subtitle}</p>
              </div>

              <div>
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
                    <label htmlFor="contact-name" className={LABEL}>
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
                    <label htmlFor="contact-email" className={LABEL}>
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
                    <p id="contact-reason-label" className={LABEL}>
                      {t.reasonLabel}
                    </p>
                    <div role="radiogroup" aria-labelledby="contact-reason-label" aria-invalid={!!fieldErrors.reason} aria-describedby={fieldErrors.reason ? 'contact-reason-error' : undefined} className="flex flex-wrap gap-2">
                      {REASONS.map(r => (
                        <button
                          key={r.value}
                          type="button"
                          role="radio"
                          aria-checked={reason === r.value}
                          onClick={() => setReason(r.value)}
                          className={`min-h-[44px] rounded-xl px-3.5 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${reason === r.value ? 'bg-brand-500 text-white' : 'bg-dark-400 text-ink'}`}
                        >
                          {t[r.labelKey]}
                        </button>
                      ))}
                    </div>
                    {fieldErrors.reason && (
                      <p id="contact-reason-error" className={`mt-1.5 text-[12.5px] font-semibold ${ERROR_TEXT}`}>
                        {fieldErrors.reason}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="contact-message" className={LABEL}>
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
                    className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-sun text-[15px] font-bold text-inkblock transition-transform active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    {status === 'sending' ? t.sending : t.sendBtn}
                  </button>
                </form>
              </div>

              {/* Urgent help is never behind a form. */}
              <p className="mt-5 flex items-start gap-2.5 rounded-2xl bg-[#DDF7EE] px-3.5 py-3 text-[13px] leading-relaxed text-inkblock" data-testid="contact-helplines">
                <LifeBuoy size={18} className="mt-0.5 shrink-0 text-[#0E5A45]" aria-hidden="true" />
                <span>{t.urgentHelp(HELPLINES)}</span>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default ContactPage;
