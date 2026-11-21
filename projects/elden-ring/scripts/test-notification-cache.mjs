import assert from "node:assert/strict";
import { test } from "node:test";
import { readCached, invalidateCache } from "../src/services/support/notification-cache.ts";

test("two windows share one request until expiry", async () => {
  const entry = { expiresAt: 0 };
  let calls = 0;
  const read = async () => ++calls;
  assert.deepEqual(await Promise.all([readCached(entry, read, 1000), readCached(entry, read, 1000)]), [1, 1]);
  assert.equal(await readCached(entry, read, 1000), 1);
  assert.equal(await readCached(entry, read, 1000, entry.expiresAt), 2);
});

test("failed requests can be retried without poisoning the cache", async () => {
  const entry = { expiresAt: 0 };
  await assert.rejects(readCached(entry, async () => { throw new Error("offline"); }, 1000));
  assert.equal(entry.pending, undefined);
  assert.equal(await readCached(entry, async () => 3, 1000), 3);
});

test("a mutation during a request discards the stale response", async () => {
  const entry = { expiresAt: 0 };
  let resolve;
  let calls = 0;
  const first = new Promise((done) => { resolve = done; });
  const result = readCached(entry, () => ++calls === 1 ? first : Promise.resolve(2), 1000);
  invalidateCache(entry);
  resolve(1);
  assert.equal(await result, 2);
  assert.equal(entry.value, 2);
});

test("separate account entries never reuse another account's result", async () => {
  const first = { expiresAt: 0 };
  const second = { expiresAt: 0 };
  await readCached(first, async () => "first", 1000);
  assert.equal(await readCached(second, async () => "second", 1000), "second");
});
