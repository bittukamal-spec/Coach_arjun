// Source-text checks for PR-1 (Pilot Visibility Cleanup). Dashboard.jsx,
// TrainPage.jsx, BodyResetPage.jsx, SelfTalkPage.jsx and FocusDeckPage.jsx
// contain JSX and cannot be imported directly by node:test without a
// transform — matching the established pattern elsewhere in this suite
// (mindJournalLinks.test.js, chatPageSource.test.js), these are
// source-text assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const dashboard = readFileSync(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8');
const train = readFileSync(path.join(root, 'src/pages/TrainPage.jsx'), 'utf8');
const bodyReset = readFileSync(path.join(root, 'src/pages/BodyResetPage.jsx'), 'utf8');
const selfTalk = readFileSync(path.join(root, 'src/pages/SelfTalkPage.jsx'), 'utf8');
const chatPage = readFileSync(path.join(root, 'src/pages/ChatPage.jsx'), 'utf8');
const translations = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

// ── 1. Dashboard: legacy pilot-facing UI is gone ────────────────────────────

test('Dashboard: no streak, XP, or fitness-score stat pills', () => {
  assert.doesNotMatch(dashboard, /stat-pill/);
  assert.doesNotMatch(dashboard, /setInfoPopup/);
});

test('Dashboard: no streak-freeze or missed-streak UI', () => {
  assert.doesNotMatch(dashboard, /useFreeze|showFreezeConfirm|streaks\/freeze|freezeConfirmTitle/);
  assert.doesNotMatch(dashboard, /missedYesterday|missedDismissed/);
});

test('Dashboard: no old Mental Fitness "today" surface, report sheet, or numeric dimension scores', () => {
  assert.doesNotMatch(dashboard, /mental-fitness\/today/);
  assert.doesNotMatch(dashboard, /showMfsReport|mfsEntry/);
  assert.doesNotMatch(dashboard, /Daily Mental Workout|दैनिक मानसिक वर्कआउट/);
});

test('Dashboard: no unsupported "reduce nerves by 31%" claim in English or Hindi', () => {
  assert.doesNotMatch(dashboard, /31%/);
  assert.doesNotMatch(dashboard, /reduce nerves/i);
});

test('Dashboard: no Starter Plan coach note, session list, locked-session messaging, or "Ask Arjun about this plan"', () => {
  assert.doesNotMatch(dashboard, /plan\/current|Starter Plan|स्टार्टर प्लान/);
  assert.doesNotMatch(dashboard, /Ask Arjun about this plan|इस प्लान के बारे में पूछो/);
  assert.doesNotMatch(dashboard, /Complete the previous session first/);
});

test('Dashboard: renders a score-free Mind Journal card that opens /mind-journal', () => {
  // Homepage-priority pass: the card reuses the shared TrainGradientCard
  // (onClick + navigate()), still score-free, with the founder-approved
  // heading/value copy.
  assert.match(dashboard, /to="\/mind-journal"|navigate\('\/mind-journal'\)/);
  assert.match(dashboard, /\{t\.journalHeading\}/);
  assert.match(dashboard, /\{t\.journalValue\}/);
  assert.doesNotMatch(dashboard, /\d+\s*\/\s*5|score:\s*\d/i, 'still no numeric score of any kind');
});

test('Dashboard: stopped requests that only supported hidden sections (Starter Plan, MFS today, progress stat pills, the Playbook summary)', () => {
  // Comments explaining WHICH request was dropped must not satisfy the check.
  const code = dashboard
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  for (const endpoint of [
    /\/api\/plan\/current/,
    /\/api\/mental-fitness\/today/,
    /\/api\/progress\/summary/,
    /\/api\/streaks\/freeze/,
    // The last one: its response was never read, and the Playbook page it
    // once fed is gone. Home now makes no request at all.
    /\/api\/playbook/,
  ]) {
    assert.doesNotMatch(code, endpoint);
  }
  assert.doesNotMatch(code, /apiFetch/);
});

test('Dashboard: no visible games or skill-path entry points', () => {
  assert.doesNotMatch(dashboard, /\/games\/focus-lock|\/games\/reset-rally/);
  assert.doesNotMatch(dashboard, /\/skills\/pressure-reset|\/skills\/focus-self-talk/);
});

// ── 2. Dashboard: all four problem shortcuts enter Coach with a prefill ────

