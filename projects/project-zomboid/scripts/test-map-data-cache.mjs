import assert from "node:assert/strict";
import {
  clearMapDataCache,
  loadCachedMapJson,
} from "../src/features/map/map-data-cache.ts";

clearMapDataCache();
let loads = 0;
const loader = async (url) => {
  loads += 1;
  return { url, loads };
};

const [first, second] = await Promise.all([
  loadCachedMapJson("/metadata.json", loader),
  loadCachedMapJson("/metadata.json", loader),
]);
assert.equal(loads, 1);
assert.equal(first, second);
assert.equal(await loadCachedMapJson("/metadata.json", loader), first);

let attempts = 0;
const flakyLoader = async () => {
  attempts += 1;
  if (attempts === 1) throw new Error("temporary failure");
  return { recovered: true };
};
await assert.rejects(loadCachedMapJson("/mod.json", flakyLoader), /temporary failure/);
assert.deepEqual(await loadCachedMapJson("/mod.json", flakyLoader), { recovered: true });
assert.equal(attempts, 2);

console.log("Map data cache tests passed.");
