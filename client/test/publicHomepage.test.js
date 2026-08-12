// Source-text + data checks for the public homepage redesign.
//
// The homepage is the one screen a visitor sees before signing up, so these
// guard two separate things: that it describes the CURRENT product (Coach
// conversations, Mental Reps, Playbook, Focus Cards, bilingual, private), and
// that it never re-acquires the removed concepts the old page advertised
// (Daily Pulse, mood/focus/energy/sleep tracking, a personality test, game
// scores, research percentages, install-first conversion) or anything
// suggesting audio — Arjun has no audio coaching of any kind.
//
// Dependency-free, run by `npm run test:source`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const landing = read('src/pages/LandingPage.jsx');
const carousel = read('src/components/landing/LandingCarousel.jsx');
const mockups = read('src/components/landing/LandingMockups.jsx');
const translationsSrc = read('src/i18n/translations.js');
const app = read('src/App.jsx');
const viteConfig = read('vite.config.js');
const tailwind = read('tailwind.config.js');
const indexCss = read('src/index.css');

const { translations } = await import('../src/i18n/translations.js');
const en = translations.en.landing;
const hi = translations.hi.landing;

// The landing namespace as raw text, per language — nested objects are
// indented deeper than 4 spaces, so `\n    },` only ever closes the namespace.
function landingNamespace(lang) {
  const langIdx = translationsSrc.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translationsSrc.indexOf('landing: {', langIdx);
  assert.ok(start !== -1, `missing landing namespace in ${lang}`);
  return translationsSrc.slice(start, translationsSrc.indexOf('\n    },', start));
}
const enBlock = landingNamespace('en');
const hiBlock = landingNamespace('hi');
const bothBlocks = `${enBlock}\n${hiBlock}`;

// Forbidden-term checks run against code and copy, not against the comments
// that explain WHY those terms are forbidden.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const homepageSources = stripComments(`${landing}\n${carousel}\n${mockups}`);

// ── 1. Hero ─────────────────────────────────────────────────────────────────

test('hero headline is the approved copy, with the closing phrase accented', () => {
  assert.equal(en.headlineLead, 'Your AI coach for the moments ');
  assert.equal(en.headlineAccent, 'that matter.');
  assert.match(landing, /\{t\.headlineLead\}/);
  assert.match(landing, /<span className="text-\[#185FA5\]">\{t\.headlineAccent\}<\/span>/);
  // Responsive wrapping, never hard-coded <br> in the headline.
  const h1 = landing.slice(landing.indexOf('<h1'), landing.indexOf('</h1>'));
  assert.doesNotMatch(h1, /<br|\\n/);
});

test('exactly one h1 on the page', () => {
  assert.equal((landing.match(/<h1[\s>]/g) || []).length, 1);
});

test('subtitle describes the current product in one short line, with no second paragraph', () => {
  assert.equal(en.subtitle, 'Mental coaching for Indian athletes.');
  assert.equal(hi.subtitle, 'भारतीय एथलीट्स के लिए मेंटल कोचिंग।');
  assert.match(landing, /\{t\.subtitle\}/);
  assert.ok(en.subtitle.length < 60, 'the hero subtitle stays a single short line');
});

// ── 2. Auth routes are untouched ────────────────────────────────────────────

