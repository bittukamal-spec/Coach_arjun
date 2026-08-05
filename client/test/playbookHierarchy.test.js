// Source-text checks for the Mental Playbook hierarchy refinement: the
// approved content order is unchanged, every section now sits in a flat
// Card container under an icon SectionHeading, "This week" remains the
// page's ONLY signature-gradient card, saved cues became quiet
// non-interactive pills, and no data/API/route/action changed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const src = readFileSync(path.join(root, 'src/pages/PlaybookPage.jsx'), 'utf8');
const translations = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

// Stage I moved this page's athlete-facing copy into the `playbook`
// translation namespace. These helpers let the existing guarantees keep
// asserting the COPY (now where it lives) and the page's WIRING separately,
// instead of matching inline literals that no longer exist in the JSX.
function playbookNamespace(lang) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translations.indexOf('playbook: {', langIdx);
  assert.ok(start !== -1, `missing playbook namespace in ${lang}`);
  return translations.slice(start, translations.indexOf('\n    },', start));
}
const pbEn = playbookNamespace('en');
const pbHi = playbookNamespace('hi');

// ── 1. Approved content order ───────────────────────────────────────────────

test('Playbook keeps the approved order: intro → What I\'m learning → This week → Focus Cards → Saved cues → Reflections → Mind Journal', () => {
  // Stage I moved this page's copy into the `playbook` translation namespace,
  // so the order is now pinned on the key references rather than on inline
  // literals. Same sections, same order, same guarantee.
  const order = [
    src.indexOf('{pb.intro}'),                     // page introduction
    src.indexOf('{pb.learningHeading}'),
    src.indexOf('{pb.thisWeek}'),
    src.indexOf('{pb.focusCardsHeading}'),
    src.indexOf('{pb.cuesHeading}'),
    src.indexOf('{pb.reflectionsHeading}'),
    src.indexOf("navigate('/mind-journal')"),
  ];
  for (const idx of order) assert.ok(idx !== -1, 'every approved section must exist');
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], `section ${i} must render after section ${i - 1}`);
  }
});

// ── 2/3. One gradient hero; everything else stays flat ─────────────────────

test('Stage F: the page carries no gradient at all — "This week" moved to the approved flat surface', () => {
  assert.equal((src.match(/variant="hero"/g) || []).length, 0);
  assert.doesNotMatch(src, /card-hero|linear-gradient|btn-gradient/);
  assert.match(src, /var\(--surface-elevated\)/, 'the weekly summary uses the approved elevated surface');
});

test('the weekly summary keeps readable theme-correct text and wraps cleanly — no score or rating inside it', () => {
  const weekBlock = src.slice(src.indexOf('{pb.thisWeek}'), src.indexOf('Recent insight'));
  assert.match(weekBlock, /text-ink/, 'theme-correct foreground rather than hardcoded white');
  assert.match(weekBlock, /break-words/);
  assert.doesNotMatch(weekBlock, /score|rating|\d+\s*\/\s*5|%/i);
  // Its data and wording are untouched by the restyle.
  assert.match(weekBlock, /data\.weekRepCount/);
  assert.match(weekBlock, /data\.weekResetCount/);
  assert.match(weekBlock, /data\.topCue/);
  // The wording itself still exists, in both languages, and still counts
  // reps/resets without turning them into a score.
  for (const ns of [pbEn, pbHi]) {
    assert.match(ns, /weekReps:/);
    assert.match(ns, /weekResets:/);
    assert.match(ns, /topCue:/);
  }
});

test('other sections are flat Cards under icon SectionHeadings — no legacy card classes, no second gradient', () => {
  assert.ok((src.match(/<SectionHeading icon=/g) || []).length >= 4, 'each major section carries an icon heading');
  assert.doesNotMatch(src, /card-surface|card-elevated|icon-tile-gradient/);
});

// ── 4-7. Existing behavior preserved per section ───────────────────────────

test('Focus Cards: same empty state, same build/view routes, saved cards still open the Focus Deck', () => {
  assert.match(pbEn, /focusCardsEmpty:\s*'No Focus Cards yet\.'/);
  assert.match(pbEn, /focusCardsBuild:\s*'Build your first Focus Card →'/);
  assert.match(pbHi, /focusCardsEmpty:/);
  assert.match(pbHi, /focusCardsBuild:/);
  assert.match(src, /\{pb\.focusCardsEmpty\}/);
  assert.match(src, /pb\.focusCardsBuild/);
  assert.match(src, /navigate\(data\?\.focusCards\?\.length \? '\/focus-deck' : '\/self-talk'\)/);
  assert.match(src, /navigate\('\/focus-deck'\)/);
});

test('Saved cues: quiet grouped pills that render the athlete\'s own words verbatim and are NOT interactive chips', () => {
  const block = src.slice(src.indexOf('Saved reset cues'), src.indexOf('Reflections —'));
  assert.match(block, /data\.savedCues\.map/);
  assert.match(block, /<span/);
  assert.doesNotMatch(block, /className="chip"/, 'cue pills must not reuse the interactive .chip treatment');
  assert.match(block, /\{c\.cue\}/, 'cue text renders verbatim — never translated');
  assert.match(block, /\{pb\.cuesCta\}/);
  assert.match(pbEn, /cuesCta:\s*"Do today's mental rep →"/);
  assert.match(pbHi, /cuesCta:/);
});

