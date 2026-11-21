import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalPriceStore } from './regional-prices.ts';
import { createRegionalPrices } from '../../../supabase/functions/valheim-regional-prices/handler.ts';

const ids = [7813740, 7815465, 7813741];
const catalog = amounts => ({ data: ids.map((id, i) => ({ id, type: 'subscription', total_price: amounts[i], currency: 'USD' })) });

test('separate customer IPs are sent to Tebex with server-only credentials; only Valheim quotes are returned', async () => {
  const calls = [];
  const handler = createRegionalPrices({ publicToken: 'public', privateKey: 'private', fetch: async (url, init) => {
    calls.push({ url, init });
    return Response.json(catalog(url.searchParams.get('ipAddress') === '203.0.113.1' ? [2.5, 6.5, 20] : [4.99, 12.99, 39.99]));
  } });
  for (const [ip, amount] of [['203.0.113.1', 2.5], ['198.51.100.2', 4.99]]) {
    const result = await handler(new Request('https://example.com/?ipAddress=8.8.8.8', { headers: { 'cf-connecting-ip': ip } }));
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await result.json(), { data: ids.map((id, i) => ({ id, price: (amount === 2.5 ? [2.5, 6.5, 20] : [4.99, 12.99, 39.99])[i], currency: 'USD' })) });
    assert.equal(calls.at(-1).url.searchParams.get('ipAddress'), ip);
    assert.equal(calls.at(-1).init.headers.Authorization, `Basic ${btoa('public:private')}`);
  }
});

test('missing client IP and upstream failures never return fabricated default prices or secret errors', async () => {
  const handler = createRegionalPrices({ publicToken: 'public', privateKey: 'private', fetch: async () => { throw new Error('private'); } });
  assert.equal((await handler(new Request('https://example.com/?ipAddress=8.8.8.8'))).status, 503);
  const result = await handler(new Request('https://example.com', { headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } }));
  assert.equal(result.status, 502);
  assert.equal((await result.text()).includes('private'), false);
});

test('quote refresh deduplicates requests, preserves zero prices, and clears stale quotes after failure', async () => {
  let fail = false;
  let calls = 0;
  const store = createRegionalPriceStore(async () => {
    calls++;
    if (fail) throw new Error('unavailable');
    return { data: ids.map((id, i) => ({ id, price: [0, 6.5, 20][i], currency: 'USD' })) };
  }, ids);
  await Promise.all([store.refresh(), store.refresh()]);
  assert.equal(calls, 1);
  assert.equal(store.getSnapshot().prices[0].price, 0);
  await store.refresh();
  assert.equal(calls, 1);
  fail = true;
  await store.refresh(true);
  assert.deepEqual(store.getSnapshot(), { status: 'error', prices: [] });
});
