import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../src/i18n/translations.js';

// Levels (founder, Nov 2026): every chapter has Level 2 and Level 3 words,
// each with a 3-card lesson, a practise and a play line.
const t = translations.en.path;

test('every chapter has levels 2 and 3 with a full lesson', () => {
  for (const key of Object.keys(t.chapters)) {
    for (const level of [2, 3]) {
      const l = t.chapterLevels[key]?.[level];
      assert.ok(l, `${key} level ${level}`);
      assert.equal(l.lesson.cards.length, 3);
      assert.ok(l.lesson.title && l.lesson.takeaway && l.practise && l.play);
    }
  }
  assert.deepEqual(Object.keys(t.levelNames), ['1', '2', '3']);
});

test('level lessons never mention cricket words directly', () => {
  const all = JSON.stringify(t.chapterLevels);
  assert.doesNotMatch(all, /next ball|watch the ball|bowler|\bbat\b/i);
});
