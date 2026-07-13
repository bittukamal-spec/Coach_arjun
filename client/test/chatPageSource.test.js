// Source/copy checks for PR-4 (chat-entry AI disclosure, Quick Chat hidden,
// recurring AI reminder, break reminder). Uses only Node's built-in test
// runner and fs — no Jest/Vitest/Playwright, no new dependency. ChatPage.jsx
// contains JSX and cannot be imported directly by node:test without a
// transform, so — matching the pattern established in PR-3's
// disclosure.test.js — these are source-text assertions; the pure
// threshold/timer logic itself is unit-tested for real in
// chatReminders.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const chatPageSrc = readFileSync(path.join(root, 'src/pages/ChatPage.jsx'), 'utf8');
const translationsSrc = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

function chatBlocks() {
  const enBlock = translationsSrc.slice(translationsSrc.indexOf('\n  en: {'), translationsSrc.indexOf('\n  hi: {'));
  const hiBlock = translationsSrc.slice(translationsSrc.indexOf('\n  hi: {'));
  return [enBlock, hiBlock].map((block) => {
    const start = block.indexOf('chat: {');
    return block.slice(start, block.indexOf('\n    },', start));
  });
}

// ── 1. Quick Chat visibility ────────────────────────────────────────────────

test('Quick Chat: no handler function remains in ChatPage', () => {
  assert.doesNotMatch(chatPageSrc, /function handleStartQuick/);
  assert.doesNotMatch(chatPageSrc, /handleStartQuick/); // no call site either
});

test('Quick Chat: no rendered JSX path references the removed entry-button copy', () => {
  assert.doesNotMatch(chatPageSrc, /t\.entry\.quick\.label/);
  assert.doesNotMatch(chatPageSrc, /t\.entry\.quick\.sub/);
});

test('Quick Chat: no "not saved" banner copy remains rendered in ChatPage', () => {
  assert.doesNotMatch(chatPageSrc, /t\.mode\.notSaved/);
});

test('Quick Chat: only one athlete-facing entry action button exists on the start screen', () => {
  const startScreen = chatPageSrc.slice(
    chatPageSrc.indexOf('Entry choice screen'),
    chatPageSrc.indexOf('Session summary — shown')
  );
  const buttonCount = (startScreen.match(/<button/g) || []).length;
  assert.equal(buttonCount, 1, 'expected exactly one button on the chat entry screen (Continue with Arjun)');
});

// ── 2. Chat-entry AI disclosure ─────────────────────────────────────────────

test('ChatPage: entry screen references the disclosure translation keys', () => {
  assert.match(chatPageSrc, /t\.entryDisclosure\b/);
  assert.match(chatPageSrc, /t\.entryDisclosureSafety\b/);
});

test('translations: chat-entry disclosure + safety line exist in English and Hindi', () => {
  for (const chatNs of chatBlocks()) {
    assert.match(chatNs, /entryDisclosure:/);
    assert.match(chatNs, /entryDisclosureSafety:/);
  }
});

test('translations: chat-entry disclosure conveys required meaning (EN)', () => {
  assert.match(translationsSrc, /not a human coach or therapist\. It can support performance skills, but it cannot provide therapy, medical care, or emergency help/);
  assert.match(translationsSrc, /contact a trusted adult or use the support contacts in Arjun/);
});

test('ChatPage: disclosure renders in the entry-screen path, not only inside the Info-only safety popover', () => {
  const disclosureIdx = chatPageSrc.indexOf('t.entryDisclosure');
  const safetyPopoverStart = chatPageSrc.indexOf('showSafety &&');
  const safetyPopoverEnd = chatPageSrc.indexOf('</header>');
  const entryScreenStart = chatPageSrc.indexOf('Entry choice screen');
  const entryScreenEnd = chatPageSrc.indexOf('Session summary — shown');

  assert.ok(disclosureIdx > entryScreenStart && disclosureIdx < entryScreenEnd, 'disclosure must render inside the entry screen');
  assert.ok(!(disclosureIdx > safetyPopoverStart && disclosureIdx < safetyPopoverEnd), 'disclosure must not be hidden inside the Info-only popover');
});

