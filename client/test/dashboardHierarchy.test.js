// Source-text checks for the Dashboard visual-hierarchy refinement:
// approved section order (Mind Journal promoted to the top, directly below
// the greeting), a segmented day-context selector that can never be
// confused with the problem-help shortcuts, a compact Mind Journal CTA, and
// none of the retired scored UI (XP, streaks, scores, Starter Plan, games,
// skill paths) returning.
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

// Code between two section markers. The markers themselves live inside the
// sections' own comments, so the partial opening comment is dropped first.
function codeBetween(startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  const end = endMarker ? src.indexOf(endMarker) : src.length;
  let block = src.slice(start, end);
  const close = block.indexOf('*/}');
  if (close !== -1) block = block.slice(close + 3);
  return stripComments(block);
}

// ── 1. Approved section order — Mind Journal promoted to the top ───────────
// Homepage-priority pass: Mind Journal now renders directly below the
// greeting, ahead of Talk to Arjun, per the approved change. Every other
// section keeps its existing relative order.

test('Dashboard renders the approved order: greeting → Mind Journal → Talk to Arjun → day context → recommended practice → need-help', () => {
  const order = [
    src.indexOf('1. GREETING'),
    src.indexOf('2. MIND JOURNAL'),
    src.indexOf('3. TALK TO ARJUN'),
    src.indexOf('4. DAY-CONTEXT SELECTOR'),
    src.indexOf('5. RECOMMENDED PRACTICE'),
    src.indexOf('7. NEED HELP RIGHT NOW'),
  ];
  for (const idx of order) assert.ok(idx !== -1, 'every approved section must exist');
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], `section ${i + 1} must render after section ${i}`);
  }
});

test('Talk to Arjun is the ONE dominant action — a plain Link to Coach that claims nothing on Home load', () => {
  const hero = src.slice(src.indexOf('3. TALK TO ARJUN'), src.indexOf('4. DAY-CONTEXT SELECTOR'));
  assert.match(hero, /to="\/coaching"/, 'the hero opens the existing Coach route');
  assert.match(hero, /L\.dashboard\.openCoach/, 'uses the existing approved "Talk to Arjun" wording');
  // A Link cannot create a session, claim the follow-up opener, or call any
  // chat API — the whole point of using one here.
  assert.doesNotMatch(hero, /apiFetch|method:\s*'POST'|claim-opener|sessionId/);
  // Exactly one hero: no competing saturated primary elsewhere on the page.
  assert.equal((src.match(/elevation-hero/g) || []).length, 1);
});

test('the recommended practice is visually secondary to the hero and never completes a practice from Home', () => {
  const block = codeBetween('5. RECOMMENDED PRACTICE', '6. CONTINUE COACHING');
  assert.match(block, /navigate\(primaryAction\.to, primaryActionState\)/, 'existing recommendation routing is unchanged');
  assert.doesNotMatch(block, /complete|markDone|POST/i, 'Home never marks a practice complete');
  // The hero owns the saturated full-bleed gradient surface; the merged
  // What's today container stays a flat neutral card (a small icon-tile may
  // still use the brand-primary token as an accent, same as elsewhere on
  // the app — it just never becomes a second hero-style gradient card).
  assert.doesNotMatch(block, /elevation-hero|card-hero|linear-gradient/);
});

test('Continue coaching is deliberately absent, not faked — no session/eligibility guess on Home', () => {
  // Its eligibility has no read-only source available to Home, so the slot
  // is documented in a comment and left empty rather than driven by an
  // invented signal. The documentation is prose; the code must stay clean.
  assert.match(src, /6\. CONTINUE COACHING/, 'the deferral is documented in place');
  assert.doesNotMatch(codeOnly, /\/api\/sessions|claim-opener|hasConversation|continueCoaching/);
});

test('exactly ONE adaptive primary action card — training/match/recovery/just-a-rep swap it, never stack another', () => {
  assert.match(src, /const primaryAction = PRIMARY_ACTION\[dayContext\] \|\| PRIMARY_ACTION\.default;/);
  for (const ctx of ['training', 'match', 'recovery', 'just_rep']) {
    assert.ok(src.includes(`'${ctx}'`), `day context ${ctx} must still exist`);
  }
  // Only the default Mental Rep action carries dayContext route state.
  assert.match(src, /primaryAction\.to === '\/mental-rep' && dayContext/);
});

// ── 2. "What's today?" is a real <select> dropdown, merged with the
// recommendation into one container (visual refresh) ───────────────────────

