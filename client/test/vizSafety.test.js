// Source checks for VisualizationPage's handling of the wizard's server-side
// safety response (PR-5). Same node:test source-assertion pattern as the
// other client tests — no new dependency.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../src/pages/VisualizationPage.jsx'), 'utf8');

test('VisualizationPage: handles the safetyFlag response instead of falling back to a generic script', () => {
  assert.match(src, /data\.safetyFlag === 'needs_support'/);
  assert.match(src, /setSafetyMsg\(data\.message\)/);
  // The safety branch must run before the normal script branch so guidance
  // is never silently replaced by a fallback visualization.
  const safetyIdx = src.indexOf("data.safetyFlag === 'needs_support'");
  const scriptIdx = src.indexOf('data.lines?.length > 0');
  assert.ok(safetyIdx !== -1 && safetyIdx < scriptIdx);
});

test('VisualizationPage: safety screen renders helplines and a way back', () => {
  assert.match(src, /import HelplineList from '\.\.\/components\/HelplineList'/);
  // lastIndexOf: an earlier `if (screen === 'entry')` exists in the back-
  // button handler; the render branch is the last occurrence.
  const screen = src.slice(src.indexOf('if (safetyMsg)'), src.lastIndexOf("if (screen === 'entry')"));
  assert.match(screen, /<HelplineList \/>/);
  assert.match(screen, /navigate\('\/train'\)/);
});
