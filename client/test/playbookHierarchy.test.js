// Source-text checks for the Mental Playbook hierarchy. Modernization pass 2
// (approved-mockup fidelity): Playbook is a compact OVERVIEW — one card per
// category, each showing its single most useful/most recent item, minimal
// copy, restrained per-section colour accent, no nested boxes. The approved
// content order is unchanged; no data/API/route/action changed for any
// section (Mind Journal's removal from Playbook is covered separately in
// mindJournalRemovedFromPlaybook.test.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const src = readFileSync(path.join(root, 'src/pages/PlaybookPage.jsx'), 'utf8');
const translations = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

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

test('Playbook keeps the approved order: Latest Lesson → This week → Focus Cards → Saved cues → Reflections', () => {
  // Modernization pass 2 dropped the standalone intro paragraph entirely
  // (per the approved mockup, the page begins directly with the first
  // card), so `pb.intro` is no longer part of this guarantee.
  const order = [
    src.indexOf('{pb.learningHeading}'),
    src.indexOf('{pb.thisWeek}'),
    src.indexOf('{pb.focusCardsHeading}'),
    src.indexOf('{pb.cuesHeading}'),
    src.indexOf('{pb.reflectionsHeading}'),
  ];
  for (const idx of order) assert.ok(idx !== -1, 'every approved section must exist');
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], `section ${i} must render after section ${i - 1}`);
  }
});

test('the standalone intro paragraph is gone — the page begins directly with the first card', () => {
  assert.doesNotMatch(src, /\{pb\.intro\}/);
  assert.doesNotMatch(pbEn, /^\s{6}intro:/m);
  assert.doesNotMatch(pbHi, /^\s{6}intro:/m);
});

// ── 2/3. One gradient hero; everything else stays flat ─────────────────────

test('Playbook carries no gradient at all', () => {
  assert.equal((src.match(/variant="hero"/g) || []).length, 0);
  assert.doesNotMatch(src, /card-hero|linear-gradient|btn-gradient/);
  assert.match(src, /var\(--surface-elevated\)/, 'the weekly summary uses the approved elevated surface');
});

test('This week: one number, one label, at most one short secondary line — no score or rating', () => {
  const weekBlock = src.slice(src.indexOf('{pb.thisWeek}'), src.indexOf('Focus Cards — blue accent'));
  assert.match(weekBlock, /text-ink/, 'theme-correct foreground rather than hardcoded white');
  assert.doesNotMatch(weekBlock, /score|rating|\d+\s*\/\s*5|%/i);
  // Its data source is untouched by the restyle.
  assert.match(weekBlock, /data\.weekRepCount/);
  assert.match(weekBlock, /data\.weekResetCount/);
  for (const ns of [pbEn, pbHi]) {
    assert.match(ns, /weekRepsLabel:/);
    assert.match(ns, /weekResets:/);
  }
});

test('every section carries an icon heading inside its own single card — no legacy card classes', () => {
  // Two headings (Latest Lesson, Reflections) wrap onto multiple lines
  // because they also pass a `right={...}` date pill, so `icon=` isn't
  // adjacent to the opening tag on the same line — match the opening tag
  // itself instead of requiring `icon=` right after it.
  assert.ok((src.match(/<SectionHeading\b/g) || []).length >= 5, 'all five sections carry an icon heading');
  assert.doesNotMatch(src, /card-surface|card-elevated|icon-tile-gradient/);
});

// ── 4-7. Existing behavior preserved per section (now single-item overview) ─

test('Focus Cards: shows the single most recent card, same build/view routes, unchanged data', () => {
  assert.match(pbEn, /focusCardsEmpty:\s*'No Focus Cards yet'/);
  assert.match(pbEn, /focusCardsBuild:\s*'Build your first Focus Card'/);
  assert.match(pbHi, /focusCardsEmpty:/);
  assert.match(pbHi, /focusCardsBuild:/);
  assert.match(src, /\{pb\.focusCardsEmpty\}/);
  assert.match(src, /pb\.focusCardsBuild/);
  // Modernization pass 2: the overview shows only data.focusCards[0] — the
  // full array is still fetched/available, just not all rendered here.
  assert.match(src, /data\?\.focusCards\?\.\[0\]/);
  assert.match(src, /navigate\('\/focus-deck'\)/);
  assert.match(src, /navigate\('\/self-talk'\)/);
  // The athlete's own power line still renders verbatim and never truncates.
  assert.match(src, /focusCard\.powerLine/);
  assert.doesNotMatch(src, /\btruncate\b/);
});

test('Saved cues: shows the single most recent cue verbatim, still read-only (never a button)', () => {
  // The `cue` variable is derived once near the top of the component
  // (`const cue = data?.savedCues?.[0] || null;`), then consumed by the
  // Saved Cues card further down — check each concern where it lives.
  assert.match(src, /const cue = data\?\.savedCues\?\.\[0\] \|\| null;/);
  const block = src.slice(src.indexOf('{pb.cuesHeading}'), src.indexOf('{pb.reflectionsHeading}'));
  assert.match(block, /\{cue\.cue\}/, 'cue text renders verbatim — never translated');
  assert.doesNotMatch(block, /<button[^>]*>[\s\S]*?cue\.cue/, 'the cue text itself must not become a button');
  assert.match(block, /\{pb\.cuesCta\}/);
  assert.match(pbEn, /cuesCta:\s*"Do today's Mental Rep →"/);
  assert.match(pbHi, /cuesCta:/);
});

