import assert from "node:assert/strict";
import { createTerrainSectionStream } from "../src/features/terrain/terrain-section-stream.ts";
import { runTerrainWork } from "../src/features/terrain/run-terrain-work.ts";
import { copyTerrainWorkData } from "../src/features/terrain/terrain-work-data.ts";
import { voxelIndex } from "../src/features/terrain/voxel-section.ts";

const scope = { worldId: "fixture-world", dimension: "surface", sourceId: "decoded-fixture", revision: 1 };
const textures = { size: 1, layers: 1, rgba: new Uint8Array([255, 255, 255, 255]) };
const source = (id = "a", origin = [0, 0, 0], blocks = [[15, 8, 8]]) => {
  const indices = new Uint16Array(4096);
  for (const [x, y, z] of blocks) indices[voxelIndex(x, y, z)] = 1;
  return { id, source: { origin, section: { indices, palette: [{ id: "fixture:empty", properties: {} }, { id: "fixture:solid", properties: {} }] },
    shapes: ["empty", "opaque-cube"] }, materials: Array.from({ length: 2 }, () => Array.from({ length: 6 }, () => ({ tile: 0, tint: [1, 1, 1] }))) };
};
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const tick = () => new Promise(resolve => setImmediate(resolve));
const fixture = (options = {}) => {
  const jobs = [], drawn = new Map(); let failUpload = false, active = true;
  const pool = { setScope() {}, submit(requested, work, signal) {
    return new Promise((resolve, reject) => { jobs.push({ requested, work, signal, resolve, reject }); });
  } };
  const renderer = { setScene() { drawn.clear(); }, updateEntries(_, upsert, remove = []) {
    if (failUpload && upsert.length) { failUpload = false; throw new Error("fixture graphics failure"); }
    for (const id of remove) drawn.delete(id); for (const entry of upsert) drawn.set(entry.id, entry);
  }, clear() { drawn.clear(); }, setActive(value) { active = value; } };
  const stream = createTerrainSectionStream({ pool, renderer, ...options });
  stream.setSource(scope, textures);
  const finish = async (job = jobs.at(-1)) => { job.resolve(await runTerrainWork(job.work)); await tick(); };
  const drain = async () => {
    for (let i = 0; stream.getSnapshot().pending && i < 300; i++) await finish();
    assert.equal(stream.getSnapshot().pending, 0);
  };
  return { stream, pool, jobs, drawn, finish, drain, active: () => active, failUpload: () => { failUpload = true; } };
};

