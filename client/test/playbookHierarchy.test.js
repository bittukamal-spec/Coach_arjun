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

// ── 1. Approved content order ───────────────────────────────────────────────

test('Playbook keeps the approved order: intro → What I\'m learning → This week → Focus Cards → Saved cues → Reflections → Mind Journal', () => {
  const order = [
    src.indexOf('private, just for you'),          // page introduction
    src.indexOf(': "What I\'m learning"'),          // section render (not the file comment)
    src.indexOf("'This week'"),
    src.indexOf("'Focus Cards'"),
    src.indexOf("'Saved cues'"),
    src.indexOf("'Reflections'"),
    src.indexOf("navigate('/mind-journal')"),
  ];
  for (const idx of order) assert.ok(idx !== -1, 'every approved section must exist');
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], `section ${i} must render after section ${i - 1}`);
  }
});

// ── 2/3. One gradient hero; everything else stays flat ─────────────────────

test('"This week" is the ONLY signature-gradient content card', () => {
  const heroCount = (src.match(/variant="hero"/g) || []).length;
  assert.equal(heroCount, 1);
  const heroIdx = src.indexOf('variant="hero"');
  const thisWeekIdx = src.indexOf("'This week'");
  assert.ok(Math.abs(heroIdx - thisWeekIdx) < 400, 'the one hero must be the This-week card');
});

test('the hero keeps strong white text and wraps cleanly — no score or rating inside it', () => {
  const heroBlock = src.slice(src.indexOf('variant="hero"'), src.indexOf('Recent insight'));
  assert.match(heroBlock, /text-white/);
  assert.match(heroBlock, /break-words/);
  assert.doesNotMatch(heroBlock, /score|rating|\d+\s*\/\s*5|%/i);
});

test('other sections are flat Cards under icon SectionHeadings — no legacy card classes, no second gradient', () => {
  assert.ok((src.match(/<SectionHeading icon=/g) || []).length >= 4, 'each major section carries an icon heading');
  assert.doesNotMatch(src, /card-surface|card-elevated|icon-tile-gradient/);
});

// ── 4-7. Existing behavior preserved per section ───────────────────────────

test('Focus Cards: same empty state, same build/view routes, saved cards still open the Focus Deck', () => {
  assert.match(src, /No Focus Cards yet\./);
  assert.match(src, /navigate\(data\?\.focusCards\?\.length \? '\/focus-deck' : '\/self-talk'\)/);
  assert.match(src, /Build your first Focus Card →/);
  assert.match(src, /navigate\('\/focus-deck'\)/);
});

test('Saved cues: quiet grouped pills that render the athlete\'s own words verbatim and are NOT interactive chips', () => {
  const block = src.slice(src.indexOf('Saved reset cues'), src.indexOf('Reflections —'));
  assert.match(block, /data\.savedCues\.map/);
  assert.match(block, /<span/);
  assert.doesNotMatch(block, /className="chip"/, 'cue pills must not reuse the interactive .chip treatment');
  assert.match(block, /\{c\.cue\}/, 'cue text renders verbatim — never translated');
  assert.match(block, /Do today's mental rep →/);
});

test('Reflections: own section container with existing entries, empty state and Start-a-reflection link', () => {
  const block = src.slice(src.indexOf('Reflections —'), src.indexOf('Mind Journal —'));
  assert.match(block, /data\.reflections\.map/);
  assert.match(block, /No reflections yet\./);
  assert.match(block, /navigate\('\/debrief'\)/);
  assert.match(block, /Start a reflection/);
});

test('Mind Journal entry: a proper quiet card with title, privacy/no-score line and /mind-journal action', () => {
  const block = src.slice(src.indexOf('Mind Journal —'));
  assert.match(block, /<Card/);
  assert.doesNotMatch(block, /variant="hero"/);
  assert.match(block, /navigate\('\/mind-journal'\)/);
  assert.match(block, /no scores|कोई स्कोर नहीं/i);
});

// ── 5. Data behavior unchanged ──────────────────────────────────────────────

test('Playbook stays read-only over exactly one GET /api/playbook call', () => {
  assert.match(src, /apiFetch\('\/api\/playbook'/);
  assert.equal((src.match(/apiFetch\(/g) || []).length, 1);
  assert.doesNotMatch(src, /method:\s*'(POST|PUT|PATCH|DELETE)'/);
});

// ── 6. English and Hindi both render ───────────────────────────────────────

test('every new athlete-facing string has both an English and a Hindi variant', () => {
  // The page translates inline via `hi ? … : …` — spot-check the new copy.
  assert.match(src, /अभी कोई सीख दर्ज नहीं हुई/);
  assert.match(src, /haven't recorded any lessons yet/);
  assert.match(src, /कोई स्कोर नहीं/);
  assert.match(src, /no scores/i);
  // Playbook uses no translations.js namespace — nothing to go missing there.
  assert.ok(!src.includes('translations['), 'Playbook translates inline; no namespace lookup to break');
  assert.ok(translations.length > 0);
});
