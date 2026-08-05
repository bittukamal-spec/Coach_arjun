// Stage I source-text guarantees for the final QA sweep: the verified-dead UI
// components stay gone, the redesigned pilot surfaces translate through the
// translation system rather than inline literals, the new warn/accent tokens
// are defined in every theme block, and the profile hook keeps its remount fix.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = (p) => readFileSync(path.join(root, 'src', p), 'utf8');

const translations = src('i18n/translations.js');
const css = src('index.css');

// Every .jsx/.js under src/, for whole-tree reference checks.
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(jsx?|css)$/.test(entry.name)) out.push(rel);
  }
  return out;
}
const ALL_FILES = walk('src');
const ALL_SOURCE = ALL_FILES.map((f) => readFileSync(path.join(root, f), 'utf8')).join('\n');

// ── 1. Verified-dead components are gone and stay gone ─────────────────────

test('the three dead Train components are deleted', () => {
  for (const name of ['SmallToolRow', 'FeatureToolCard', 'SectionHeader']) {
    assert.equal(
      existsSync(path.join(root, `src/components/train/${name}.jsx`)),
      false,
      `${name}.jsx must be removed`
    );
  }
});

test('nothing imports the removed components, statically or dynamically', () => {
  for (const name of ['SmallToolRow', 'FeatureToolCard', 'SectionHeader']) {
    assert.doesNotMatch(
      ALL_SOURCE,
      new RegExp(`(import[^\\n]*\\b${name}\\b|from\\s+['"][^'"]*${name}['"]|import\\([^)]*${name})`),
      `${name} must have no remaining import`
    );
  }
});

test('the components they shared are still present, because they still have callers', () => {
  // GradientIconTile lost one caller (SmallToolRow) but keeps another
  // (ToolIntroLayout → PracticeShell), so it must NOT have been swept up.
  for (const name of ['GradientIconTile', 'ToolIntroLayout']) {
    assert.ok(existsSync(path.join(root, `src/components/train/${name}.jsx`)), `${name} is still in use`);
  }
  assert.match(src('components/train/ToolIntroLayout.jsx'), /GradientIconTile/);
  assert.match(src('components/practice/PracticeShell.jsx'), /ToolIntroLayout/);
});

// ── 2. Translation cleanup on the redesigned pilot surfaces ────────────────

// A `hi ? 'x' : 'y'` whose branches are BCP-47 locale codes is a date-format
// selector, not translatable copy — those are allowed to remain.
const LOCALE_CODES = new Set(['hi-IN', 'en-IN', 'hi', 'en']);

// A CSS class list ('bg-brand-500 text-white') is not copy. Real copy has at
// least one capital letter or non-Latin script; class tokens are all lowercase
// kebab/utility syntax.
const isClassList = (v) => v.split(/\s+/).every((tok) => /^[a-z0-9:[\]/._-]+$/.test(tok));

