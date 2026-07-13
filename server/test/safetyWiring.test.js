// Wiring coverage for the deterministic pre-LLM safety screen (PR-5).
// Route handlers can't be introspected below the middleware level, so —
// matching the repo's established pattern — these are source-level
// assertions over every file that can call Anthropic, backed by the pure
// behavioral tests in safetyScreen.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const routesDir = path.join(__dirname, '../src/routes');
const read = (f) => readFileSync(path.join(routesDir, f), 'utf8');

// ── Coverage manifest: every Anthropic-calling route file ────────────────────
// screened: athlete-authored (or athlete-derived) text is screened before
//           every messages.create/stream in the file.
// exempt:   the file's Anthropic input contains no athlete-authored text —
//           documented, not assumed.

const SCREENED_FILES = [
  { file: 'chat.js', note: 'POST /message (direct input, SSE) + wizard specificMoment (direct input, JSON); memory extraction only runs after a non-flagged turn' },
  { file: 'debrief.js', note: 'legacy + structured free-text fields (direct input)' },
  { file: 'selfTalk.js', note: 'oldThought/situationText/etc (direct input); LLM safety_flag classifier retained as layer 2' },
  { file: 'bodyReset.js', note: 'feeling/context/focusWordUsed (direct input); client keyword check retained' },
  { file: 'profileIntro.js', note: 'user.name — the only athlete-authored field in that prompt' },
  { file: 'weeklyReports.js', note: 'derived stored messages — flagged ones filtered out of the block (no event: source already evented at send time)' },
  { file: 'sessions.js', note: 'derived transcript — athlete side screened; neutral date fallback on flag' },
];

const EXEMPT_FILES = [
  { file: 'mentalFitness.js', reason: 'Anthropic input is validated 1-5 integer scores only — no athlete-authored free text reaches the model (mood + six dims, parseInt-validated)' },
];

test('every Anthropic-calling route file is either screened or explicitly exempt', () => {
  const fs = require('node:fs');
  const allRouteFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
  const anthropicFiles = allRouteFiles.filter(f => read(f).includes("require('@anthropic-ai/sdk')"));
  const covered = new Set([...SCREENED_FILES, ...EXEMPT_FILES].map(e => e.file));
  for (const f of anthropicFiles) {
    assert.ok(covered.has(f), `Anthropic-calling route file not in the coverage manifest: ${f}`);
  }
  // And the manifest doesn't drift: everything listed really imports the SDK.
  for (const f of covered) {
    assert.ok(anthropicFiles.includes(f), `manifest entry no longer imports Anthropic: ${f}`);
  }
});

test('screened files import the shared safety service and screen before their main Anthropic call', () => {
  for (const { file } of SCREENED_FILES) {
    const src = read(file);
    assert.match(src, /require\('\.\.\/services\/safety'\)/, `${file}: missing shared safety-service import`);
    const screenIdx = src.search(/screenSafety(Text|Fields)\(/);
    // chat.js defines the memory-extraction helper (its own messages.create)
    // ABOVE the /message handler in the file; extraction only ever runs
    // after a successful (i.e. non-flagged) stream, so the meaningful
    // ordering anchor for chat.js is the streaming call inside /message.
    const llmAnchor = file === 'chat.js' ? /messages\.stream\(/ : /messages\.(create|stream)\(/;
    const llmIdx = src.search(llmAnchor);
    assert.ok(screenIdx !== -1, `${file}: no screening call found`);
    assert.ok(llmIdx !== -1, `${file}: no Anthropic call found (manifest stale?)`);
    assert.ok(screenIdx < llmIdx, `${file}: screening must run before the main Anthropic call`);
  }
});

test('exempt file takes no athlete free text into its Anthropic prompt', () => {
  const src = read('mentalFitness.js');
  // The prompt is built exclusively from parseInt-validated scores.
  assert.match(src, /parseInt\(raw\[key\], 10\)/);
  assert.match(src, /Today's scores — Mood: \$\{scores\.mood\}/);
  // No screening needed — but if someone later adds free text here, this
  // documented exemption should be revisited.
  assert.doesNotMatch(src, /screenSafety/);
});

test('deterministic layer never persists athlete text: SafetyEvent writes carry no content fields', () => {
  const writer = readFileSync(path.join(__dirname, '../src/services/safety/recordSafetyEvent.js'), 'utf8');
  assert.match(writer, /data: \{ userId, surface, triggerType \}/);
  // Strip comments (which legitimately *explain* that no content is stored)
  // before asserting that no code path passes content-like fields.
  const codeOnly = writer.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(codeOnly, /content|snippet|excerpt|summary:/);
});

test('prompt-level safety instructions remain intact as the second layer', () => {
  const chat = read('chat.js');
  assert.match(chat, /## Crisis detection and emotional safety/);
  assert.match(chat, /## Injury and physical safety/);
  assert.match(chat, /Safety overrides everything/);
});

test('chat SSE safety path preserves the surface protocol (d + end events) and persists only fixed guidance', () => {
  const chat = read('chat.js');
  const block = chat.slice(chat.indexOf('Deterministic pre-LLM safety screen'), chat.indexOf('// Fetch user profile for the system prompt'));
  assert.match(block, /t: 'd', c: guidance/);
  assert.match(block, /t: 'end'/);
  assert.match(block, /role: 'assistant', content: guidance/); // fixed copy, never `content` from the athlete
  assert.doesNotMatch(block, /content: content/); // the athlete's message is never persisted on this path
});