test('the auth route contract is untouched — sign-in still goes to /auth?tab=signin', () => {
  // The page no longer *markets* account creation (the product action is
  // installing the app; accounts are created inside it), but the route and
  // the menu entry that reaches it are unchanged.
  assert.match(landing, /const goSignIn = \(\) => navigate\('\/auth\?tab=signin'\);/);
  const routes = [...landing.matchAll(/navigate\('([^']+)'\)/g)].map((m) => m[1]);
  const allowed = ['/auth?tab=signin', '/privacy', '/terms', '/terms#ai-child-safety', '/refund'];
  for (const route of routes) {
    assert.ok(allowed.includes(route), `unexpected navigation target: ${route}`);
  }
});

test('the hero no longer shows paired Create account / Sign in CTAs', () => {
  const hero = landing.slice(landing.indexOf('{/* ── Hero'), landing.indexOf('{/* ── Value strip'));
  assert.doesNotMatch(hero, /ctaCreate|ctaSignIn|goSignIn/);
  // Exactly one CTA in the hero, and it is the shared Download action.
  assert.equal((hero.match(/<button/g) || []).length, 1);
  assert.match(hero, /onClick=\{primaryAction\}/);
  assert.equal(en.ctaDownload, 'Download the app');
  assert.equal(hi.ctaDownload, 'ऐप डाउनलोड करो');
  assert.ok(!('ctaCreate' in en) && !('ctaCreate' in hi), 'the Create account label is gone');
});

test('the hero opens on the headline — no eyebrow, pill or tag above it', () => {
  const hero = landing.slice(landing.indexOf('{/* ── Hero'), landing.indexOf('</h1>'));
  assert.doesNotMatch(hero, /rounded-full/, 'no pill sits above the headline');
  assert.ok(!('pill' in en) && !('pill' in hi), 'the eyebrow string is gone from both languages');
  assert.doesNotMatch(bothBlocks, /AI Mental Coach for Athletes/);
});

test('App.jsx still renders the landing page at / and AuthPage at /auth', () => {
  assert.match(app, /<Route path="\/" element=\{user \? <Navigate to="\/dashboard" replace \/> : <LandingPage \/>\} \/>/);
  assert.match(app, /<Route path="\/auth" element=\{user \? <Navigate to="\/dashboard" replace \/> : <AuthPage \/>\} \/>/);
});

// ── 3. No audio, anywhere ───────────────────────────────────────────────────

test('no audio/voice/waveform concept appears in the homepage or its copy', () => {
  const forbidden = /waveform|microphone|\bmic\b|\bvoice\b|\baudio\b|speaker|playback|headphone|आवाज़|ऑडियो/i;
  assert.doesNotMatch(homepageSources, forbidden);
  assert.doesNotMatch(bothBlocks, forbidden);
});

test('no audio-suggesting control is rendered — no play button, no duration bar', () => {
  assert.doesNotMatch(homepageSources, /<audio|Play,|PlayCircle|Mic,|Volume|AudioLines|Headphones/);
  // The only duration on the page is the length of a Mental Rep, next to Start.
  assert.equal(en.phone.repMeta, '2 min');
  assert.equal(en.phone.repCta, 'Start');
  assert.doesNotMatch(homepageSources, /0:\d\d/);
});

// ── 4. Removed/legacy concepts stay removed ─────────────────────────────────

test('no Daily Pulse or daily check-in framing', () => {
  assert.doesNotMatch(bothBlocks, /daily pulse|डेली पल्स|check-?in|चेक-इन/i);
  assert.doesNotMatch(homepageSources, /daily pulse|checkin|check-in/i);
});

test('no mood / energy / sleep tracking claim', () => {
  assert.doesNotMatch(bothBlocks, /\bmood\b|\bsleep\b|\benergy\b|मूड|नींद|ऊर्जा/i);
  assert.doesNotMatch(bothBlocks, /\btrack\b|ट्रैक/i);
});

test('no personality test claim', () => {
  assert.doesNotMatch(bothBlocks, /personality|व्यक्तित्व|ocean/i);
});

test('no scores, XP, streaks, charts or analytics claims', () => {
  assert.doesNotMatch(bothBlocks, /\bscore\b|\bxp\b|streak|analytics|\bchart\b|\bstat\b|स्कोर|स्ट्रीक/i);
  assert.doesNotMatch(homepageSources, /\bxp\b|streak|recharts|BarChart/i);
});

test('no research percentages or performance claims', () => {
  assert.doesNotMatch(bothBlocks, /\d%|research|अध्ययन|रिसर्च|Journal of|et al\./i);
});

test('no fake social proof — no counts, ratings or testimonials', () => {
  assert.doesNotMatch(bothBlocks, /thousands|lakh|million|\d+\s*\+?\s*(athletes|users|खिलाड़ी)|\brating\b|★|5-star|\breviews\b|star review|रिव्यू|testimonial|trusted by|loved by/i);
});

test('no old mental games, drills or match-day-routine-builder copy', () => {
  assert.doesNotMatch(bothBlocks, /mini-?game|Concentration Grid|Stroop|Reaction Ball|Thought Buster|Focus Filter|today'?s drill|gratitude|visualisation|visualization/i);
});

test('the old landing keys are gone from both languages', () => {
  for (const block of [enBlock, hiBlock]) {
    for (const key of [
      // `pricingTitle` is NOT in this list — the key name is reused by the
      // new pricing section, whose content is asserted separately.
      'tagline:', 'badge:', 'trust1:', 'step1:', 'feature1Title:', 'premium:',
      'premiumDesc:', 'personalizeItems:', 'allFeatures:', 'researchFacts:',
      'premiumAnnual:', 'ctaBtn:',
    ]) {
      assert.ok(!block.includes(key), `stale landing key still present: ${key}`);
    }
  }
});

// ── 5. Current product is what's represented ────────────────────────────────

test('How Arjun helps has exactly the four intended use cases, in order', () => {
  assert.deepEqual(
    en.helps.map((h) => h.title),
    ['Before a match', 'After a setback', 'Build focus', 'Reflect & reset'],
  );
  assert.equal(hi.helps.length, 4);
  for (const help of [...en.helps, ...hi.helps]) {
    assert.ok(help.line.length > 0, 'each card carries exactly one supporting line');
    assert.ok(!help.desc && !help.sub, 'no second supporting line per card');
  }
  // Four distinct restrained tints, not four identical blue cards.
  const helpTints = landing.slice(landing.indexOf('const HELP_TINTS'), landing.indexOf('];', landing.indexOf('const HELP_TINTS')));
  const tints = [...helpTints.matchAll(/bg: '(#[0-9A-F]{6})'/gi)].map((m) => m[1].toLowerCase());
  assert.equal(tints.length, 4);
  assert.equal(new Set(tints).size, 4);
  // Each card carries its own icon, so the row is not four identical tiles.
  const icons = [...helpTints.matchAll(/Icon: (\w+)/g)].map((m) => m[1]);
  assert.equal(new Set(icons).size, 4);
});

test('app preview shows current product areas only: Coach, Mental Reps, Playbook, Focus Cards', () => {
  assert.deepEqual(
    [en.preview.coachCard.title, en.preview.repsCard.title, en.preview.playbookCard.title, en.preview.focusCard.title],
    ['Coach', 'Mental Reps', 'Playbook', 'Focus Cards'],
  );
  assert.match(landing, /<CoachPreview key="coach" t=\{previews\.coachCard\} \/>/);
  assert.match(landing, /<RepsPreview key="reps" t=\{previews\.repsCard\} \/>/);
  assert.match(landing, /<PlaybookPreview key="playbook" t=\{previews\.playbookCard\} \/>/);
  assert.match(landing, /<FocusCardPreview key="focus" t=\{previews\.focusCard\} \/>/);
});

test('the hero mockup shows the real app navigation, and no invented surfaces', () => {
  // Home · Train · Coach · Playbook · Profile — the real bottom-nav order.
  const nav = mockups.slice(mockups.indexOf('const NAV = ['), mockups.indexOf('];', mockups.indexOf('const NAV = [')));
  assert.deepEqual(
    [...nav.matchAll(/key: '(\w+)'/g)].map((m) => m[1]),
    ['home', 'train', 'coach', 'playbook', 'profile'],
  );
});

test('the hero is a layered stack of current screens — Playbook, Focus Cards, a saved cue', () => {
  assert.equal(en.phone.behindPlaybook, 'Playbook');
  assert.equal(en.phone.behindFocus, 'Focus Cards');
  assert.equal(en.phone.cueLabel, 'Saved cue');
  const hero = mockups.slice(mockups.indexOf('export function HeroPhone'), mockups.indexOf('// ── App-preview mockups'));
  assert.equal((hero.match(/<BehindCard/g) || []).length, 2, 'two screens sit behind the phone');
  assert.match(hero, /<FloatingCue/, 'a card overlaps the phone at every width, including mobile');
  // The rear screens carry no analytics of any kind.
  assert.doesNotMatch(stripComments(mockups), /progress|percent|graph|trend/i);
});

// ── 5b. Personalisation section ─────────────────────────────────────────────

test('the personalisation section mirrors the real Profile sections', () => {
  assert.equal(en.personalTitle, 'Arjun gets to know how you perform');
  assert.deepEqual(en.personal.map((p) => p.title), ['Your game', 'When pressure hits', 'What works for you']);
  assert.equal(hi.personal.length, 3);
  // When Pressure Hits uses the athlete-facing stage names the Profile uses.
  assert.deepEqual(
    [en.personalFlow.situation, en.personalFlow.firstResponse, en.personalFlow.impact],
    ['Situation', 'First response', 'Performance impact'],
  );
  assert.match(landing, /\{t\.personalTitle\}/);
  assert.match(landing, /<GameChips chips=\{t\.personalGameChips\}/);
  assert.match(landing, /<PressureFlow/);
  assert.match(landing, /<WorksList items=\{t\.personalWorks\}/);
});

test('personalisation claims stay inside what the athlete told Arjun', () => {
  const claims = en.personal.map((p) => p.line).join(' ');
  assert.match(claims, /Understands your game/);
  assert.match(claims, /Remembers what tends to happen/);
  assert.match(claims, /Keeps useful strategies close/);
  // Never the removed/overreaching framings.
  assert.doesNotMatch(bothBlocks, /personality|व्यक्तित्व|mental state|reads you|knows you|learns everything|performance pattern/i);
});

// ── 5c. Sport-psychology principles ─────────────────────────────────────────

test('the principles section states principles, never measured outcomes', () => {
  assert.equal(en.principlesTitle, 'Built around sport psychology principles');
  assert.deepEqual(
    en.principles.map((p) => p.title),
    ['Reset after setbacks', 'Focus & self-talk', 'Reflect & learn'],
  );
  assert.equal(hi.principles.length, 3);
  assert.match(landing, /\{t\.principlesTitle\}/);
  for (const p of [...en.principles, ...hi.principles]) {
    assert.ok(p.line.length <= 60, `principle line too long: ${p.title}`);
  }
  // No statistic, no citation, no "proven" claim about Arjun itself.
  assert.doesNotMatch(bothBlocks, /\d+\s*%|proven|clinically|study|studies|evidence-based|अध्ययन/i);
});

test('the value strip lists five short, supportable labels', () => {
  const values = [en.valueCoach, en.valueReps, en.valueCues, en.valueLang, en.valuePrivate];
  assert.deepEqual(values, [
    'Coach conversations', '2-min Mental Reps', 'Save cues', 'Hindi + English', 'Private by design',
  ]);
  for (const v of values) assert.ok(v.length <= 20, `value-strip label too long: ${v}`);
});

// ── 6. FAQ ──────────────────────────────────────────────────────────────────

test('FAQ asks the five approved questions and answers stay short', () => {
  assert.deepEqual(en.faq.map((f) => f.q), [
    'How is Arjun different?',
    'Is Arjun only for professional athletes?',
    'Can I use Arjun in Hindi?',
    'Is my data private?',
    'Is Arjun therapy?',
  ]);
  assert.equal(hi.faq.length, 5);
  for (const item of [...en.faq, ...hi.faq]) assert.ok(item.a.length <= 190, `FAQ answer too long: ${item.q}`);
});

test('the therapy boundary is stated, and privacy is claimed only as implemented', () => {
  assert.match(en.faq[4].a, /not therapy, diagnosis or emergency help/i);
  // Deletion is a real product capability; encryption/certification claims are not.
  assert.match(en.faq[3].a, /delete your data, or your whole account/i);
  assert.doesNotMatch(bothBlocks, /encrypt|end-to-end|ISO|SOC ?2|GDPR-certified/i);
});

test('FAQ rows are an accessible accordion — button, aria-expanded, labelled panel', () => {
  assert.match(landing, /aria-expanded=\{open\}/);
  assert.match(landing, /aria-controls=\{`faq-panel-\$\{i\}`\}/);
  assert.match(landing, /aria-labelledby=\{`faq-btn-\$\{i\}`\}/);
  assert.match(landing, /hidden=\{!open\}/);
  assert.match(landing, /<h3>\s*<button/);
});

// ── 7. Carousels ────────────────────────────────────────────────────────────

test('carousels are swipeable, keyboard-operable and never auto-rotate', () => {
  assert.match(carousel, /snap-x snap-mandatory/);
  assert.match(carousel, /overflow-x-auto/);
  assert.match(carousel, /role="region"/);
  assert.match(carousel, /aria-roledescription="carousel"/);
  assert.match(carousel, /aria-roledescription="slide"/);
  assert.match(carousel, /tabIndex=\{0\}/);
  assert.match(carousel, /e\.key === 'ArrowRight'/);
  assert.match(carousel, /e\.key === 'ArrowLeft'/);
  assert.match(carousel, /aria-label=\{`Previous — \$\{label\}`\}/);
  assert.match(carousel, /aria-label=\{`Next — \$\{label\}`\}/);
  assert.match(carousel, /aria-current=\{active === i \? 'true' : undefined\}/);
  assert.doesNotMatch(carousel, /setInterval|autoplay|autoPlay/);
  assert.match(carousel, /prefers-reduced-motion: reduce/);
});

test('both homepage carousels are labelled and show a partial next card on mobile', () => {
  assert.match(landing, /<LandingCarousel\s+label=\{t\.helpsTitle\}/);
  assert.match(landing, /<LandingCarousel\s+label=\{t\.previewTitle\}/);
  // Slide widths below 100% are what makes the next card peek into view.
  const widths = [...landing.matchAll(/slideClass="w-\[(\d+(?:\.\d+)?)%\]/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 2);
  for (const w of widths) assert.ok(w < 90, 'the next card must be partly visible at mobile width');
});

// ── 8. PWA install stays supported, but secondary ───────────────────────────

test('PWA install support is intact — the prompt event is still captured and used', () => {
  assert.match(landing, /window\.addEventListener\('beforeinstallprompt', onPrompt\)/);
  assert.match(landing, /installPrompt\.prompt\(\)/);
  assert.match(landing, /window\.addEventListener\('appinstalled', onInstalled\)/);
  assert.match(viteConfig, /VitePWA\(/, 'the PWA plugin is untouched');
  assert.match(viteConfig, /short_name: 'Arjun'/);
});

test('install is a visible header action, not a menu item', () => {
  const header = landing.slice(landing.indexOf('{/* ── Header'), landing.indexOf('id="landing-menu"'));
  assert.match(header, /onClick=\{handleInstall\}/, 'the header carries the install button itself');
  assert.match(header, /<Download size=/, 'it reads as a download/install action');
  assert.match(header, /aria-label=\{t\.installApp\}/);
  const menu = landing.slice(landing.indexOf('id="landing-menu"'), landing.indexOf('</header>'));
  assert.doesNotMatch(menu, /handleInstall|installApp|installShort/, 'install was removed from the hamburger');
});

test('every Download CTA runs the one existing PWA handler — no second implementation', () => {
  // hero, pricing, final CTA and footer all call the same primaryAction.
  assert.ok((landing.match(/onClick=\{primaryAction\}/g) || []).length >= 4);
  assert.match(landing, /const primaryAction = installed \? goSignIn : handleInstall;/);
  assert.equal((landing.match(/installPrompt\.prompt\(\)/g) || []).length, 1);
});

test('an installed visitor is never shown a misleading install action', () => {
  assert.match(landing, /const primaryLabel = installed \? t\.ctaOpen : t\.ctaDownload;/);
  const header = landing.slice(landing.indexOf('{/* ── Header'), landing.indexOf('id="landing-menu"'));
  assert.match(header, /installed \? \(/, 'the header swaps to the installed state');
  assert.match(header, /\{t\.installDone\}/);
  assert.equal(en.ctaOpen, 'Open Arjun');
});

test('the no-prompt fallback instructions are still reachable', () => {
  assert.match(landing, /setInstallHint\(true\)/);
  assert.match(landing, /\{installHint && \(/);
  assert.match(landing, /isIOS \? t\.installIos : isAndroid \? t\.installAndroid : t\.installDesktop/);
});

test('the final CTA and footer convert to the app, not to an account form', () => {
  const finalCta = landing.slice(landing.indexOf('{/* ── Final CTA'), landing.indexOf('{/* ── Footer'));
  assert.match(finalCta, /onClick=\{primaryAction\}/);
  assert.doesNotMatch(finalCta, /ctaSignIn|ctaCreate|goSignIn/, 'no secondary Sign in in the final CTA');
  const footer = landing.slice(landing.indexOf('{/* ── Footer'));
  assert.match(footer, /onClick=\{primaryAction\}/, 'the footer product action is Download the app');
  assert.match(footer, /\/terms#ai-child-safety/, 'Child Safety survives the footer change');
});

// ── 8b. Pricing ─────────────────────────────────────────────────────────────

test('the pricing section states only the real trial and price', () => {
  assert.equal(en.pricingTitle, 'Start with Arjun');
  assert.equal(en.pricingTrial, '14 days free');
  assert.equal(en.pricingPrice, '₹299 / month');
  assert.equal(hi.pricingPrice, '₹299 / महीना');
  assert.match(en.pricingNote, /₹299\/month/);
  assert.match(landing, /\{t\.pricingTitle\}/);
  assert.match(landing, /\{t\.pricingTrial\}/);
  assert.match(landing, /\{t\.pricingPrice\}/);
});

test('pricing sits between the principles section and the FAQ', () => {
  const order = [
    landing.indexOf('{t.principlesTitle}'),
    landing.indexOf('{t.pricingTitle}'),
    landing.indexOf('{t.faqTitle}'),
  ];
  for (const i of order) assert.ok(i !== -1);
  assert.ok(order[0] < order[1] && order[1] < order[2]);
});

test('pricing invents nothing — no tiers, annual plan, struck-through price or urgency', () => {
  assert.doesNotMatch(bothBlocks, /annual|yearly|per year|\/year|साल|tier|plan[s]?\b|most popular|save \d|limited time|offer ends|guarantee|₹(?!299)\d/i);
  // ₹299 is the only price anywhere in the copy.
  const prices = [...bothBlocks.matchAll(/₹[\d,]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(prices)], ['₹299']);
  // The payment implementation is untouched by this page.
  assert.doesNotMatch(homepageSources, /razorpay|checkout|subscription/i);
});

// ── 9. Client-only, and scoped to this page ─────────────────────────────────

test('the homepage calls no API and needs no server or schema change', () => {
  assert.doesNotMatch(homepageSources, /apiFetch|fetch\(|\/api\//);
});

test('the homepage palette is hard-coded to this page — no shared theme token is touched', () => {
  assert.doesNotMatch(homepageSources, /bg-dark-|text-ink|text-slt|card-glow|btn-primary|btn-secondary/);
  assert.doesNotMatch(tailwind, /landing/i);
  assert.doesNotMatch(indexCss, /landing/i);
});

test('the homepage imports no authenticated screen or app-shell component', () => {
  const imports = [...landing.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  for (const spec of imports) {
    assert.ok(
      !/pages\/|Navbar|BottomNav/.test(spec),
      `homepage must not import an authenticated screen: ${spec}`,
    );
  }
});

test('the footer still links to the public child-safety statement', () => {
  assert.match(landing, /\/terms#ai-child-safety/);
});

// ── 10. EN/HI parity ────────────────────────────────────────────────────────

function shape(value) {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, shape(value[k])]));
  }
  return typeof value;
}

test('every landing string exists in both English and Hindi, with the same shape', () => {
  assert.deepEqual(shape(hi), shape(en));
});

test('no Hindi landing string was left as its English source', () => {
  const devanagari = /[ऀ-ॿ]/;
  const walk = (e, h, keyPath = 'landing') => {
    if (typeof e === 'string') {
      // Product nouns stay in English by design (Arjun, Mental Rep, Playbook,
      // Focus Cards, EN/HI labels); everything sentence-like must be Hindi.
      if (e.length > 24 && !/^[A-Za-z ]+$/.test(h)) {
        assert.ok(devanagari.test(h), `${keyPath} was not translated: ${h}`);
      }
      return;
    }
    if (Array.isArray(e)) { e.forEach((item, i) => walk(item, h[i], `${keyPath}[${i}]`)); return; }
    if (e && typeof e === 'object') {
      for (const k of Object.keys(e)) walk(e[k], h[k], `${keyPath}.${k}`);
    }
  };
  walk(en, hi);
});
