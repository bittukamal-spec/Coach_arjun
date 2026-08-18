// Source-text checks for the Pilot Overview panel (Phase 1). Same
// constraint/pattern as founderClientContainment.test.js: no JSX transform
// is available under node:test here, so these assert against the raw
// source text rather than rendering components.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '../src');
const read = (f) => readFileSync(path.join(srcDir, f), 'utf8');

// ── Tab wiring ───────────────────────────────────────────────────────────

test('a Pilot tab is registered in BottomNav', () => {
  const nav = read('components/BottomNav.jsx');
  assert.match(nav, /id:\s*'pilot'/);
  assert.match(nav, /label:\s*'Pilot'/);
});

test('the Pilot tab is wired to PilotPanel in App.jsx', () => {
  const app = read('App.jsx');
  assert.match(app, /import PilotPanel\s+from\s+'\.\/panels\/PilotPanel'/);
  assert.match(app, /pilot:\s*PilotPanel/);
});

// ── Auth reuse ───────────────────────────────────────────────────────────

test('PilotPanel uses the existing authenticated founderFetch helper, not a raw fetch or a static token', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /import\s*\{\s*founderFetch\s*\}\s*from\s*'\.\.\/api'/);
  assert.match(panel, /founderFetch\(['"]\/api\/founder\/pilot-overview['"]\)/);
  assert.doesNotMatch(panel, /FOUNDER_TOKEN/);
  assert.doesNotMatch(panel, /VITE_FOUNDER_PIN/);
});

test('PilotPanel never calls fetch() directly (bypassing the authenticated helper)', () => {
  const panel = read('panels/PilotPanel.jsx');
  // Lowercase `fetch(` is the raw global call; founderFetch(...) is spelled
  // with a capital F and so never matches this pattern.
  assert.doesNotMatch(panel, /\bfetch\(/);
});

// ── UI states ────────────────────────────────────────────────────────────

test('PilotPanel has a loading state', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /loading/i);
  assert.match(panel, /animate-spin/);
});

test('PilotPanel has an error state distinct from the loading/data states', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /setError/);
  assert.match(panel, /Failed to load pilot overview/i);
});

test('PilotPanel handles a zero-athlete cohort explicitly rather than assuming data is always present', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /recentAthletes\.length === 0/);
  assert.match(panel, /No athletes yet/i);
});

// ── StatCard / funnel / recent athletes reuse ───────────────────────────

test('PilotPanel reuses the existing StatCard component for its top metrics', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /import StatCard from '\.\.\/components\/StatCard'/);
  const statCardUses = panel.match(/<StatCard\b/g) || [];
  assert.ok(statCardUses.length >= 8, `expected at least 8 StatCard uses, found ${statCardUses.length}`);
});

test('PilotPanel renders the funnel using the metrics/funnel fields the API returns', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /data\.funnel\.map/);
  assert.match(panel, /signedUp/);
  assert.match(panel, /completedOnboarding/);
  assert.match(panel, /usedCoach/);
  assert.match(panel, /receivedMentalRep/);
  assert.match(panel, /completedMentalRep/);
  assert.match(panel, /reportedOutcome/);
});

test('PilotPanel renders a capped recent-athletes list from data.recentAthletes', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /data\.recentAthletes\.map/);
});

// ── No Active/Returning cards yet (Phase 2) ─────────────────────────────

test('PilotPanel does not display Active/Returning-athlete cards or lastActiveAt yet', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.doesNotMatch(panel, /lastActiveAt/i);
  assert.doesNotMatch(panel, /returning athlete/i);
  assert.doesNotMatch(panel, /active (last|in the last)/i);
});

// ── No athlete free-text content rendered ───────────────────────────────

test('PilotPanel never renders chat/journal/prescription free-text fields', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.doesNotMatch(panel, /\.content\b/);
  assert.doesNotMatch(panel, /cardContent/);
  assert.doesNotMatch(panel, /outcomeLesson/);
  assert.doesNotMatch(panel, /\.situation\b/);
  assert.doesNotMatch(panel, /arjunNote|arjunInsight|arjunResponse/);
});

test('PilotPanel never fetches raw chat messages or journal entries', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.doesNotMatch(panel, /\/api\/chat\/messages/);
  assert.doesNotMatch(panel, /\/api\/mind-journal/);
});

test('PilotPanel does not read a raw guardian email field, only the derived status', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.doesNotMatch(panel, /guardianEmail/);
  assert.match(panel, /guardianConsentStatus/);
});

// ── No new third-party analytics / tracking introduced anywhere in the app ─

test('no analytics SDK or tracking cookie is introduced in the files this PR adds/changes', () => {
  // Scoped to the files this Phase-1 PR actually touches (PilotPanel.jsx is
  // new; App.jsx/BottomNav.jsx get the new tab wired in) — not the whole
  // dashboard, since unrelated pre-existing files (e.g. BuildPanel.jsx's
  // backlog list) may legitimately *mention* a considered-but-not-installed
  // tool by name without that being a new introduction.
  const files = ['App.jsx', 'panels/PilotPanel.jsx', 'components/BottomNav.jsx'];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /google-analytics|gtag|fbevents|hotjar|mixpanel|posthog/i, `${f} references a third-party analytics tool`);
    assert.doesNotMatch(src, /document\.cookie/, `${f} sets a cookie directly`);
  }
});
