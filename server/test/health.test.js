const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, stopTestServer } = require('./helpers/testServer');

let server;
let baseUrl;

test.before(async () => {
  ({ server, baseUrl } = await startTestServer());
});

test.after(async () => {
  await stopTestServer(server);
});

test('GET /api/health returns a successful status and expected shape', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.app, 'Arjun API');
});
