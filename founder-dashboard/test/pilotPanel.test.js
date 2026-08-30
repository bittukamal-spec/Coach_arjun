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

// ── Engagement: Active 24h/7d, Returning (Phase 2B) ─────────────────────

test('PilotPanel renders the three Phase 2B engagement cards from metrics.activeLast24Hours/activeLast7Days/returningAthletes', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /Engagement/);
  assert.match(panel, /Active 24h/);
  assert.match(panel, /Active 7d/);
  assert.match(panel, /Returning/);
  assert.match(panel, /data\.metrics\.activeLast24Hours/);
  assert.match(panel, /data\.metrics\.activeLast7Days/);
  assert.match(panel, /data\.metrics\.returningAthletes/);
  assert.match(panel, /data\.metrics\.returningPercentage/);
});

test('the Engagement cards reuse the existing StatCard component, not a new one-off card element', () => {
  const panel = read('panels/PilotPanel.jsx');
  const engagementBlock = panel.slice(panel.indexOf('Engagement'), panel.indexOf('Pilot funnel'));
  const statCardUses = engagementBlock.match(/<StatCard\b/g) || [];
  assert.equal(statCardUses.length, 3, 'expected exactly 3 StatCard uses in the Engagement block (Active 24h, Active 7d, Returning)');
});

test('PilotPanel renders a concise last-active label per recent athlete via a dedicated formatLastActive helper', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /function formatLastActive/);
  assert.match(panel, /formatLastActive\(athlete\.lastActiveAt\)/);
});

test('formatLastActive renders "No activity yet" for a null lastActiveAt, never a raw null/undefined/NaN', () => {
  const panel = read('panels/PilotPanel.jsx');
  const fn = panel.slice(panel.indexOf('function formatLastActive'), panel.indexOf('\n}\n', panel.indexOf('function formatLastActive')) + 2);
  assert.match(fn, /if \(!iso\) return 'No activity yet'/);
});

test('formatLastActive uses coarse relative buckets (hours ago / Yesterday / days ago), never a fabricated exact-minute figure', () => {
  const panel = read('panels/PilotPanel.jsx');
  const fn = panel.slice(panel.indexOf('function formatLastActive'), panel.indexOf('\n}\n', panel.indexOf('function formatLastActive')) + 2);
  assert.match(fn, /Yesterday/);
  assert.match(fn, /\$\{hours\}h ago/);
  assert.match(fn, /\$\{days\}d ago/);
  assert.doesNotMatch(fn, /getMinutes|getSeconds/);
});

test('AthleteRow shows an optional Returning pill driven by athlete.isReturning, alongside the existing pills', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /athlete\.isReturning && <Pill/);
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
  // dashboard, since an unrelated pre-existing file may legitimately
  // *mention* a considered-but-not-installed tool by name without that
  // being a new introduction.
  const files = ['App.jsx', 'panels/PilotPanel.jsx', 'components/BottomNav.jsx'];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /google-analytics|gtag|fbevents|hotjar|mixpanel|posthog/i, `${f} references a third-party analytics tool`);
    assert.doesNotMatch(src, /document\.cookie/, `${f} sets a cookie directly`);
  }
});

// ── Pilot Presence Tracking ────────────────────────────────────────────────

test('a compact "Live now" metric renders metrics.liveNow', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /Live now/);
  assert.match(panel, /data\.metrics\.liveNow/);
});

test('the Live now metric is its own compact element, not folded into the StatCard grid', () => {
  const panel = read('panels/PilotPanel.jsx');
  const liveIdx = panel.indexOf('Live now');
  const gridIdx = panel.indexOf("StatCard label=\"Total athletes\"");
  assert.ok(liveIdx !== -1 && gridIdx !== -1 && liveIdx < gridIdx, 'expected the Live now metric before the Total athletes grid');
});

test('per-athlete presence is a dedicated PresenceLine, driven by athlete.isLive/athlete.lastSeenAt, rendered separately from formatLastActive', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /function PresenceLine/);
  assert.match(panel, /athlete\.isLive/);
  assert.match(panel, /<PresenceLine athlete=\{athlete\}\s*\/>/);
  // Both lines exist in AthleteRow, and PresenceLine is never given the
  // same prop/label formatLastActive uses — the two are visually distinct.
  const rowStart = panel.indexOf('function AthleteRow');
  const rowSource = panel.slice(rowStart, panel.indexOf('\n}\n', rowStart) + 2);
  assert.match(rowSource, /<PresenceLine athlete=\{athlete\}\s*\/>/);
  assert.match(rowSource, /formatLastActive\(athlete\.lastActiveAt\)/);
});

