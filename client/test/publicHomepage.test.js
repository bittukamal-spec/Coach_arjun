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

test('Create account still goes to /auth and Sign in still goes to /auth?tab=signin', () => {
  assert.match(landing, /const goCreate = \(\) => navigate\('\/auth'\);/);
  assert.match(landing, /const goSignIn = \(\) => navigate\('\/auth\?tab=signin'\);/);
  // No other auth-ish destination was invented.
  const routes = [...landing.matchAll(/navigate\('([^']+)'\)/g)].map((m) => m[1]);
  for (const route of routes) {
    assert.ok(
      ['/auth', '/auth?tab=signin', '/privacy', '/terms', '/terms#ai-child-safety', '/refund', link(route)].includes(route),
      `unexpected navigation target: ${route}`,
    );
  }
  function link(r) { return r; } // keeps the assertion readable for footer links
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
  assert.doesNotMatch(bothBlocks, /thousands|lakh|million|\d+\s*\+?\s*(athletes|users|खिलाड़ी)|\brating\b|★|5-star|\breviews?\b|testimonial|trusted by|loved by/i);
});

test('no old mental games, drills or match-day-routine-builder copy', () => {
  assert.doesNotMatch(bothBlocks, /mini-?game|Concentration Grid|Stroop|Reaction Ball|Thought Buster|Focus Filter|today'?s drill|gratitude|visualisation|visualization/i);
});

test('the old landing keys are gone from both languages', () => {
  for (const block of [enBlock, hiBlock]) {
    for (const key of [
      'tagline:', 'badge:', 'trust1:', 'step1:', 'feature1Title:', 'pricingTitle:',
      'personalizeItems:', 'allFeatures:', 'researchFacts:', 'premiumAnnual:', 'ctaBtn:',
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
  const tints = [...landing.matchAll(/bg: '(#[0-9A-F]{6})'/gi)].map((m) => m[1].toLowerCase());
  assert.equal(tints.length, 4);
  assert.equal(new Set(tints).size, 4);
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

test('install is a secondary action inside the menu, never the primary CTA', () => {
  const menu = landing.slice(landing.indexOf('id="landing-menu"'), landing.indexOf('</header>'));
  assert.match(menu, /onClick=\{handleInstall\}/, 'install lives in the header menu');
  const hero = landing.slice(landing.indexOf('{/* ── Hero'), landing.indexOf('{/* ── Value strip'));
  assert.doesNotMatch(hero, /handleInstall|installApp/, 'the hero converts to account creation only');
  const finalCta = landing.slice(landing.indexOf('{/* ── Final CTA'), landing.indexOf('{/* ── Footer'));
  assert.doesNotMatch(finalCta, /handleInstall|installApp/);
  assert.match(hero, /\{t\.ctaCreate\}/);
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
