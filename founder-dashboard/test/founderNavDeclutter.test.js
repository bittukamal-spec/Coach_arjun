// Founder Dashboard declutter — Pulse, Prompt, Coach, and Build were removed
// (dead placeholder, local dev-prompt scratchpad, unused manual-outreach
// CRM, stale technical-debt backlog respectively). Same source-text
// constraint as the other founder-dashboard tests: no JSX transform is
// available under node:test here, so these assert against the raw source.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '../src');
const read = (f) => readFileSync(path.join(srcDir, f), 'utf8');

const REMOVED_PANELS = [
  'panels/PulsePanel.jsx',
  'panels/PromptPanel.jsx',
  'panels/CoachPanel.jsx',
  'panels/BuildPanel.jsx',
];

// ── Removed panel files no longer exist ───────────────────────────────────

test('Pulse, Prompt, Coach, and Build panel files no longer exist on disk', () => {
  for (const f of REMOVED_PANELS) {
    assert.ok(!existsSync(path.join(srcDir, f)), `${f} should have been deleted`);
  }
});

// ── Navigation: exactly Pilot, Safety, Comms, in that order ───────────────

test('BottomNav TABS contains exactly Pilot, Safety, Comms in that order', () => {
  const nav = read('components/BottomNav.jsx');
  const idsInOrder = [...nav.matchAll(/id:\s*'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(idsInOrder, ['pilot', 'safety', 'comms']);
});

test('Pulse, Prompt, Coach, and Build tabs are absent from BottomNav', () => {
  const nav = read('components/BottomNav.jsx');
  for (const id of ['pulse', 'prompt', 'coach', 'build']) {
    assert.doesNotMatch(nav, new RegExp(`id:\\s*'${id}'`), `BottomNav must not register a '${id}' tab`);
  }
  assert.doesNotMatch(nav, /label:\s*'Pulse'/);
  assert.doesNotMatch(nav, /label:\s*'Prompt'/);
  assert.doesNotMatch(nav, /label:\s*'Coach'/);
  assert.doesNotMatch(nav, /label:\s*'Build'/);
});

test('BottomNav no longer imports the icons only the removed tabs used', () => {
  const nav = read('components/BottomNav.jsx');
  assert.doesNotMatch(nav, /\bActivity\b/, 'Activity (Pulse icon) must be gone');
  assert.doesNotMatch(nav, /\bMessageSquare\b/, 'MessageSquare (Prompt icon) must be gone');
  assert.doesNotMatch(nav, /\bUsers\b/, 'Users (Coach icon) must be gone');
  assert.doesNotMatch(nav, /\bCheckSquare\b/, 'CheckSquare (Build icon) must be gone');
  // Retained icons must still be imported.
  assert.match(nav, /\bTrendingUp\b/);
  assert.match(nav, /\bShieldAlert\b/);
  assert.match(nav, /\bSend\b/);
});

// ── App.jsx wiring: PANELS map, imports, default tab ──────────────────────

test('App.jsx no longer imports the removed panels', () => {
  const app = read('App.jsx');
  assert.doesNotMatch(app, /PulsePanel/);
  assert.doesNotMatch(app, /PromptPanel/);
  assert.doesNotMatch(app, /CoachPanel/);
  assert.doesNotMatch(app, /BuildPanel/);
});

test('App.jsx PANELS map contains exactly pilot, safety, comms', () => {
  const app = read('App.jsx');
  const panelsBlock = app.slice(app.indexOf('const PANELS = {'), app.indexOf('};', app.indexOf('const PANELS = {')) + 2);
  const keys = [...panelsBlock.matchAll(/(\w+):\s*\w+Panel/g)].map((m) => m[1]);
  assert.deepEqual(keys.sort(), ['comms', 'pilot', 'safety'].sort());
});

test('Pilot is the default landing tab', () => {
  const app = read('App.jsx');
  assert.match(app, /const DEFAULT_TAB = 'pilot'/);
  assert.match(app, /useState\(DEFAULT_TAB\)/);
});

test('an invalid/legacy tab id falls back to the Pilot panel rather than rendering blank', () => {
  const app = read('App.jsx');
  assert.match(app, /const Panel = PANELS\[active\] \|\| PANELS\[DEFAULT_TAB\];/);
});

// ── Retained panels still render / are still wired ────────────────────────

test('Pilot, Safety, and Comms panels still exist and are still imported in App.jsx', () => {
  for (const f of ['panels/PilotPanel.jsx', 'panels/SafetyPanel.jsx', 'panels/CommunicationsPanel.jsx']) {
    assert.ok(existsSync(path.join(srcDir, f)), `${f} must still exist`);
  }
  const app = read('App.jsx');
  assert.match(app, /import PilotPanel\s+from\s+'\.\/panels\/PilotPanel'/);
  assert.match(app, /import SafetyPanel from '\.\/panels\/SafetyPanel'/);
  assert.match(app, /import CommunicationsPanel from '\.\/panels\/CommunicationsPanel'/);
});

test('Pilot Access Grant/Revoke controls are still present in PilotPanel (declutter must not touch Pilot functionality)', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, />\s*Grant 60 days\s*</);
  assert.match(panel, />\s*Revoke\s*</);
  assert.match(panel, /founderFetch\(`\/api\/founder\/pilot-access\/\$\{id\}\/\$\{action\}`/);
});

test('every Pilot metric/status this PR must preserve is still rendered', () => {
  const panel = read('panels/PilotPanel.jsx');
  const mustContain = [
    'Live now', 'Total athletes', 'New today', 'New 7 days',
    'Onboarding completed', 'Used Coach',
    'Mental Rep received', 'Mental Rep completed', 'Outcomes reported',
    'Never seen', 'Last active:',
    'Onboarded', 'Onboarding pending',
    'Coach used', 'No Coach yet',
    'Returning',
    'Free', 'Premium',
    'Guardian:',
    'Pilot access:',
  ];
  for (const text of mustContain) {
    assert.ok(panel.includes(text), `PilotPanel must still render "${text}"`);
  }
  assert.match(panel, /onClick=\{load\}/, 'manual refresh must still exist');
});

test('SafetyPanel still exists, unchanged, and is founder-session-authenticated', () => {
  const panel = read('panels/SafetyPanel.jsx');
  assert.match(panel, /import\s*\{\s*founderFetch\s*\}\s*from\s*'\.\.\/api'/);
  assert.match(panel, /reviewStatus/);
  assert.match(panel, /reviewOutcome/);
});

test('CommunicationsPanel (Comms / Email Center) still exists, unchanged, and is founder-session-authenticated', () => {
  const panel = read('panels/CommunicationsPanel.jsx');
  assert.match(panel, /import\s*\{\s*founderFetch\s*\}\s*from\s*'\.\.\/api'/);
  assert.match(panel, /import EmailSection/);
});

// ── Layout: 3 evenly-spaced items, no overflow ────────────────────────────

test('bottom nav renders exactly 3 buttons, each flex-1 (balanced spacing, no empty gaps)', () => {
  const nav = read('components/BottomNav.jsx');
  assert.match(nav, /TABS\.map/);
  // TABS.length is exactly 3 (proven above); each rendered button keeps the
  // existing equal-width flex-1 sizing, unchanged since before the declutter.
  assert.match(nav, /className="flex-1 flex flex-col items-center gap-0\.5 py-3 transition-colors"/);
});

test('the nav container has no horizontal-scroll/overflow class — flex-1 buttons alone keep 3 items from overflowing', () => {
  const nav = read('components/BottomNav.jsx');
  const navTag = nav.slice(nav.indexOf('<nav'), nav.indexOf('>', nav.indexOf('<nav')) + 1);
  assert.doesNotMatch(navTag, /overflow-x/);
});

test('the fixed/safe-area bottom-nav behavior is unchanged', () => {
  const nav = read('components/BottomNav.jsx');
  assert.match(nav, /className="fixed bottom-0 left-0 right-0 bg-\[#1E293B\] border-t border-\[#334155\] flex safe-pb"/);
});

test('active-state styling is unchanged', () => {
  const nav = read('components/BottomNav.jsx');
  assert.match(nav, /const isActive = active === id;/);
  assert.match(nav, /color: isActive \? '#1769AA' : '#64748B'/);
});