function inlineCopyLiterals(source) {
  return [...source.matchAll(/(?:hi|language === 'hi') \? (['"])([^'"]*)\1/g)]
    .map((m) => m[2])
    .filter((v) => v && !LOCALE_CODES.has(v) && !isClassList(v));
}

test('the redesigned pilot surfaces carry no inline bilingual copy', () => {
  const surfaces = {
    'pages/Dashboard.jsx': 'Home',
    'pages/PlaybookPage.jsx': 'Playbook',
    'pages/ChatPage.jsx': 'Coach',
    'pages/OnboardingPage.jsx': 'Onboarding',
    'pages/StartingProfilePage.jsx': 'Performance Profile',
    'pages/MindJournalPage.jsx': 'Mind Journal',
    'pages/TrainPage.jsx': 'Train',
    'components/Navbar.jsx': 'the app navbar',
  };
  for (const [file, label] of Object.entries(surfaces)) {
    assert.deepEqual(
      inlineCopyLiterals(src(file)),
      [],
      `${label} must translate through translations.js, not inline literals`
    );
  }
});

test('language-conditional copy on those surfaces is never a multi-line ternary either', () => {
  for (const file of ['pages/Dashboard.jsx', 'pages/PlaybookPage.jsx', 'components/Navbar.jsx']) {
    const s = src(file);
    assert.doesNotMatch(s, /\{hi\s*\n\s*\?/, `${file} must not carry a multi-line bilingual ternary`);
    // `language === 'hi' ? …` may still pick a CSS class, but never copy.
    assert.deepEqual(inlineCopyLiterals(s), [], `${file} must not branch on language for copy`);
  }
});

// ── 3. Key parity for every namespace those surfaces read ──────────────────

function namespaceBlock(lang, name) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translations.indexOf(`${name}: {`, langIdx);
  assert.ok(start !== -1, `missing ${name} namespace in ${lang}`);
  return translations.slice(start, translations.indexOf('\n    },', start));
}
const keysOf = (block) => [...block.matchAll(/^\s{6}([a-zA-Z]+):/gm)].map((m) => m[1]).sort();

test('every pilot-surface namespace has identical keys in English and Hindi', () => {
  for (const ns of ['home', 'playbook', 'chat', 'nav', 'mindJournal', 'startingProfile', 'trainPage', 'onboarding']) {
    assert.deepEqual(
      keysOf(namespaceBlock('en', ns)),
      keysOf(namespaceBlock('hi', ns)),
      `${ns} keys must match across languages`
    );
  }
});

test('the Hindi side of each pilot namespace is actually written in Hindi', () => {
  for (const ns of ['home', 'playbook', 'mindJournal']) {
    assert.match(namespaceBlock('hi', ns), /[ऀ-ॿ]/, `${ns} must carry Devanagari copy`);
  }
});

test('the keys Stage I introduced exist in both languages', () => {
  const added = {
    playbook: ['title', 'learningHeading', 'thisWeek', 'focusCardsHeading', 'cuesHeading', 'reflectionsHeading', 'journalDesc'],
    home: ['journalTitle', 'journalDesc', 'journalHint'],
    nav: ['language', 'theme', 'themeAuto', 'themeLight', 'themeDark'],
    chat: ['retryBtn'],
    mindJournal: ['retry'],
  };
  for (const [ns, keys] of Object.entries(added)) {
    for (const lang of ['en', 'hi']) {
      const block = namespaceBlock(lang, ns);
      for (const k of keys) {
        assert.match(block, new RegExp(`^\\s{6}${k}:`, 'm'), `${lang}.${ns}.${k} is missing`);
      }
    }
  }
});

// ── 4. Theme tokens are complete across all three blocks ───────────────────

test('the warn and accent tokens are defined in the light block and BOTH dark blocks', () => {
  // A token missing from one dark block is the exact class of bug Stage A
  // shipped with --border-hairline, so all three definitions are pinned.
  for (const token of ['--status-warn', '--surface-warn', '--border-warn', '--accent-amber']) {
    assert.equal(
      (css.match(new RegExp(`${token}:`, 'g')) || []).length,
      3,
      `${token} must be defined exactly three times (light, media dark, [data-theme] dark)`
    );
  }
  const mediaDark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('[data-theme="dark"]'));
  const attrDark = css.slice(css.indexOf('[data-theme="dark"]'));
  for (const token of ['--status-warn', '--surface-warn', '--border-warn', '--accent-amber']) {
    assert.match(mediaDark, new RegExp(`${token}:`), `${token} missing from the media dark block`);
    assert.match(attrDark, new RegExp(`${token}:`), `${token} missing from the [data-theme] dark block`);
  }
});

test('the amber accent is consumed as a token, never as the raw hex, on redesigned surfaces', () => {
  for (const file of ['pages/ChatPage.jsx', 'pages/PlaybookPage.jsx', 'pages/Dashboard.jsx']) {
    assert.doesNotMatch(src(file), /#D98B2B/i, `${file} must use var(--accent-amber)`);
    assert.match(src(file), /var\(--accent-amber\)/, `${file} must consume the accent token`);
  }
});

// ── 5. The profile hook keeps its remount fix ──────────────────────────────

test('useStartingProfile re-arms its mounted ref on mount, not only on cleanup', () => {
  const hook = src('hooks/useStartingProfile.js');
  assert.match(
    hook,
    /useEffect\(\(\) => \{\s*mounted\.current = true;\s*return \(\) => \{ mounted\.current = false; \};\s*\}, \[\]\);/,
    'the mounted ref must be set true in the effect body and false only in cleanup'
  );
  // Unmount safety is unchanged.
  assert.match(hook, /mounted\.current = false;/);
  // And a stale response can no longer win.
  assert.match(hook, /const seq = \+\+loadSeq\.current;/);
  assert.match(hook, /seq === loadSeq\.current/);
});

test('the hook still talks to exactly the four profile endpoints', () => {
  const paths = [...src('hooks/useStartingProfile.js').matchAll(/apiFetch\('([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(paths, [
    '/api/profile/confirm', '/api/profile/current-focus',
    '/api/profile/start-chat', '/api/profile/starting',
  ]);
});

// ── 6. Shared SaveStatus, one implementation ───────────────────────────────

test('SaveStatus lives in the shared ui folder and has exactly one implementation', () => {
  assert.ok(existsSync(path.join(root, 'src/components/ui/SaveStatus.jsx')));
  assert.equal(existsSync(path.join(root, 'src/components/onboarding/SaveStatus.jsx')), false);
  const definitions = ALL_FILES.filter((f) => /SaveStatus\.jsx$/.test(f));
  assert.equal(definitions.length, 1, 'only one SaveStatus component may exist');
});

test('both onboarding and Mind Journal consume that one component', () => {
  assert.match(src('pages/OnboardingPage.jsx'), /from '\.\.\/components\/ui\/SaveStatus'/);
  assert.match(src('pages/MindJournalPage.jsx'), /SaveStatus/);
  assert.match(src('pages/MindJournalPage.jsx'), /<SaveStatus/);
});

// ── 7. Page-level headings ─────────────────────────────────────────────────

test('the shared PageHeader renders its title as the page heading', () => {
  const header = src('components/ui/PageHeader.jsx');
  assert.match(header, /<h1 className="text-heading font-bold text-ink flex-1">\{title\}<\/h1>/);
});

test('Home and Coach carry a real page heading rather than a styled paragraph', () => {
  assert.match(src('pages/Dashboard.jsx'), /<h1 className="text-2xl font-black text-ink leading-tight">/);
  assert.match(src('pages/ChatPage.jsx'), /<h1 className="font-semibold text-sm leading-none text-ink">/);
});

// ── 8. Mind Journal control accessibility ──────────────────────────────────

test('the Mind Journal context checkbox is themed and focus-visible', () => {
  // The control moved off the Mind Journal landing screen onto its own
  // Arjun-context screen; the checkbox itself is unchanged.
  const page = src('pages/mindJournal/ArjunContextPage.jsx');
  const idx = page.indexOf('type="checkbox"');
  assert.ok(idx !== -1);
  // From the wrapping <label> (which owns the tap target) through the input.
  const start = page.lastIndexOf('<label', idx);
  const block = page.slice(start, page.indexOf('/>', idx) + 2);
  assert.match(block, /accentColor: 'var\(--brand-primary\)'/, 'checked state must use the design system colour');
  assert.match(block, /focus-visible:ring-2/, 'keyboard focus must be visible');
  assert.match(block, /min-h-\[44px\]/, 'the label row must stay a comfortable target');
  // Behaviour untouched.
  assert.match(block, /checked=\{contextEnabled\}/);
  assert.match(block, /onChange=\{handleContextToggle\}/);
});

// ── 9. The power line is no longer truncated ───────────────────────────────

test('the Focus Card power line wraps instead of truncating', () => {
  const playbook = src('pages/PlaybookPage.jsx');
  const idx = playbook.indexOf('c.powerLine');
  const line = playbook.slice(playbook.lastIndexOf('<p', idx), idx + 40);
  assert.doesNotMatch(line, /\btruncate\b/, 'the athlete-authored power line must not be cut off');
  assert.match(line, /break-words/);
});

// ── 10. Change Focus keyboard/action accessibility ─────────────────────────

test('the Change Focus action area is sticky inside the sheet, without moving in the DOM', () => {
  const dialog = src('components/profile/ChangeFocusDialog.jsx');
  assert.match(dialog, /sticky bottom-0/, 'Save must stay on screen on a short viewport');
  // Sticky only works against a scroll container — the panel still is one.
  assert.match(dialog, /overflow-y-auto/);
  // Focus trap, Escape and focus-return are untouched by the sticky wrapper.
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /e\.key === 'Escape'/);
  assert.match(dialog, /e\.key !== 'Tab'/);
});

test('revealing the custom field scrolls it clear of the sticky action area', () => {
  const dialog = src('components/profile/ChangeFocusDialog.jsx');
  assert.match(dialog, /customRef\.current\?\.scrollIntoView\?\.\(\{ block: 'end' \}\)/);
  assert.match(dialog, /scroll-mb-36/, 'the field must reserve room for the sticky action area');
});

test('the Change Focus primary action keeps the 54px standard and duplicate-submit guard', () => {
  const dialog = src('components/profile/ChangeFocusDialog.jsx');
  // No min-h override shrinking .btn-primary below its own 54px. Checked per
  // className, so an unrelated 44px target elsewhere in the file cannot mask it.
  const primaryClassNames = [...dialog.matchAll(/className="([^"]*btn-primary[^"]*)"/g)].map((m) => m[1]);
  assert.ok(primaryClassNames.length >= 2, 'both the save and confirm actions use .btn-primary');
  for (const cn of primaryClassNames) {
    assert.doesNotMatch(cn, /min-h-\[\d+px\]/, `.btn-primary must keep its own 54px: ${cn}`);
  }
  assert.match(dialog, /if \(!valid \|\| saving\) return;/, 'a second submit while saving must be ignored');
  assert.match(dialog, /disabled=\{saving\}/, 'the confirm action disables itself while the save is in flight');
});
