import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translations } from '../src/i18n/translations.js';
import { toolExamples, chatExamples, sportBlock } from '../src/i18n/sportExamples.js';

// Every onboarding sport gets its own examples, lessons and focus words
// (founder, Nov 2026: everything follows the athlete's sport).
const config = JSON.parse(readFileSync(new URL('../../shared/onboarding/v2.json', import.meta.url), 'utf8'));
const SPORTS = config.questions.sport.answers.map(a => a.id).filter(id => id !== 'other');
const rep = readFileSync(new URL('../src/pages/MentalRepPage.jsx', import.meta.url), 'utf8');

for (const sport of SPORTS) {
  test(`${sport}: has its own examples, lessons and warm-up words`, () => {
    assert.notEqual(sportBlock(sport), sportBlock('other'), 'own example block');
    assert.ok(toolExamples(sport).routine.rows.length >= 3);
    assert.ok(chatExamples(sport).length >= 5);
    assert.ok(translations.en.skillPathFocus.example[sport], 'focus lesson example');
    assert.ok(translations.en.skillPathFocus.quiz.bySport[sport], 'focus quiz');
    assert.ok(translations.en.skillPathPressure.example[sport], 'pressure lesson example');
    assert.ok(translations.en.skillPathPressure.quiz.bySport[sport], 'pressure quiz');
    assert.ok(translations.en.path.plan.unit[sport], 'play-plan unit');
    assert.match(rep, new RegExp(`\\n  ${sport}: +\\{`), 'Mind Warm-up words');
  });
}

test('training-plan lessons use the athlete\'s sport words, not cricket ones', () => {
  const lessons = Object.values(translations.en.path.chapters).flatMap(c => [...c.lesson.cards, c.lesson.takeaway]).join(' ');
  assert.doesNotMatch(lessons, /next ball|watch the ball/i);
  assert.match(readFileSync(new URL('../src/pages/PathLessonPage.jsx', import.meta.url), 'utf8'), /focusWord\|resetWord\|unit/);
});
