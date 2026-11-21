import assert from 'node:assert/strict';
import test from 'node:test';
import { GAME_CONFIG as config } from '../../game-config.ts';
import { createSubscriptionController } from './subscription-controller.ts';

test('quarterly checkout and entitlement stay isolated to the configured app', async () => {
  const identity = { uuid: 'quarterly-user', extensionId: 'quarterly-app', name: 'Test' };
  const opened = [];
  let records = [7815465, 7815468].map(packageId => ({ userId: identity.uuid, packageId, state: 'ACTIVE' }));
  const controller = createSubscriptionController({
    storeToken: 'test-store', packageIds: Object.values(config.premiumPackageIds),
    packageTiers: Object.fromEntries(Object.entries(config.premiumPackageIds).map(([key, id]) => [id, config.premiumPackageTiers[key]])),
    getIdentity: async () => identity, getToken: async () => 'test-token',
    request: async url => url.includes('/packages/')
      ? [7815469, ...[7815465, 7815468]].map(id => ({ id, type: 'subscription', base_price: 13.99, currency: 'USD' }))
      : records,
    openCheckout: url => opened.push(url),
  });
  await controller.refresh();
  assert.equal(controller.getSnapshot().premium, false);
  assert.deepEqual(controller.getSnapshot().packages.map(p => p.id), [7815469]);
  for (const id of [7815465, 7815468]) await controller.purchase(id);
  assert.equal(opened.length, 0);
  await controller.purchase(config.premiumPackageIds.quarterly);
  assert.equal(new URL(opened[0]).pathname, '/checkout/test-store/7815469');
  for (const state of ['ACTIVE', 'PENDING_CANCELLATION', 'EXPIRED', 'CANCELLED']) {
    records = [{ userId: identity.uuid, packageId: 7815469, state }];
    await controller.refresh();
    const active = state === 'ACTIVE' || state === 'PENDING_CANCELLATION';
    assert.equal(controller.getSnapshot().premium, active);
    assert.equal(controller.getSnapshot().activeSubscription?.packageId, active ? 7815469 : undefined);
  }
});