test('day-context control is a real <select> dropdown covering all four day contexts, with a visible focus ring', () => {
  const block = src.slice(src.indexOf('<select'), src.indexOf('navigate(primaryAction.to'));
  assert.match(block, /<select/, 'the pill grid was replaced by a real dropdown');
  assert.match(block, /aria-label=\{t\.contextLabel\}/);
  assert.match(block, /focus-visible:ring-2/);
  assert.match(block, /value=\{dayContext \|\| ''\}/, 'controlled by the same dayContext state as before');
  assert.match(block, /DAY_CONTEXTS\.map/, 'every day context still becomes an option');
  assert.doesNotMatch(block, /aria-pressed|role="group"/, 'the old pill/group markup is gone');
});

test('day-context dropdown only updates context on change — it is never a link and never calls navigate itself', () => {
  // Slice ends where the separate primary CTA button (which legitimately
  // navigates) begins.
  const block = src.slice(src.indexOf('<select'), src.indexOf('navigate(primaryAction.to'));
  assert.match(block, /onChange=\{e => pickContext\(e\.target\.value \|\| null\)\}/);
  assert.doesNotMatch(block, /<Link|navigate\(/);
});

// ── 3. Need-help shortcuts stay separate, with a different treatment ────────

test('all four problem shortcuts are real Links to /coaching with unsent prefill state, in their own section', () => {
  const block = src.slice(src.indexOf('PROBLEM_SHORTCUTS.map'), src.indexOf('4. MENTAL PLAYBOOK'));
  assert.match(block, /to="\/coaching"/);
  assert.match(block, /state=\{\{ prefillMsg: q\.prefill\[hi \? 'hi' : 'en'\] \}\}/);
  assert.doesNotMatch(block, /sendMessage|autoSend|method: 'POST'/, 'shortcuts must never auto-send');
  for (const id of ['nervous', 'mistake', 'focus', 'confidence']) {
    assert.ok(src.includes(`id: '${id}'`), `shortcut ${id} must survive`);
  }
});

test('shortcut tiles look like actions (icon + bordered tile) while the day-context dropdown does not — the two can\'t be confused', () => {
  // Need Help is the last rendered section since Mind Journal moved to the
  // top of Home, so the block runs to end of file.
  const shortcutBlock = src.slice(src.indexOf('PROBLEM_SHORTCUTS.map'));
  const dropdownBlock = src.slice(src.indexOf('<select'), src.indexOf('navigate(primaryAction.to'));
  assert.match(shortcutBlock, /border border-dark-600/, 'shortcuts are outlined tiles');
  assert.match(shortcutBlock, /<Icon size=/, 'shortcuts carry a small icon');
  assert.doesNotMatch(dropdownBlock, /<Icon size=/, 'the dropdown carries no lucide shortcut icon');
  assert.doesNotMatch(dropdownBlock, /className=\{?"?chip/, 'the dropdown never uses the generic .chip class the shortcuts use');
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

// ── 4/5. Playbook card removed; Mind Journal preserved ────────────────────

test('the duplicate Home Playbook / "Your library" card is GONE — Playbook lives in the bottom nav only', () => {
  assert.doesNotMatch(src, /to="\/playbook"/, 'no Home link to /playbook');
  assert.doesNotMatch(src, /Your library|तुम्हारी लाइब्रेरी/);
  assert.doesNotMatch(src, /Mental Playbook/);
  assert.doesNotMatch(src, /Your cues, cards, reflections, and lessons/);
});

test('Dashboard still makes exactly one read-only GET /api/playbook — the API contract is unchanged', () => {
  const apiCalls = codeOnly.match(/apiFetch\(/g) || [];
  assert.equal(apiCalls.length, 1, 'Dashboard must make exactly one API call');
  assert.match(src, /apiFetch\('\/api\/playbook'/);
  assert.doesNotMatch(codeOnly, /method:\s*'(POST|PUT|PATCH|DELETE)'/, 'Home writes nothing');
});

test('Mind Journal is a compact CTA linking to /mind-journal with the approved heading/value/CTA copy, no score', () => {
  assert.match(src, /to="\/mind-journal"/);
  // Homepage-priority pass: the card's own heading/value/CTA live in
  // dedicated `home` namespace keys, distinct from journalDesc/journalHint
  // (still defined, still read by other surfaces) so the exact approved
  // copy is asserted where it now actually renders.
  assert.ok(src.includes('{t.journalHeading}'));
  assert.ok(translations.includes('Reflect. Grow. Perform.'));
  assert.ok(src.includes('{t.journalValue}'), 'one short value statement, tying reflection to Arjun\'s coaching');
  assert.ok(translations.includes('help Arjun coach you more personally'));
  assert.ok(src.includes('t.journalCta'), 'the CTA copy labels the affordance to open Mind Journal');
  assert.ok(translations.includes('Open Mind Journal'));
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
