const test = require('node:test');
const assert = require('node:assert/strict');

// PR-6 fixed a pre-existing ERR_ERL_KEY_GEN_IPV6 warning that fired at
// module-construction time because aiLimiter's custom keyGenerator used
// `req.ip` directly instead of express-rate-limit's IPv6-safe helper. This
// re-requires the module fresh (bypassing the require cache) so the
// construction-time validation actually runs during the test, and asserts
// it no longer logs that warning.
test('constructing the rate limiters produces no ERR_ERL_KEY_GEN_IPV6 warning', () => {
  const modulePath = require.resolve('../src/middleware/rateLimits');
  delete require.cache[modulePath];

  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    require('../src/middleware/rateLimits');
  } finally {
    console.error = originalError;
  }

  const flat = logs.flat().map((a) => (a && a.stack) || String(a)).join('\n');
  assert.doesNotMatch(flat, /ERR_ERL_KEY_GEN_IPV6/);
});

test('unrelated limiter behavior (authLimiter, aiLimiter policy) is unchanged', () => {
  const { authLimiter, aiLimiter, founderLoginLimiter } = require('../src/middleware/rateLimits');
  // Limiters are Express middleware functions — presence and arity are the
  // only externally observable contract without making real requests.
  assert.equal(typeof authLimiter, 'function');
  assert.equal(typeof aiLimiter, 'function');
  assert.equal(typeof founderLoginLimiter, 'function');

  const src = require('node:fs').readFileSync(
    require.resolve('../src/middleware/rateLimits'), 'utf8'
  );
  // authLimiter's policy (5 attempts / 15 minutes) must be untouched.
  assert.match(src, /windowMs:\s*15\s*\*\s*60\s*\*\s*1000,\s*\n\s*limit:\s*5,/);
  // aiLimiter's policy (30 requests / 1 minute) must be untouched.
  assert.match(src, /windowMs:\s*60\s*\*\s*1000,\s*\n\s*limit:\s*30,/);
});

test('aiLimiter keyGenerator falls back to the IPv6-safe helper, not raw req.ip', () => {
  const src = require('node:fs').readFileSync(
    require.resolve('../src/middleware/rateLimits'), 'utf8'
  );
  assert.match(src, /keyGenerator:\s*\(req\)\s*=>\s*req\.userId\s*\|\|\s*ipKeyGenerator\(req\.ip\)/);
});
