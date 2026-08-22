// Source-text checks for the Dashboard visual hierarchy. Home is deliberately
// four sections — greeting → Mind Journal → Talk to Arjun → Pick what you need
// now — with no day-context selector, no recommended-practice card and no API
// call of its own, and none of the retired scored UI (XP, streaks, scores,
// Starter Plan, games, skill paths) returning.
// Dashboard.jsx contains JSX and cannot be imported by node:test without
// a transform — matching the established pattern, these are source-text
// assertions; the real click/router behavior is separately proven in
// dashboardShortcuts.dom.test.jsx.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const src = readFileSync(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8');
const translations = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

// Strips JSX `{/* … */}` blocks, JS `/* … */` blocks and `//` lines, so an
// assertion about what the CODE does can never be satisfied — or broken —
// by explanatory prose in a comment.
function stripComments(s) {
  return s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
}

const codeOnly = stripComments(src);

// The `home` namespace for one language, so a removed key can be proven gone
// from that language rather than merely absent from the whole file.
function homeNamespace(lang) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translations.indexOf('home: {', langIdx);
  assert.ok(start !== -1, `missing home namespace in ${lang}`);
  return translations.slice(start, translations.indexOf('\n    },', start));
}

// ── 1. Approved section order — exactly four sections ─────────────────────
// Mind Journal renders directly below the greeting, ahead of Talk to Arjun.
// "Pick what you need now" closes the page. Nothing sits between the Coach
// hero and the shortcuts any more.

test('Dashboard renders exactly the approved order: greeting → Mind Journal → Talk to Arjun → Pick what you need now', () => {
  const order = [
    src.indexOf('1. GREETING'),
    src.indexOf('2. MIND JOURNAL'),
    src.indexOf('3. TALK TO ARJUN'),
    src.indexOf('4. PICK WHAT YOU NEED NOW'),
  ];
  for (const idx of order) assert.ok(idx !== -1, 'every approved section must exist');
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], `section ${i + 1} must render after section ${i}`);
  }
  // No fifth section slipped in to fill the space the recommender left.
  assert.equal(src.indexOf('5. '), -1, 'Home is deliberately four sections');
});

test('Talk to Arjun is the ONE dominant action — a plain Link to Coach that claims nothing on Home load', () => {
  const hero = src.slice(src.indexOf('3. TALK TO ARJUN'), src.indexOf('CONTINUE COACHING'));
  assert.match(hero, /to="\/coaching"/, 'the hero opens the existing Coach route');
  assert.match(hero, /L\.dashboard\.openCoach/, 'uses the existing approved "Talk to Arjun" wording');
  // A Link cannot create a session, claim the follow-up opener, or call any
  // chat API — the whole point of using one here.
  assert.doesNotMatch(hero, /apiFetch|method:\s*'POST'|claim-opener|sessionId/);
  // Exactly one hero: no competing saturated primary elsewhere on the page.
  assert.equal((src.match(/elevation-hero/g) || []).length, 1);
});

test('Continue coaching is deliberately absent, not faked — no session/eligibility guess on Home', () => {
  // Its eligibility has no read-only source available to Home, so the slot
  // is documented in a comment and left empty rather than driven by an
  // invented signal. The documentation is prose; the code must stay clean.
  assert.match(src, /CONTINUE COACHING/, 'the deferral is documented in place');
  assert.doesNotMatch(codeOnly, /\/api\/sessions|claim-opener|hasConversation|continueCoaching/);
});

// ── 2. "What's today?" and its recommended practice are gone ──────────────
// The day-context selector and the single adaptive practice card it fed were
// removed from Home. The selector was client-local state, so nothing was
// migrated; nothing replaced the recommendation, and no hidden or dead
// version of it survives.

test('the "What\'s today?" day-context selector is gone — no control, no state, no localStorage', () => {
  assert.doesNotMatch(src, /<select/, 'no day-context dropdown');
  assert.doesNotMatch(src, /DAY_CONTEXTS|dayContext|pickContext/, 'no day-context data or state');
  assert.doesNotMatch(src, /arjun_day_context/, 'the client-local remembered pick is gone');
  assert.doesNotMatch(src, /localStorage/, 'Home reads and writes no localStorage at all');
});

test('the recommended-practice card tied to the selector is gone, and no other recommender took its place', () => {
  assert.doesNotMatch(src, /PRIMARY_ACTION|primaryAction|primaryActionState/);
  assert.doesNotMatch(codeOnly, /recommend/i, 'no recommendation copy or hint remains');
  // Home's only remaining destinations are Mind Journal and Coach; it must
  // not have quietly become a tool launcher instead.
  assert.doesNotMatch(codeOnly, /\/mental-rep|\/body-reset|\/mind-journal\/new/);
});

test('the removed day-context and recommendation copy is gone from both languages', () => {
  for (const key of ['contextLabel', 'contextPlaceholder', 'recommendHint', 'recommendedLabel']) {
    assert.doesNotMatch(homeNamespace('en'), new RegExp(`${key}:`), `en.home.${key} must be gone`);
    assert.doesNotMatch(homeNamespace('hi'), new RegExp(`${key}:`), `hi.home.${key} must be gone`);
  }
});

