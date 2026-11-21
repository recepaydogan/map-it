import assert from "node:assert/strict";
import { emptySavedMapSnapshot as empty, mergeSavedMapSnapshots as merge, parseSavedMapSnapshot } from "../src/features/map/saved-map-merge";
import {
  activateSavedMapAccount, activeSavedMapScope, getSavedMapStorage, readAccountSnapshot,
  readAccountBaseline, writeAccountSnapshot,
} from "../src/features/map/saved-map-account-storage";
import { FAVORITES_STORAGE_KEY, NOTES_STORAGE_KEY } from "../src/features/map/saved-map-storage";
import { syncSavedMapAccount } from "../src/features/map/saved-map-sync";

const local = { ...empty(), favoriteIds: ["local"], completedIds: ["done"], notes: { note: "local note" } };
const remote = { ...empty(), favoriteIds: ["remote"], notes: { note: "remote note" } };
const combined = merge(null, local, remote);
assert.deepEqual(combined.favoriteIds, ["local", "remote"]);
assert.deepEqual(combined.completedIds, ["done"]);
assert.equal(combined.notes.note, "local note");
assert.deepEqual(combined.conflicts?.["note:note"], ["remote note"]);
const removed = merge(combined, { ...combined, favoriteIds: [], notes: {} }, combined);
assert.deepEqual(removed.favoriteIds, []);
assert.deepEqual(removed.notes, {});
assert.deepEqual(merge(combined, combined, { ...combined, favoriteIds: [] }).favoriteIds, []);
assert.deepEqual(merge(combined, combined, { ...combined, notes: { note: "new remote" } }).notes, { note: "new remote" });
assert.throws(() => parseSavedMapSnapshot({ ...empty(), favoriteIds: [123] }));
assert.throws(() => parseSavedMapSnapshot({ ...empty(), markers: [{}] }));

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
}, configurable: true });
Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
Object.defineProperty(globalThis, "navigator", { value: { locks: { request: async (_name: string, operation: () => Promise<void>) => operation() } }, configurable: true });
localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(["legacy"]));
localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ note: "guest" }));
activateSavedMapAccount("account-a");
assert.deepEqual(readAccountSnapshot("account-a").favoriteIds, ["legacy"]);
assert.deepEqual(readAccountSnapshot("guest").favoriteIds, []);
activateSavedMapAccount(null);
assert.equal(activeSavedMapScope(), "guest");
assert.deepEqual(readAccountSnapshot("guest").notes, {});
getSavedMapStorage().setItem(FAVORITES_STORAGE_KEY, JSON.stringify(["new-guest"]));
activateSavedMapAccount("account-b");
assert.deepEqual(readAccountSnapshot("account-b").favoriteIds, ["new-guest"]);
assert.deepEqual(readAccountSnapshot("account-a").favoriteIds, ["legacy"]);
activateSavedMapAccount("account-a");
assert.deepEqual(readAccountSnapshot("account-a").favoriteIds, ["legacy"]);