test('Reflections: own section container with existing entries, empty state and Start-a-reflection link', () => {
  const block = src.slice(src.indexOf('Reflections —'), src.indexOf('Mind Journal —'));
  assert.match(block, /data\.reflections\.map/);
  assert.match(block, /\{pb\.reflectionsEmpty\}/);
  assert.match(block, /navigate\('\/debrief'\)/);
  assert.match(block, /\{pb\.reflectionsCta\}/);
  assert.match(pbEn, /reflectionsEmpty:\s*'No reflections yet\.'/);
  assert.match(pbEn, /reflectionsCta:\s*'Start a reflection'/);
  assert.match(pbHi, /reflectionsEmpty:/);
  assert.match(pbHi, /reflectionsCta:/);
});

test('Mind Journal entry: a proper quiet card with title, personal/score-free line and /mind-journal action', () => {
  const block = src.slice(src.indexOf('Mind Journal —'));
  assert.match(block, /<Card/);
  assert.doesNotMatch(block, /variant="hero"/);
  assert.match(block, /navigate\('\/mind-journal'\)/);
  assert.match(block, /\{pb\.journalDesc\}/);
  assert.match(pbEn, /journalDesc:\s*'A personal, score-free place to reflect and carry something useful forward\.'/);
  assert.match(pbHi, /कोई स्कोर नहीं/);
});

// ── 5. Data behavior unchanged ──────────────────────────────────────────────

test('Playbook stays read-only over exactly one GET /api/playbook call', () => {
  assert.match(src, /apiFetch\('\/api\/playbook'/);
  assert.equal((src.match(/apiFetch\(/g) || []).length, 1);
  assert.doesNotMatch(src, /method:\s*'(POST|PUT|PATCH|DELETE)'/);
});

// ── 5b. Stage F: approved recipes applied, timeline explicitly NOT built ──

test('Stage F applies the approved chip recipes to content that already existed', () => {
  // Dates already in the payload get the date-pill recipe.
  assert.match(src, /chip-date-pill/);
  assert.match(src, /o\.outcomeRecordedAt/, 'the outcome date is still the stored one');
  assert.match(src, /r\.createdAt/, 'the reflection date is still the stored one');
  // The stored outcome status gets the status-label recipe, not a score.
  assert.match(src, /chip-status-label/);
  assert.match(src, /outcomeLabel\(o\.outcomeStatus, pb\)/);
  // The four stored statuses still map to plain result labels, both languages.
  for (const ns of [pbEn, pbHi]) {
    for (const k of ['outcomeHelped', 'outcomeHelpedALittle', 'outcomeDidNotHelp', 'outcomeNotTried']) {
      assert.match(ns, new RegExp(`${k}:`));
    }
  }
  // Athlete-authored cues get the read-only fact-chip recipe.
  assert.match(src, /chip-fact/);
});

test('Stage F introduces NO timeline: no month grouping, milestone classification or event feed', () => {
  assert.doesNotMatch(src, /timeline|milestone|monthGroup|groupByMonth|eventFeed|routineRow/i);
  // No date arithmetic that would imply a chronological rebuild.
  assert.doesNotMatch(src, /getMonth\(\)|startOf|endOf|sort\(/);
});

test('Stage F adds no API surface — still exactly one read-only GET /api/playbook', () => {
  assert.equal((src.match(/apiFetch\(/g) || []).length, 1);
  assert.match(src, /apiFetch\('\/api\/playbook'/);
  assert.doesNotMatch(src, /method:\s*'(POST|PUT|PATCH|DELETE)'/);
});

test('every athlete-content section survives the restyle', () => {
  for (const marker of [
    'data.practiceOutcomes.map',
    'data.focusCards.slice',
    'data.savedCues.map',
    'data.reflections.map',
    "navigate('/mind-journal')",
  ]) {
    assert.ok(src.includes(marker), `${marker} must survive the Stage F restyle`);
  }
});

test('empty states keep their meaning and their actions', () => {
  // The copy now lives in the namespace; the page wires each one.
  assert.match(pbEn, /focusCardsEmpty:\s*'No Focus Cards yet\.'/);
  assert.match(pbEn, /cuesEmpty:\s*'No saved cues yet\.'/);
  assert.match(pbEn, /reflectionsEmpty:\s*'No reflections yet\.'/);
  assert.match(pbEn, /haven't recorded any lessons yet/);
  for (const key of ['focusCardsEmpty', 'cuesEmpty', 'reflectionsEmpty', 'learningEmpty']) {
    assert.match(src, new RegExp(`pb\\.${key}`), `${key} must still render`);
    assert.match(pbHi, new RegExp(`${key}:`), `${key} must exist in Hindi`);
  }
  // No invented claim of completed practices or developed patterns.
  assert.doesNotMatch(pbEn, /you have (completed|developed|built) a pattern/i);
});

// ── 6. English and Hindi both render ───────────────────────────────────────

test('every athlete-facing string has both an English and a Hindi variant', () => {
  // Stage I: the page no longer translates inline. Copy lives in the
  // `playbook` namespace, which must stay at full EN/HI key parity.
  assert.match(pbHi, /अभी कोई सीख दर्ज नहीं हुई/);
  assert.match(pbEn, /haven't recorded any lessons yet/);
  assert.match(pbHi, /कोई स्कोर नहीं/);
  assert.match(pbEn, /no scores/i);
  const keysOf = (block) => [...block.matchAll(/^\s{6}([a-zA-Z]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keysOf(pbEn), keysOf(pbHi), 'playbook keys must match across languages');
  // The page reads that namespace rather than branching on language inline.
  assert.match(src, /\.playbook;/);
  // Only BCP-47 locale codes for toLocaleDateString may still branch on `hi`
  // — those are not translatable copy, they select a date format.
  const inline = [...src.matchAll(/hi \? '([^']*)'/g)]
    .map((m) => m[1])
    .filter((v) => v !== 'hi-IN');
  assert.deepEqual(inline, [], 'no inline bilingual copy should remain on Playbook');
});
