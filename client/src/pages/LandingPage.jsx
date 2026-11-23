import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Menu, X, ChevronDown, FlaskConical, Globe, Timer, Lock, MessageCircle, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { ArjunLogo } from '../components/ArjunLogo';
import { CheckDot } from '../components/site/SiteBits';
import Teer from '../components/visuals/Teer';
import { useStatusBarColour } from '../components/ui/TonePage';
import SceneBackdrop from '../components/visuals/SceneBackdrop';
import { PhoneFrame, RealScreen } from '../components/site/PhoneScreens';

// Real screenshots of the app with a demo athlete (scripts/site-screens.cjs).
// `bg` = each screen's top colour, so the drawn status bar blends in.
const SCREENS = {
  coach:    { src: '/site-screens/coach.jpg',    bg: '#EFF3FF' },
  home:     { src: '/site-screens/home.jpg',     bg: '#EFF3FF' },
  reset:    { src: '/site-screens/reset.jpg',    bg: '#B4C3E4' },
  focus:    { src: '/site-screens/focus.jpg',    bg: '#FFBBAE' },
  practice: { src: '/site-screens/practice.jpg', bg: '#EFF3FF' },
  tools:    { src: '/site-screens/tools.jpg',    bg: '#EFF3FF' },
};

// ─── Public website (Playbook redesign, Nov 2026) ─────────────────────────────
// Founder-approved mock-ups ("Arjun public pages"): a phone showing the real
// app is the hero (its screen changes every few seconds), the same three
// screens explain "How Arjun helps", each section sits on its own colour
// band, small text matches the hero line (15px, regular, grey) and there are
// no prices on this page. The one main action is "Start free" (sign-up).

