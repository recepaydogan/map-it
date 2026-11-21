import assert from 'node:assert/strict';
import test from 'node:test';
import { createSubscriberSync } from './handler.ts';

const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const token = `header.${Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')}.signature`;
const request = (extra = {}, bearer = token) => new Request('https://local/sync', {
  method: 'POST', headers: { Authorization: `Bearer ${bearer}` }, body: JSON.stringify({ extensionId: 'registered-app', ...extra }),
});
const row = (state = 'ACTIVE', packageId = 7793904) => ({ userId: user, packageId, state, recurringPaymentId: 'tbx-r-test' });
function harness({ records = [row()], verify = 200, upstream = 200, saveFails = false } = {}) {
  const writes = [], calls = [];
  const handler = createSubscriberSync({
    storeToken: 'fixed-store', packageIds: new Set([7793904, 7797990, 7797992]), singlePackageIds: new Set([7797992]),
    fetch: async (url, options) => {
      calls.push({ url, options });
      return url.includes('/verify?') ? new Response(null, { status: verify }) : Response.json(records, { status: upstream });
    },
    save: async (...args) => { if (saveFails) throw new Error('offline'); writes.push(args); },
  });
  return { handler, writes, calls };
}
test('rejects unverified tokens and never writes client-supplied claims or statuses', async () => {
  const denied = harness({ verify: 401 });
  assert.equal((await denied.handler(request())).status, 401);
  assert.equal(denied.writes.length, 0);
  assert.equal(denied.calls.length, 1);
  const h = harness();
  assert.equal((await h.handler(request({ userId: other, status: 'refunded', email: 'fake@example.com', storeToken: 'another-store' }))).status, 204);
  assert.equal(h.writes[0][0], user);
  assert.equal(h.writes[0][2][0].status, 'active');
  assert.ok(!JSON.stringify(h.writes).includes('fake@example.com'));
  assert.ok(h.calls[1].url.includes('/fixed-store?'));
});
test('preserves lifecycle states and identifies lifetime without trusting client values', async () => {
  for (const [state, expected] of [['PENDING_CANCELLATION', 'pending_cancellation'], ['OVERDUE', 'overdue'], ['EXPIRED', 'expired'], ['CANCELLED', 'cancelled'], ['NEW_STATE', 'unknown']]) {
    const h = harness({ records: [row(state), row('ACTIVE', 7797992), row('ACTIVE', 123)] });
    assert.equal((await h.handler(request())).status, 204);
    assert.deepEqual(h.writes[0][2].map(r => [r.status, r.billing_type]), [[expected, 'recurring'], ['active', 'one_time']]);
    assert.equal(h.writes[0][2][0].overwolf_state, state);
  }
});
test('only a successful empty response reconciles missing subscriptions', async () => {
  const h = harness({ records: [] });
  assert.equal((await h.handler(request())).status, 204);
  assert.deepEqual(h.writes[0][2], []);
  for (const config of [{ records: null }, { records: [{ ...row(), userId: other }] }, { upstream: 500 }, { verify: 500 }]) {
    const failed = harness(config);
    assert.equal((await failed.handler(request())).status, 502);
    assert.equal(failed.writes.length, 0);
  }
});
test('old ended agreement cannot override a new active agreement in the same snapshot', async () => {
  for (const records of [[row('EXPIRED'), row('ACTIVE')], [row('ACTIVE'), row('EXPIRED')]]) {
    const h = harness({ records });
    await h.handler(request());
    assert.equal(h.writes[0][2].length, 1);
    assert.equal(h.writes[0][2][0].status, 'active');
  }
});
test('CORS preflight and storage errors are handled without leaking data', async () => {
  const h = harness({ saveFails: true });
  assert.equal((await h.handler(new Request('https://local', { method: 'OPTIONS' }))).status, 204);
  assert.equal((await h.handler(request())).status, 503);
  assert.equal((await h.handler(request({}, 'invalid'))).status, 401);
});
