import assert from "node:assert/strict";
import test from "node:test";
import { createSubscriptionController } from "./subscription-controller.ts";
import { createSubscriberLedgerSync } from "./subscriber-sync.ts";

const identity = { uuid: "overwolf-user-uuid", name: "Tester", extensionId: "registered-app-uid" };
const plan = { id: 7793904, name: "Premium", type: "subscription" };
function harness(overrides = {}) {
  const calls = [];
  const opened = [];
  let user = identity;
  let records = [];
  const deps = {
    storeToken: "public-token", packageIds: [plan.id], getIdentity: async () => user,
    getToken: async () => "session-token",
    request: async (url, token) => {
      calls.push({ url, token });
      return new URL(url).pathname.startsWith("/packages/") ? [plan] : records;
    },
    openCheckout: url => opened.push(url), ...overrides,
  };
  return { controller: createSubscriptionController(deps), calls, opened,
    setUser: next => { user = next; }, setRecords: next => { records = next; } };
}
const record = state => ({ userId: identity.uuid, packageId: plan.id, state });

test("the full check times out at 90 seconds and ignores late responses at every stage", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const stalledStage of ["identity", "token", "packages", "subscriptions", "identity-recheck"]) {
    let release;
    let stall = true;
    let identityCalls = 0;
    const writes = [];
    const blocked = new Promise(resolve => { release = resolve; });
    const h = harness({
      getIdentity: async () => {
        identityCalls++;
        const stage = identityCalls === 1 ? "identity" : "identity-recheck";
        return stall && stalledStage === stage ? blocked : identity;
      },
      getToken: async () => stall && stalledStage === "token" ? blocked : "token",
      request: async url => {
        const stage = url.includes("/packages/") ? "packages" : "subscriptions";
        if (stall && stalledStage === stage) return blocked;
        return stage === "packages" ? [plan] : [];
      },
      syncSubscriber: async (...args) => { writes.push(args); },
    });
    const pending = h.controller.refresh();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.controller.refresh(), pending);
    t.mock.timers.tick(89_999);
    assert.equal(h.controller.getSnapshot().status, "loading", stalledStage);
    t.mock.timers.tick(1);
    await pending;
    assert.equal(h.controller.getSnapshot().status, "error", stalledStage);
    assert.equal(h.controller.getSnapshot().error, "subscription-check-timeout");
    assert.equal(h.controller.getSnapshot().checking, false);
    assert.equal(h.controller.getSnapshot().premium, false);

    stall = false;
    await h.controller.refresh();
    const recovered = h.controller.getSnapshot();
    assert.equal(recovered.status, "ready");
    assert.equal(writes.length, 1);
    release(stalledStage === "subscriptions" ? [record("ACTIVE")]
      : stalledStage === "packages" ? [plan]
        : stalledStage === "token" ? "token" : identity);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.controller.getSnapshot(), recovered);
    assert.equal(writes.length, 1);
  }
});

test("the deadline covers sequential calls and releases a timed-out purchase for retry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let slow = true;
  const delayed = value => new Promise(resolve => setTimeout(() => resolve(value), 20_000));
  const h = harness({
    getIdentity: async () => {
      if (slow) { await delayed(null); await delayed(null); }
      return identity;
    },
    getToken: async () => slow ? delayed("token") : "token",
    request: async url => {
      const value = url.includes("/packages/") ? [plan] : [];
      return slow ? delayed(value) : value;
    },
  });
  const purchase = h.controller.purchase(plan.id);
  for (let step = 0; step < 4; step++) {
    t.mock.timers.tick(20_000);
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(h.controller.getSnapshot().checking, true);
  t.mock.timers.tick(10_000);
  await purchase;
  assert.equal(h.controller.getSnapshot().error, "subscription-check-timeout");
  assert.equal(h.opened.length, 0);
  slow = false;
  await h.controller.purchase(plan.id);
  assert.equal(h.opened.length, 1);
  t.mock.timers.tick(90_000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.controller.getSnapshot().status, "ready");
});

