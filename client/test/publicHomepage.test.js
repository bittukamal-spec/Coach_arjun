// Source-text + data checks for the public homepage.
//
// The homepage is the one screen a visitor sees before installing, so these
// guard two separate things: that it describes the CURRENT product (Coach
// conversations that ask before they prescribe, Mental Reps, Playbook, the
// When Pressure Hits profile, bilingual, private), and that it never
// re-acquires the removed concepts the old page advertised (Daily Pulse,
// mood/energy/sleep tracking, a personality test, game scores, research
// percentages) or anything suggesting audio — Arjun has no audio coaching.
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
const phoneFrame = read('src/components/landing/PhoneFrame.jsx');
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
const homepageSources = stripComments(`${landing}\n${carousel}\n${mockups}\n${phoneFrame}`);

const section = (from, to) => landing.slice(landing.indexOf(from), landing.indexOf(to));

// ── 1. Hero ─────────────────────────────────────────────────────────────────

test('hero headline is the approved copy, with the closing phrase accented', () => {
  assert.equal(en.headlineLead, 'Train your mind. ');
  assert.equal(en.headlineAccent, 'Perform under pressure.');
  assert.equal(hi.headlineAccent, 'दबाव में बेहतर खेलो।');
  assert.match(landing, /\{t\.headlineLead\}/);
  assert.match(landing, /<span className="block text-\[#185FA5\]">\{t\.headlineAccent\}<\/span>/);
  // Responsive wrapping, never hard-coded <br> in the headline.
  const h1 = landing.slice(landing.indexOf('<h1'), landing.indexOf('</h1>'));
  assert.doesNotMatch(h1, /<br|\\n/);
  // Visually dominant on mobile: the base size leads the page's type scale.
  const size = Number(h1.match(/text-\[(\d+)px\]/)[1]);
  assert.ok(size >= 38, `hero headline should dominate on mobile, got ${size}px`);
});

test('exactly one h1 on the page', () => {
  assert.equal((landing.match(/<h1[\s>]/g) || []).length, 1);
});

test('subtext is one short line and names what the athlete gets', () => {
  assert.equal(en.subtitle, 'Train focus, handle pressure and build confidence with Arjun.');
  assert.match(landing, /\{t\.subtitle\}/);
  assert.ok(en.subtitle.length <= 70, 'the hero subtext stays a single short line');
  // No second paragraph in the hero.
  const hero = section('{/* ── Hero', '{/* ── Benefit tags');
  assert.equal((hero.match(/\{t\.subtitle\}/g) || []).length, 1);
  assert.doesNotMatch(hero, /\{t\.(pricingTrialNote|finalLine)\}/);
});

test('the hero opens on the headline — no eyebrow, pill or tag above it', () => {
  const above = landing.slice(landing.indexOf('{/* ── Hero'), landing.indexOf('</h1>'));
  assert.doesNotMatch(above, /rounded-full/, 'no pill sits above the headline');
  assert.ok(!('pill' in en) && !('pill' in hi));
  assert.doesNotMatch(bothBlocks, /AI Mental Coach for Athletes/);
});

test('the hero CTA is Install Arjun — no Create account / Sign in conversion', () => {
  assert.equal(en.ctaInstall, 'Install Arjun');
  assert.equal(hi.ctaInstall, 'Arjun इंस्टॉल करो');
  const hero = section('{/* ── Hero', '{/* ── Benefit tags');
  assert.equal((hero.match(/<button/g) || []).length, 1, 'exactly one hero CTA');
  assert.match(hero, /onClick=\{primaryAction\}/);
  assert.doesNotMatch(hero, /ctaSignIn|goSignIn|ctaCreate/);
  assert.ok(!('ctaCreate' in en) && !('ctaCreate' in hi));
});

test('no fake app-store distribution is claimed — Arjun ships as a PWA', () => {
  assert.doesNotMatch(bothBlocks, /app ?store|google play|play store|get it on/i);
  assert.doesNotMatch(homepageSources, /app-?store|google-?play|playstore/i);
});

// ── 2. Hero phone — the real coaching loop, no audio ───────────────────────

