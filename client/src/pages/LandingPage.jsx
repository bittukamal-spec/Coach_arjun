import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, ArrowRight, Bookmark, Check, ChevronDown, Download, Flag, Gauge,
  Globe, Lock, Menu, MessageCircle, NotebookPen, RefreshCw, RotateCcw, Sparkles,
  Target, Trophy, X, Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { ArjunLogo } from '../components/ArjunLogo';
import LandingCarousel from '../components/landing/LandingCarousel';
import {
  CoachPreview, GameChips, HeroPhone, PlaybookPreview, PressureFlow,
  ProfilePreview, RepsPreview, WorksList,
} from '../components/landing/LandingMockups';
import {
  AthleteMark, BreathMark, CardsMark, StopwatchMark,
} from '../components/visuals/CardArt';

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
// The four use cases. Each gets its own tint AND its own sport mark — the
// same silhouettes the authenticated Train cards use (CardArt.jsx), so the
// section carries sport imagery without shipping a single binary asset or a
// stock photo.
const HELP_TINTS = [
  { bg: '#E3EEFA', fg: BRAND,     Icon: Flag,      Art: AthleteMark },   // before a match — blue
  { bg: '#DDF0EC', fg: '#13776F', Icon: Activity,  Art: BreathMark },    // under pressure — teal
  { bg: '#FAEBD8', fg: '#9A5410', Icon: RotateCcw, Art: StopwatchMark }, // after a setback — amber
  { bg: '#E8E4FB', fg: '#5546C9', Icon: Target,    Art: CardsMark },     // build the mental game — violet
];