test("invalidation settles a hung refresh and its deadline cannot affect the next check", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness({ getIdentity: () => new Promise(() => {}) });
  const first = h.controller.refresh();
  t.mock.timers.tick(40_000);
  h.controller.invalidate();
  await first;
  const second = h.controller.refresh();
  t.mock.timers.tick(50_000);
  assert.equal(h.controller.getSnapshot().status, "loading");
  assert.equal(h.controller.getSnapshot().checking, true);
  t.mock.timers.tick(40_000);
  await second;
  assert.equal(h.controller.getSnapshot().status, "error");
});

test("only allowed packages belonging to the current user grant Premium", async () => {
  const h = harness();
  for (const entry of [record("EXPIRED"), record("CANCELLED"), record("UNKNOWN"),
    { ...record("ACTIVE"), userId: "another-user" }, { ...record("ACTIVE"), packageId: 1 }]) {
    h.setRecords([entry]); await h.controller.refresh();
    assert.equal(h.controller.getSnapshot().premium, false);
  }
  for (const state of ["ACTIVE", "PENDING_CANCELLATION"]) {
    h.setRecords([record(state)]); await h.controller.refresh();
    assert.equal(h.controller.getSnapshot().premium, true);
  }
});
test("checkout uses the Overwolf UUID and runtime extension ID without a token in the URL", async () => {
  const h = harness();
  await h.controller.purchase(plan.id);
  const url = new URL(h.opened[0]);
  assert.equal(url.origin, "https://subscriptions-api.overwolf.com");
  assert.equal(url.pathname, `/checkout/public-token/${plan.id}`);
  assert.equal(url.searchParams.get("userId"), identity.uuid);
  assert.equal(url.searchParams.get("extensionId"), identity.extensionId);
  assert.ok(!url.toString().includes("session-token"));
  assert.equal(h.calls.find(c => c.url.includes("/subscriptions/")).token, "session-token");
  assert.equal(h.calls.find(c => c.url.includes("/packages/")).token, undefined);
  assert.equal(h.controller.getSnapshot().premium, false);
});
test("checkout does not grant access; server confirmation does", async () => {
  const h = harness();
  await h.controller.purchase(plan.id);
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().premium, false);
  assert.equal(h.controller.getSnapshot().checkoutPending, true);
  h.setRecords([record("ACTIVE")]); await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().premium, true);
  assert.equal(h.controller.getSnapshot().checkoutPending, false);
});

