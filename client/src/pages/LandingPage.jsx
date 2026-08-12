import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, ArrowRight, Check, ChevronDown, Download, Flag, Gauge, Globe, Menu,
  MessageCircle, NotebookPen, RefreshCw, RotateCcw, Shield, Sparkles, Tag, Target,
  Trophy, X, Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { ArjunLogo } from '../components/ArjunLogo';
import LandingCarousel from '../components/landing/LandingCarousel';
import {
  CoachPreview, FocusCardPreview, GameChips, HeroPhone, PlaybookPreview,
  PressureFlow, RepsPreview, WorksList,
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
// read as four identical white SaaS cards. Same four-accent family the
// authenticated Train cards use — blue, teal, amber, violet.
const HELP_TINTS = [
  { bg: '#E3EEFA', fg: BRAND,     Icon: Flag },        // preparation — blue
  { bg: '#DDF0EC', fg: '#13776F', Icon: Activity },    // reset — teal
  { bg: '#FAEBD8', fg: '#9A5410', Icon: Target },      // focus — amber
  { bg: '#E8E4FB', fg: '#5546C9', Icon: RotateCcw },   // reflection — violet
];

// Personalisation cards — one accent each, in the same family.
const PERSONAL_TINTS = [
  { bg: '#E3EEFA', fg: BRAND,     Icon: Trophy },   // your game — blue
  { bg: '#E8E4FB', fg: '#5546C9', Icon: Gauge },    // when pressure hits — violet
  { bg: '#DDF0EC', fg: '#13776F', Icon: Sparkles }, // what works — teal
];

// Sport-psychology principles — a lighter wash of the same accents, so the
// row reads as calmer than the two gradient-card rows above it.
const PRINCIPLE_TINTS = [
  { bg: '#DDF0EC', fg: '#13776F', Icon: RefreshCw },   // reset after setbacks
  { bg: '#E3EEFA', fg: BRAND,     Icon: MessageCircle }, // focus & self-talk
  { bg: '#FAEBD8', fg: '#9A5410', Icon: NotebookPen }, // reflect & learn
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

  // PWA install support is the same implementation it has always been — the
  // beforeinstallprompt event is captured here, prompt() is called in
  // handleInstall, and the no-prompt fallback still shows the platform
  // instructions. What changed is placement: installing is now the page's
  // primary action, exposed directly in the header and behind every Download
  // CTA, rather than hidden in the menu.
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

  const goSignIn = () => navigate('/auth?tab=signin');

  // One product action for the whole page: install the app. Every Download
  // CTA (hero, pricing, final, footer) runs the same PWA handler as the
  // header button — there is no second install implementation. Once the app
  // is installed, the same button stops claiming to install and opens Arjun
  // instead, so an installed visitor never sees a misleading action. Account
  // creation and sign-in happen inside the app; /auth is untouched and still
  // reachable from the menu.
  const primaryLabel = installed ? t.ctaOpen : t.ctaDownload;
  const primaryAction = installed ? goSignIn : handleInstall;

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
      {/* Order: brand · language · install · menu. Install is a visible header
          action rather than a menu item, and shares the one PWA handler with
          every other Download CTA on the page. */}
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-5 py-4">
        <div className="flex items-center gap-2">
          <ArjunLogo size={32} className="shrink-0 rounded-xl" />
          <span className="text-[19px] font-black tracking-tight">Arjun</span>
        </div>

        <div className="flex items-center gap-1.5 xs:gap-2">
          <button
            type="button"
            onClick={toggleLanguage}
            aria-label={t.langLabel}
            className={`flex min-h-[44px] shrink-0 items-center rounded-full border ${BORDER} bg-white p-1 text-[12.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2`}
          >
            <span className={`rounded-full px-2 py-1.5 ${language === 'hi' ? 'bg-[#185FA5] text-white' : BODY}`}>हिंदी</span>
            <span className={`rounded-full px-2 py-1.5 ${language === 'en' ? 'bg-[#185FA5] text-white' : BODY}`}>EN</span>
          </button>

          {installed ? (
            <span className={`flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border ${BORDER} bg-white px-2.5 text-[12.5px] font-semibold ${BODY}`}>
              <Check size={15} className="text-[#13776F]" aria-hidden="true" />
              <span className="hidden xs:inline">{t.installDone}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleInstall}
              aria-label={t.installApp}
              className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-[#185FA5] px-3 text-[13px] font-bold text-white shadow-[0_3px_10px_rgba(24,95,165,0.25)] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2 xs:px-4"
            >
              <Download size={16} aria-hidden="true" />
              <span className="hidden xs:inline">{t.installShort}</span>
            </button>
          )}

          <div className="relative shrink-0" ref={menuRef}>
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
                {/* Install is NOT repeated here — it has its own visible
                    header action. Sign in stays available for athletes who
                    already have an account, without being a page CTA. */}
                <button type="button" onClick={goSignIn} className={`flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[14px] font-semibold hover:bg-[#F3F6FB]`}>
                  {t.ctaSignIn}
                </button>
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

      {/* Manual-install instructions — the existing fallback for browsers with
          no beforeinstallprompt. It sits under the header so it is visible
          whichever Download action triggered it. */}
      {installHint && (
        <div className="mx-auto max-w-5xl px-5">
          <div className={`flex items-start gap-3 rounded-2xl border ${BORDER} bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.05)]`}>
            <p className={`flex-1 text-[13px] leading-snug ${BODY}`}>
              <span className="block font-bold text-[#0F172A]">{t.installHow}</span>
              {isIOS ? t.installIos : isAndroid ? t.installAndroid : t.installDesktop}
            </p>
            <button
              type="button"
              onClick={() => setInstallHint(false)}
              aria-label={t.close}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${BODY} hover:bg-[#F3F6FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5]`}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <main>
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        {/* No eyebrow/pill: header → whitespace → headline. */}
        <section className="mx-auto max-w-5xl px-5 pb-4 pt-8 lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:pt-14">
          <div>
            {/* No hard-coded line breaks: the headline wraps to the column,
                balanced so the accent phrase never strands one short word. */}
            <h1 className="text-[34px] font-black leading-[1.08] tracking-tight [text-wrap:balance] xs:text-[42px] lg:text-[50px]">
              {t.headlineLead}
              <span className="text-[#185FA5]">{t.headlineAccent}</span>
            </h1>

            <p className={`mt-4 text-[16px] leading-snug ${BODY}`}>{t.subtitle}</p>

            <div className="mt-7">
              <button
                type="button"
                onClick={primaryAction}
                className="inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[#185FA5] px-8 text-[16px] font-bold text-white shadow-[0_6px_18px_rgba(24,95,165,0.25)] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2 sm:w-auto"
              >
                {primaryLabel}
                <ArrowRight size={18} aria-hidden="true" />
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
                  className="flex h-full min-h-[168px] flex-col rounded-3xl border p-4"
                  style={{
                    background: `linear-gradient(155deg, ${bg} 0%, ${bg}66 58%, #FFFFFF 100%)`,
                    borderColor: `${fg}22`,
                  }}
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-[0_4px_12px_rgba(15,23,42,0.10)]"
                    style={{ background: fg }}
                    aria-hidden="true"
                  >
                    <Icon size={19} />
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

        {/* ── Arjun gets to know how you perform ──────────────────────────── */}
        {/* Mirrors the athlete's real Profile sections — My Game, When
            Pressure Hits, What Helps Me — so the claim stays inside what the
            athlete themselves told Arjun. No traits, no scoring. */}
        <section className="mx-auto max-w-5xl px-5 pt-12">
          <h2 className="text-[22px] font-black tracking-tight">{t.personalTitle}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {t.personal.map((item, i) => {
              const { bg, fg, Icon } = PERSONAL_TINTS[i];
              return (
                <div
                  key={item.title}
                  className="flex flex-col rounded-3xl border p-4"
                  style={{
                    background: `linear-gradient(155deg, ${bg} 0%, ${bg}55 62%, #FFFFFF 100%)`,
                    borderColor: `${fg}22`,
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_4px_12px_rgba(15,23,42,0.10)]"
                      style={{ background: fg }}
                      aria-hidden="true"
                    >
                      <Icon size={18} />
                    </span>
                    <h3 className="text-[15px] font-bold leading-snug">{item.title}</h3>
                  </div>
                  <div className="mt-3.5" aria-hidden="true">
                    {i === 0 && <GameChips chips={t.personalGameChips} fg={fg} />}
                    {i === 1 && (
                      <PressureFlow
                        steps={[t.personalFlow.situation, t.personalFlow.firstResponse, t.personalFlow.impact]}
                        fg={fg}
                      />
                    )}
                    {i === 2 && <WorksList items={t.personalWorks} fg={fg} />}
                  </div>
                  <p className={`mt-3.5 text-[13px] leading-snug ${BODY}`}>{item.line}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Built around sport psychology principles ─────────────────────── */}
        {/* Principles only — no percentages, no study names, no claim that any
            research measured Arjun itself. */}
        <section className="mx-auto max-w-5xl px-5 pt-12">
          <h2 className="text-[22px] font-black tracking-tight">{t.principlesTitle}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {t.principles.map((item, i) => {
              const { bg, fg, Icon } = PRINCIPLE_TINTS[i];
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-2xl border p-4"
                  style={{ background: `${bg}66`, borderColor: `${fg}22` }}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_4px_12px_rgba(15,23,42,0.10)]"
                    style={{ background: fg }}
                    aria-hidden="true"
                  >
                    <Icon size={18} />
                  </span>
                  <div>
                    <h3 className="text-[14.5px] font-bold leading-snug">{item.title}</h3>
                    <p className={`mt-1 text-[12.5px] leading-snug ${BODY}`}>{item.line}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Pricing ─────────────────────────────────────────────────────── */}
        {/* The only two numbers the product actually has: a 14-day trial and
            ₹299/month. No tiers, no annual plan, no struck-through price, no
            savings claim. Nothing here touches the payment implementation. */}
        <section className="mx-auto max-w-5xl px-5 pt-12">
          <div
            className="relative overflow-hidden rounded-3xl px-6 py-9 text-white sm:px-10 sm:py-11"
            style={{ background: 'linear-gradient(140deg, #1E6FC4 0%, #2A4FC0 52%, #4B32B4 100%)' }}
          >
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 400 220" fill="none" preserveAspectRatio="xMaxYMid slice" aria-hidden="true"
            >
              <circle cx="360" cy="40" r="110" stroke="#FFFFFF" strokeOpacity="0.10" strokeWidth="10" />
              <path d="M-20 200 C 90 200, 160 120, 260 120 S 400 56, 470 56" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="3" />
            </svg>

            <div className="relative sm:flex sm:items-end sm:justify-between sm:gap-8">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{t.pricingLabel}</p>
                <h2 className="mt-2 text-[26px] font-black leading-tight xs:text-[30px]">{t.pricingTitle}</h2>
                <p className="mt-4 text-[34px] font-black leading-none xs:text-[38px]">{t.pricingTrial}</p>
                <p className="mt-2 text-[17px] font-bold text-white/90">{t.pricingPrice}</p>
                <p className="mt-3 max-w-xs text-[13px] leading-snug text-white/75">{t.pricingNote}</p>
              </div>

              <button
                type="button"
                onClick={primaryAction}
                className="mt-7 inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-white px-8 text-[16px] font-bold text-[#2A4FC0] shadow-[0_8px_24px_rgba(12,20,72,0.30)] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2A4FC0] sm:mt-0 sm:w-auto"
              >
                {primaryLabel}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────────── */}
        {/* Same 5xl gutter as every other section, with the rows themselves
            capped narrower so long questions stay readable. */}
        <section className="mx-auto max-w-5xl px-5 pt-12">
          <h2 className="text-[22px] font-black tracking-tight">{t.faqTitle}</h2>
          <div className="mt-4 max-w-3xl space-y-2">
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
          <div
            className="relative overflow-hidden rounded-3xl px-6 py-9 text-white sm:flex sm:items-center sm:justify-between sm:gap-6"
            style={{ background: 'linear-gradient(135deg, #1C6FBE 0%, #185FA5 46%, #10456F 100%)' }}
          >
            {/* Abstract performance lines — decorative, no meaning carried. */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 400 200" fill="none" preserveAspectRatio="xMaxYMid slice" aria-hidden="true"
            >
              <circle cx="345" cy="60" r="96" stroke="#FFFFFF" strokeOpacity="0.12" strokeWidth="10" />
              <circle cx="345" cy="60" r="60" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="10" />
              <path d="M-20 178 C 90 178, 150 96, 250 96 S 400 34, 460 34" stroke="#FFFFFF" strokeOpacity="0.16" strokeWidth="3" />
              <path d="M-20 196 C 100 196, 170 130, 270 130 S 400 74, 460 74" stroke="#FFFFFF" strokeOpacity="0.10" strokeWidth="3" />
            </svg>
            <div className="relative flex items-center gap-3">
              <ArjunLogo size={44} className="hidden rounded-2xl xs:block" />
              <p className="text-[24px] font-black leading-tight xs:text-[26px]">
                {t.finalLine1}<br />{t.finalLine2}
              </p>
            </div>
            <div className="relative mt-6 sm:mt-0 sm:shrink-0">
              <button
                type="button"
                onClick={primaryAction}
                className="inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-white px-8 text-[16px] font-bold text-[#185FA5] shadow-[0_8px_24px_rgba(8,42,74,0.28)] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#185FA5] sm:w-auto"
              >
                {primaryLabel}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className={`mx-auto mt-12 max-w-5xl border-t ${BORDER} px-5 py-8`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArjunLogo size={22} className="rounded-lg" />
            <span className="text-[15px] font-black tracking-tight">Arjun</span>
          </div>
          <button
            type="button"
            onClick={primaryAction}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border-[1.5px] border-[#185FA5] px-5 text-[14px] font-bold text-[#185FA5] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2`}
          >
            {primaryLabel}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
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
