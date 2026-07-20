// Source-text checks for the Dashboard visual-hierarchy refinement:
// approved five-section order, a segmented day-context selector that can
// never be confused with the problem-help shortcuts, larger informative
// Playbook and Mind Journal cards, and none of the retired scored UI
// (XP, streaks, scores, Starter Plan, games, skill paths) returning.
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
const codeOnly = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

// ── 1. Approved five-section order ──────────────────────────────────────────

test('Dashboard renders the approved five sections in order: greeting → primary action → need-help → Playbook → Mind Journal', () => {
  const order = [
    src.indexOf('1. GREETING'),
    src.indexOf('2. ONE ADAPTIVE PRIMARY ACTION CARD'),
    src.indexOf('3. NEED HELP RIGHT NOW'),
    src.indexOf('4. MENTAL PLAYBOOK'),
    src.indexOf('5. MIND JOURNAL'),
  ];
  for (const idx of order) assert.ok(idx !== -1, 'every approved section must exist');
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], `section ${i + 1} must render after section ${i}`);
  }
});

test('exactly ONE adaptive primary action card — training/match/recovery/just-a-rep swap it, never stack another', () => {
  assert.match(src, /const primaryAction = PRIMARY_ACTION\[dayContext\] \|\| PRIMARY_ACTION\.default;/);
  for (const ctx of ['training', 'match', 'recovery', 'just_rep']) {
    assert.ok(src.includes(`'${ctx}'`), `day context ${ctx} must still exist`);
  }
  // Only the default Mental Rep action carries dayContext route state.
  assert.match(src, /primaryAction\.to === '\/mental-rep' && dayContext/);
});

// ── 2. "What's today?" is a compact segmented selector, not action cards ────

test('day-context controls are aria-pressed buttons in one grouped track with 44px targets and a filled selected state', () => {
  const block = src.slice(src.indexOf('DAY_CONTEXTS.map'), src.indexOf('btn-gradient'));
  assert.match(block, /aria-pressed=\{dayContext === c\.id\}/);
  assert.match(block, /min-h-\[44px\]/);
  assert.match(block, /focus-visible:ring-2/);
  assert.match(block, /bg-brand-600 text-white/, 'selected chip must be clearly filled');
  const groupIdx = src.indexOf('role="group"');
  assert.ok(groupIdx !== -1 && groupIdx < src.indexOf('DAY_CONTEXTS.map'), 'chips sit inside one labelled group track');
});

test('day-context controls only update context — they are never links and never navigate', () => {
  // Slice ends where the separate primary CTA button (which legitimately
  // navigates) begins.
  const block = src.slice(src.indexOf('DAY_CONTEXTS.map'), src.indexOf('navigate(primaryAction.to'));
  assert.match(block, /onClick=\{\(\) => pickContext\(c\.id\)\}/);
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

test('shortcut tiles look like actions (icon + card surface) while day-context chips do not — the two can\'t be confused', () => {
  const shortcutBlock = src.slice(src.indexOf('PROBLEM_SHORTCUTS.map'), src.indexOf('4. MENTAL PLAYBOOK'));
  const chipBlock = src.slice(src.indexOf('DAY_CONTEXTS.map'), src.indexOf('btn-gradient'));
  assert.match(shortcutBlock, /card-surface/, 'shortcuts are outlined tiles');
  assert.match(shortcutBlock, /<Icon size=/, 'shortcuts carry a small icon');
  assert.doesNotMatch(chipBlock, /card-surface/, 'selector chips must not share the tile surface');
  assert.doesNotMatch(chipBlock, /className=\{?"?chip/, 'selector no longer uses the generic .chip class the shortcuts once shared');
});

test('shortcut prefill messages are unchanged', () => {
  assert.ok(src.includes(`"I'm feeling nervous."`));
  assert.ok(src.includes(`"I made a mistake and can't stop thinking about it."`));
  assert.ok(src.includes(`'I need help focusing.'`));
  assert.ok(src.includes(`"I'm feeling low on confidence."`));
});

// ── 4/5. Larger informative Playbook + Mind Journal cards ──────────────────

test('Mental Playbook is a larger card linking to /playbook with the approved supporting copy', () => {
  assert.match(src, /to="\/playbook"/);
  assert.ok(src.includes('Your cues, cards, reflections, and lessons — private to you.'));
});

test('the Playbook card\'s contextual line uses only already-fetched Dashboard data — no new API call, no fake metric', () => {
  assert.match(src, /playbook && playbook\.weekRepCount > 0/);
  assert.match(src, /playbook\.topCue/);
  const apiCalls = codeOnly.match(/apiFetch\(/g) || [];
  assert.equal(apiCalls.length, 1, 'Dashboard must make exactly one API call');
  assert.match(src, /apiFetch\('\/api\/playbook'/);
});

test('Mind Journal is a larger card linking to /mind-journal with the approved no-score copy and a purpose line', () => {
  assert.match(src, /to="\/mind-journal"/);
  assert.ok(src.includes(`A private place to note how you're feeling. No scores.`));
  assert.ok(src.includes(`Write whenever you feel like it`), 'one extra short purpose line, no pressure to write daily');
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
