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

test('Dashboard: renders a quiet Mind Journal row that opens /mind-journal', () => {
  assert.match(dashboard, /onClick=\{\(\) => navigate\('\/mind-journal'\)\}/);
  assert.match(dashboard, /A private note of how you're feeling\. No scores\./);
});

test('Dashboard: stopped requests that only supported hidden sections (Starter Plan, MFS today, progress stat pills)', () => {
  assert.doesNotMatch(dashboard, /\/api\/plan\/current/);
  assert.doesNotMatch(dashboard, /\/api\/mental-fitness\/today/);
  assert.doesNotMatch(dashboard, /\/api\/progress\/summary/);
  assert.doesNotMatch(dashboard, /\/api\/streaks\/freeze/);
  // The Playbook summary fetch is still needed (cue card, insight, Playbook entry).
  assert.match(dashboard, /\/api\/playbook/);
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

test('Train: retained tools still render — Pressure Reset, Match & Practice Reflection, Daily Mental Rep, Focus Card Builder', () => {
  assert.match(train, /Pressure Reset/);
  assert.match(train, /Match & Practice Reflection/);
  assert.match(train, /Daily Mental Rep/);
  assert.match(train, /Focus Card Builder/);
  assert.match(train, /navigate\('\/body-reset'\)/);
  assert.match(train, /navigate\('\/debrief'\)/);
  assert.match(train, /navigate\('\/mental-rep'\)/);
  assert.match(train, /navigate\('\/self-talk'\)/);
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