test('the hero phone shows Arjun asking and checking, not prescribing', () => {
  const p = en.phone;
  assert.equal(p.q1, 'What happened today?');
  assert.equal(p.a1, 'I lost focus after a mistake.');
  assert.equal(p.q2, 'What happened in the next few moments?');
  assert.equal(p.a2, 'I kept thinking about it.');
  assert.match(p.q3, /Does that fit\?$/);
  assert.equal(p.chipYes, 'Yes');
  assert.equal(p.chipNo, 'Not quite');
  // No Mental Rep is prescribed in the hero conversation.
  const hero = mockups.slice(mockups.indexOf('export function HeroPhone'), mockups.indexOf('// ── Inside Arjun'));
  assert.doesNotMatch(hero, /MentalRepScreen|repTitle|Start/);
  assert.match(hero, /<PhoneFrame>/);
  assert.match(hero, /<CoachScreen/);
});

test('the phone frame is a real device frame, not a card', () => {
  assert.match(phoneFrame, /rounded-\[2\.4rem\]/, 'rounded device shell');
  assert.match(phoneFrame, /bg-\[#0A0F16\]/, 'dark bezel');
  assert.match(phoneFrame, /h-\[16px\] w-\[64px\] rounded-full bg-black/, 'dynamic-island cutout');
  assert.match(phoneFrame, /shadow-\[0_26px_60px/, 'device shadow');
  // Narrow phone proportions — never as wide as a marketing card.
  const heroWidth = Number(mockups.match(/max-w-\[(\d+)px\]/)[1]);
  assert.ok(heroWidth <= 280, `hero device should stay narrow, got ${heroWidth}px`);
});

test('device screens use the app\'s real dark theme while the page stays light', () => {
  for (const token of ['#07131F', '#132334', '#1B3044', '#1F3448', '#F8FAFC', '#5FA8DE']) {
    assert.ok(phoneFrame.includes(token), `missing dark-theme token ${token}`);
  }
  // The page itself is still the light canvas.
  assert.match(landing, /bg-\[#FAFBFD\]/);
  assert.doesNotMatch(stripComments(landing), /#07131F/, 'no dark section on the page itself');
});

test('the device shows the real bottom-nav order and nothing invented', () => {
  const nav = phoneFrame.slice(phoneFrame.indexOf('const NAV = ['), phoneFrame.indexOf('];', phoneFrame.indexOf('const NAV = [')));
  assert.deepEqual(
    nav.replace('const NAV = [', '').split(',').map((s) => s.trim()).filter(Boolean),
    ['Home', 'Dumbbell', 'MessageCircle', 'BookOpen', 'User'],
  );
});

// ── 3. No audio, anywhere ───────────────────────────────────────────────────

test('no audio/voice/waveform concept appears in the homepage or its copy', () => {
  const forbidden = /waveform|microphone|\bmic\b|\bvoice\b|\baudio\b|speaker|playback|headphone|आवाज़|ऑडियो/i;
  assert.doesNotMatch(homepageSources, forbidden);
  assert.doesNotMatch(bothBlocks, forbidden);
});

test('no audio-suggesting control is rendered — no play button, no duration bar', () => {
  assert.doesNotMatch(homepageSources, /<audio|Play,|PlayCircle|Mic,|Volume|AudioLines|Headphones/);
  // The only duration on the page is a Mental Rep's length.
  assert.equal(en.preview.repsCard.meta, '2 min');
  assert.doesNotMatch(homepageSources, /0:\d\d/);
});

// ── 4. Removed/legacy concepts stay removed ─────────────────────────────────

test('no Daily Pulse or daily check-in framing', () => {
  assert.doesNotMatch(bothBlocks, /daily pulse|डेली पल्स|\bcheck-?ins?\b|चेक-इन/i);
  assert.doesNotMatch(homepageSources, /daily pulse|checkin/i);
});

test('no mood / energy / sleep tracking claim', () => {
  assert.doesNotMatch(bothBlocks, /\bmood\b|\bsleep\b|\benergy\b|मूड|नींद|ऊर्जा/i);
  assert.doesNotMatch(bothBlocks, /\btrack\b|ट्रैक/i);
});

test('no personality test claim', () => {
  assert.doesNotMatch(bothBlocks, /personality|व्यक्तित्व|ocean/i);
});

test('no scores, XP, streaks, charts, graphs or analytics claims', () => {
  assert.doesNotMatch(bothBlocks, /\bscore\b|\bxp\b|streak|analytics|\bchart\b|\bgraph\b|\bstat\b|स्कोर|स्ट्रीक/i);
  assert.doesNotMatch(homepageSources, /\bxp\b|streak|recharts|BarChart|LineChart|progress ?bar/i);
});

test('no research percentages or performance claims', () => {
  assert.doesNotMatch(bothBlocks, /\d%|research|अध्ययन|रिसर्च|Journal of|et al\./i);
});

test('no fake social proof — no counts, ratings or testimonials', () => {
  assert.doesNotMatch(
    bothBlocks,
    /thousands|lakh|million|\d+\s*\+?\s*(athletes|users|खिलाड़ी)|\brating\b|★|5-star|\breviews\b|star review|रिव्यू|testimonial|trusted by|loved by/i,
  );
});

test('no old mental games, drills or match-day-routine-builder copy', () => {
  assert.doesNotMatch(bothBlocks, /mini-?game|Concentration Grid|Stroop|Reaction Ball|Thought Buster|Focus Filter|today'?s drill|gratitude|visualisation|visualization/i);
});

test('the old landing keys are gone from both languages', () => {
  for (const block of [enBlock, hiBlock]) {
    for (const key of [
      // `step1` is NOT listed — the Mental Rep preview legitimately uses it
      // nested under repsCard; the stale key was a namespace-level one.
      'tagline:', 'badge:', 'trust1:', 'feature1Title:', 'premiumDesc:',
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
    ['Before a match', 'Under pressure', 'After a setback', 'Build your mental game'],
  );
  assert.deepEqual(
    en.helps.map((h) => h.line),
    ['Get mentally ready.', 'Reset and refocus.', 'Bounce back faster.', 'Practice what helps.'],
  );
  assert.equal(hi.helps.length, 4);
  for (const help of [...en.helps, ...hi.helps]) {
    assert.ok(help.line.length > 0 && help.line.length <= 45, 'one short supporting line per card');
    assert.ok(!help.desc && !help.sub, 'no second supporting line per card');
  }
  // Four distinct tints and four distinct icons.
  const tintBlock = landing.slice(landing.indexOf('const HELP_TINTS'), landing.indexOf('];', landing.indexOf('const HELP_TINTS')));
  const tints = [...tintBlock.matchAll(/bg: '(#[0-9A-F]{6})'/gi)].map((m) => m[1].toLowerCase());
  assert.equal(tints.length, 4);
  assert.equal(new Set(tints).size, 4);
  assert.equal(new Set([...tintBlock.matchAll(/Icon: (\w+)/g)].map((m) => m[1])).size, 4);
});

test('How Arjun helps sits directly after the hero and its benefit tags', () => {
  const order = ['{/* ── Hero', '{/* ── Benefit tags', '{/* ── How Arjun helps', '{/* ── Inside Arjun ']
    .map((marker) => landing.indexOf(marker));
  for (const i of order) assert.ok(i !== -1);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1]);
});

test('the five benefit tags each carry their own accent, not one shared pill style', () => {
  assert.deepEqual(
    [en.tagTalk, en.tagReps, en.tagSave, en.tagLang, en.tagPrivate],
    ['Talk it through', 'Quick Mental Reps', 'Save what works', 'Hindi + English', 'Private by design'],
  );
  const tags = landing.slice(landing.indexOf('const benefitTags'), landing.indexOf('];', landing.indexOf('const benefitTags')));
  const fgs = [...tags.matchAll(/fg: '(#[0-9A-F]{6})'/gi)].map((m) => m[1].toLowerCase());
  assert.equal(fgs.length, 5);
  assert.equal(new Set(fgs).size, 5, 'five distinct accent colours');
  assert.equal(new Set([...tags.matchAll(/Icon: (\w+)/g)].map((m) => m[1])).size, 5);
  // No supporting sentence under a tag.
  for (const label of [en.tagTalk, en.tagReps, en.tagSave, en.tagLang, en.tagPrivate]) {
    assert.ok(label.length <= 20, `tag label too long: ${label}`);
  }
});

test('Inside Arjun shows four current product screens', () => {
  assert.deepEqual(
    [en.preview.coachCard.title, en.preview.repsCard.title, en.preview.playbookCard.title, en.preview.profileCard.title],
    ['Coach', 'Mental Reps', 'Playbook', 'Arjun remembers your game'],
  );
  assert.match(landing, /<CoachPreview key="coach" t=\{previews\.coachCard\} \/>/);
  assert.match(landing, /<RepsPreview key="reps" t=\{previews\.repsCard\} \/>/);
  assert.match(landing, /<PlaybookPreview key="playbook" t=\{previews\.playbookCard\} \/>/);
  assert.match(landing, /<ProfilePreview key="profile" t=\{previews\.profileCard\} \/>/);
  // Every preview is a device frame, all the same size.
  const inside = mockups.slice(mockups.indexOf('// ── Inside Arjun'), mockups.indexOf('// ── Built-around-you'));
  assert.equal((inside.match(/<PhoneFrame/g) || []).length, 1, 'one shared frame recipe for all four');
  assert.equal((inside.match(/<Preview /g) || []).length, 4);
});

test('the Coach preview is a real coaching exchange, not a generic AI chat', () => {
  const c = en.preview.coachCard;
  assert.equal(c.q1, "What's been getting in the way lately?");
  assert.equal(c.a1, 'After one mistake I start rushing.');
  assert.equal(c.q2, 'Is it the mistake itself, or trying to fix it too quickly?');
  assert.equal(c.line, "Work through what's happening.");
});

test('the Mental Rep preview shows the real rep shape', () => {
  const r = en.preview.repsCard;
  assert.equal(r.repTitle, 'Reset after a mistake');
  assert.equal(r.meta, '2 min');
  assert.deepEqual([r.step1, r.step2, r.step3], ['Slow the breath', 'Name the next action', 'Use your reset cue']);
  assert.equal(r.cta, 'Start Mental Rep');
});

test('the Playbook preview shows a lesson and a saved cue, nothing measured', () => {
  const p = en.preview.playbookCard;
  assert.equal(p.lessonLabel, 'Latest lesson');
  assert.equal(p.cueLabel, 'Saved cue');
  assert.equal(p.cue, 'Next ball.');
  const screen = phoneFrame.slice(phoneFrame.indexOf('export function PlaybookScreen'), phoneFrame.indexOf('// ── Screen 4'));
  assert.doesNotMatch(screen, /%|chart|graph|streak|score/i);
});

test('the fourth preview is the real When Pressure Hits profile section', () => {
  const p = en.preview.profileCard;
  assert.equal(p.screenTitle, 'When pressure hits');
  assert.deepEqual(
    [p.situationLabel, p.firstResponseLabel, p.impactLabel],
    ['Situation', 'First response', 'Performance impact'],
  );
  assert.match(p.resetTime, /^Reset time · /);
  assert.equal(p.title, 'Arjun remembers your game');
});

// ── 6. Built around you ─────────────────────────────────────────────────────

test('the personalisation section mirrors the real Profile sections', () => {
  assert.equal(en.personalTitle, 'Built around you');
  assert.deepEqual(en.personal.map((p) => p.title), ['Your game', 'When pressure hits', 'What works for you']);
  assert.deepEqual(
    en.personal.map((p) => p.line),
    ['Your sport, role and goals.', 'What tends to happen in difficult moments.', 'Useful cues, strategies and lessons.'],
  );
  assert.equal(hi.personal.length, 3);
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
  assert.doesNotMatch(bothBlocks, /personality|व्यक्तित्व|mental state|reads you|reads your mind|knows you|knows everything|learns everything|performance pattern/i);
});

// ── 7. Sport-psychology principles ──────────────────────────────────────────

test('the principles section states principles, never measured outcomes', () => {
  assert.equal(en.principlesTitle, 'Built around sport psychology principles');
  assert.deepEqual(en.principles.map((p) => p.title), ['Reset after setbacks', 'Focus & self-talk', 'Reflect & learn']);
  assert.equal(hi.principles.length, 3);
  assert.doesNotMatch(bothBlocks, /\d+\s*%|proven|clinically|\bstudy\b|\bstudies\b|evidence-based/i);
});

// ── 8. Pricing ──────────────────────────────────────────────────────────────

test('pricing has its own heading above the cards, not inside one', () => {
  assert.equal(en.pricingTitle, 'Choose your plan');
  assert.equal(hi.pricingTitle, 'अपना प्लान चुनो');
  const pricing = section('{/* ── Pricing', '{/* ── FAQ');
  const headingIdx = pricing.indexOf('{t.pricingTitle}');
  const firstCardIdx = pricing.indexOf('{t.planMonthly}');
  assert.ok(headingIdx !== -1 && firstCardIdx !== -1);
  assert.ok(headingIdx < firstCardIdx, 'the heading sits above both cards');
  assert.match(pricing, /<h2/);
  // Side by side on desktop, stacked on mobile.
  assert.match(pricing, /grid gap-4 sm:grid-cols-2/);
});

test('the two plans carry the real launch prices and the correct saving', () => {
  assert.equal(en.planMonthlyPrice, '₹299 / month');
  assert.equal(en.planYearlyPrice, '₹2,499 / year');
  assert.equal(en.planSave, 'Save ₹1,089 a year');
  // ₹299 × 12 = ₹3,588; ₹3,588 − ₹2,499 = ₹1,089.
  assert.equal(299 * 12 - 2499, 1089);
  assert.equal(hi.planMonthlyPrice, '₹299 / महीना');
  assert.equal(hi.planYearlyPrice, '₹2,499 / साल');
  // No other price exists anywhere in the visible copy (values only — the
  // arithmetic in the source comment is not shown to anyone).
  const flat = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(flat)
    : v && typeof v === 'object' ? Object.values(v).flatMap(flat) : []);
  const prices = [...flat(en), ...flat(hi)].join(' ').match(/₹[\d,]+/g) || [];
  assert.deepEqual([...new Set(prices)].sort(), ['₹1,089', '₹2,499', '₹299']);
});

test('both plans list the same benefits, yearly adds one', () => {
  assert.deepEqual(en.planBenefits, [
    'AI Coach conversations', 'Mental Reps', 'Playbook & saved cues', 'Hindi + English',
  ]);
  assert.equal(en.planYearlyExtra, 'Best value for regular training');
  assert.equal(hi.planBenefits.length, 4);
  const pricing = section('{/* ── Pricing', '{/* ── FAQ');
  assert.match(pricing, /\{t\.planBenefits\.map/);
  assert.match(pricing, /\[\.\.\.t\.planBenefits, t\.planYearlyExtra\]/);
});

test('yearly is the visually preferred plan, monthly is not broken', () => {
  const pricing = section('{/* ── Pricing', '{/* ── FAQ');
  // Split on the card comments so each slice includes its container classes.
  const monthly = pricing.slice(pricing.indexOf('{/* Monthly'), pricing.indexOf('{/* Yearly'));
  const yearly = pricing.slice(pricing.indexOf('{/* Yearly'));
  // POPULAR badge on yearly only.
  assert.equal((pricing.match(/\{t\.planPopular\}/g) || []).length, 1);
  assert.match(yearly, /\{t\.planPopular\}/);
  assert.doesNotMatch(monthly, /planPopular/);
  // Yearly: brand border + tint + filled CTA. Monthly: neutral + outlined CTA.
  assert.match(yearly, /border-2 border-\[#185FA5\]/);
  assert.match(yearly, /linear-gradient/);
  assert.match(yearly, /bg-\[#185FA5\] text-\[15\.5px\] font-bold text-white/);
  assert.match(monthly, /border-\[1\.5px\] border-\[#185FA5\] bg-white/, 'monthly keeps a clear outlined CTA');
  assert.doesNotMatch(monthly, /border-2 border-\[#185FA5\]/);
});

test('pricing invents nothing — no third tier, struck-through price or urgency', () => {
  assert.doesNotMatch(bothBlocks, /line-through|was ₹|only ₹|limited time|offer ends|hurry|money-back|guarantee/i);
  assert.doesNotMatch(section('{/* ── Pricing', '{/* ── FAQ'), /line-through/);
  // Exactly two plans.
  assert.equal((landing.match(/\{t\.planChoose\w+\}/g) || []).length, 2);
  // The 14-day trial is the only other pricing claim, and it is real.
  assert.match(en.pricingTrialNote, /14 days free/);
});

test('pricing CTAs use the existing entry point — no invented checkout', () => {
  const pricing = section('{/* ── Pricing', '{/* ── FAQ');
  assert.equal((pricing.match(/onClick=\{primaryAction\}/g) || []).length, 2);
  assert.doesNotMatch(homepageSources, /razorpay|create-subscription|checkout|planType/i);
});

// ── 9. FAQ ──────────────────────────────────────────────────────────────────

test('FAQ asks the approved questions, including the supported pricing one', () => {
  assert.deepEqual(en.faq.map((f) => f.q), [
    'What is Arjun?',
    'How do Mental Reps work?',
    'Is Arjun only for professional athletes?',
    'Can I use Arjun in Hindi?',
    'Is my data private?',
    'Can I cancel anytime?',
    'Is Arjun therapy?',
  ]);
  assert.equal(hi.faq.length, 7);
  for (const item of [...en.faq, ...hi.faq]) assert.ok(item.a.length <= 220, `FAQ answer too long: ${item.q}`);
});

test('the cancel answer matches the implemented cancel behaviour', () => {
  // AccountPage calls POST /api/payments/cancel, which keeps access until the
  // end of the billing period — the answer says exactly that and no more.
  const cancel = en.faq.find((f) => /cancel/i.test(f.q)).a;
  assert.match(cancel, /end of that billing period/i);
  assert.doesNotMatch(cancel, /refund|instantly|immediately/i);
});

test('the therapy boundary is stated, and privacy is claimed only as implemented', () => {
  assert.match(en.faq[6].a, /not therapy, diagnosis or emergency help/i);
  assert.match(en.faq[4].a, /delete your data, or your whole account/i);
  assert.doesNotMatch(bothBlocks, /encrypt|end-to-end|ISO|SOC ?2|GDPR-certified/i);
});

test('FAQ rows are an accessible accordion — button, aria-expanded, labelled panel', () => {
  assert.match(landing, /aria-expanded=\{open\}/);
  assert.match(landing, /aria-controls=\{`faq-panel-\$\{i\}`\}/);
  assert.match(landing, /aria-labelledby=\{`faq-btn-\$\{i\}`\}/);
  assert.match(landing, /hidden=\{!open\}/);
  assert.match(landing, /<h3>\s*<button/);
});

// ── 10. Carousels ───────────────────────────────────────────────────────────

test('carousels are swipeable, keyboard-operable and never auto-rotate', () => {
  assert.match(carousel, /snap-x snap-mandatory/);
  assert.match(carousel, /scroll-pl-5/, 'the first card stays aligned with its heading');
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
  const widths = [...landing.matchAll(/slideClass="w-\[(\d+(?:\.\d+)?)%\]/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 2);
  for (const w of widths) assert.ok(w >= 60 && w <= 90, `slide width ${w}% should reveal the next card`);
});

// ── 11. PWA install ─────────────────────────────────────────────────────────

test('PWA install support is intact — the prompt event is still captured and used', () => {
  assert.match(landing, /window\.addEventListener\('beforeinstallprompt', onPrompt\)/);
  assert.match(landing, /installPrompt\.prompt\(\)/);
  assert.match(landing, /window\.addEventListener\('appinstalled', onInstalled\)/);
  assert.match(viteConfig, /VitePWA\(/, 'the PWA plugin is untouched');
  assert.match(viteConfig, /short_name: 'Arjun'/);
});

test('install is a visible header action, not a menu item', () => {
  const header = section('{/* ── Header', 'id="landing-menu"');
  assert.match(header, /onClick=\{handleInstall\}/);
  assert.match(header, /<Download size=/);
  assert.match(header, /aria-label=\{t\.installApp\}/);
  const menu = section('id="landing-menu"', '</header>');
  assert.doesNotMatch(menu, /handleInstall|installApp|installShort/);
});

test('every CTA runs the one existing PWA handler — no second implementation', () => {
  assert.ok((landing.match(/onClick=\{primaryAction\}/g) || []).length >= 5,
    'hero, both pricing cards, final CTA and footer');
  assert.match(landing, /const primaryAction = installed \? goSignIn : handleInstall;/);
  assert.equal((landing.match(/installPrompt\.prompt\(\)/g) || []).length, 1);
});

test('an installed visitor is never shown a misleading install action', () => {
  assert.match(landing, /const primaryLabel = installed \? t\.ctaOpen : t\.ctaInstall;/);
  const header = section('{/* ── Header', 'id="landing-menu"');
  assert.match(header, /installed \? \(/);
  assert.match(header, /\{t\.installDone\}/);
  assert.equal(en.ctaOpen, 'Open Arjun');
});

test('the no-prompt fallback instructions are still reachable', () => {
  assert.match(landing, /setInstallHint\(true\)/);
  assert.match(landing, /\{installHint && \(/);
  assert.match(landing, /isIOS \? t\.installIos : isAndroid \? t\.installAndroid : t\.installDesktop/);
});

// ── 12. Final CTA + footer ──────────────────────────────────────────────────

test('the final CTA converts to the app, with no account CTA or social proof', () => {
  assert.equal(en.finalTitle, 'Ready to play your best?');
  assert.equal(en.finalLine, 'Install Arjun and start training your mind.');
  const finalCta = section('{/* ── Final CTA', '{/* ── Footer');
  assert.match(finalCta, /onClick=\{primaryAction\}/);
  assert.doesNotMatch(finalCta, /ctaSignIn|ctaCreate|goSignIn/);
  assert.doesNotMatch(finalCta, /★|star|badge/i);
});

test('the footer keeps every policy link, including child safety', () => {
  const footer = landing.slice(landing.indexOf('{/* ── Footer'));
  assert.match(footer, /onClick=\{primaryAction\}/, 'the footer product action is the install action');
  for (const key of ['footerPrivacy', 'footerTerms', 'footerChildSafety', 'footerRefund', 'footerSupport']) {
    assert.match(footer, new RegExp(`t\\.${key}`), `missing footer link: ${key}`);
  }
  assert.match(footer, /\/terms#ai-child-safety/);
});

// ── 13. Auth routes are untouched ───────────────────────────────────────────

test('the auth route contract is untouched — sign-in still goes to /auth?tab=signin', () => {
  assert.match(landing, /const goSignIn = \(\) => navigate\('\/auth\?tab=signin'\);/);
  const routes = [...landing.matchAll(/navigate\('([^']+)'\)/g)].map((m) => m[1]);
  const allowed = ['/auth?tab=signin', '/privacy', '/terms', '/terms#ai-child-safety', '/refund'];
  for (const route of routes) assert.ok(allowed.includes(route), `unexpected navigation target: ${route}`);
});

test('App.jsx still renders the landing page at / and AuthPage at /auth', () => {
  assert.match(app, /<Route path="\/" element=\{user \? <Navigate to="\/dashboard" replace \/> : <LandingPage \/>\} \/>/);
  assert.match(app, /<Route path="\/auth" element=\{user \? <Navigate to="\/dashboard" replace \/> : <AuthPage \/>\} \/>/);
});

// ── 14. Client-only, and scoped to this page ────────────────────────────────

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
    assert.ok(!/pages\/|Navbar|BottomNav/.test(spec), `homepage must not import an authenticated screen: ${spec}`);
  }
});

// ── 15. EN/HI parity ────────────────────────────────────────────────────────

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
      // Coach, EN/HI labels); everything sentence-like must be Hindi.
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