await check("decoded sections mesh incrementally with copied source ownership and stable snapshots", async () => {
  const { stream, jobs, drawn, finish } = fixture();
  const a = source(); stream.updateSections(scope, [a]);
  const snapshot = stream.getSnapshot(); assert.equal(snapshot, stream.getSnapshot());
  assert.equal(snapshot.sections[0].status, "meshing"); assert(Object.isFrozen(snapshot.sections[0]));
  a.source.section.indices.fill(0); a.materials[1][0].tile = 999;
  assert.equal(jobs[0].work.source.section.indices[voxelIndex(15, 8, 8)], 1);
  await finish();
  assert.equal(drawn.get("a").mesh.blockIndices.length, 6); assert.equal(stream.getSnapshot().sections[0].status, "ready");
  assert.equal((await stream.whenIdle()).pending, 0); stream.dispose();
});
await check("neighbor arrival suppresses shared faces and eviction restores explicitly unknown boundaries", async () => {
  const { stream, drawn, drain } = fixture();
  stream.updateSections(scope, [source()]); await drain();
  assert.equal(drawn.get("a").mesh.blockIndices.length, 6);
  stream.updateSections(scope, [source("b", [16, 0, 0], [[0, 8, 8]])]);
  assert.equal(drawn.size, 0); await drain();
  assert.equal(drawn.get("a").mesh.blockIndices.length, 5); assert.equal(drawn.get("b").mesh.blockIndices.length, 5);
  stream.updateSections(scope, [], ["b"]); assert.equal(drawn.size, 0); await drain();
  const mesh = drawn.get("a").mesh; assert.equal(mesh.blockIndices.length, 6);
  assert.equal(mesh.faceFlags[mesh.faceDirections.indexOf(1)] & 1, 1);
  stream.dispose();
});
await check("distant additions preserve existing sections and one worker request runs at a time", async () => {
  const { stream, jobs, drawn, finish, drain } = fixture();
  stream.updateSections(scope, [source()]); await finish(); const original = drawn.get("a");
  stream.updateSections(scope, Array.from({ length: 40 }, (_, i) => source(`far-${i}`, [64 + i * 32, 0, 0])));
  assert.equal(jobs.length, 2); assert.equal(stream.getSnapshot().pending, 40); assert.equal(drawn.get("a"), original);
  await drain(); assert.equal(drawn.size, 41); assert.equal(drawn.get("a"), original); stream.dispose();
});
await check("replacement cancels old work and ignores a late successful result", async () => {
  const { stream, jobs, finish, drawn } = fixture();
  stream.updateSections(scope, [source()]); const old = jobs[0];
  stream.updateSections(scope, [source("a", [0, 0, 0], [[1, 1, 1]])]);
  assert(old.signal.aborted); await finish(old); assert.equal(drawn.size, 0);
  await finish(); assert.equal(drawn.get("a").mesh.blockIndices[0], voxelIndex(1, 1, 1)); stream.dispose();
});
await check("cutaway cancels in-flight geometry, preserves sources and remeshes at the new level", async () => {
  const { stream, jobs, drawn, finish } = fixture();
  stream.updateSections(scope, [source("a", [0, 0, 0], [[8, 8, 8], [8, 9, 8]])]); const old = jobs[0];
  stream.setCutaway(scope, 8); assert(old.signal.aborted); assert.equal(jobs.at(-1).work.cutawayY, 8);
  await finish(old); assert.equal(drawn.size, 0); await finish();
  assert.equal(drawn.get("a").mesh.blockIndices.length, 6); assert(drawn.get("a").mesh.faceFlags.includes(2));
  const before = jobs.length; stream.setCutaway(scope, 8); assert.equal(jobs.length, before); stream.dispose();
});
await check("source changes abort waits and old results cannot repopulate the new world", async () => {
  const { stream, jobs, drawn, finish } = fixture();
  stream.updateSections(scope, [source()]); const old = jobs[0];
  const waiting = assert.rejects(stream.whenIdle(), /source changed/);
  const next = { ...scope, worldId: "next-world" }; stream.setSource(next, textures); await waiting;
  assert(old.signal.aborted); await finish(old); assert.equal(drawn.size, 0);
  assert.throws(() => stream.updateSections(scope, [source()]), /another source/);
  assert.equal(stream.getSnapshot().scope.worldId, "next-world"); stream.dispose();
});
await check("hidden views cancel CPU work and resume their queued sections", async () => {
  const f = fixture(), { stream, jobs, drawn, finish } = f;
  stream.updateSections(scope, [source()]); const old = jobs[0]; stream.setActive(false);
  assert(old.signal.aborted); assert.equal(f.active(), false); assert.equal(stream.getSnapshot().sections[0].status, "queued");
  await finish(old); assert.equal(drawn.size, 0); assert.equal(jobs.length, 1);
  stream.setActive(true); assert.equal(jobs.length, 2); await finish(); assert.equal(drawn.size, 1); stream.dispose();
});