test('Dashboard: all four problem shortcuts are real <Link> elements to /coaching with a visible, unsent prefill', () => {
  const idx = dashboard.indexOf('PROBLEM_SHORTCUTS');
  assert.ok(idx !== -1, 'expected a PROBLEM_SHORTCUTS definition');
  // A real <Link>, not onClick+navigate — see hotfix/dashboard-shortcut-navigation.
  assert.match(dashboard, /import \{ useNavigate, Link \} from 'react-router-dom'/);
  assert.match(dashboard, /<Link[\s\S]{0,80}to="\/coaching"[\s\S]{0,80}state=\{\{ prefillMsg: q\.prefill\[hi \? 'hi' : 'en'\] \}\}/);
  // Exactly 4 stable shortcut ids, matching the approved product decision.
  for (const id of ['nervous', 'mistake', 'focus', 'confidence']) {
    assert.match(dashboard, new RegExp(`id:\\s*'${id}'`));
  }
});

test('Dashboard: problem shortcuts no longer navigate directly to games, Pressure Reset, or a skill path', () => {
  const shortcutsBlock = dashboard.slice(dashboard.indexOf('PROBLEM_SHORTCUTS'), dashboard.indexOf('export default function Dashboard'));
  assert.doesNotMatch(shortcutsBlock, /\/games\/|\/skills\/|\/body-reset|\/self-talk/);
});