test("the approved lifetime package has its own checkout and requires server confirmation", async () => {
  const lifetime = { id: 7797992, name: "Lifetime", type: "single", base_price: 99.99, currency: "USD" };
  let confirmed = false;
  const h = harness({
    packageIds: [plan.id, lifetime.id],
    request: async url => url.includes("/packages/")
      ? [plan, lifetime, { ...lifetime, id: 999 }]
      : confirmed ? [{ ...record("ACTIVE"), packageId: lifetime.id }] : [],
  });
  await h.controller.purchase(999);
  assert.equal(h.opened.length, 0);
  await h.controller.purchase(lifetime.id);
  assert.equal(new URL(h.opened[0]).pathname, `/checkout/public-token/${lifetime.id}`);
  assert.equal(h.controller.getSnapshot().packages.find(pkg => pkg.id === lifetime.id)?.price, 99.99);
  assert.equal(h.controller.getSnapshot().premium, false);
  confirmed = true;
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().premium, true);
});
test("checkout can reopen or change plans while pending, with one checkout per concurrent attempt", async () => {
  const annual = { id: 7797990, name: "Annual", type: "subscription" };
  let records = [];
  const { controller, opened } = harness({
    packageIds: [plan.id, annual.id],
    request: async url => url.includes("/packages/") ? [plan, annual] : records,
  });
  await Promise.all([controller.purchase(plan.id), controller.purchase(plan.id)]);
  assert.equal(opened.length, 1);
  assert.equal(controller.getSnapshot().checkoutPending, true);
  await controller.purchase(plan.id);
  await controller.purchase(annual.id);
  assert.deepEqual(opened.map(url => new URL(url).pathname.split("/").at(-1)), [String(plan.id), String(plan.id), String(annual.id)]);

  records = [record("PENDING_CANCELLATION")];
  await controller.purchase(annual.id);
  records = [];
  await controller.purchase(999);
  assert.equal(opened.length, 3);
});
test("logout clears entitlement and prevents checkout", async () => {
  const h = harness();
  h.setRecords([record("ACTIVE")]); await h.controller.refresh();
  h.setUser(null); h.controller.invalidate();
  assert.equal(h.controller.getSnapshot().premium, false);
  await h.controller.purchase(plan.id);
  assert.equal(h.controller.getSnapshot().status, "signed-out");
  assert.equal(h.opened.length, 0);
});
test("in-flight responses cannot restore entitlement after logout", async () => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const h = harness({ request: async url => url.includes("/packages/") ? [plan] : response });
  const pending = h.controller.refresh();
  await new Promise(resolve => setImmediate(resolve));
  h.setUser(null); h.controller.invalidate(); await h.controller.refresh();
  release([record("ACTIVE")]); await pending;
  assert.equal(h.controller.getSnapshot().premium, false);
  assert.equal(h.controller.getSnapshot().status, "signed-out");
});
test("account switch without an event cannot apply another user's result", async () => {
  let checks = 0;
  const h = harness({ getIdentity: async () => ++checks === 1 ? identity : { ...identity, uuid: "changed" },
    request: async url => url.includes("/packages/") ? [plan] : [record("ACTIVE")] });
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().premium, false);
});
test("failed and malformed API responses fail closed and prevent checkout", async () => {
  for (const response of [null, { data: [] }, [{ packageId: plan.id, state: "ACTIVE" }]]) {
    const h = harness({ request: async () => response });
    await h.controller.purchase(plan.id);
    assert.equal(h.controller.getSnapshot().status, "error");
    assert.equal(h.controller.getSnapshot().premium, false);
    assert.equal(h.opened.length, 0);
  }
  const h = harness({ getToken: async () => { throw new Error("offline"); } });
  await h.controller.purchase(plan.id);
  assert.equal(h.controller.getSnapshot().premium, false);
  assert.equal(h.opened.length, 0);
});

test("ledger errors do not affect Premium and only verified current-user responses trigger sync", async () => {
  const writes = [];
  const h = harness({ syncSubscriber: async (...args) => { writes.push(args); throw new Error('db unavailable'); } });
  h.setRecords([record('ACTIVE')]);
  await h.controller.refresh();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.controller.getSnapshot().premium, true);
  assert.equal(h.controller.getSnapshot().error, null);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0].uuid, identity.uuid);
  h.setRecords(null);
  await h.controller.refresh();
  assert.equal(writes.length, 1);
  h.setUser(null); h.controller.invalidate(); await h.controller.refresh();
  assert.equal(writes.length, 1);
});

test("ledger skips unchanged snapshots indefinitely, retries failures, and syncs changed states", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000 });
  let count = 0;
  let fail = true;
  const sync = createSubscriberLedgerSync(async () => { count++; if (fail) throw new Error('offline'); });
  await assert.rejects(sync(identity, 'token', []));
  fail = false;
  await sync(identity, 'token', []);
  t.mock.timers.tick(86_400_000);
  await sync(identity, 'token', []);
  assert.equal(count, 2);
  await sync(identity, 'token', [record('ACTIVE')]);
  await sync(identity, 'token', [record('PENDING_CANCELLATION')]);
  await sync({ ...identity, uuid: 'another-user' }, 'other-token', []);
  assert.equal(count, 5);
});

