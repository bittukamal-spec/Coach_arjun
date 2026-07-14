// Real behavioral tests for the pure, framework-free server-card helpers
// (PR-9: structured `{ t: "card", card: {...} }` SSE event support). No JSX
// involved, so these run as genuine unit tests via Node's built-in test
// runner — not just source-text assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidServerCard, parseServerCardEvent, mergeUniqueServerCard } from '../src/utils/serverCardEvent.js';

function validCard(overrides = {}) {
  return {
    prescriptionId: 'presc-1',
    practiceKey: 'pressure_reset',
    situation: 'Free throws in the last two minutes',
    cardContent: 'Before your next free throw, take one slow breath and reset.',
    cueWord: 'Breathe',
    ...overrides,
  };
}

// ── isValidServerCard ────────────────────────────────────────────────────────

test('isValidServerCard: accepts a fully-populated card', () => {
  assert.equal(isValidServerCard(validCard()), true);
});

test('isValidServerCard: accepts a card with cueWord explicitly null', () => {
  assert.equal(isValidServerCard(validCard({ cueWord: null })), true);
});

test('isValidServerCard: accepts a card with cueWord omitted entirely', () => {
  const card = validCard();
  delete card.cueWord;
  assert.equal(isValidServerCard(card), true);
});

test('isValidServerCard: rejects null/non-object input', () => {
  assert.equal(isValidServerCard(null), false);
  assert.equal(isValidServerCard(undefined), false);
  assert.equal(isValidServerCard('a string'), false);
  assert.equal(isValidServerCard(42), false);
});

test('isValidServerCard: rejects when any required field is missing', () => {
  for (const field of ['prescriptionId', 'practiceKey', 'situation', 'cardContent']) {
    const card = validCard();
    delete card[field];
    assert.equal(isValidServerCard(card), false, `should reject a card missing ${field}`);
  }
});

test('isValidServerCard: rejects when a required field is an empty or blank string', () => {
  for (const field of ['prescriptionId', 'practiceKey', 'situation', 'cardContent']) {
    assert.equal(isValidServerCard(validCard({ [field]: '' })), false, `should reject empty ${field}`);
    assert.equal(isValidServerCard(validCard({ [field]: '   ' })), false, `should reject blank ${field}`);
  }
});

test('isValidServerCard: rejects when a required field is the wrong type', () => {
  assert.equal(isValidServerCard(validCard({ prescriptionId: 123 })), false);
  assert.equal(isValidServerCard(validCard({ cardContent: { nested: true } })), false);
});

test('isValidServerCard: rejects a non-string, non-null cueWord', () => {
  assert.equal(isValidServerCard(validCard({ cueWord: 42 })), false);
  assert.equal(isValidServerCard(validCard({ cueWord: {} })), false);
});

// ── parseServerCardEvent ─────────────────────────────────────────────────────

test('parseServerCardEvent: accepts a valid t:"card" event and normalizes cueWord', () => {
  const result = parseServerCardEvent({ t: 'card', card: validCard() });
  assert.deepEqual(result, {
    prescriptionId: 'presc-1',
    practiceKey: 'pressure_reset',
    situation: 'Free throws in the last two minutes',
    cardContent: 'Before your next free throw, take one slow breath and reset.',
    cueWord: 'Breathe',
  });
});

test('parseServerCardEvent: normalizes an omitted cueWord to null', () => {
  const card = validCard();
  delete card.cueWord;
  const result = parseServerCardEvent({ t: 'card', card });
  assert.equal(result.cueWord, null);
});

test('parseServerCardEvent: returns null for a non-card event type', () => {
  assert.equal(parseServerCardEvent({ t: 'd', c: 'hello' }), null);
  assert.equal(parseServerCardEvent({ t: 'end', id: 'm1' }), null);
});

test('parseServerCardEvent: returns null for malformed or incomplete payloads, never throws', () => {
  const malformed = [
    null,
    undefined,
    {},
    { t: 'card' },
    { t: 'card', card: null },
    { t: 'card', card: {} },
    { t: 'card', card: { prescriptionId: 'p1' } },
    { t: 'card', card: 'not an object' },
    { t: 'card', card: { prescriptionId: '', practiceKey: 'x', situation: 'x', cardContent: 'x' } },
  ];
  for (const event of malformed) {
    assert.doesNotThrow(() => parseServerCardEvent(event));
    assert.equal(parseServerCardEvent(event), null);
  }
});

// ── mergeUniqueServerCard ─────────────────────────────────────────────────────

test('mergeUniqueServerCard: adds a new card to an empty list', () => {
  const result = mergeUniqueServerCard([], validCard());
  assert.equal(result.length, 1);
  assert.equal(result[0].prescriptionId, 'presc-1');
});

test('mergeUniqueServerCard: does not render/add the same prescriptionId twice', () => {
  const first = mergeUniqueServerCard([], validCard());
  const second = mergeUniqueServerCard(first, validCard()); // same prescriptionId
  assert.equal(second.length, 1);
  assert.equal(second, first, 'should return the same array reference when nothing changes'); // no-op, not a new duplicate entry
});

test('mergeUniqueServerCard: preserves cards with different prescriptionIds', () => {
  let cards = mergeUniqueServerCard([], validCard({ prescriptionId: 'presc-1' }));
  cards = mergeUniqueServerCard(cards, validCard({ prescriptionId: 'presc-2' }));
  assert.deepEqual(cards.map((c) => c.prescriptionId), ['presc-1', 'presc-2']);
});

test('mergeUniqueServerCard: rejects a card with no valid id rather than inventing one', () => {
  const noId = { ...validCard(), prescriptionId: undefined };
  assert.deepEqual(mergeUniqueServerCard([], noId), []);
  assert.deepEqual(mergeUniqueServerCard([], null), []);
  assert.deepEqual(mergeUniqueServerCard([], { prescriptionId: '' }), []);
});

test('mergeUniqueServerCard: does not mutate the existing array', () => {
  const existing = [validCard({ prescriptionId: 'presc-1' })];
  const frozen = Object.freeze(existing);
  assert.doesNotThrow(() => mergeUniqueServerCard(frozen, validCard({ prescriptionId: 'presc-2' })));
});
