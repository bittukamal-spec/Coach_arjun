// "Start fresh" (Nov 2026). sessions.js and chat.js use a module-level
// Prisma client, so — like chatBufferedWiring.test.js — these are
// source-text checks of the wiring that matters.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const read = (f) => readFileSync(path.join(__dirname, '..', f), 'utf8');
const sessionsSrc = read('src/routes/sessions.js');
const chatSrc = read('src/routes/chat.js');
const schema = read('prisma/schema.prisma');

test('ChatSession gets an optional freshStartAt (additive)', () => {
  const model = schema.slice(schema.indexOf('model ChatSession {'), schema.indexOf('}', schema.indexOf('model ChatSession {')));
  assert.match(model, /freshStartAt DateTime\?/);
});

test('POST /:id/fresh-start: authenticated, owner-only, main + non-archived only, sets the timestamp, deletes nothing', () => {
  const start = sessionsSrc.indexOf("router.post('/:id/fresh-start'");
  assert.ok(start !== -1, 'route exists');
  assert.ok(start < sessionsSrc.indexOf("router.post('/:id/end'"), 'declared with the other /:id routes');
  const block = sessionsSrc.slice(start, sessionsSrc.indexOf('\n});', start));
  assert.match(block, /authenticate/);
  assert.match(block, /session\.userId !== req\.userId/);
  assert.match(block, /session\.mode !== 'main'/);
  assert.match(block, /session\.status === 'archived'/);
  assert.match(block, /data: \{ freshStartAt: new Date\(\), focusRoutineId: null \}/);
  assert.doesNotMatch(block, /delete|deleteMany|messages\.create|Anthropic/);
});

test('the messages endpoint hides messages from before the fresh start', () => {
  const start = sessionsSrc.indexOf("router.get('/:id/messages'");
  const block = sessionsSrc.slice(start, sessionsSrc.indexOf('\n});', start));
  assert.match(block, /select: \{ userId: true, freshStartAt: true \}/);
  assert.match(block, /session\.freshStartAt && \(!from \|\| session\.freshStartAt > from\)/);
  assert.match(block, /msgWhere\.createdAt = \{ gte: from \}/);
});

test('Coach only reads messages from the fresh start on, scoped to the athlete\'s own session', () => {
  const start = chatSrc.indexOf('const historyWhere = chatSessionId');
  const block = chatSrc.slice(start, chatSrc.indexOf('const history = await prisma.message.findMany', start));
  assert.match(block, /where: \{ id: chatSessionId, userId: req\.userId \}/);
  assert.match(block, /historyWhere\.createdAt = \{ gte: sessionRow\.freshStartAt \}/);
});

test('the Weekly Review still reads the whole cycle (no freshStartAt filter there)', () => {
  assert.doesNotMatch(read('src/routes/weeklyReports.js'), /freshStartAt/);
});
