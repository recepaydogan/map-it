import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString("base64")}`;
const payloadUrl = moduleUrl(await readFile(new URL("../src/features/live-position/live-position-payload.ts", import.meta.url), "utf8"));
const source = (await readFile(new URL("../src/features/live-position/live-position-source-selector.ts", import.meta.url), "utf8"))
  .replace('"./live-position-payload"', JSON.stringify(payloadUrl));
const { createLivePositionSourceSelector } = await import(moduleUrl(source));
let time = 100_000;
const updates = [];
const selector = createLivePositionSourceSelector(value => updates.push(value), () => time);
const sample = (x, updatedAt = time) => ({ version: 1, sequence: 1, x, y: 10, z: 0, dx: 1, dy: 0, updatedAt });
selector.refresh();
assert.equal(updates.length, 0, "Neither feed: wait without fabricating a position");
const bridge = sample(1);
selector.accept("bridge", bridge);
assert.equal(updates.at(-1), bridge, "Bridge only");
const native = sample(2);
selector.accept("native", native);
assert.equal(updates.at(-1), native, "Both available: native wins");
time += 2000;
const standby = sample(3);
selector.accept("bridge", standby);
assert.equal(updates.at(-1), native, "Bridge callbacks cannot steal native priority");
time += 1001;
selector.refresh();
assert.equal(updates.at(-1), standby, "Native expired: cached fresh Bridge takes over without a new callback");
const recovered = sample(2);
selector.accept("native", recovered);
assert.equal(updates.at(-1), recovered, "Native recovery immediately regains priority");
selector.accept("native", sample(999, time - 5000));
selector.accept("native", sample(999, time - 1));
assert.equal(updates.at(-1), recovered, "Stale and out-of-order samples are ignored");
time += 2000;
const stationary = sample(2);
selector.accept("native", stationary);
assert.equal(updates.at(-1), stationary, "A stationary character with a new timestamp stays live");
time += 3001;
selector.refresh();
assert.equal(updates.at(-1), null, "Both expired: clear the live position");
const count = updates.length;
selector.refresh();
assert.equal(updates.length, count, "Do not repeatedly clear while waiting");
selector.accept("native", sample(4));
assert.equal(updates.at(-1).x, 4, "Native alone recovers from waiting");
console.log("Live position source selection tests passed.");