test('Reflections: shows the single most recent reflection — date, short context, one takeaway', () => {
  assert.match(src, /const reflection = data\?\.reflections\?\.\[0\] \|\| null;/);
  const block = src.slice(src.indexOf('{pb.reflectionsHeading}'));
  assert.match(block, /\{pb\.reflectionsEmpty\}/);
  // PR 2 cutover: the action opens the Mind Journal reflection.
  assert.match(block, /navigate\('\/mind-journal\/new'\)/);
  assert.doesNotMatch(block, /\/debrief/);
  assert.match(block, /\{pb\.reflectionsCta\}/);
  // A new Mind Journal reflection renders its context and Arjun's takeaway.
  assert.match(block, /reflection\.source === 'mind_journal'/);
  assert.match(block, /reflectionContextLabel\(reflection, mj\)/);
  assert.match(block, /reflection\.takeaway/);
  // A historical row from the retired tool keeps rendering exactly the
  // fields that row genuinely has — read-only, nothing rewritten.
  assert.match(block, /reflection\.eventType/);
  assert.match(block, /reflection\.nextFocus/);
  assert.match(block, /reflection\.arjunInsight/);
  assert.match(pbEn, /reflectionsEmpty:\s*'No reflections yet'/);
  assert.match(pbEn, /reflectionsCta:\s*'Start a reflection'/);
  assert.match(pbHi, /reflectionsEmpty:/);
  assert.match(pbHi, /reflectionsCta:/);
});

// ── 5. Data behavior unchanged ──────────────────────────────────────────────

test('Playbook stays read-only over exactly one GET /api/playbook call', () => {
  assert.match(src, /apiFetch\('\/api\/playbook'/);
  assert.equal((src.match(/apiFetch\(/g) || []).length, 1);
  assert.doesNotMatch(src, /method:\s*'(POST|PUT|PATCH|DELETE)'/);
});

// ── 5b. Dates keep the approved chip recipe; outcome-status/full-history
// metadata (practice name, situation, outcome label, all cues, all
// reflections) is intentionally no longer rendered on this overview — the
// data is still fetched, just not all displayed (see file header). ────────

test('dates on the overview keep the approved date-pill recipe, sourced from the real stored values', () => {
  assert.match(src, /chip-date-pill/);
  assert.match(src, /lesson\.outcomeRecordedAt/, 'the lesson date is still the stored one');
  assert.match(src, /reflection\.createdAt/, 'the reflection date is still the stored one');
});

test('the overview intentionally no longer shows outcome-status ("It helped") language or the old OUTCOME_KEYS mapping', () => {
  // That metadata row was explicitly dropped per the approved mockup — the
  // lesson text itself is now the whole, single strongest takeaway.
  assert.doesNotMatch(src, /OUTCOME_KEYS|outcomeLabel|chip-status-label/);
  for (const ns of [pbEn, pbHi]) {
    for (const k of ['outcomeHelped', 'outcomeHelpedALittle', 'outcomeDidNotHelp', 'outcomeNotTried']) {
      assert.doesNotMatch(ns, new RegExp(`${k}:`));
    }
  }
});

test('Playbook introduces NO timeline: no month grouping, milestone classification or event feed', () => {
  assert.doesNotMatch(src, /timeline|milestone|monthGroup|groupByMonth|eventFeed|routineRow/i);
  assert.doesNotMatch(src, /getMonth\(\)|startOf|endOf|sort\(/);
});

test('Playbook adds no API surface — still exactly one read-only GET /api/playbook', () => {
  assert.equal((src.match(/apiFetch\(/g) || []).length, 1);
  assert.match(src, /apiFetch\('\/api\/playbook'/);
  assert.doesNotMatch(src, /method:\s*'(POST|PUT|PATCH|DELETE)'/);
});

test('every athlete-content section still reads its real data source', () => {
  for (const marker of [
    'data?.practiceOutcomes?.[0]',
    'data?.focusCards?.[0]',
    'data?.savedCues?.[0]',
    'data?.reflections?.[0]',
  ]) {
    assert.ok(src.includes(marker), `${marker} must be read by the overview`);
  }
});

test('empty states keep their meaning and their actions', () => {
  assert.match(pbEn, /focusCardsEmpty:\s*'No Focus Cards yet'/);
  assert.match(pbEn, /cuesEmpty:\s*'No saved cues yet'/);
  assert.match(pbEn, /reflectionsEmpty:\s*'No reflections yet'/);
  assert.match(pbEn, /Practice a Mental Rep and tell Arjun how it went/);
  for (const key of ['focusCardsEmpty', 'cuesEmpty', 'reflectionsEmpty', 'learningEmpty', 'learningEmptyTitle']) {
    assert.match(src, new RegExp(`pb\\.${key}`), `${key} must still render`);
    assert.match(pbHi, new RegExp(`${key}:`), `${key} must exist in Hindi`);
  }
  // No invented claim of completed practices or developed patterns.
  assert.doesNotMatch(pbEn, /you have (completed|developed|built) a pattern/i);
});

// ── 6. English and Hindi both render ───────────────────────────────────────

test('every athlete-facing string has both an English and a Hindi variant', () => {
  assert.match(pbHi, /अभी कोई सीख नहीं/);
  assert.match(pbEn, /Practice a Mental Rep and tell Arjun how it went/);
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
