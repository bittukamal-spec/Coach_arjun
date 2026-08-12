import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ChevronDown, Flag, Globe, Menu,
  MessageCircle, NotebookPen, RotateCcw, Shield, Tag, Target, X, Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { ArjunLogo } from '../components/ArjunLogo';
import LandingCarousel from '../components/landing/LandingCarousel';
import {
  CoachPreview, FocusCardPreview, HeroPhone, PlaybookPreview, RepsPreview,
} from '../components/landing/LandingMockups';

// Public homepage. Deliberately a fixed light surface rather than the app's
// themed tokens: this is the first screen a visitor sees, the approved
// direction is white, and it must not flip to the dark theme on a device
// whose OS prefers dark. Same reasoning (and same technique) as the
// intentionally always-dark tool screens inside the app — a hard-coded
// palette, scoped to this one page, that never touches the shared tokens.
const INK = 'text-[#0F172A]';
const BODY = 'text-[#5A6B80]';
const BORDER = 'border-[#E4E9F2]';
const BRAND = '#185FA5';

// The four use cases, each with its own restrained tint so the row doesn't
// read as four identical white SaaS cards.
const HELP_TINTS = [
  { bg: '#E3EEFA', fg: BRAND,     Icon: Flag },        // preparation — blue
  { bg: '#DDF0EC', fg: '#13776F', Icon: RotateCcw },   // reset — teal
  { bg: '#E8E4FB', fg: '#5546C9', Icon: Target },      // focus — violet
  { bg: '#FAEBD8', fg: '#9A5410', Icon: NotebookPen }, // reflection — amber
];

