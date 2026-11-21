import assert from 'node:assert/strict';
import test from 'node:test';
import { subscriptionPrice } from './subscription-price.ts';
import { SUBSCRIPTION_CONFIG } from './subscription-config.ts';
import { createSubscriptionController } from './subscription-controller.ts';

test('missing, failed or incomplete API prices retain the verified Valheim prices', () => {
  for (const fallback of Object.values(SUBSCRIPTION_CONFIG.premiumPrices)) {
    for (const live of [undefined, { price: 12 }, { currency: 'EUR' }, { price: NaN, currency: 'USD' }]) {
      assert.deepEqual(subscriptionPrice(live, fallback), fallback);
    }
    assert.deepEqual(subscriptionPrice({ price: 3.5, currency: 'EUR' }, fallback), { price: 3.5, currency: 'EUR' });
    assert.deepEqual(subscriptionPrice({ price: 0, currency: 'USD' }, fallback), { price: 0, currency: 'USD' });
  }
});

test('a WoW subscription in the shared store cannot grant Valheim Premium or open its checkout', async () => {
  const identity = { uuid: 'valheim-test-user', extensionId: 'valheim-test-app', name: 'Test' };
  const opened = [];
  const controller = createSubscriptionController({
    storeToken: 'test-store', packageIds: Object.values(SUBSCRIPTION_CONFIG.premiumPackageIds),
    getIdentity: async () => identity, getToken: async () => 'test-token',
    request: async url => url.includes('/packages/')
      ? [7793904, 7797990, 7813740, 7813741].map(id => ({ id, type: 'subscription' }))
      : [{ userId: identity.uuid, packageId: 7797990, state: 'ACTIVE' }],
    openCheckout: url => opened.push(url),
  });
  await controller.refresh();
  assert.equal(controller.getSnapshot().premium, false);
  assert.deepEqual(controller.getSnapshot().packages.map(p => p.id), [7813740, 7813741]);
  await controller.purchase(7797990);
  assert.equal(opened.length, 0);
  await controller.purchase(7813741);
  assert.match(opened[0], /\/checkout\/test-store\/7813741\?/);
});