test("manual ledger refresh resends unchanged state and a failed manual send is retried", async () => {
  let count = 0;
  let fail = false;
  const sync = createSubscriberLedgerSync(async () => { count++; if (fail) throw new Error('offline'); });
  await sync(identity, 'token', []);
  await sync(identity, 'token', [], true);
  assert.equal(count, 2);
  fail = true;
  await assert.rejects(sync(identity, 'token', [], true));
  fail = false;
  await sync(identity, 'token', []);
  await sync(identity, 'token', []);
  assert.equal(count, 4);
});

test("ledger serializes changed snapshots and coalesces concurrent identical manual sends", async () => {
  const releases = [];
  const sync = createSubscriberLedgerSync(() => new Promise(resolve => { releases.push(resolve); }));
  const first = sync(identity, 'token', []);
  const second = sync(identity, 'token', [record('ACTIVE')]);
  const third = sync(identity, 'token', [record('ACTIVE')], true);
  const fourth = sync(identity, 'token', [record('ACTIVE')], true);
  assert.equal(releases.length, 1);
  releases[0]();
  await first;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(releases.length, 2);
  releases[1]();
  await Promise.all([second, third, fourth]);
  assert.equal(releases.length, 2);
});

test("startup, manual refresh and a new login sync unchanged state; automatic checks skip it", async () => {
  let sends = 0;
  let block;
  let release;
  const h = harness({
    syncSubscriber: createSubscriberLedgerSync(async () => { sends++; }),
    getToken: async () => block ? block : 'token',
  });
  await h.controller.refresh();
  await h.controller.refresh();
  assert.equal(sends, 1);
  await h.controller.refresh({ forceSync: true });
  assert.equal(sends, 2);
  h.controller.invalidate();
  await h.controller.refresh();
  assert.equal(sends, 3);
  block = new Promise(resolve => { release = resolve; });
  const automatic = h.controller.refresh();
  const manual = h.controller.refresh({ forceSync: true });
  assert.equal(automatic, manual);
  release('token');
  await manual;
  assert.equal(sends, 4);
});

test("highest eligible tier wins regardless of response order; expired upper plans fall back", async () => {
  const monthly = 7793904, annual = 7797990, lifetime = 7797992;
  const h = harness({ packageIds: [monthly, annual, lifetime], packageTiers: { [monthly]: 1, [annual]: 2, [lifetime]: 3 } });
  const entry = (packageId, state = 'ACTIVE') => ({ userId: identity.uuid, packageId, state, recurringPaymentId: `ref-${packageId}` });
  for (const records of [[entry(monthly), entry(lifetime), entry(annual)], [entry(annual), entry(monthly), entry(lifetime)]]) {
    h.setRecords(records); await h.controller.refresh();
    assert.equal(h.controller.getSnapshot().activeSubscription.packageId, lifetime);
    assert.equal(h.controller.getSnapshot().activeTier, 3);
    assert.equal(h.controller.getSnapshot().subscriptions.length, 3);
  }
  h.setRecords([entry(lifetime, 'EXPIRED'), entry(annual, 'PENDING_CANCELLATION'), entry(monthly)]);
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().activeSubscription.packageId, annual);
  assert.equal(h.controller.getSnapshot().activeTier, 2);
  assert.equal(h.controller.getSnapshot().activeSubscription.recurringPaymentId, `ref-${annual}`);
  h.setRecords([entry(annual, 'OVERDUE'), entry(monthly), entry(lifetime, 'REFUNDED')]);
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().activeTier, 1);
  h.setRecords([entry(lifetime, 'UNKNOWN'), entry(annual, 'CANCELLED')]);
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().activeSubscription, null);
  assert.equal(h.controller.getSnapshot().activeTier, null);
  assert.equal(h.controller.getSnapshot().premium, false);
  h.setRecords([entry(lifetime)]); await h.controller.refresh();
  h.setRecords(null); await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().activeSubscription, null);
  assert.equal(h.controller.getSnapshot().activeTier, null);
});
