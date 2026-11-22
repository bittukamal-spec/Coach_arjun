// Hook fix 4: per-kind reminder switches in Settings (shown only while
// notifications are on), and the service worker opens only allowed screens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const account = readFileSync(new URL('../src/pages/AccountPage.jsx', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../src/hooks/usePushNotifications.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../src/sw.js', import.meta.url), 'utf8');

test('Settings shows match / rematch / weekly switches only when notifications are on', () => {
  assert.match(account, /push\.status === 'enabled' && tpush\.kinds/);
  assert.match(account, /\['match', 'rematch', 'weekly'\]/);
  assert.match(account, /push\.setKind\(key, !on\)/);
  assert.match(hook, /body: JSON\.stringify\(\{ \[key\]: value \}\)/);
});

test('notification taps open only allowed screens', () => {
  assert.match(sw, /ALLOWED_NOTIFICATION_ROUTES = \['\/mental-rep', '\/dashboard', '\/mind-challenge', '\/weekly-reviews'\]/);
});
