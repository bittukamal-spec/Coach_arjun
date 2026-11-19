// Premium layer (Nov 2026, docs/PREMIUM-PLAN.md): Teer the mascot + photo scenes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const pub = (p) => new URL(`../public/${p}`, import.meta.url);

test('every Teer pose and every scene ships as a small webp', () => {
  for (const pose of ['idle', 'wave', 'think', 'breathe', 'point', 'cheer', 'notes', 'head']) {
    const f = pub(`brand/teer/teer-${pose}.webp`);
    assert.ok(existsSync(f), pose);
    assert.ok(statSync(f).size < 40_000, `${pose} stays under 40 KB`);
  }
  for (const scene of ['track-sunrise', 'court', 'lake', 'stadium-dusk']) {
    for (const suffix of ['', '-sm']) {
      const f = pub(`backgrounds/bg-${scene}${suffix}.webp`);
      assert.ok(existsSync(f), scene + suffix);
      assert.ok(statSync(f).size < 120_000, `${scene}${suffix} stays under 120 KB`);
    }
  }
});

test('Teer is decorative by default and only moves for people who allow motion', () => {
  const teer = src('components/visuals/Teer.jsx');
  assert.match(teer, /alt = ''/);
  assert.match(teer, /motion-safe:animate-float/);
  assert.doesNotMatch(teer, /'animate-/, 'no animation without motion-safe');
});

test('photo scenes are decorative and dimmed on the dark theme', () => {
  assert.match(src('components/visuals/SceneBackdrop.jsx'), /aria-hidden="true"/);
  const css = src('index.css');
  assert.match(css, /\[data-theme="dark"\] \.scene-photo/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\) \.scene-photo/);
});

test('Teer and the scenes appear where the founder approved them', () => {
  assert.match(src('components/LaunchScreen.jsx'), /<Teer pose="wave"/);
  const landing = src('pages/LandingPage.jsx');
  assert.match(landing, /scene="track-sunrise"/);
  assert.match(landing, /scene="court"/);
  assert.match(landing, /<Teer pose="wave"/);
  assert.match(landing, /<Teer pose="notes"/);
  const reset = src('pages/BodyResetPage.jsx');
  assert.match(reset, /mascot="breathe"/);
  assert.match(reset, /scene="lake"/);
  assert.match(reset, /scene="stadium-dusk"/);
  assert.match(src('pages/ChatPage.jsx'), /<Teer pose="think"/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /\/brand\/teer\/teer-wave\.webp/);
});
