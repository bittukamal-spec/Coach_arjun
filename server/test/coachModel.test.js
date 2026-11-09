// Coach-only model settings (Nov 2026): COACH_MODEL / COACH_EFFORT /
// COACH_REFUSAL_FALLBACK, prompt-cached system blocks, and that the buffered
// loop forwards the extra body fields and request options on every call.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  coachRequestSettings, resolveCoachModel, buildCoachSystem, DEFAULT_MODEL, FALLBACK_BETA,
  LEGACY_MAX_TOKENS, THINKING_MAX_TOKENS,
} = require('../src/services/coaching/coachModel');
const { runBufferedToolLoop, stripThinking } = require('../src/services/coaching/bufferedToolLoop');

test('no settings → unchanged behaviour: ANTHROPIC_MODEL or Haiku 4.5, no extra fields', () => {
  assert.equal(resolveCoachModel({}), DEFAULT_MODEL);
  assert.equal(resolveCoachModel({ ANTHROPIC_MODEL: 'x-model' }), 'x-model');
  const s = coachRequestSettings({});
  assert.deepEqual(s, { model: DEFAULT_MODEL, maxTokens: LEGACY_MAX_TOKENS, body: {}, options: undefined });
});

test('COACH_MODEL wins over ANTHROPIC_MODEL, for Coach only', () => {
  assert.equal(resolveCoachModel({ ANTHROPIC_MODEL: 'claude-haiku-4-5', COACH_MODEL: 'claude-sonnet-5-5' }), 'claude-sonnet-5-5');
});

test('Sonnet 5.5: low effort, room for thinking, refusal fallback with its beta header', () => {
  const s = coachRequestSettings({ COACH_MODEL: 'claude-sonnet-5-5' });
  assert.equal(s.maxTokens, THINKING_MAX_TOKENS);
  assert.deepEqual(s.body, { output_config: { effort: 'low' }, fallbacks: 'default' });
  assert.deepEqual(s.options, { headers: { 'anthropic-beta': FALLBACK_BETA } });
});

test('Haiku 5.5: low effort, no fallback (not supported on Haiku)', () => {
  const s = coachRequestSettings({ COACH_MODEL: 'claude-haiku-5-5' });
  assert.deepEqual(s.body, { output_config: { effort: 'low' } });
  assert.equal(s.options, undefined);
});

test('Haiku 4.5 never gets effort (it rejects it)', () => {
  for (const m of ['claude-haiku-4-5', 'claude-haiku-4-5-20251001']) {
    assert.deepEqual(coachRequestSettings({ COACH_MODEL: m }).body, {}, m);
  }
});

test('COACH_EFFORT overrides; "none" or junk sends no effort; fallback can be switched off', () => {
  assert.deepEqual(coachRequestSettings({ COACH_MODEL: 'claude-sonnet-5-5', COACH_EFFORT: 'medium' }).body.output_config, { effort: 'medium' });
  assert.equal(coachRequestSettings({ COACH_MODEL: 'claude-sonnet-5-5', COACH_EFFORT: 'none' }).body.output_config, undefined);
  assert.equal(coachRequestSettings({ COACH_MODEL: 'claude-sonnet-5-5', COACH_EFFORT: 'turbo' }).body.output_config, undefined);
  const off = coachRequestSettings({ COACH_MODEL: 'claude-sonnet-5-5', COACH_REFUSAL_FALLBACK: 'off' });
  assert.equal(off.body.fallbacks, undefined);
  assert.equal(off.options, undefined);
});

test('system blocks: the stable prompt is cached, notes follow uncached, empty notes dropped', () => {
  assert.deepEqual(buildCoachSystem('STABLE', '\n\n## note'), [
    { type: 'text', text: 'STABLE', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: '## note' },
  ]);
  assert.equal(buildCoachSystem('STABLE', '').length, 1);
});

test('the buffered loop forwards body fields and request options on every model call', async () => {
  const calls = [];
  const replies = [
    { content: [{ type: 'thinking', thinking: '' }, { type: 'tool_use', id: 't1', name: 'unknown_tool', input: {} }], stop_reason: 'tool_use' },
    { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Koi baat nahi.' }], stop_reason: 'end_turn' },
  ];
  const anthropic = { messages: { create: async (body, options) => { calls.push({ body, options }); return replies.shift(); } } };
  const out = await runBufferedToolLoop({
    anthropic,
    model: 'claude-sonnet-5-5',
    maxTokens: THINKING_MAX_TOKENS,
    system: buildCoachSystem('STABLE'),
    messages: [{ role: 'user', content: 'matlab?' }],
    coachingContext: null,
    requestBody: { output_config: { effort: 'low' }, fallbacks: 'default' },
    requestOptions: { headers: { 'anthropic-beta': FALLBACK_BETA } },
  });
  assert.equal(out.finalText, 'Koi baat nahi.', 'thinking blocks are ignored; only text reaches the athlete');
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(c.body.model, 'claude-sonnet-5-5');
    assert.deepEqual(c.body.output_config, { effort: 'low' });
    assert.equal(c.body.fallbacks, 'default');
    assert.deepEqual(c.options, { headers: { 'anthropic-beta': FALLBACK_BETA } });
  }
  // The intermediate assistant turn is passed back whole (thinking included).
  assert.equal(calls[1].body.messages[1].content[0].type, 'thinking');
});

test('stripThinking removes thinking blocks only, leaving text, tool_use and string turns intact', () => {
  const msgs = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: [{ type: 'thinking', thinking: '' }, { type: 'redacted_thinking', data: 'x' }, { type: 'tool_use', id: 't', name: 'n', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: '{}' }] },
  ];
  const out = stripThinking(msgs);
  assert.equal(out[0].content, 'hi');
  assert.deepEqual(out[1].content.map(b => b.type), ['tool_use']);
  assert.deepEqual(out[2], msgs[2]);
  assert.equal(msgs[1].content.length, 3, 'input not mutated');
});
