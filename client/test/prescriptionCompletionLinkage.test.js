// Source-text checks for PR-12's exact prescription completion linkage on
// the client. ChatPage.jsx/BodyResetPage.jsx/DebriefPage.jsx contain JSX and
// cannot be imported directly by node:test without a transform, so — same
// pattern as prescriptionFollowUpWiring.test.js — these are source-text
// assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const chatPageSrc = readFileSync(path.join(root, 'src/pages/ChatPage.jsx'), 'utf8');
const bodyResetSrc = readFileSync(path.join(root, 'src/pages/BodyResetPage.jsx'), 'utf8');
const debriefSrc = readFileSync(path.join(root, 'src/pages/DebriefPage.jsx'), 'utf8');
const practiceMapSrc = readFileSync(path.join(root, 'src/utils/prescriptionPractice.js'), 'utf8');

function fnBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected a function named ${name}`);
  const end = src.indexOf('\n  }', start);
  return src.slice(start, end);
}

// ── 1. practiceRouteFor: documented, minimal, no invented routes ───────────

test('prescriptionPractice: only pressure_reset and post_performance_reflection map to a real route', () => {
  assert.match(practiceMapSrc, /pressure_reset:\s*'\/body-reset'/);
  assert.match(practiceMapSrc, /post_performance_reflection:\s*'\/debrief'/);
  // No other approved practice key gets an invented route.
  for (const key of ['focus_cue_building', 'attentional_routine', 'pre_performance_routine', 'mistake_reset_routine', 'guided_rehearsal', 'acclimatization_homework']) {
    assert.doesNotMatch(practiceMapSrc, new RegExp(`${key}:\\s*'/`), `${key} must not be given an invented route`);
  }
});

test('prescriptionPractice: practiceRouteFor returns null for anything not in the map', () => {
  assert.match(practiceMapSrc, /return PRESCRIBED_PRACTICE_ROUTES\[practiceKey\] \|\| null;/);
});

// ── 2. Structured card preserves the real prescriptionId + practiceKey ────

test('ChatPage: ServerCardBubble launches the practice with the real card.prescriptionId and card.practiceKey — never an invented id', () => {
  const start = chatPageSrc.indexOf('function ServerCardBubble');
  const end = chatPageSrc.indexOf('\n}', start);
  const body = chatPageSrc.slice(start, end);
  assert.match(body, /practiceRouteFor\(card\.practiceKey\)/);
  assert.match(body, /state: \{ prescriptionId: card\.prescriptionId, practiceKey: card\.practiceKey \}/);
});