const BODY = 'text-[15px] leading-relaxed text-slt';
const H2 = 'text-[26px] leading-tight font-extrabold tracking-[-0.02em] lg:text-[34px]';
const TAG_ICONS = { science: FlaskConical, sport: Globe, reps: Timer, private: Lock, lang: MessageCircle };
const TAG_TONES = { science: 'bg-sky', sport: 'bg-mint', reps: 'bg-sun', private: 'bg-blush', lang: 'bg-coral' };
const HELP_TONES = ['bg-[#FFE08A]', 'bg-[#FFC2B5]', 'bg-[#C9F3E5]', 'bg-[#DCE5FF]', 'bg-[#FFD6EF]'];
const ROTATE_MS = 4500;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function LandingPage() {
  const { language } = useAuth();
  const t = translations[language]?.site || translations.en.site;
  const s = t.screens;
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [screen, setScreen] = useState(0);
  const [paused, setPaused] = useState(false);
  const menuRef = useRef(null);

  // The hero phone moves through three screens on its own; it stops when the
  // visitor picks a screen, and never moves for reduced-motion users.
  useEffect(() => {
    if (paused || prefersReducedMotion()) return undefined;
    const id = setInterval(() => setScreen(n => (n + 1) % 3), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused]);

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

  // The phone's status bar takes the photo's sky colour on this page.
  useStatusBarColour({ cssVar: '--site-top' });

  const startFree = () => navigate('/auth?tab=signup');
  const menuItem = 'flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[15px] text-ink hover:bg-dark-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

  const heroScreens = [
    <RealScreen key="coach" {...SCREENS.coach} eager />,
    <RealScreen key="home" {...SCREENS.home} />,
    <RealScreen key="reset" {...SCREENS.reset} />,
  ];

  return (
    <div className="relative min-h-screen overflow-x-clip bg-dark-900 text-ink">
      {/* Soft sunrise track behind the header and hero, fading into the page */}
      <SceneBackdrop scene="track-sunrise" height="h-[600px] lg:h-[680px]" position="30% 60%" fadeVia="via-dark-900/10" />
      {/* The photo's sky colour runs up into the phone's status bar. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[color:var(--site-top)] to-transparent" />
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="relative mx-auto flex max-w-5xl items-center justify-between gap-2 px-5 py-3">
        {/* Frosted pill, like the menu button, so the name stands out on the photo. */}
        <Link to="/" className="flex h-11 items-center gap-1.5 rounded-[14px] bg-dark-400/75 pl-1.5 pr-3 shadow-[0_4px_14px_rgba(16,21,51,0.08)] backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Arjun home">
          <ArjunLogo size={32} className="shrink-0" />
          <span className="pt-px text-[19px] font-extrabold leading-none tracking-[-0.03em] text-ink">Arjun</span>
        </Link>
        <nav aria-label="Site" className="flex items-center gap-2">
          <a href="#how" className="hidden lg:flex min-h-[44px] items-center px-3 text-[15px]">{t.howTitle}</a>
          <a href="#faq" className="hidden lg:flex min-h-[44px] items-center px-3 text-[15px]">{t.faqTitle}</a>
          <button type="button" onClick={startFree} className="flex min-h-[44px] items-center whitespace-nowrap rounded-[14px] bg-sun px-4 text-[14px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
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
                <button type="button" onClick={() => navigate('/auth?tab=signin')} className={menuItem}>{t.signIn}</button>
                {installPrompt && <button type="button" onClick={handleInstall} className={menuItem}>{t.installApp}</button>}
                <button type="button" onClick={() => navigate('/privacy')} className={menuItem}>{t.footerPrivacy}</button>
                <button type="button" onClick={() => navigate('/terms')} className={menuItem}>{t.footerTerms}</button>
                <button type="button" onClick={() => navigate('/contact')} className={menuItem}>{t.footerContact}</button>
              </div>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero: the app on a phone ──────────────────────────────────── */}
        <section className="relative mx-auto flex max-w-5xl flex-col items-center px-5 pb-10 pt-4 text-center lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:pt-10 lg:text-left">
          <div className="flex flex-col items-center lg:items-start">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-500">{t.heroEyebrow}</p>
            <h1 className="mt-2.5 text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em] [text-wrap:balance] lg:text-[60px]">{t.heroTitle}</h1>
            <p className={`mt-3 hidden lg:block ${BODY} lg:text-[18px]`}>{t.heroSub}</p>
            <button
              type="button"
              onClick={startFree}
              className="mt-6 hidden lg:inline-flex min-h-[58px] items-center gap-2 rounded-[18px] bg-sun px-8 text-[17px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {t.startFree}
              <ArrowRight size={18} strokeWidth={2.6} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-6 flex flex-col items-center lg:mt-0">
            <div className="relative" role="img" aria-label={t.phoneLabel} data-testid="site-hero-phone" data-screen={screen}>
              <PhoneFrame maxWidth={250} share={0.56}>{heroScreens[screen]}</PhoneFrame>
              <Teer pose="wave" height={128} motion="float" eager className="pointer-events-none absolute -left-[30%] -bottom-[3%] drop-shadow-[0_12px_18px_rgba(16,21,51,0.18)]" />
              <button
                type="button"
                onClick={startFree}
                className="group absolute -left-[24%] bottom-[29%] flex min-h-[44px] items-center rounded-full focus-visible:outline-none"
              >
                <span className="flex h-9 items-center whitespace-nowrap rounded-full border border-white/50 bg-brand-500/55 px-3.5 text-[13px] font-semibold text-white shadow-[0_6px_14px_rgba(27,77,255,0.18)] backdrop-blur-md group-focus-visible:ring-2 group-focus-visible:ring-brand-500 group-focus-visible:ring-offset-2">
                  {t.sayHi}
                </span>
              </button>
            </div>
            <div className="mt-4 flex gap-1" role="group" aria-label={t.phoneLabel}>
              {[0, 1, 2].map(n => (
                <button
                  key={n}
                  type="button"
                  aria-label={t.screenDot(n + 1)}
                  aria-pressed={screen === n}
                  onClick={() => { setScreen(n); setPaused(true); }}
                  className="flex h-11 w-7 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span className={`h-1.5 rounded-full transition-all ${screen === n ? 'w-[18px] bg-brand-500' : 'w-1.5 bg-sky'}`} />
                </button>
              ))}
            </div>
          </div>

          <p className={`mt-1 lg:hidden ${BODY}`}>{t.heroSub}</p>
          <button
            type="button"
            onClick={startFree}
            className="mt-5 flex w-full max-w-sm min-h-[56px] items-center justify-center gap-2 rounded-[18px] bg-sun text-[16px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 lg:hidden"
          >
            {t.startFree}
            <ArrowRight size={18} strokeWidth={2.6} aria-hidden="true" />
          </button>

          <ul className="mt-6 grid w-full grid-cols-5 gap-1 lg:col-span-2 lg:mx-auto lg:mt-10 lg:max-w-2xl" aria-label={t.tagsLabel}>
            {t.tags.map(tag => {
              const Icon = TAG_ICONS[tag.key];
              return (
                <li key={tag.key} className="flex flex-col items-center gap-1.5 text-center">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-inkblock ${TAG_TONES[tag.key]}`} aria-hidden="true">
                    <Icon size={24} strokeWidth={2.2} />
                  </span>
                  <span className="text-[13px] leading-tight text-slt xs:text-[15px]">{tag.label}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── How Arjun helps: the same three phone screens ─────────────── */}
        <section id="how" className="scroll-mt-4 bg-dark-400 py-10 lg:py-16">
          <div className="mx-auto max-w-5xl px-5">
            <h2 className={H2}>{t.howTitle}</h2>
          </div>
          <ol className="mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 lg:mx-auto lg:max-w-5xl lg:justify-between lg:overflow-visible" aria-label={t.howTitle}>
            {[
              { key: 'chat', el: <RealScreen {...SCREENS.coach} />, label: s.talk.label },
              { key: 'card', el: <RealScreen {...SCREENS.focus} />, label: s.card.label },
              { key: 'results', el: <RealScreen {...SCREENS.practice} />, label: s.results.label },
            ].map((step, i) => (
              <li key={step.key} className="flex shrink-0 snap-center flex-col items-center gap-3">
                <div aria-hidden="true"><PhoneFrame maxWidth={236} share={0.6}>{step.el}</PhoneFrame></div>
                <p className="flex items-center gap-2 text-[17px] font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-[13px] font-bold text-white" aria-hidden="true">{i + 1}</span>
                  {step.label}
                </p>
              </li>
            ))}
          </ol>
          <div className="mx-auto max-w-5xl px-5">
            <p className={`mt-6 mb-2 ${BODY}`}>{t.helpsLabel}</p>
            <ul className="flex flex-wrap gap-2">
              {t.helps.map((h, i) => (
                <li key={h} className={`rounded-full px-3 py-2 text-[15px] text-inkblock ${HELP_TONES[i % HELP_TONES.length]}`}>{h}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Why Arjun: tick table ─────────────────────────────────────── */}
        <section className="bg-[#DCE5FF] py-10 text-inkblock lg:py-16">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className={H2}>{t.whyTitle}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[#4A5273]">{t.whySub}</p>
            <div className="relative mt-5 rounded-[24px] bg-white px-3.5 pb-2 pt-1">
              <span className="pointer-events-none absolute bottom-1.5 right-[84px] top-1.5 w-[70px] rounded-[35px] border-[3px] border-[#1B4DFF]" aria-hidden="true" />
              <table className="w-full border-collapse text-[15px]">
                <thead>
                  <tr className="h-[52px]">
                    <td />
                    <th scope="col" className="w-[70px] font-semibold text-[#1B3FD1]">{t.whyCols.arjun}</th>
                    <th scope="col" className="w-[70px] font-normal text-[#4A5273]">{t.whyCols.inPerson}</th>
                  </tr>
                </thead>
                <tbody>
                  {t.whyRows.map(r => (
                    <tr key={r.label} className="h-[50px] border-t border-[#E3E8F7]">
                      <th scope="row" className="text-left font-normal text-[#4A5273]">{r.label}</th>
                      <td className="text-center">{r.arjun ? <Check size={24} strokeWidth={3} className="mx-auto text-[#1B4DFF]" aria-label={t.yes} /> : <X size={20} strokeWidth={3} className="mx-auto text-[#9AA3C7]" aria-label={t.no} />}</td>
                      <td className="text-center">{r.inPerson ? <Check size={20} strokeWidth={3} className="mx-auto text-[#4A5273]" aria-label={t.yes} /> : <X size={20} strokeWidth={3} className="mx-auto text-[#9AA3C7]" aria-label={t.no} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Is AI coaching safe? ──────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[#DDF7EE] py-10 text-inkblock lg:py-16">
          <SceneBackdrop scene="court" height="h-[340px] lg:h-[420px]" position="40% 50%" fadeVia="via-[#DDF7EE]/70" fadeTo="to-[#DDF7EE]" className="[&_.scene-photo]:!opacity-70" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center px-5 text-center">
            <Teer pose="notes" height={168} motion="float" className="drop-shadow-[0_12px_18px_rgba(16,21,51,0.15)]" />
            <h2 className={`mt-3 ${H2}`}>{t.safeTitle}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[#4A5273]">{t.safeSub}</p>
            <ul className="mt-5 w-full space-y-2.5 text-left">
              {t.safePoints.map(p => (
                <li key={p.title} className="flex items-start gap-3 rounded-[18px] border border-white bg-white/80 px-4 py-3.5 backdrop-blur-md">
                  <CheckDot className="mt-px h-[22px] w-[22px] shrink-0" tone="mint" />
                  <span className="flex flex-col gap-0.5"><span className="text-[16px] font-bold leading-snug">{p.title}</span><span className="text-[14px] leading-snug text-[#4A5273]">{p.text}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Start for free (its own section, no price) — same mint as the safety band, split by a line ── */}
        <section className="relative overflow-hidden bg-[#DDF7EE] pb-12 pt-4 text-inkblock lg:pb-16">
          <span className="absolute -bottom-12 -left-8 h-[120px] w-[120px] rounded-full bg-mint" aria-hidden="true" />
          <div className="relative mx-auto flex max-w-md flex-col items-center gap-4 px-5 text-center" data-testid="site-free-section">
            <span className="flex h-14 w-14 items-center justify-center" aria-hidden="true"><ArjunLogo size={56} /></span>
            <h2 className="text-[32px] leading-[1.05] font-extrabold tracking-[-0.02em]">
              {t.freeTitleLead} <span className="rounded-xl bg-sun px-2 text-inkblock">{t.freeTitleWord}</span>
            </h2>
            <ul className="flex gap-4 text-[15px]">
              {t.freePoints.map(p => (
                <li key={p} className="flex items-center gap-1.5"><CheckDot className="h-5 w-5" tone="mint" />{p}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={startFree}
              className="flex w-full min-h-[58px] items-center justify-center gap-2 rounded-[18px] bg-sun text-[17px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {t.freeCta}
              <ArrowRight size={18} strokeWidth={2.6} aria-hidden="true" />
            </button>
            <Link to="/premium" data-testid="site-premium-link" className="flex min-h-[44px] items-center px-2 text-[15px] underline underline-offset-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              {t.freeMore}
            </Link>
          </div>
        </section>

        {/* ── Questions ──────────────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-4 bg-dark-400 py-10 lg:py-16">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className={`mb-4 ${H2}`}>{t.faqTitle}</h2>
            <ul className="space-y-2">
              {t.faqs.map((f, i) => {
                const open = openFaq === i;
                return (
                  <li key={f.q} className="rounded-[18px] bg-dark-900">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`faq-${i}`}
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="flex min-h-[54px] w-full items-center justify-between gap-3 rounded-[18px] px-4 text-left text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      {f.q}
                      <ChevronDown size={18} strokeWidth={2.4} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {open && <p id={`faq-${i}`} className={`px-4 pb-4 ${BODY}`}>{f.a}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ── Final call ─────────────────────────────────────────────────── */}
        <section className="bg-sun pb-8 pt-10 text-inkblock">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-5 text-center lg:flex-row lg:text-left">
            <div role="img" aria-label={t.finalPhotoAlt} className="flex justify-center lg:shrink-0" data-testid="final-phone">
              <PhoneFrame maxWidth={200} share={0.5}><RealScreen {...SCREENS.tools} /></PhoneFrame>
            </div>
            <div className="flex w-full flex-col gap-3 lg:pl-6">
              <h2 className="text-[26px] leading-tight font-extrabold">{t.finalTitle}</h2>
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

      {/* ── Footer — the same sun block as the last section, one piece ─── */}
      <footer className="bg-[#FFE9A8] text-inkblock">
        <div className="mx-auto max-w-3xl px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-6 pt-8">
            <Link to="/" className="flex min-h-[44px] items-center gap-1.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inkblock" aria-label="Arjun home">
              <ArjunLogo size={34} className="shrink-0" />
              <span className="pt-px text-[20px] font-extrabold leading-none tracking-[-0.03em]">Arjun</span>
            </Link>
            <nav aria-label="Legal" className="flex flex-col items-end text-[15px] font-medium text-inkblock/75">
              <Link to="/privacy" className="flex min-h-[36px] items-center">{t.footerPrivacy}</Link>
              <Link to="/terms" className="flex min-h-[36px] items-center">{t.footerTerms}</Link>
              <Link to="/terms#ai-child-safety" className="flex min-h-[36px] items-center">{t.footerChildSafety}</Link>
              <Link to="/refund" className="flex min-h-[36px] items-center">{t.footerRefund}</Link>
              <Link to="/contact" className="flex min-h-[36px] items-center">{t.footerContact}</Link>
            </nav>
          </div>
          <p className="mt-6 border-t border-inkblock/10 pt-5 text-[13px] text-inkblock/65">{t.copyright(new Date().getFullYear())}</p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