await check("source initialization failure clears the previous world's pixels and permits recovery", async () => {
  const { stream, pool, drawn, finish } = fixture();
  stream.updateSections(scope, [source()]); await finish(); assert.equal(drawn.size, 1);
  pool.setScope = () => { throw new Error("fixture source failure"); };
  assert.throws(() => stream.setSource({ ...scope, worldId: "new" }, textures), /fixture source failure/);
  assert.equal(drawn.size, 0); assert.equal(stream.getSnapshot().scope, null); assert.equal(stream.getSnapshot().sourceBytes, 0);
  pool.setScope = () => {};
  stream.setSource(scope, textures); stream.updateSections(scope, [source()]); await finish();
  assert.equal(drawn.size, 1); stream.dispose();
});
await check("unsupported models and unrendered source layers remain partial rather than becoming complete cubes", async () => {
  const { stream, drawn, finish } = fixture();
  const model = source("model"), layered = { ...source("layered", [16, 0, 0]), sourceIncomplete: true };
  model.source.shapes[1] = "model";
  stream.updateSections(scope, [model, layered]); await finish(); await finish();
  assert.equal(drawn.get("model").mesh.blockIndices.length, 0);
  const states = new Map(stream.getSnapshot().sections.map(section => [section.id, section]));
  assert.equal(states.get("model").status, "partial"); assert.equal(states.get("model").deferredModels, 1);
  assert.equal(states.get("layered").status, "partial"); assert.equal(states.get("layered").deferredModels, 0);
  stream.dispose();
});
await check("worker and graphics failures surface in snapshots and explicit retry recovers", async () => {
  const f = fixture(), { stream, jobs, finish, drawn } = f;
  stream.updateSections(scope, [source()]); jobs[0].reject(new Error("fixture worker failure")); await tick();
  await assert.rejects(stream.whenIdle(), /fixture worker failure/); assert.equal(drawn.size, 0);
  f.failUpload(); stream.retry(scope, "a"); await finish();
  await assert.rejects(stream.whenIdle(), /fixture graphics failure/); assert.equal(stream.getSnapshot().sections[0].status, "failed");
  stream.retry(scope, "a"); await finish(); assert.equal((await stream.whenIdle()).sections[0].status, "ready"); stream.dispose();
});
await check("invalid source batches leave valid geometry, queue and owned cache unchanged", async () => {
  const { stream, drawn, finish, jobs } = fixture(); stream.updateSections(scope, [source()]); await finish();
  const original = stream.getSnapshot();
  for (const items of [[source("b")], [source("b", [1, 0, 0])], [source("b", [16, 0, 0]), source("b", [32, 0, 0])]])
    assert.throws(() => stream.updateSections(scope, items));
  const invalid = source("b", [32, 0, 0]); invalid.materials[1][0].tile = 1;
  assert.throws(() => stream.updateSections(scope, [invalid]), /materials/);
  assert.equal(stream.getSnapshot(), original); assert.equal(drawn.size, 1); assert.equal(jobs.length, 1); stream.dispose();
});
await check("section and source memory budgets reject work before queuing", async () => {
  const f = fixture({ maxSections: 1 }); f.stream.updateSections(scope, [source()]); await f.finish();
  assert.throws(() => f.stream.updateSections(scope, [source("b", [32, 0, 0])]), /budget/); f.stream.dispose();
  const small = fixture({ maxSourceBytes: 64 }); assert.throws(() => small.stream.updateSections(scope, [source()]), /budget/);
  assert.equal(small.jobs.length, 0); assert.equal(small.stream.getSnapshot().sourceBytes, 0); small.stream.dispose();
});
await check("one atomic viewport update can spend bytes released by its own eviction", async () => {
  const oneSectionBytes = copyTerrainWorkData(source("measure"), 64 * 1024 * 1024).bytes;
  const f = fixture({ maxSections: 1, maxSourceBytes: oneSectionBytes });
  f.stream.updateSections(scope, [source("old")]); await f.finish();
  assert.doesNotThrow(() => f.stream.updateSections(scope, [source("next", [32, 0, 0])], ["old"]));
  await f.finish(); assert.equal(f.drawn.has("old"), false); assert.equal(f.drawn.has("next"), true);
  assert.equal(f.stream.getSnapshot().sections.length, 1); f.stream.dispose();
});
await check("disposal aborts workers and idle waiters, clears terrain, and removes listeners", async () => {
  const { stream, jobs, drawn, finish } = fixture(); let notices = 0;
  stream.subscribe(() => notices++); stream.updateSections(scope, [source()]);
  const waiting = assert.rejects(stream.whenIdle(), /source changed/); stream.dispose(); await waiting;
  assert(jobs[0].signal.aborted); const before = notices; await finish(); assert.equal(notices, before);
  assert.equal(drawn.size, 0); assert.equal(stream.getSnapshot().disposed, true);
  assert.throws(() => stream.updateSections(scope, [source()]), /disposed/); stream.dispose();
});

console.log(`${checks} terrain stream checks passed.`);
