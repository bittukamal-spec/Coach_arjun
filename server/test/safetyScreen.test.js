// Pure unit tests for the deterministic safety screen — no database, no
// network, no Anthropic. Table-driven across all three categories and all
// three scripts (English, Devanagari Hindi, Romanized Hinglish), positive
// and negative cases.

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSafetyText } = require('../src/services/safety/normalizeSafetyText');
const { screenSafetyText, screenSafetyFields } = require('../src/services/safety/screenSafetyText');

// ── Normalization ────────────────────────────────────────────────────────────

test('normalize: lowercases, collapses whitespace, straightens smart quotes, strips zero-width chars', () => {
  assert.equal(normalizeSafetyText('  I  WANT\nTo   Die  '), 'i want to die');
  assert.equal(normalizeSafetyText('can’t feel my legs'), "can't feel my legs");
  assert.equal(normalizeSafetyText('kill​ myself'), 'kill myself');
  assert.equal(normalizeSafetyText(''), '');
  assert.equal(normalizeSafetyText(null), '');
  assert.equal(normalizeSafetyText(undefined), '');
});

// ── Positive cases: every category × every script ────────────────────────────

const POSITIVE = [
  // crisis — English
  { text: 'sometimes I want to die after losing', category: 'crisis' },
  { text: 'I have been cutting myself', category: 'crisis' },
  { text: 'I feel suicidal lately', category: 'crisis' },
  // crisis — Romanized Hinglish
  { text: 'mujhe lagta hai main marna chahta hun', category: 'crisis' },
  { text: 'ab jeena nahi chahta yaar', category: 'crisis' },
  { text: 'maine khud ko chot pahunchayi', category: 'crisis' },
  // crisis — Devanagari
  { text: 'मैं मरना चाहता हूँ', category: 'crisis' },
  { text: 'अब जीना नहीं चाहती', category: 'crisis' },
  { text: 'मैंने खुद को चोट पहुंचाई', category: 'crisis' },

  // abuse — English
  { text: 'my coach hits me after every loss', category: 'abuse' },
  { text: 'I am scared to go home after practice', category: 'abuse' },
  { text: 'someone is bullying me in the team', category: 'abuse' },
  // abuse — Romanized Hinglish
  { text: 'coach mujhe maarta hai jab main haar jata hun', category: 'abuse' },
  { text: 'papa ghar par maarte hain', category: 'abuse' },
  { text: 'woh mujhe dhamki deta hai roz', category: 'abuse' },
  // abuse — Devanagari
  { text: 'कोच मुझे मारता है', category: 'abuse' },
  { text: 'वो मुझे धमकी देता है', category: 'abuse' },
  { text: 'मुझे घर जाने से डर लगता है', category: 'abuse' },

  // injury — English
  { text: 'I think I have a concussion from the tackle', category: 'injury' },
  { text: 'I passed out during training today', category: 'injury' },
  { text: 'my knee is bleeding heavily', category: 'injury' },
  // injury — Romanized Hinglish
  { text: 'main ground par behosh ho gaya tha', category: 'injury' },
  { text: 'sir mein chot lagi hai ball se', category: 'injury' },
  { text: 'bahut khoon nikal raha hai', category: 'injury' },
  // injury — Devanagari
  { text: 'मैं मैदान पर बेहोश हो गया', category: 'injury' },
  { text: 'सिर में चोट लगी है', category: 'injury' },
  { text: 'बहुत खून बह रहा है', category: 'injury' },
];

test('positive cases: flags the right category across EN / Devanagari / Hinglish', () => {
  for (const { text, category } of POSITIVE) {
    const result = screenSafetyText(text);
    assert.equal(result.flagged, true, `should flag: "${text}"`);
    assert.equal(result.category, category, `wrong category for: "${text}"`);
    assert.ok(result.riskLevel, `riskLevel missing for: "${text}"`);
  }
});

test('case, punctuation-variant, and spacing insensitivity', () => {
  assert.equal(screenSafetyText('I WANT TO DIE').flagged, true);
  assert.equal(screenSafetyText('i   want   to   die').flagged, true);
  assert.equal(screenSafetyText('can’t feel my legs').flagged, true); // curly apostrophe
});

// ── Negative cases: normal sports talk must never flag ───────────────────────

const NEGATIVE = [
  'I killed it today in practice',
  'dead tired after the match',
  'the game went to sudden death',
  'I want to smash it tomorrow',
  'coach was hard on me today',
  'maar diya maine aaj match mein',       // "nailed it" in sports Hinglish
  'jaan laga di maine aaj',               // "gave my all"
  'my legs are dead after training',
  'that delivery was a killer',
  'I got hit on the pads',
  'washed out by rain today',
  'we got destroyed in the second half',
  'the pressure is killing my focus',     // idiomatic, not literal
  'I choked in the final over',
  'meri body toot rahi hai training se',  // normal soreness talk
  'खूब मेहनत की आज',                        // worked hard today
  // Deliberate exclusion (documented in safetyRules.js): breathlessness is
  // the most common pre-match nerves description — the deterministic layer
  // leaves it to the contextual prompt layer.
  "I feel like I can't breathe before matches",
];

test("negative cases: everyday athlete language never flags", () => {
  for (const text of NEGATIVE) {
    const result = screenSafetyText(text);
    assert.equal(result.flagged, false, `should NOT flag: "${text}"`);
  }
});

// ── Return-value privacy ──────────────────────────────────────────────────────

test('result never contains the input text or matched phrase', () => {
  const result = screenSafetyText('I want to die');
  assert.deepEqual(Object.keys(result).sort(), ['category', 'flagged', 'riskLevel']);
});

// ── Multi-field helper ───────────────────────────────────────────────────────

test('screenSafetyFields: flags when any field trips, ignores null/undefined fields', () => {
  assert.equal(screenSafetyFields('nervous before finals', null, undefined, 'coach hits me').flagged, true);
  assert.equal(screenSafetyFields('nervous before finals', 'want to focus better').flagged, false);
  assert.equal(screenSafetyFields().flagged, false);
});