test('ChatPage: the prefillMsg mechanism sets the composer but never auto-sends', () => {
  assert.match(chatPage, /prefillMsgRef\s*=\s*useRef\(location\.state\?\.prefillMsg/);
  assert.match(chatPage, /setInput\(prefillMsgRef\.current\)/);
  // Consumed once so it can't repeatedly overwrite later athlete input.
  assert.match(chatPage, /prefillMsgRef\.current\s*=\s*null/);
  // No auto-send: the prefill effect never calls a send/submit function itself.
  const idx = chatPage.indexOf('if (prefillMsgRef.current)');
  const block = chatPage.slice(idx, idx + 200);
  assert.doesNotMatch(block, /handleSend|sendMessage|submit\(/i);
});

// ── 3. Train: obsolete entries removed, retained tools still render ────────

test('Train: does not render Practice Focus, Next Play Reset, Mental Playbook row, Games section, Focus Lock, Reset Rally, or play counters', () => {
  assert.doesNotMatch(train, /Practice Focus/);
  assert.doesNotMatch(train, /Next Play Reset/);
  assert.doesNotMatch(train, /Mental Playbook/);
  assert.doesNotMatch(train, /Games|GameCard/);
  assert.doesNotMatch(train, /Focus Lock|Reset Rally/);
  assert.doesNotMatch(train, /playsToday|totalToday|totalLimit|repsDone/);
});

test('Train: no visible links to games or skill-path quiz routes', () => {
  assert.doesNotMatch(train, /\/games\/focus-lock|\/games\/reset-rally/);
  assert.doesNotMatch(train, /\/skills\/pressure-reset|\/skills\/focus-self-talk/);
  assert.doesNotMatch(train, /Learn first|पहले सीखो/);
});

test('Train: stopped client requests for removed game-status / skill-gate content', () => {
  assert.doesNotMatch(train, /\/api\/games\/status/);
  assert.doesNotMatch(train, /\/api\/skills\/calm_body/);
});

test('Train: retained tools still render — Ritual, Pressure Reset, Quick Rep, Focus Card Builder', () => {
  // Stage E moved the practice names into the trainPage translation
  // namespace and the routes into one table, so the names are asserted
  // where they now live — in BOTH languages, which the previous
  // English-only source-text check never covered.
  for (const name of ['Pressure Reset', 'Quick Rep', 'Focus Card Builder', 'Ritual']) {
    assert.ok(translations.includes(name), `${name} must still be an athlete-facing name`);
  }
  // PR 2 cutover: the separate reflection tool is retired as an athlete
  // entry point, so its name must not survive anywhere in athlete copy.
  assert.ok(!translations.includes('Match & Practice Reflection'),
    'the retired reflection tool name must be gone from athlete copy');
  assert.equal(
    (translations.match(/trainPage: \{/g) || []).length, 2,
    'trainPage namespace exists in both en and hi',
  );
  assert.doesNotMatch(train, /Daily Mental Rep/);
  assert.doesNotMatch(translations, /Daily Mental Rep/);

  // Every real practice route is still reachable from Train.
  for (const route of ['/ritual', '/body-reset', '/mental-rep', '/self-talk']) {
    assert.ok(train.includes(`'${route}'`), `Train must still route to ${route}`);
  }
  assert.doesNotMatch(train, /\/debrief/, 'Train no longer exposes the retired reflection tool');
  // Visual refresh: "View history" was relocated OFF the Train page onto the
  // Pressure Reset intro screen (BodyResetPage.jsx already exposes it via
  // PracticeIntro's secondaryLabel/onSecondary — proven in
  // pressureResetShell.dom.test.jsx and navigationIaCleanup.dom.test.jsx).
  // Train itself no longer references the route at all.
  assert.doesNotMatch(train, /'\/body-reset\/history'/, 'Train no longer links to the history route directly');
  const bodyReset = readFileSync(path.join(root, 'src/pages/BodyResetPage.jsx'), 'utf8');
  assert.match(bodyReset, /onSecondary=\{\(\) => navigate\('\/body-reset\/history'\)\}/, 'the intro screen still exposes it');
  assert.match(train, /navigate\(p\.to\)/, 'tiles navigate via the route table');
});

test('Train: the tap-target correction touched only styling — every route is exactly as before, minus the relocated history control', () => {
  // Pins the complete route set so a future change can't quietly add,
  // remove or redirect a destination while "just" fixing a tap target.
  // '/body-reset/history' is intentionally absent — see the test above.
  const routeMatches = train.match(/to: '([^']+)'/g) || [];
  const routes = routeMatches.map(m => m.match(/'([^']+)'/)[1]).sort();
  assert.deepEqual(routes, [
    '/body-reset', '/mental-rep', '/ritual', '/self-talk',
  ].sort());
  assert.doesNotMatch(train, /historyTo/, 'the per-practice history route table entry is gone, not just hidden');
});

test('Train: exactly the four real practices — no invented categories, no fabricated counts', () => {
  const keys = (train.match(/key: '(\w+)'/g) || []);
  assert.equal(keys.length, 4, 'exactly four practices are listed');
  // No count/metadata language anywhere on the page.
  assert.doesNotMatch(train, /\d+\s*(practices|sessions|exercises)/i);
  assert.doesNotMatch(train, /practiceCount|count:/);
  // No category scaffolding beyond the two real groupings — the "After you
  // play" group went with the retired reflection tool rather than being left
  // behind empty.
  assert.equal((train.match(/labelKey:/g) || []).length, 2);
  assert.doesNotMatch(train, /afterLabel/, 'no empty group is left behind');
});

// Visual refresh (approved mockup): Train's tiles are now deliberately
// gradient cards — the opposite of the earlier flat-only decision this test
// used to pin. The old flat PracticeTile.jsx is left untouched and unused
// (still importable, still flat) rather than deleted, so this only asserts
// the NEW page actually adopted the approved gradient system.
test('Train tiles now use the approved blue/teal/amber/purple gradient system from the mockup', () => {
  const stripComments = (s) => s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

  assert.match(stripComments(train), /TrainGradientCard/, 'the practices render through the new gradient card');
  // Amber left Train with the retired reflection tile; the remaining
  // practices keep their own approved gradients.
  for (const variant of ['blue', 'teal', 'purple']) {
    assert.ok(train.includes(`variant: '${variant}'`), `the ${variant} gradient must still be assigned somewhere`);
  }
  // The old flat tile stays untouched and unused rather than deleted.
  const tile = stripComments(readFileSync(path.join(root, 'src/components/train/PracticeTile.jsx'), 'utf8'));
  assert.doesNotMatch(tile, /gradient|GradientIconTile|card-hero|btn-gradient/i);
  assert.doesNotMatch(stripComments(train), /PracticeTile/, 'Train no longer renders the retired flat tile');
});

test('Train: two-column grid with a real minimum tile height and accessible targets', () => {
  assert.match(train, /grid-cols-2/);
  const tile = readFileSync(path.join(root, 'src/components/train/PracticeTile.jsx'), 'utf8');
  assert.match(tile, /min-h-\[76px\]/);
  assert.match(tile, /focus-visible:ring-2/);
});

// ── 4. Pressure Reset / Focus Self-Talk: soft-gate skill-path CTA hidden ───

test('BodyResetPage: no visible soft-gate CTA into the Pressure Reset skill-path quiz', () => {
  assert.doesNotMatch(bodyReset, /\/skills\/pressure-reset/);
  assert.doesNotMatch(bodyReset, /showSoftGate/);
});

test('BodyResetPage: breathing, safety, HelplineList, and prescription handling are untouched', () => {
  assert.match(bodyReset, /HelplineList/);
  assert.match(bodyReset, /prescriptionLinkRef/);
  assert.match(bodyReset, /CRISIS_KEYWORDS/);
  assert.match(bodyReset, /circleScale/);
});

test('SelfTalkPage: no visible soft-gate CTA into the Focus Self-Talk skill-path quiz', () => {
  assert.doesNotMatch(selfTalk, /\/skills\/focus-self-talk/);
  assert.doesNotMatch(selfTalk, /showSoftGate/);
});

// ── 5. No route or page file was deleted ────────────────────────────────────

test('The /skills/pressure-reset and /skills/focus-self-talk routes still exist in App.jsx', () => {
  const app = readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
  assert.match(app, /path="\/skills\/pressure-reset"/);
  assert.match(app, /path="\/skills\/focus-self-talk"/);
  assert.match(app, /path="\/games\/focus-lock"/);
  assert.match(app, /path="\/games\/reset-rally"/);
});