// Personalisation cards — one accent each, in the same family.
const PERSONAL_TINTS = [
  { bg: '#E3EEFA', fg: BRAND,     Icon: Trophy },   // your game — blue
  { bg: '#DDF0EC', fg: '#13776F', Icon: Gauge },    // when pressure hits — teal
  { bg: '#E8E4FB', fg: '#5546C9', Icon: Sparkles }, // what works — violet
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

  // One product action for the whole page: install Arjun. Every CTA (hero,
  // pricing, final, footer) runs the same PWA handler as the header button —
  // there is no second install implementation. Once the app is installed the
  // same button stops claiming to install and opens Arjun instead, so an
  // installed visitor never sees a misleading action. Account creation and
  // sign-in happen inside the app; /auth is untouched and still reachable
  // from the menu.
  //
  // The pricing CTAs deliberately run this same action: choosing a plan needs
  // an authenticated Razorpay subscription (POST /api/payments/create-
  // subscription, in-app /pricing), so the homepage routes to the real entry
  // point instead of faking a checkout. No payment contract is touched.
  const primaryLabel = installed ? t.ctaOpen : t.ctaInstall;
  const primaryAction = installed ? goSignIn : handleInstall;

  const previews = t.preview;
  const previewCards = [
    <CoachPreview key="coach" t={previews.coachCard} />,
    <RepsPreview key="reps" t={previews.repsCard} />,
    <PlaybookPreview key="playbook" t={previews.playbookCard} />,
    <ProfilePreview key="profile" t={previews.profileCard} />,
  ];

  // One accent per tag, from the same family the app uses. Green is added
  // only here, for the privacy tag — it reads as reassurance, not as a
  // product area.
  const benefitTags = [
    { Icon: MessageCircle, label: t.tagTalk,    bg: '#E7F0FB', fg: '#185FA5' },
    { Icon: Zap,           label: t.tagReps,    bg: '#DDF0EC', fg: '#13776F' },
    { Icon: Bookmark,      label: t.tagSave,    bg: '#FAEBD8', fg: '#9A5410' },
    { Icon: Globe,         label: t.tagLang,    bg: '#EAE6FC', fg: '#5546C9' },
    { Icon: Lock,          label: t.tagPrivate, bg: '#E2F2E6', fg: '#1F7A46' },
  ];

  return (
    <div className={`min-h-screen overflow-x-clip bg-[#FAFBFD] ${INK}`}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      {/* Order: brand · language · install · menu. Install is a visible header
          action rather than a menu item, and shares the one PWA handler with
          every other Download CTA on the page. */}
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-5 py-3">
        <div className="flex items-center gap-2">
          <ArjunLogo size={32} className="shrink-0 rounded-xl" />
          <span className="text-[19px] font-black tracking-tight">Arjun</span>
        </div>

        <div className="flex items-center gap-1.5 xs:gap-2">
          <button
            type="button"
            onClick={toggleLanguage}
            aria-label={t.langLabel}
            className={`flex h-10 shrink-0 items-center rounded-full border ${BORDER} bg-white p-[3px] text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2`}
          >
            <span className={`rounded-full px-2.5 py-1.5 ${language === 'hi' ? 'bg-[#185FA5] text-white' : BODY}`}>हिंदी</span>
            <span className={`rounded-full px-2 py-1.5 ${language === 'en' ? 'bg-[#185FA5] text-white' : BODY}`}>EN</span>
          </button>

          {installed ? (
            <span className={`flex h-10 shrink-0 items-center gap-1 rounded-full border ${BORDER} bg-white px-2.5 text-[12px] font-semibold ${BODY}`}>
              <Check size={15} className="text-[#13776F]" aria-hidden="true" />
              <span className="hidden xs:inline">{t.installDone}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleInstall}
              aria-label={t.installApp}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#185FA5] px-3.5 text-[13px] font-bold text-white shadow-[0_3px_10px_rgba(24,95,165,0.25)] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2 xs:px-4"
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
              className={`flex h-10 w-10 items-center justify-center rounded-full border ${BORDER} bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2`}
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
        <section className="mx-auto max-w-5xl px-5 pb-2 pt-6 lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:pt-12">
          <div>
            {/* No hard-coded line breaks: the headline wraps to the column,
                balanced so the accent phrase never strands one short word. */}
            {/* Two logical lines: the statement, then the accented promise on
                its own line. Each half still wraps freely inside its column. */}
            <h1 className="text-[42px] font-black leading-[0.98] tracking-[-0.02em] [text-wrap:balance] xs:text-[48px] lg:text-[58px]">
              {t.headlineLead}
              <span className="block text-[#185FA5]">{t.headlineAccent}</span>
            </h1>

            <p className={`mt-4 text-[16px] leading-snug ${BODY}`}>{t.subtitle}</p>

            <div className="mt-6">
              <button
                type="button"
                onClick={primaryAction}
                className="inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[#185FA5] px-8 text-[16.5px] font-bold text-white shadow-[0_6px_18px_rgba(24,95,165,0.25)] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2 sm:w-auto"
              >
                {primaryLabel}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* The device sits after the copy + CTA on mobile and beside them from
              lg up, so the fold stays copy → CTA → phone → tags → How Arjun
              helps rather than pushing the sections down. */}
          <div className="mt-7 lg:mt-0">
            <HeroPhone t={t} label={t.heroVisualAlt} />
          </div>
        </section>

        {/* ── Benefit tags ────────────────────────────────────────────────── */}
        {/* Separate coloured tags, one accent each — not five identical pills. */}
        <section className="mx-auto max-w-5xl px-5 pt-8" aria-label={t.tagsLabel}>
          {/* One elevated rail: circular tinted icon, label, nothing else. It
              scrolls on a phone and settles into a single white container from
              `sm` up, as in the approved direction. */}
          <ul className={`no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:justify-between sm:gap-1 sm:overflow-visible sm:rounded-[1.75rem] sm:border ${BORDER} sm:bg-white sm:px-3 sm:py-3 sm:shadow-[0_6px_22px_rgba(15,23,42,0.06)]`}>
            {benefitTags.map(({ Icon, label, bg, fg }, i) => (
              <li
                key={label}
                className={`flex shrink-0 items-center gap-2.5 rounded-2xl px-3 py-2.5 sm:flex-1 sm:justify-center sm:rounded-none sm:border-0 sm:bg-transparent sm:px-3 ${
                  i > 0 ? `sm:border-l ${BORDER}` : ''
                }`}
                style={{ background: bg, border: `1px solid ${fg}22` }}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: `${fg}1F` }}
                  aria-hidden="true"
                >
                  <Icon size={18} style={{ color: fg }} />
                </span>
                <span className="whitespace-nowrap text-[13px] font-bold text-[#0F172A] sm:max-w-[10ch] sm:whitespace-normal sm:text-[12.5px] sm:leading-tight">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── How Arjun helps ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-5 pt-9">
          <h2 className="text-[22px] font-black tracking-tight">{t.helpsTitle}</h2>
          <LandingCarousel
            label={t.helpsTitle}
            slideLabel={(i, n) => `${t.helps[i].title} (${i + 1}/${n})`}
            slideClass="w-[68%] xs:w-[54%] sm:w-[42%] lg:w-[23.5%]"
            className="mt-4"
          >
            {t.helps.map((help, i) => {
              const { bg, fg, Icon, Art } = HELP_TINTS[i];
              return (
                <div
                  key={help.title}
                  className="relative flex h-full min-h-[236px] flex-col overflow-hidden rounded-3xl border p-4"
                  style={{
                    background: `linear-gradient(160deg, ${bg} 0%, ${bg}88 52%, #FFFFFF 100%)`,
                    borderColor: `${fg}26`,
                  }}
                >
                  {/* Sport imagery band filling the lower half of the card —
                      the same silhouettes the app's Train cards use, sized up
                      so they read as imagery rather than as a watermark. */}
                  <span
                    className="pointer-events-none absolute inset-x-0 bottom-0 block h-[48%] rounded-b-3xl"
                    style={{ background: `linear-gradient(180deg, transparent 0%, ${fg}1A 100%)` }}
                    aria-hidden="true"
                  />
                  <span
                    className="pointer-events-none absolute -bottom-1 right-2 block h-32 w-32 opacity-[0.32]"
                    style={{ color: fg }}
                    aria-hidden="true"
                  >
                    <Art className="h-full w-full" />
                  </span>
                  <span
                    className="relative flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-[0_4px_12px_rgba(15,23,42,0.12)]"
                    style={{ background: fg }}
                    aria-hidden="true"
                  >
                    <Icon size={19} />
                  </span>
                  <h3 className="relative mt-4 text-[16px] font-bold leading-snug">{help.title}</h3>
                  <p className={`relative mt-1 text-[13px] leading-snug ${BODY}`}>{help.line}</p>
                </div>
              );
            })}
          </LandingCarousel>
        </section>

        {/* ── Inside Arjun ────────────────────────────────────────────────── */}
        {/* A full-bleed tinted canvas breaks the heading/card/heading rhythm
            and lets the dark product crops sit on something other than white. */}
        <section className="mt-12 bg-[#F1F5FA] py-11">
          <div className="mx-auto max-w-5xl px-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[22px] font-black tracking-tight">{t.previewTitle}</h2>
            <p className={`text-[12.5px] font-semibold ${BODY}`}>{t.previewHint}</p>
          </div>
          <LandingCarousel
            label={t.previewTitle}
            slideLabel={(i, n) => `${previewCards[i].props.t.title} (${i + 1}/${n})`}
            slideClass="w-[85%] xs:w-[72%] sm:w-[50%] lg:w-[24%]"
            className="mt-4"
          >
            {previewCards}
          </LandingCarousel>
          </div>
        </section>

        {/* ── Built around you ─────────────────────────────────────────────── */}
        {/* Mirrors the athlete's real Profile sections — My Game, When
            Pressure Hits, What Helps Me — so the claim stays inside what the
            athlete themselves told Arjun. No traits, no scoring. */}
        <section className="relative mx-auto max-w-5xl px-5 pt-12">
          {/* One athlete figure, part of the composition rather than a card —
              the same silhouette the Ritual card uses inside the app. */}
          <span
            className="pointer-events-none absolute -bottom-2 right-2 block h-40 w-40 opacity-[0.08] sm:h-56 sm:w-56"
            style={{ color: BRAND }}
            aria-hidden="true"
          >
            <AthleteMark className="h-full w-full" />
          </span>
          <h2 className="relative text-[22px] font-black tracking-tight">{t.personalTitle}</h2>
          <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
            {t.personal.map((item, i) => {
              const { bg, fg, Icon } = PERSONAL_TINTS[i];
              return (
                <div
                  key={item.title}
                  className="relative flex flex-col overflow-hidden rounded-3xl border p-5"
                  style={{
                    background: `linear-gradient(155deg, ${bg} 0%, ${bg}77 60%, #FFFFFF 100%)`,
                    borderColor: `${fg}26`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_6px_16px_rgba(15,23,42,0.14)]"
                      style={{ background: fg }}
                      aria-hidden="true"
                    >
                      <Icon size={22} />
                    </span>
                    <h3 className="text-[16px] font-bold leading-snug">{item.title}</h3>
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
        {/* Two real plans, one heading above them — not inside a card. The only
            saving claimed is the arithmetic one: ₹299 × 12 = ₹3,588, minus
            ₹2,499 = ₹1,089. No third tier, no struck-through price, no
            urgency. Both CTAs run the page's install action because choosing a
            plan requires an authenticated Razorpay subscription inside the app;
            no payment contract is touched here. */}
        <section className="mx-auto max-w-5xl px-5 pt-12">
          <h2 className="text-[22px] font-black tracking-tight">{t.pricingTitle}</h2>
          <p className={`mt-1.5 text-[13.5px] ${BODY}`}>{t.pricingTrialNote}</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 sm:items-start">
            {/* Monthly — neutral container, outlined CTA */}
            <div className={`flex flex-col rounded-3xl border ${BORDER} bg-white p-5`}>
              <p className={`text-[12px] font-bold uppercase tracking-[0.12em] ${BODY}`}>{t.planMonthly}</p>
              <p className="mt-2 text-[26px] font-black leading-none">{t.planMonthlyPrice}</p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {t.planBenefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-[13.5px] leading-snug">
                    <Check size={16} strokeWidth={3} className="mt-[2px] shrink-0 text-[#185FA5]" aria-hidden="true" />
                    {benefit}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={primaryAction}
                className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl border-[1.5px] border-[#185FA5] bg-white text-[15.5px] font-bold text-[#185FA5] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2"
              >
                {t.planChooseMonthly}
              </button>
            </div>

            {/* Yearly — preferred: brand border, light tint, badge, filled CTA */}
            <div
              className="relative flex flex-col rounded-3xl border-2 border-[#185FA5] p-5 shadow-[0_8px_28px_rgba(24,95,165,0.12)]"
              style={{ background: 'linear-gradient(160deg, #EDF4FC 0%, #FFFFFF 72%)' }}
            >
              <span className="absolute right-4 top-4 rounded-full bg-[#185FA5] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white">
                {t.planPopular}
              </span>
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#185FA5]">{t.planYearly}</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
                <p className="text-[28px] font-black leading-none">{t.planYearlyPrice}</p>
                <span className="rounded-full bg-[#E2F2E6] px-2.5 py-1 text-[11.5px] font-bold text-[#1F7A46]">
                  {t.planSave}
                </span>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5">
                {[...t.planBenefits, t.planYearlyExtra].map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-[13.5px] leading-snug">
                    <Check size={16} strokeWidth={3} className="mt-[2px] shrink-0 text-[#185FA5]" aria-hidden="true" />
                    {benefit}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={primaryAction}
                className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#185FA5] text-[15.5px] font-bold text-white shadow-[0_6px_18px_rgba(24,95,165,0.25)] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2"
              >
                {t.planChooseYearly}
                <ArrowRight size={17} aria-hidden="true" />
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
              <ArjunLogo size={44} className="hidden shrink-0 rounded-2xl xs:block" />
              <div>
                <p className="text-[24px] font-black leading-tight xs:text-[26px]">{t.finalTitle}</p>
                <p className="mt-1.5 text-[14px] leading-snug text-white/80">{t.finalLine}</p>
              </div>
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