test('ChatPage: the practice launch link only renders when practiceRouteFor resolves a real route (no link for unintegrated practice keys)', () => {
  const start = chatPageSrc.indexOf('function ServerCardBubble');
  const end = chatPageSrc.indexOf('\n}', start);
  const body = chatPageSrc.slice(start, end);
  assert.match(body, /\{practiceRoute && \(/);
});

test('ChatPage: the Mental Rep card\'s situation/card content and cue are rendered unconditionally — never gated behind whether a launch link exists', () => {
  const start = chatPageSrc.indexOf('function ServerCardBubble');
  const end = chatPageSrc.indexOf('\n}', start);
  const body = chatPageSrc.slice(start, end);
  const cardContentIdx = body.indexOf('{card.cardContent}');
  const cueWordIdx = body.indexOf('card.cueWord &&');
  const practiceRouteIdx = body.indexOf('{practiceRoute && (');
  assert.ok(cardContentIdx !== -1 && cardContentIdx < practiceRouteIdx, 'cardContent must render before (outside) the practice-route conditional');
  assert.ok(cueWordIdx !== -1 && cueWordIdx < practiceRouteIdx, 'cueWord must render before (outside) the practice-route conditional');
});

test('ChatPage: an unsupported approved practice key (no real route) shows the card with no launch action, without inventing a route or falling back to a generic tool', () => {
  const start = chatPageSrc.indexOf('function ServerCardBubble');
  const end = chatPageSrc.indexOf('\n}', start);
  const body = chatPageSrc.slice(start, end);
  // The ONLY source of the route is practiceRouteFor(card.practiceKey) — no
  // hardcoded fallback route, no unconditional navigate() call exists here.
  const navigateCalls = [...body.matchAll(/navigate\(/g)];
  assert.equal(navigateCalls.length, 1, 'exactly one navigate() call site, reached only through the practiceRoute-gated button');
  assert.doesNotMatch(body, /navigate\('\/train'\)|navigate\('\/'\)/, 'no silent fallback to a generic tool/home route');
});

// ── 3. Completion calls the exact Prescription endpoint ────────────────────

function assertCallsExactEndpoint(src, fnName) {
  const body = fnBody(src, fnName);
  assert.match(body, /apiFetch\(`\/api\/prescriptions\/\$\{link\.prescriptionId\}\/complete`/);
  assert.match(body, /method: 'POST'/);
  assert.match(body, /body: JSON\.stringify\(\{ practiceKey: link\.practiceKey \}\)/);
}

test('BodyResetPage: completePrescriptionLink posts to the exact /api/prescriptions/:id/complete endpoint with prescriptionId + practiceKey', () => {
  assertCallsExactEndpoint(bodyResetSrc, 'completePrescriptionLink');
});

test('DebriefPage: completePrescriptionLink posts to the exact /api/prescriptions/:id/complete endpoint with prescriptionId + practiceKey', () => {
  assertCallsExactEndpoint(debriefSrc, 'completePrescriptionLink');
});

// ── 4. Generic practice (no prescriptionId) makes no Prescription request ──

test('BodyResetPage: completePrescriptionLink returns immediately with no request when there is no prescription link', () => {
  const body = fnBody(bodyResetSrc, 'completePrescriptionLink');
  const guardIdx = body.indexOf('if (!link) return;');
  const fetchIdx = body.indexOf('apiFetch(');
  assert.ok(guardIdx !== -1 && guardIdx < fetchIdx, 'the no-link guard must run before any request');
});

test('DebriefPage: completePrescriptionLink returns immediately with no request when there is no prescription link', () => {
  const body = fnBody(debriefSrc, 'completePrescriptionLink');
  const guardIdx = body.indexOf('if (!link) return;');
  const fetchIdx = body.indexOf('apiFetch(');
  assert.ok(guardIdx !== -1 && guardIdx < fetchIdx, 'the no-link guard must run before any request');
});

test('BodyResetPage: the prescription link is only set when the incoming practiceKey matches this page\'s own practice — a mismatched key is dropped rather than silently trusted', () => {
  assert.match(bodyResetSrc, /location\.state\?\.practiceKey === 'pressure_reset'/);
});

test('DebriefPage: the prescription link is only set when the incoming practiceKey matches this page\'s own practice', () => {
  assert.match(debriefSrc, /location\.state\?\.practiceKey === 'post_performance_reflection'/);
});

// ── 5. Opening/abandoning a practice never completes it ────────────────────

test('BodyResetPage: completePrescriptionLink is called only from saveSession — never from a mount effect or screen-render path', () => {
  // completePrescriptionLink(); (a call, with trailing semicolon) is
  // distinct from `function completePrescriptionLink() {` (the definition).
  const callSites = [...bodyResetSrc.matchAll(/completePrescriptionLink\(\);/g)].length;
  assert.equal(callSites, 1, 'completePrescriptionLink must be called from exactly one place: saveSession\'s success path');
  const saveSessionBody = fnBody(bodyResetSrc, 'saveSession');
  assert.match(saveSessionBody, /completePrescriptionLink\(\);/);
});

test('DebriefPage: completePrescriptionLink is called only from submitDebrief\'s success path — never on mount or on the 409 already-done branch', () => {
  const callSites = [...debriefSrc.matchAll(/completePrescriptionLink\(\);/g)].length;
  assert.equal(callSites, 1, 'completePrescriptionLink must be called from exactly one place: submitDebrief\'s success path');
  const idx = debriefSrc.indexOf('completePrescriptionLink();');
  const status409Idx = debriefSrc.indexOf("res.status === 409");
  const resultIdx = debriefSrc.indexOf('setResult(data);');
  assert.ok(status409Idx < idx, 'the 409 (already done today) branch must return before reaching completion linkage');
  assert.ok(idx < resultIdx + 30 && idx > 0, 'completion linkage must sit in the success path, right alongside setResult');
});

// ── 6. Repeated UI completion remains safe ──────────────────────────────────

test('BodyResetPage: the Save button is disabled while saving, preventing a double-tap from firing twice', () => {
  assert.match(bodyResetSrc, /disabled=\{saving\}\s*\n\s*onClick=\{saveSession\}/);
});

test('DebriefPage: submitDebrief is guarded against re-invocation by submitCalled', () => {
  assert.match(debriefSrc, /if \(submitting \|\| result \|\| submitCalled\.current\) return;/);
  assert.match(debriefSrc, /submitCalled\.current = true;/);
});

// ── 7. Quick Chat and legacy [APP:...] cards are unchanged ─────────────────

test('ChatPage: the legacy AppToolCard / [APP:...] mechanism is untouched by the ServerCardBubble practice-launch change', () => {
  const start = chatPageSrc.indexOf('function AppToolCard');
  const end = chatPageSrc.indexOf('\n}', start);
  const body = chatPageSrc.slice(start, end);
  assert.doesNotMatch(body, /practiceRouteFor|prescriptionId|completePrescriptionLink/);
});

test('ChatPage: the dormant Quick Chat cleanup effect is untouched by this change — no practice-launch/completion code leaked into it', () => {
  const idx = chatPageSrc.indexOf('Quick chat cleanup: delete session on tab hide or unmount');
  assert.ok(idx !== -1);
  const end = chatPageSrc.indexOf("}, [chatMode, chatSessionId, token]);", idx);
  const block = chatPageSrc.slice(idx, end);
  assert.doesNotMatch(block, /practiceRouteFor|prescriptionId|completePrescriptionLink/);
});