function LandingPage() {
  const { language, toggleLanguage } = useAuth();
  const t = translations[language].landing;
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [installHint, setInstallHint] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const menuRef = useRef(null);

  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  // PWA install support is kept exactly as it was — the beforeinstallprompt
  // event is still captured and prompt() is still called. What changed is
  // placement: install is a secondary action inside the menu, never the
  // page's primary conversion, which is Create account / Sign in.
  useEffect(() => {
    const standalone =
      (typeof window !== 'undefined' && window.navigator?.standalone) ||
      (typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches);
    if (standalone) setInstalled(true);

    const onPrompt = (e) => { e.preventDefault(); setInstallPrompt(e); };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [menuOpen]);

  async function handleInstall() {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setInstallPrompt(null);
      setMenuOpen(false);
    } else {
      setInstallHint(true);
    }
  }

  const goCreate = () => navigate('/auth');
  const goSignIn = () => navigate('/auth?tab=signin');

  const previews = t.preview;
  const previewCards = [
    <CoachPreview key="coach" t={previews.coachCard} />,
    <RepsPreview key="reps" t={previews.repsCard} />,
    <PlaybookPreview key="playbook" t={previews.playbookCard} />,
    <FocusCardPreview key="focus" t={previews.focusCard} />,
  ];

  const valueItems = [
    { Icon: MessageCircle, label: t.valueCoach },
    { Icon: Zap, label: t.valueReps },
    { Icon: Tag, label: t.valueCues },
    { Icon: Globe, label: t.valueLang },
    { Icon: Shield, label: t.valuePrivate },
  ];

  return (
    <div className={`min-h-screen overflow-x-clip bg-[#FAFBFD] ${INK}`}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <ArjunLogo size={34} className="rounded-xl" />
          <span className="text-xl font-black tracking-tight">Arjun</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLanguage}
            aria-label={t.langLabel}
            className={`flex min-h-[44px] items-center gap-1 rounded-full border ${BORDER} bg-white px-1.5 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2`}
          >
            <span className={`rounded-full px-2.5 py-1.5 ${language === 'hi' ? 'bg-[#185FA5] text-white' : BODY}`}>हिंदी</span>
            <span className={`rounded-full px-2.5 py-1.5 ${language === 'en' ? 'bg-[#185FA5] text-white' : BODY}`}>EN</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? t.menuClose : t.menuOpen}
              aria-expanded={menuOpen}
              aria-controls="landing-menu"
              className={`flex h-11 w-11 items-center justify-center rounded-full border ${BORDER} bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2`}
            >
              {menuOpen
                ? <X size={20} aria-hidden="true" />
                : <Menu size={20} aria-hidden="true" />}
            </button>

            {menuOpen && (
              <div
                id="landing-menu"
                className={`absolute right-0 top-[52px] z-30 w-60 rounded-2xl border ${BORDER} bg-white p-2 shadow-[0_10px_30px_rgba(15,23,42,0.12)]`}
              >
                <button type="button" onClick={goSignIn} className={`flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[14px] font-semibold hover:bg-[#F3F6FB]`}>
                  {t.ctaSignIn}
                </button>
                {installed ? (
                  <p className={`px-3 py-3 text-[13px] font-semibold ${BODY}`}>✓ {t.installDone}</p>
                ) : (
                  <button type="button" onClick={handleInstall} className={`flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[14px] font-semibold hover:bg-[#F3F6FB]`}>
                    {t.installApp}
                  </button>
                )}
                {installHint && (
                  <p className={`mx-1 mb-1 rounded-xl bg-[#F3F6FB] px-3 py-2 text-[12px] leading-snug ${BODY}`}>
                    <span className="block font-semibold text-[#0F172A]">{t.installHow}</span>
                    {isIOS ? t.installIos : isAndroid ? t.installAndroid : t.installDesktop}
                  </p>
                )}
                <span className={`my-1 block h-px ${BORDER} border-t`} />
                <button type="button" onClick={() => navigate('/privacy')} className={`flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[14px] ${BODY} hover:bg-[#F3F6FB]`}>
                  {t.footerPrivacy}
                </button>
                <button type="button" onClick={() => navigate('/terms')} className={`flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[14px] ${BODY} hover:bg-[#F3F6FB]`}>
                  {t.footerTerms}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-5 pb-4 pt-6 lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:pt-12">
          <div>
            <p className={`inline-flex items-center gap-2 rounded-full border ${BORDER} bg-white px-3 py-1.5 text-[12px] font-semibold ${BODY}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-[#185FA5]" aria-hidden="true" />
              {t.pill}
            </p>

            {/* No hard-coded line breaks: the headline wraps to the column,
                balanced so the accent phrase never strands one short word. */}
            <h1 className="mt-5 text-[34px] font-black leading-[1.08] tracking-tight [text-wrap:balance] xs:text-[42px] lg:text-[50px]">
              {t.headlineLead}
              <span className="text-[#185FA5]">{t.headlineAccent}</span>
            </h1>

            <p className={`mt-4 text-[16px] leading-snug ${BODY}`}>{t.subtitle}</p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={goCreate}
                className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-2xl bg-[#185FA5] px-7 text-[16px] font-bold text-white shadow-[0_6px_18px_rgba(24,95,165,0.25)] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2"
              >
                {t.ctaCreate}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={goSignIn}
                className={`inline-flex min-h-[54px] items-center justify-center rounded-2xl border-[1.5px] border-[#185FA5] bg-white px-7 text-[16px] font-bold text-[#185FA5] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2`}
              >
                {t.ctaSignIn}
              </button>
            </div>
          </div>

          <div className="mt-10 lg:mt-0">
            <HeroPhone t={t} label={t.heroVisualAlt} />
          </div>
        </section>

        {/* ── Value strip ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-5 pt-10" aria-label={t.valueLabel}>
          <ul className={`no-scrollbar flex overflow-x-auto rounded-2xl border ${BORDER} bg-white shadow-[0_2px_8px_rgba(15,23,42,0.05)] lg:justify-between`}>
            {valueItems.map(({ Icon, label }, i) => (
              <li
                key={label}
                className={`flex shrink-0 items-center gap-2 px-4 py-3.5 ${i > 0 ? `border-l ${BORDER}` : ''}`}
              >
                <Icon size={17} className="shrink-0 text-[#185FA5]" aria-hidden="true" />
                <span className="max-w-[11ch] text-[12.5px] font-semibold leading-tight">{label}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── How Arjun helps ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-5 pt-10">
          <h2 className="text-[22px] font-black tracking-tight">{t.helpsTitle}</h2>
          <LandingCarousel
            label={t.helpsTitle}
            slideLabel={(i, n) => `${t.helps[i].title} (${i + 1}/${n})`}
            slideClass="w-[68%] xs:w-[54%] sm:w-[42%] lg:w-[23.5%]"
            className="mt-4"
          >
            {t.helps.map((help, i) => {
              const { bg, fg, Icon } = HELP_TINTS[i];
              return (
                <div
                  key={help.title}
                  className={`flex h-full min-h-[168px] flex-col rounded-3xl border ${BORDER} p-4`}
                  style={{ background: `linear-gradient(160deg, ${bg} 0%, #FFFFFF 82%)` }}
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
                    aria-hidden="true"
                  >
                    <Icon size={19} style={{ color: fg }} />
                  </span>
                  <h3 className="mt-4 text-[15px] font-bold leading-snug">{help.title}</h3>
                  <p className={`mt-1 text-[13px] leading-snug ${BODY}`}>{help.line}</p>
                </div>
              );
            })}
          </LandingCarousel>
        </section>

        {/* ── App preview ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-5 pt-10">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[22px] font-black tracking-tight">{t.previewTitle}</h2>
            <p className={`text-[12.5px] font-semibold ${BODY}`}>{t.previewHint}</p>
          </div>
          <LandingCarousel
            label={t.previewTitle}
            slideLabel={(i, n) => `${previewCards[i].props.t.title} (${i + 1}/${n})`}
            slideClass="w-[78%] xs:w-[66%] sm:w-[48%] lg:w-[24%]"
            className="mt-4"
          >
            {previewCards}
          </LandingCarousel>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-5 pt-10">
          <h2 className="text-[22px] font-black tracking-tight">{t.faqTitle}</h2>
          <div className="mt-4 space-y-2">
            {t.faq.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q} className={`rounded-2xl border ${BORDER} bg-white`}>
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(open ? null : i)}
                      aria-expanded={open}
                      aria-controls={`faq-panel-${i}`}
                      id={`faq-btn-${i}`}
                      className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2 rounded-2xl"
                    >
                      {item.q}
                      <ChevronDown
                        size={18}
                        aria-hidden="true"
                        className={`shrink-0 text-[#5A6B80] transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </h3>
                  <div
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-btn-${i}`}
                    hidden={!open}
                    className={`px-4 pb-4 text-[13.5px] leading-relaxed ${BODY}`}
                  >
                    {item.a}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Final CTA ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-5 pt-10">
          <div className="relative overflow-hidden rounded-3xl bg-[#185FA5] px-6 py-8 text-white sm:flex sm:items-center sm:justify-between sm:gap-6">
            <svg
              className="pointer-events-none absolute -right-10 -top-8 h-48 w-48 text-white/10"
              viewBox="0 0 200 200" fill="none" aria-hidden="true"
            >
              <circle cx="100" cy="100" r="88" stroke="currentColor" strokeWidth="10" />
              <circle cx="100" cy="100" r="56" stroke="currentColor" strokeWidth="10" />
            </svg>
            <div className="relative flex items-center gap-3">
              <ArjunLogo size={40} className="hidden rounded-xl xs:block" />
              <p className="text-[24px] font-black leading-tight">
                {t.finalLine1}<br />{t.finalLine2}
              </p>
            </div>
            <button
              type="button"
              onClick={goCreate}
              className="relative mt-6 inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-white px-7 text-[16px] font-bold text-[#185FA5] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#185FA5] sm:mt-0 sm:w-auto"
            >
              {t.ctaCreate}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className={`mx-auto mt-12 max-w-5xl border-t ${BORDER} px-5 py-8`}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {[
            { label: t.footerPrivacy, to: '/privacy' },
            { label: t.footerTerms, to: '/terms' },
            { label: t.footerChildSafety, to: '/terms#ai-child-safety' },
            { label: t.footerRefund, to: '/refund' },
          ].map((link) => (
            <button
              key={link.to}
              type="button"
              onClick={() => navigate(link.to)}
              className={`min-h-[44px] text-[13px] ${BODY} hover:text-[#0F172A]`}
            >
              {link.label}
            </button>
          ))}
          <a
            href="mailto:kamal.prabhanshu@outlook.com"
            className={`inline-flex min-h-[44px] items-center text-[13px] ${BODY} hover:text-[#0F172A]`}
          >
            {t.footerSupport}
          </a>
        </div>
        <p className={`mt-2 text-[12px] ${BODY}`}>
          © {new Date().getFullYear()} Arjun · {t.footerRights}
        </p>
      </footer>
    </div>
  );
}

export default LandingPage;
