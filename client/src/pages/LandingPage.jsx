import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Menu, X, ChevronDown, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { ArjunLogo } from '../components/ArjunLogo';
import { PhotoSlot, CheckDot } from '../components/site/SiteBits';

// ─── Public website (Playbook redesign, Nov 2026) ─────────────────────────────
// Founder-approved mock-ups ("Arjun public pages"): one main action, "Start
// free" (→ sign up); no prices on this page — the Premium box opens the
// Free vs Premium page (/premium), which leads to the plans page (/plans).
// Words are sport-neutral. Photos load from /photos/*.jpg and fall back to
// a drawing until the founder adds them (components/site/SiteBits.jsx).

const STEP_DOT = 'w-[34px] h-[34px] rounded-full bg-brand-500 text-white flex items-center justify-center text-[15px] font-extrabold shrink-0';
const HELP_TONES = ['bg-sun', 'bg-coral', 'bg-mint', 'bg-sky', 'bg-blush'];

function LandingPage() {
  const { language } = useAuth();
  const t = translations[language]?.site || translations.en.site;
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [installPrompt, setInstallPrompt] = useState(null);
  const menuRef = useRef(null);

  // Install stays available from the menu (same PWA prompt as before); the
  // page's main action is now signing up.
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [menuOpen]);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setMenuOpen(false);
  }

  const startFree = () => navigate('/auth?tab=signup');

  const menuItem = 'flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[14px] font-semibold text-ink hover:bg-dark-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

  return (
    <div className="min-h-screen overflow-x-clip bg-dark-900 text-ink">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-5 py-3">
        <Link to="/" className="flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Arjun home">
          <ArjunLogo size={30} />
          <span className="text-[20px] font-extrabold tracking-[-0.02em]">Arjun</span>
        </Link>
        <nav aria-label="Site" className="flex items-center gap-2">
          <a href="#how" className="hidden lg:flex min-h-[44px] items-center px-3 text-[15px] font-semibold">{t.howTitle}</a>
          <a href="#faq" className="hidden lg:flex min-h-[44px] items-center px-3 text-[15px] font-semibold">{t.faqTitle}</a>
          <Link to="/auth?tab=signin" className="flex min-h-[44px] items-center rounded-[14px] bg-dark-400 px-4 text-[14px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            {t.signIn}
          </Link>
          <button type="button" onClick={startFree} className="hidden lg:flex min-h-[44px] items-center rounded-[14px] bg-sun px-4 text-[14px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            {t.startFree}
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              aria-label={menuOpen ? t.menuClose : t.menuOpen}
              aria-expanded={menuOpen}
              aria-controls="site-menu"
              className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-dark-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
            {menuOpen && (
              <div id="site-menu" className="absolute right-0 top-[52px] z-30 w-56 rounded-2xl bg-dark-400 p-2 shadow-card">
                {installPrompt && (
                  <button type="button" onClick={handleInstall} className={menuItem}>{t.installApp}</button>
                )}
                <button type="button" onClick={() => navigate('/privacy')} className={menuItem}>{t.footerPrivacy}</button>
                <button type="button" onClick={() => navigate('/terms')} className={menuItem}>{t.footerTerms}</button>
                <button type="button" onClick={() => navigate('/contact')} className={menuItem}>{t.footerContact}</button>
              </div>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-5 pt-2 lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:pt-10">
          <div>
            <h1 className="text-[38px] leading-[1.02] font-extrabold tracking-[-0.03em] [text-wrap:balance] lg:text-[60px]">{t.heroTitle}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slt lg:text-[18px]">{t.heroSub}</p>
            <button
              type="button"
              onClick={startFree}
              data-testid="site-hero-cta"
              className="mt-5 hidden lg:inline-flex min-h-[58px] items-center gap-2 rounded-[18px] bg-sun px-8 text-[17px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {t.startFree}
              <ArrowRight size={18} strokeWidth={2.6} aria-hidden="true" />
            </button>
          </div>

          <div className="relative mt-4 h-[330px] overflow-hidden rounded-[32px] bg-brand-500 lg:mt-0 lg:h-[440px]">
            <span className="absolute inset-x-[18px] bottom-0 h-[300px] rounded-t-[160px] bg-brand-300 lg:h-[400px]" aria-hidden="true" />
            <PhotoSlot
              src="/photos/hero.jpg"
              alt={t.heroPhotoAlt}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[300px] w-[230px] rounded-t-[115px] lg:h-[400px] lg:w-[300px] lg:rounded-t-[150px]"
            />
            <span className="absolute left-3.5 top-5 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-[12.5px] font-bold text-inkblock shadow-card">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-mint" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#101533" strokeWidth="2.6"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill="#101533" /></svg>
              </span>
              {t.chipBreathe}
            </span>
            <span className="absolute right-3.5 top-[92px] rounded-2xl bg-sun px-3 py-2 text-[12.5px] font-extrabold text-inkblock">{t.chipCue}</span>
            <span className="absolute bottom-6 left-5 flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-[12.5px] font-bold text-inkblock">
              <CheckDot className="w-4 h-4" tone="plain" />
              {t.chipHelped}
            </span>
          </div>

          <button
            type="button"
            onClick={startFree}
            className="mt-4 flex w-full min-h-[56px] items-center justify-center gap-2 rounded-[18px] bg-sun text-[16px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 lg:hidden"
          >
            {t.startFree}
            <ArrowRight size={18} strokeWidth={2.6} aria-hidden="true" />
          </button>

          <ul className="mt-3.5 flex flex-wrap justify-center gap-1.5 lg:col-span-2 lg:mt-8" aria-label="Why athletes trust Arjun">
            {t.tags.map(tag => (
              <li key={tag} className="rounded-full bg-dark-400 px-3 py-1.5 text-[12.5px] font-bold">{tag}</li>
            ))}
          </ul>
        </section>

        {/* ── How Arjun helps ────────────────────────────────────────────── */}
        <section id="how" className="mx-auto max-w-5xl scroll-mt-4 px-5 pt-14 lg:pt-20">
          <h2 className="text-[26px] leading-tight font-extrabold tracking-[-0.02em] lg:text-[34px]">{t.howTitle}</h2>
          <p className="mt-1.5 text-[14px] text-slt">{t.howSub}</p>

          <ol className="mt-4 space-y-3 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
            <li className="flex gap-3 lg:flex-col">
              <span className={STEP_DOT} aria-hidden="true">1</span>
              <div className="flex-1 rounded-[22px] bg-dark-400 p-3.5 flex flex-col gap-2">
                <h3 className="text-[16px] font-extrabold">{t.step1}</h3>
                <p className="self-end max-w-[85%] rounded-[16px_16px_4px_16px] bg-brand-500 px-3 py-2 text-[13px] text-white">{t.step1You}</p>
                <p className="flex items-end gap-1.5">
                  <ArjunLogo size={26} className="shrink-0" />
                  <span className="max-w-[85%] rounded-[16px_16px_16px_4px] bg-dark-900 px-3 py-2 text-[13px]">{t.step1Arjun}</span>
                </p>
              </div>
            </li>
            <li className="flex gap-3 lg:flex-col">
              <span className={STEP_DOT} aria-hidden="true">2</span>
              <div className="flex-1 rounded-[22px] bg-dark-400 p-3.5 flex flex-col gap-2">
                <h3 className="text-[16px] font-extrabold">{t.step2}</h3>
                <p className="flex items-center gap-2.5 rounded-2xl bg-mint p-3 text-inkblock">
                  <svg aria-hidden="true" width="36" height="36" viewBox="0 0 104 104" className="shrink-0"><circle cx="52" cy="52" r="44" fill="#A8EFD8" /><circle cx="52" cy="52" r="26" fill="#FFFFFF" /><circle cx="52" cy="52" r="8" fill="#101533" /></svg>
                  <span className="flex flex-col">
                    <span className="text-[14px] font-extrabold">{t.step2Card}</span>
                    <span className="text-[12px] text-[#1C3B33]">{t.step2CardSub}</span>
                  </span>
                </p>
              </div>
            </li>
            <li className="flex gap-3 lg:flex-col">
              <span className={STEP_DOT} aria-hidden="true">3</span>
              <div className="flex-1 rounded-[22px] bg-dark-400 p-3.5 flex flex-col gap-2">
                <h3 className="text-[16px] font-extrabold">{t.step3}</h3>
                <p className="grid grid-cols-3 gap-1.5 rounded-2xl bg-brand-500 p-2.5 text-white">
                  <span className="flex flex-col"><span className="text-[20px] font-extrabold">4</span><span className="text-[10.5px] text-white/90">{t.step3Practices}</span></span>
                  <span className="flex flex-col"><span className="text-[20px] font-extrabold">2</span><span className="text-[10.5px] text-white/90">{t.step3Reflections}</span></span>
                  <span className="flex flex-col"><span className="text-[20px] font-extrabold">3 of 4</span><span className="text-[10.5px] text-white/90">{t.step3Helped}</span></span>
                </p>
              </div>
            </li>
          </ol>

          <p className="mt-5 mb-2 text-[13px] font-extrabold uppercase tracking-[0.06em] text-slt">{t.helpsLabel}</p>
          <ul className="flex flex-wrap gap-2">
            {t.helps.map((h, i) => (
              <li key={h} className={`rounded-full px-3 py-2 text-[13px] font-bold text-inkblock ${HELP_TONES[i % HELP_TONES.length]}`}>{h}</li>
            ))}
          </ul>
        </section>

        {/* ── Why Arjun — an honest comparison ───────────────────────────── */}
        <section className="mx-auto max-w-5xl px-5 pt-14 lg:pt-20">
          <h2 className="text-[26px] leading-tight font-extrabold tracking-[-0.02em] lg:text-[34px]">{t.whyTitle}</h2>
          <p className="mt-1.5 text-[14px] text-slt">{t.whySub}</p>
          <div className="mt-4 overflow-hidden rounded-[22px] bg-dark-400">
            <table className="w-full border-collapse text-[13px] lg:text-[15px]">
              <thead>
                <tr>
                  <td className="p-3" />
                  <th scope="col" className="bg-brand-500 p-3 text-left font-extrabold text-white">{t.whyCols.arjun}</th>
                  <th scope="col" className="p-3 text-left font-extrabold">{t.whyCols.inPerson}</th>
                </tr>
              </thead>
              <tbody>
                {t.whyRows.map(r => (
                  <tr key={r.label} className="border-t border-dark-600">
                    <th scope="row" className="p-3 text-left font-bold align-top">{r.label}</th>
                    <td className="bg-brand-500/10 p-3 font-bold align-top">{r.arjun}</td>
                    <td className="p-3 text-slt align-top">{r.inPerson}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Is AI coaching safe? ────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-5 pt-10">
          <div className="rounded-[28px] bg-[#DDF7EE] p-5 text-inkblock lg:p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint" aria-hidden="true">
              <ShieldCheck size={26} strokeWidth={2.2} />
            </span>
            <h2 className="mt-3 text-[22px] leading-tight font-extrabold">{t.safeTitle}</h2>
            <ul className="mt-3 space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:space-y-0 lg:gap-y-3">
              {t.safePoints.map(p => (
                <li key={p} className="flex gap-2.5 text-[14px] leading-snug">
                  <CheckDot className="w-5 h-5 shrink-0 mt-px" tone="mint" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Premium box — no price here; opens the Free vs Premium page ── */}
        <section className="mx-auto max-w-5xl px-5 pt-10">
          <Link
            to="/premium"
            data-testid="site-premium-box"
            className="relative flex flex-col gap-3 overflow-hidden rounded-[28px] bg-brand-500 p-5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 lg:p-8"
          >
            <span className="absolute -right-5 -top-5 h-[120px] w-[120px] rounded-full bg-brand-300" aria-hidden="true" />
            <span className="relative flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white" aria-hidden="true">
                <ArjunLogo size={30} />
              </span>
              <span className="text-[20px] font-extrabold">{t.premiumBoxTitle}</span>
            </span>
            <span className="relative flex flex-col gap-2 text-[14px] font-semibold">
              {t.premiumBoxPoints.map(p => (
                <span key={p} className="flex items-center gap-2">
                  <CheckDot className="w-5 h-5 shrink-0" tone="sun" />
                  {p}
                </span>
              ))}
            </span>
            <span className="relative flex min-h-[56px] items-center justify-center gap-2 rounded-[18px] bg-sun text-[16px] font-extrabold text-inkblock lg:self-start lg:px-10">
              {t.premiumBoxCta}
              <ArrowRight size={18} strokeWidth={2.6} aria-hidden="true" />
            </span>
          </Link>
        </section>

        {/* ── Questions ──────────────────────────────────────────────────── */}
        <section id="faq" className="mx-auto max-w-5xl scroll-mt-4 px-5 pt-14 lg:pt-20">
          <h2 className="mb-3 text-[26px] leading-tight font-extrabold tracking-[-0.02em] lg:text-[34px]">{t.faqTitle}</h2>
          <ul className="space-y-2">
            {t.faqs.map((f, i) => {
              const open = openFaq === i;
              return (
                <li key={f.q} className="rounded-[18px] bg-dark-400">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`faq-${i}`}
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 text-left text-[15px] font-bold rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {f.q}
                    <ChevronDown size={18} strokeWidth={2.4} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {open && <p id={`faq-${i}`} className="px-4 pb-4 text-[13.5px] leading-relaxed text-slt">{f.a}</p>}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Final call ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-5 pt-12">
          <div className="flex flex-col items-center gap-3 rounded-[28px] bg-sun p-5 text-center text-inkblock lg:flex-row lg:p-8 lg:text-left">
            <PhotoSlot src="/photos/cta.jpg" alt={t.finalPhotoAlt} className="h-[150px] w-full rounded-[20px] lg:h-[180px] lg:w-[320px]" tone="sun" />
            <div className="flex w-full flex-col gap-3 lg:pl-6">
              <h2 className="text-[24px] leading-tight font-extrabold">{t.finalTitle}</h2>
              <button
                type="button"
                onClick={startFree}
                className="flex min-h-[56px] items-center justify-center rounded-[18px] bg-brand-500 text-[16px] font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inkblock focus-visible:ring-offset-2 lg:self-start lg:px-10"
              >
                {t.startFree}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="mx-auto max-w-5xl px-5 pb-10 pt-8">
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slt">
          <Link to="/privacy" className="min-h-[32px] flex items-center">{t.footerPrivacy}</Link>
          <Link to="/terms" className="min-h-[32px] flex items-center">{t.footerTerms}</Link>
          <Link to="/terms#ai-child-safety" className="min-h-[32px] flex items-center">{t.footerChildSafety}</Link>
          <Link to="/refund" className="min-h-[32px] flex items-center">{t.footerRefund}</Link>
          <Link to="/contact" className="min-h-[32px] flex items-center">{t.footerContact}</Link>
        </nav>
        <p className="mt-3 text-[12px] text-slt">{t.copyright(new Date().getFullYear())}</p>
      </footer>
    </div>
  );
}

export default LandingPage;