test('PresenceLine renders a green "Live" state when isLive, distinct styling from the offline "Seen" state', () => {
  const panel = read('panels/PilotPanel.jsx');
  const fnStart = panel.indexOf('function PresenceLine');
  const fnSource = panel.slice(fnStart, panel.indexOf('\n}\n', fnStart) + 2);
  assert.match(fnSource, /if \(athlete\.isLive\)/);
  assert.match(fnSource, /Live/);
  assert.match(fnSource, /#22C55E/); // the established green used elsewhere in this dashboard
  assert.match(fnSource, /formatLastSeen\(athlete\.lastSeenAt\)/);
});

test('formatLastSeen never uses the word "Active" — presence and activity terminology stay distinct', () => {
  const panel = read('panels/PilotPanel.jsx');
  const fnStart = panel.indexOf('function formatLastSeen');
  const fnSource = panel.slice(fnStart, panel.indexOf('\n}\n', fnStart) + 2);
  assert.doesNotMatch(fnSource, /Active/);
  assert.match(fnSource, /Seen/);
});

test('formatLastSeen: "Never seen" for a null lastSeenAt', () => {
  const panel = read('panels/PilotPanel.jsx');
  const fnStart = panel.indexOf('function formatLastSeen');
  const fnSource = panel.slice(fnStart, panel.indexOf('\n}\n', fnStart) + 2);
  assert.match(fnSource, /if \(!iso\) return 'Never seen'/);
});

test('formatLastSeen: minute-level granularity ("X min ago"), then hours, then "yesterday", then days — matching the product examples', () => {
  const panel = read('panels/PilotPanel.jsx');
  const fnStart = panel.indexOf('function formatLastSeen');
  const fnSource = panel.slice(fnStart, panel.indexOf('\n}\n', fnStart) + 2);
  assert.match(fnSource, /\$\{minutes\} min ago/);
  assert.match(fnSource, /\$\{hours\}/);
  assert.match(fnSource, /yesterday/i);
  assert.match(fnSource, /\$\{days\}d ago/);
});

test('PilotPanel polls the pilot-overview endpoint automatically, not just once on mount', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /setInterval/);
  assert.match(panel, /POLL_INTERVAL_MS/);
});

test('the poll interval is within the 30-60s guidance, never a sub-10s aggressive poll', () => {
  const panel = read('panels/PilotPanel.jsx');
  const match = panel.match(/const POLL_INTERVAL_MS = (\d+)\s*\*\s*1000/);
  assert.ok(match, 'expected POLL_INTERVAL_MS defined in seconds*1000 form');
  const seconds = Number(match[1]);
  assert.ok(seconds >= 30 && seconds <= 60, `expected 30-60s, got ${seconds}s`);
});

test('polling is paused while the dashboard tab is hidden, and resumes on visibilitychange -> visible', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /document\.visibilityState === 'visible'/);
  assert.match(panel, /clearInterval/);
  assert.match(panel, /addEventListener\(['"]visibilitychange['"]/);
  assert.match(panel, /removeEventListener\(['"]visibilitychange['"]/);
});

test('the manual refresh button still exists alongside auto-polling', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.match(panel, /onClick=\{load\}/);
  assert.match(panel, /RefreshCw/);
});

test('lastSeenAt is never labelled as lastActiveAt anywhere in the panel', () => {
  const panel = read('panels/PilotPanel.jsx');
  assert.doesNotMatch(panel, /lastActiveAt.*lastSeenAt|lastSeenAt.*lastActiveAt/);
  // Each is read into its own dedicated formatter, never cross-wired.
  assert.match(panel, /formatLastSeen\(athlete\.lastSeenAt\)/);
  assert.match(panel, /formatLastActive\(athlete\.lastActiveAt\)/);
  assert.doesNotMatch(panel, /formatLastSeen\(athlete\.lastActiveAt\)/);
  assert.doesNotMatch(panel, /formatLastActive\(athlete\.lastSeenAt\)/);
});