// ── 3. Need-help shortcuts keep their own treatment ────────────────────────

test('all four problem shortcuts are real Links to /coaching with unsent prefill state, in their own section', () => {
  const block = src.slice(src.indexOf('PROBLEM_SHORTCUTS.map'));
  assert.match(block, /to="\/coaching"/);
  assert.match(block, /state=\{\{ prefillMsg: q\.prefill\[hi \? 'hi' : 'en'\] \}\}/);
  assert.doesNotMatch(block, /sendMessage|autoSend|method: 'POST'/, 'shortcuts must never auto-send');
  for (const id of ['nervous', 'mistake', 'focus', 'confidence']) {
    assert.ok(src.includes(`id: '${id}'`), `shortcut ${id} must survive`);
  }
});

test('shortcut tiles still read as actions — icon plus bordered tile', () => {
  // "Pick what you need now" is the last rendered section, so the block runs
  // to end of file.
  const shortcutBlock = src.slice(src.indexOf('PROBLEM_SHORTCUTS.map'));
  assert.match(shortcutBlock, /border border-dark-600/, 'shortcuts are outlined tiles');
  assert.match(shortcutBlock, /<Icon size=/, 'shortcuts carry a small icon');
});

test('the four shortcuts are visually demoted but keep accessible tap targets', () => {
  // Need Help is the last rendered section since Mind Journal moved to the
  // top of Home, so the block runs to end of file.
  const shortcutBlock = src.slice(src.indexOf('PROBLEM_SHORTCUTS.map'));
  assert.match(shortcutBlock, /min-h-\[48px\]/, 'still a real tap target after demotion');
});

test('shortcut prefill messages are unchanged', () => {
  assert.ok(src.includes(`"I'm feeling nervous."`));
  assert.ok(src.includes(`"I made a mistake and can't stop thinking about it."`));
  assert.ok(src.includes(`'I need help focusing.'`));
  assert.ok(src.includes(`"I'm feeling low on confidence."`));
});

// ── 4. Playbook gone from Home entirely; Mind Journal preserved ───────────

test('Home carries no Playbook link or card at all', () => {
  assert.doesNotMatch(codeOnly, /playbook/i, 'no Home link, card or fetch mentioning Playbook');
  assert.doesNotMatch(src, /Your library|तुम्हारी लाइब्रेरी/);
  assert.doesNotMatch(src, /Your cues, cards, reflections, and lessons/);
});

test('Home no longer fetches /api/playbook — it makes no API call of its own', () => {
  // The fetch existed only to gate a loading skeleton; its response was
  // never read. Removing it means Home renders immediately. The server
  // endpoint is untouched.
  assert.doesNotMatch(codeOnly, /apiFetch/, 'Dashboard must make no API call');
  assert.doesNotMatch(codeOnly, /\/api\/playbook/);
  assert.doesNotMatch(codeOnly, /useEffect|setLoaded|animate-pulse/, 'no loading gate or skeleton left behind');
  assert.doesNotMatch(codeOnly, /method:\s*'(POST|PUT|PATCH|DELETE)'/, 'Home writes nothing');
});

test('Mind Journal is a gradient CTA (reusing TrainGradientCard) linking to /mind-journal with the approved heading/value copy, no score', () => {
  assert.match(src, /onClick=\{\(\) => navigate\('\/mind-journal'\)\}/);
  // Homepage-priority pass: the card's own heading/value live in dedicated
  // `home` namespace keys, distinct from journalDesc/journalHint (still
  // defined, still read by other surfaces) so the exact approved copy is
  // asserted where it now actually renders. The affordance to open Mind
  // Journal is the shared card's own bottom-right arrow badge, the same
  // established pattern Train's own gradient cards already use — there is
  // no separate CTA label to assert here.
  assert.ok(src.includes('title={t.journalHeading}'));
  assert.ok(translations.includes('Reflect. Grow. Perform.'));
  assert.ok(src.includes('desc={t.journalValue}'), 'one short value statement, tying reflection to Arjun\'s coaching');
  assert.ok(translations.includes('help Arjun coach you more personally'));
  assert.doesNotMatch(codeOnly, /daily habit|every day|har din likho/i, 'no pressure-to-write-daily copy');
});

// ── 6. None of the retired scored UI returns ────────────────────────────────

test('no XP, streak, score, Starter Plan, game or skill-path UI returns to the Dashboard', () => {
  assert.doesNotMatch(codeOnly, /\bxp\b|streak|Starter Plan|स्टार्टर/i);
  // The only permitted "score" mentions are the Mind Journal card's
  // explicit NO-scores promise — never a displayed score or rating.
  assert.doesNotMatch(codeOnly, /fitnessScore|score:|Score\b|\d+\s*\/\s*5/);
  assert.doesNotMatch(codeOnly, /\/games\/|\/skills\//);
  assert.doesNotMatch(codeOnly, /\/api\/progress|\/api\/streaks|\/api\/plan/);
});