type Row = { payload: ReturnType<typeof empty>; revision: number };
const rows = new Map<string, Row>();
let account = "account-a";
let fail = false;
let beforeWrite: (() => void) | undefined;
let afterWrite: (() => void) | undefined;
let writeCount = 0;
class Query {
  filters = new Map<string, unknown>();
  operation = "read";
  value: Record<string, unknown> = {};
  select() { return this; }
  eq(key: string, value: unknown) { this.filters.set(key, value); return this; }
  insert(value: Record<string, unknown>) { this.operation = "insert"; this.value = value; return this; }
  update(value: Record<string, unknown>) { this.operation = "update"; this.value = value; return this; }
  async maybeSingle() {
    if (fail) return { data: null, error: new Error("offline") };
    return { data: structuredClone(rows.get(String(this.filters.get("user_id"))) ?? null), error: null };
  }
  async execute() {
    const user = String(this.operation === "insert" ? this.value.user_id : this.filters.get("user_id"));
    assert.equal(user, account, "Never send another account's data");
    if (fail) return { data: null, error: new Error("offline") };
    const hook = beforeWrite; beforeWrite = undefined; hook?.();
    const previous = rows.get(user);
    if (this.operation === "insert" && previous) return { data: null, error: { code: "23505" } };
    if (this.operation === "update" && previous?.revision !== this.filters.get("revision")) return { data: [], error: null };
    rows.set(user, { payload: structuredClone(this.value.payload) as Row["payload"], revision: Number(this.value.revision) });
    writeCount++;
    const after = afterWrite; afterWrite = undefined; after?.();
    return { data: [{ revision: this.value.revision }], error: null };
  }
  then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return this.execute().then(resolve, reject); }
}
Object.assign(globalThis, { testCloud: {
  auth: { getSession: async () => ({ data: { session: { user: { id: account } } }, error: null }) },
  from: () => new Query(),
} });
rows.set(account, { payload: { ...empty(), favoriteIds: ["cloud"] }, revision: 1 });
await syncSavedMapAccount(account, () => false);
assert.deepEqual(rows.get(account)?.payload.favoriteIds, ["cloud", "legacy"]);
assert.deepEqual(readAccountSnapshot(account).favoriteIds, ["cloud", "legacy"]);
const firstWriteCount = writeCount;
await syncSavedMapAccount(account, () => false);
assert.equal(writeCount, firstWriteCount, "No upload loop for unchanged state");

getSavedMapStorage().setItem(FAVORITES_STORAGE_KEY, JSON.stringify(["legacy"]));
fail = true;
await assert.rejects(syncSavedMapAccount(account, () => false));
assert.deepEqual(readAccountSnapshot(account).favoriteIds, ["legacy"]);
fail = false;
beforeWrite = () => {
  const row = rows.get(account)!;
  rows.set(account, { payload: { ...row.payload, completedIds: ["another-device"] }, revision: row.revision + 1 });
};
await syncSavedMapAccount(account, () => false);
assert.deepEqual(rows.get(account)?.payload.favoriteIds, ["legacy"], "Offline removal survives reconnect");
assert.deepEqual(readAccountSnapshot(account).completedIds, ["another-device"], "CAS retry keeps concurrent remote edits");

getSavedMapStorage().setItem(FAVORITES_STORAGE_KEY, JSON.stringify(["legacy", "before-request"]));
afterWrite = () => getSavedMapStorage().setItem(FAVORITES_STORAGE_KEY, JSON.stringify(["during-request"]));
await syncSavedMapAccount(account, () => false);
assert.deepEqual(readAccountSnapshot(account).favoriteIds, ["during-request"]);
await syncSavedMapAccount(account, () => false);
assert.deepEqual(rows.get(account)?.payload.favoriteIds, ["during-request"]);
assert.deepEqual(readAccountBaseline(account), rows.get(account)?.payload);
rows.delete(account);
await syncSavedMapAccount(account, () => false);
assert.deepEqual(rows.get(account)?.payload.favoriteIds, ["during-request"], "Missing remote row is reseeded without clearing local saves");

getSavedMapStorage().setItem(FAVORITES_STORAGE_KEY, JSON.stringify(["account-a-last-edit"]));
afterWrite = () => { activateSavedMapAccount("account-b"); account = "account-b"; };
await syncSavedMapAccount("account-a", () => false);
assert.deepEqual(readAccountSnapshot("account-b").favoriteIds, ["new-guest"], "Late response cannot overwrite another account");
await syncSavedMapAccount("account-a", () => false);
assert.equal(rows.has("account-b"), false, "Stale account worker stops");
await syncSavedMapAccount("account-b", () => false);
assert.deepEqual(rows.get("account-b")?.payload.favoriteIds, ["new-guest"]);
activateSavedMapAccount(null);
assert.equal(storage.has("gm:account-map-state:account-b"), false, "Synced account cache is removed on sign-out");
assert.equal(storage.has("gm:account-map-state:account-a"), true, "Pending account edits remain isolated for recovery");
assert.equal(localStorage.getItem(FAVORITES_STORAGE_KEY), null, "Legacy unscoped copies are removed after durable migration");
console.log("Saved-map sync passed: guest merge, account isolation, removals, notes, offline retry, concurrent writes, in-flight edits, late responses and idempotence.");
