// Audit of every visible surface that could open the (now retired) scored
// Mental Fitness experience — Dashboard, Train, Onboarding, and the router.
// Source-text assertions only (JSX can't be imported directly by node:test
// without a transform), matching the established pattern elsewhere in this
// suite.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const app = readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const dashboard = readFileSync(path.join(root, 'src/pages/Dashboard.jsx'), 'utf8');
const train = readFileSync(path.join(root, 'src/pages/TrainPage.jsx'), 'utf8');
const onboarding = readFileSync(path.join(root, 'src/pages/OnboardingPage.jsx'), 'utf8');
const activeTools = readFileSync(path.join(root, 'src/constants/activeTools.js'), 'utf8');

test('Dashboard: the visible daily check-in action opens Mind Journal, not the old scored page', () => {
  assert.match(dashboard, /onClick=\{\(\) => navigate\('\/mind-journal'\)\}/);
  assert.doesNotMatch(dashboard, /navigate\('\/mental-fitness'/, 'Dashboard must never navigate to the old scored route');
});

test('Dashboard: no active action POSTs to the legacy scored endpoint (a read of /today for legacy display is not a write and is left as-is)', () => {
  assert.doesNotMatch(dashboard, /method:\s*'POST'[^}]*\/api\/mental-fitness/s);
  assert.doesNotMatch(dashboard, /\/api\/mental-fitness['"][^}]*method:\s*'POST'/s);
});

test('Train: inspection confirms there is no Mental Fitness / Mind Journal action or link on the Train page — no change was needed there', () => {
  assert.doesNotMatch(train, /mental-fitness|MentalFitness|mind-journal|MindJournal/i, 'Train page must have no Mental Fitness/Mind Journal action of any kind');
});

test('Onboarding: the post-onboarding redirect opens Mind Journal, not the old scored page', () => {
  assert.match(onboarding, /navigate\('\/mind-journal', \{ replace: true, state: \{ fromOnboarding: true \} \}\)/);
  assert.doesNotMatch(onboarding, /navigate\('\/mental-fitness'/, 'Onboarding must never navigate to the old scored route');
});

test('App.jsx: /mental-fitness still redirects to /mind-journal (the compatibility guarantee)', () => {
  const idx = app.indexOf('path="/mental-fitness"');
  assert.ok(idx !== -1, 'the /mental-fitness route must still exist');
  const block = app.slice(idx, idx + 150);
  assert.match(block, /<Navigate to="\/mind-journal" replace \/>/);
});

test('No client route or page targets the old scored page component anymore', () => {
  assert.doesNotMatch(app, /MentalFitnessCheckin/);
  for (const [name, src] of [['Dashboard', dashboard], ['TrainPage', train], ['OnboardingPage', onboarding]]) {
    assert.doesNotMatch(src, /navigate\(['"]\/mental-fitness['"]/, `${name} must never link to the old scored route`);
  }
});

test('activeTools.js registry: does not need a Mental Fitness or Mind Journal entry (neither is a recommendation target), and references neither', () => {
  // Mind Journal is an entry point athletes navigate to directly, not a
  // recommended-tool target validated by isActiveToolRoute — so its absence
  // from this registry is correct, not an oversight.
  assert.doesNotMatch(activeTools, /mental-fitness|mind-journal/i);
});
