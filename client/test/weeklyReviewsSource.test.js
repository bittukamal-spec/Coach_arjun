// Source-text checks for Weekly Reviews outside the chat: the summary/report
// bubble is gone from the live chat stream, the Chat header carries an
// accessible Weekly Reviews link, the /weekly-reviews route exists behind
// the same protection as other athlete pages, translations exist in both
// languages, and the composer/send/SSE path is untouched. The real
// click-through navigation is proven in weeklyReviews.dom.test.jsx.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const chatPage = readFileSync(path.join(root, 'src/pages/ChatPage.jsx'), 'utf8');
const reviewsPage = readFileSync(path.join(root, 'src/pages/WeeklyReviewsPage.jsx'), 'utf8');
const app = readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const translationsSrc = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

// ── 1. No weekly report/summary inside the live chat stream ────────────────

test('ChatPage: the summary bubble is gone from the message stream — no report renders inside chat', () => {
  assert.doesNotMatch(chatPage, /SummaryBubble/);
  assert.doesNotMatch(chatPage, /sessionSummary/);
  assert.doesNotMatch(chatPage, /\/api\/weekly-reports/, 'chat itself never fetches weekly reports');
});

test('ChatPage: chat still opens at the most recent message (auto-scroll to bottom preserved)', () => {
  assert.match(chatPage, /bottomRef\.current\?\.scrollIntoView/);
});

// ── 2. Chat header: accessible Weekly Reviews link beside the info control ──

test('ChatPage header: a Weekly Reviews link to /weekly-reviews with an accessible label sits beside the info control', () => {
  const header = chatPage.slice(chatPage.indexOf('<header'), chatPage.indexOf('</header>'));
  assert.match(header, /to="\/weekly-reviews"/);
  assert.match(header, /aria-label=\{t\.weeklyReviewsLabel\}/);
  assert.match(header, /aria-label="Safety info"/, 'the existing info control survives');
  assert.match(header, /aria-label="Go back"/, 'the existing back control survives');
  assert.match(header, /<ArjunLogo/, 'Arjun branding survives');
  // Same touch-target treatment as the neighbouring info button.
  const linkIdx = header.indexOf('to="/weekly-reviews"');
  assert.match(header.slice(linkIdx - 300, linkIdx + 300), /p-2\.5/);
});

test('ChatPage: no unread-badge tracking was invented for the header icon', () => {
  assert.doesNotMatch(chatPage, /unread|badgeCount|viewedAt/i);
});

// ── 3. Composer / send / SSE behavior untouched ────────────────────────────

test('ChatPage: message sending and SSE streaming markers are all still present', () => {
  assert.match(chatPage, /apiFetch\('\/api\/chat\/message'/);
  assert.match(chatPage, /res\.body\.getReader\(\)/);
  assert.match(chatPage, /data\.t === 'd'/);
  assert.match(chatPage, /data\.t === 'end'/);
  assert.match(chatPage, /data\.t === 'card'/);
  assert.match(chatPage, /data\.t === 'quick_replies'/);
  assert.match(chatPage, /QuickReplyChips/);
  assert.match(chatPage, /claimFollowUpOpener/);
  assert.match(chatPage, /onKeyDown=\{handleKeyDown\}/);
});

// ── 4. Weekly Reviews page + route ─────────────────────────────────────────

test('App: /weekly-reviews is a protected, onboarded route', () => {
  const idx = app.indexOf('path="/weekly-reviews"');
  assert.ok(idx !== -1);
  const block = app.slice(idx, idx + 400);
  assert.match(block, /<ProtectedRoute requireOnboarding=\{true\}>/);
  assert.match(block, /<WeeklyReviewsPage \/>/);
});

test('WeeklyReviewsPage: reads the EXISTING weekly-reports contract read-only, back goes to Coach', () => {
  assert.match(reviewsPage, /apiFetch\('\/api\/weekly-reports'/);
  assert.equal((reviewsPage.match(/apiFetch\(/g) || []).length, 1);
  assert.doesNotMatch(reviewsPage, /method:\s*'(POST|PUT|PATCH|DELETE)'/);
  assert.match(reviewsPage, /backTo="\/coaching"/);
});

test('WeeklyReviewsPage: renders reports in server order (newest first) — no client-side reordering', () => {
  assert.doesNotMatch(reviewsPage, /\.sort\(|\.reverse\(/);
  assert.match(reviewsPage, /const isNewest = i === 0;/);
});

test('WeeklyReviewsPage: not a generic chat-history page — no messages, sessions, or transcripts are fetched', () => {
  assert.doesNotMatch(reviewsPage, /\/api\/sessions|\/api\/chat|messages/i);
});

test('translations: weeklyReviews namespace exists in English and Hindi with the approved copy', () => {
  const enBlock = translationsSrc.slice(translationsSrc.indexOf('\n  en: {'), translationsSrc.indexOf('\n  hi: {'));
  const hiBlock = translationsSrc.slice(translationsSrc.indexOf('\n  hi: {'));
  for (const block of [enBlock, hiBlock]) {
    const ns = block.slice(block.indexOf('weeklyReviews: {'), block.indexOf('},', block.indexOf('weeklyReviews: {')));
    for (const key of ['title:', 'intro:', 'empty:', 'emptySub:', 'latestLabel:', 'loadError:']) {
      assert.ok(ns.includes(key), `weeklyReviews.${key.slice(0, -1)} missing in a language`);
    }
    assert.ok(block.includes('weeklyReviewsLabel:'), 'chat header label missing in a language');
  }
  assert.ok(enBlock.includes('Your weekly coaching summaries, patterns, and next focus.'));
  assert.ok(enBlock.includes('No weekly reviews yet.'));
  assert.ok(enBlock.includes('Your first review will appear after a completed coaching week.'));
});
