// Routines in Coach (Nov 2026): "Talk to Arjun" links a conversation to one
// saved routine; Arjun can offer an improved/new routine as a card
// (propose_routine) that the athlete saves with one tap.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const { validateProposeRoutine, PROPOSE_ROUTINE } = require('../src/services/coaching/coachingTools');
const { runBufferedToolLoop } = require('../src/services/coaching/bufferedToolLoop');
const { buildRoutineFocusSection, buildRoutineProposalEvent } = require('../src/services/coaching/routineFocus');

const NO_STATE = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };
const STEPS = ['Breathe out slowly and drop your shoulders', 'Set your stance', 'Watch the bowler\'s hand, say "Ball"'];

function stub(responses) {
  const calls = [];
  return { calls, client: { messages: { create: async (body) => { calls.push(body); return responses.shift() || responses[responses.length - 1]; } } } };
}
const tool = (name, input, id = 't1') => ({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'draft' }, { type: 'tool_use', id, name, input }] });
const text = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const run = (s) => runBufferedToolLoop({ anthropic: s.client, model: 'm', maxTokens: 800, system: 'sys', messages: [{ role: 'user', content: 'hi' }], coachingContext: NO_STATE });

test('validateProposeRoutine: 1-5 non-empty steps up to 120 chars; optional name/category', () => {
  assert.deepEqual(validateProposeRoutine({ steps: ['  a  b ', 'c'] }), { ok: true, proposal: { steps: ['a b', 'c'], name: null, category: null } });
  assert.equal(validateProposeRoutine({ steps: [] }).ok, false);
  assert.equal(validateProposeRoutine({ steps: Array(6).fill('x') }).ok, false);
  assert.equal(validateProposeRoutine({ steps: [''] }).ok, false);
  assert.equal(validateProposeRoutine({ steps: ['x'.repeat(121)] }).ok, false);
  assert.equal(validateProposeRoutine({ steps: ['x'], category: 'nope' }).ok, false);
  assert.equal(validateProposeRoutine({ steps: ['x'], name: 'n'.repeat(61) }).ok, false);
  assert.deepEqual(validateProposeRoutine({ steps: ['x'], name: ' Before I bat ', category: 'pressure_moment' }).proposal,
    { steps: ['x'], name: 'Before I bat', category: 'pressure_moment' });
});

test('the loop returns a staged routine proposal alongside the final text', async () => {
  const s = stub([tool(PROPOSE_ROUTINE, { steps: STEPS }), text('Try this sequence.')]);
  const out = await run(s);
  assert.equal(out.finalText, 'Try this sequence.');
  assert.deepEqual(out.routineProposal, { steps: STEPS, name: null, category: null });
  assert.equal(out.transition, null, 'not a coaching-state transition');
});

test('propose_routine is never blocked by, and never blocks, a staged coaching transition', async () => {
  const s = stub([
    tool('propose_barrier', { problemStatement: 'Freezes between balls', barrierHypothesis: 'Overthinking' }, 'a'),
    tool(PROPOSE_ROUTINE, { steps: STEPS }, 'b'),
    text('Here it is.'),
  ]);
  const out = await run(s);
  assert.equal(out.transition?.type, 'propose_barrier');
  assert.deepEqual(out.routineProposal.steps, STEPS);
});

test('an invalid proposal is rejected back to the model and nothing is returned', async () => {
  const s = stub([tool(PROPOSE_ROUTINE, { steps: [] }), text('OK.')]);
  const out = await run(s);
  assert.equal(out.routineProposal, null);
  const toolResult = s.calls[1].messages.at(-1).content[0];
  assert.equal(toolResult.is_error, true);
});

test('the internal note names the one linked routine and its steps; empty without one', () => {
  assert.equal(buildRoutineFocusSection(null), '');
  const note = buildRoutineFocusSection({ id: 'r1', name: 'After each ball while batting', category: 'repeated_moment', steps: [{ instruction: 'Reset your stance' }, { instruction: 'Watch it in' }] });
  assert.match(note, /Routine the athlete is discussing \(internal\)/);
  assert.match(note, /"After each ball while batting"/);
  assert.match(note, /1\. Reset your stance\n2\. Watch it in/);
  assert.match(note, /call propose_routine with the COMPLETE new step list/);
  assert.match(note, /Never say it has been saved/);
});

test('card payload: updates the linked routine, or creates a new one; unsafe steps are dropped', () => {
  const focus = { id: 'r1', name: 'After each ball while batting', category: 'repeated_moment' };
  assert.deepEqual(buildRoutineProposalEvent({ steps: STEPS, name: 'ignored', category: 'pressure_moment' }, focus), {
    t: 'routine_proposal',
    proposal: { mode: 'update', routineId: 'r1', routineName: focus.name, name: focus.name, category: 'repeated_moment', steps: STEPS },
  });
  assert.deepEqual(buildRoutineProposalEvent({ steps: STEPS, name: 'Before I bat', category: 'pressure_moment' }, null).proposal,
    { mode: 'create', routineId: null, routineName: null, name: 'Before I bat', category: 'pressure_moment', steps: STEPS });
  assert.equal(buildRoutineProposalEvent(null, focus), null);
  assert.equal(buildRoutineProposalEvent({ steps: ['I want to die'] }, focus), null);
});

test('chat wiring: routineId is linked only when owned; focus routine loaded per user; card sent after the reply is committed', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');
  assert.match(src, /routineId = null \} = req\.body/);
  assert.match(src, /prisma\.routine\.findFirst\(\{ where: \{ id: routineId, userId: req\.userId \}/);
  assert.match(src, /where: \{ id: chatSessionId, userId: req\.userId \},\s*data: \{ focusRoutineId: owned\.id \}/);
  assert.match(src, /where: \{ id: sessionRow\.focusRoutineId, userId: req\.userId \}/);
  const commitIdx = src.indexOf('committed = await commitCoachingTransition');
  const eventIdx = src.indexOf('buildRoutineProposalEvent(loop.routineProposal, focusRoutine)');
  assert.ok(commitIdx !== -1 && eventIdx > commitIdx, 'the card is only sent after the reply is saved');
  assert.doesNotMatch(src, /routine\.(create|update)\(/, 'Coach never writes routines itself');
});