test('ChatPage: existing Info/help safety popover content is preserved', () => {
  assert.match(chatPageSrc, /t\.safetyNote/);
  assert.match(chatPageSrc, /t\.safetyHelpline/);
});

// ── 3. Recurring AI reminder ─────────────────────────────────────────────────

test('ChatPage: recurring reminder uses the shared deterministic helper, not ad-hoc logic', () => {
  assert.match(chatPageSrc, /import\s*{\s*shouldShowAiReminder,\s*BREAK_REMINDER_MS\s*}\s*from\s*'\.\.\/utils\/chatReminders'/);
  assert.match(chatPageSrc, /shouldShowAiReminder\(assistantReplyIndex\)/);
});

test('ChatPage: recurring reminder references its translation key and is not added to the messages array', () => {
  assert.match(chatPageSrc, /t\.reminderAiCoach\b/);
  // The reminder block must be plain conditional JSX, never passed through setMessages.
  const reminderBlockStart = chatPageSrc.indexOf('showAiReminder &&');
  const nearbySlice = chatPageSrc.slice(reminderBlockStart, reminderBlockStart + 200);
  assert.doesNotMatch(nearbySlice, /setMessages/);
});

test('ChatPage: recurring reminder does not touch arjunMsgCountRef (the coaching-logic counter)', () => {
  const reminderLogicStart = chatPageSrc.indexOf('let assistantReplyIndex = 0');
  const reminderLogicEnd = chatPageSrc.indexOf('});', reminderLogicStart);
  const slice = chatPageSrc.slice(reminderLogicStart, reminderLogicEnd);
  // Strip explanatory comments (which are allowed to *mention* the ref by
  // name) before checking that no actual code reads or writes it.
  const codeOnly = slice
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  assert.doesNotMatch(codeOnly, /arjunMsgCountRef/);
});

test('translations: recurring AI reminder copy exists in English and Hindi', () => {
  for (const chatNs of chatBlocks()) {
    assert.match(chatNs, /reminderAiCoach:/);
  }
});

// ── 4. Break reminder ────────────────────────────────────────────────────────

test('ChatPage: break reminder uses the 30-minute constant and is client-only (no API call in its effect)', () => {
  assert.match(chatPageSrc, /BREAK_REMINDER_MS/);
  const effectStart = chatPageSrc.indexOf('Gentle break reminder');
  const effectEnd = chatPageSrc.indexOf('}, []);', effectStart) + '}, []);'.length;
  const effectSrc = chatPageSrc.slice(effectStart, effectEnd);
  assert.match(effectSrc, /setTimeout\(\(\) => setShowBreakReminder\(true\), BREAK_REMINDER_MS\)/);
  assert.match(effectSrc, /clearTimeout\(timer\)/);
  assert.doesNotMatch(effectSrc, /apiFetch/);
});

test('ChatPage: break reminder is a single one-shot timer (no repeating interval) and is dismissible', () => {
  assert.doesNotMatch(chatPageSrc, /setInterval/);
  assert.match(chatPageSrc, /setShowBreakReminder\(false\)/); // dismiss handler
});

test('translations: break reminder copy exists in English and Hindi', () => {
  for (const chatNs of chatBlocks()) {
    assert.match(chatNs, /breakReminder:/);
  }
});

// ── 5. Regression ─────────────────────────────────────────────────────────────

test('regression: main chat entry action (Continue with Arjun) is still present', () => {
  assert.match(chatPageSrc, /handleContinueMain/);
  assert.match(chatPageSrc, /t\.entry\.continue\.label/);
});

test('regression: consent-pending guard is still present on the entry action', () => {
  assert.match(chatPageSrc, /disabled=\{atLimit \|\| consentPending\}/);
  assert.match(chatPageSrc, /consentPending && /);
});

test('regression: no forbidden overclaiming phrases were introduced', () => {
  const forbidden = [
    '24/7 monitoring', 'monitored 24/7', 'human reviews every message',
    'a human reads every message', 'every message is reviewed',
    'professional is always available', 'automatically contacted',
  ];
  for (const phrase of forbidden) {
    assert.ok(
      !chatPageSrc.toLowerCase().includes(phrase.toLowerCase()) &&
      !translationsSrc.toLowerCase().includes(phrase.toLowerCase()),
      `forbidden phrase found: "${phrase}"`
    );
  }
});
