import assert from "node:assert/strict";
import { NbtFile, NbtCompound, NbtInt, NbtByte, NbtString, NbtList } from "deepslate/nbt";
import { GAME_COLUMN_TAG_SCHEMA, GAME_NBT_FORMATS, GAME_REGION_COMPRESSION, GAME_SUBCHUNK_SCHEMA } from "../src/game-config.ts";
import { copyTerrainWorkData } from "../src/features/terrain/terrain-work-data.ts";
import { createTerrainWorkerPool } from "../src/features/terrain/terrain-worker-pool.ts";
import { runTerrainWork } from "../src/features/terrain/run-terrain-work.ts";

let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const scope = { worldId: "fixture-world", dimension: "fixture-dimension", sourceId: "fixture-source", revision: 1 };
const section = () => ({ palette: [{ id: "fixture:solid", properties: {} }], indices: new Uint16Array(4096) });
const source = (origin = [0, 0, 0]) => ({ origin, section: section(), shapes: ["opaque-cube"] });
const meshJob = () => ({ kind: "mesh", source: source() });
const validResult = await runTerrainWork(meshJob());
const errorCode = code => error => error?.code === code;

class TestWorker extends EventTarget {
  requests = []; terminated = false; failPost = false;
  postMessage(request, transfer) {
    if (this.failPost) throw new Error("Fixture post failure");
    this.requests.push(structuredClone(request, { transfer }));
  }
  terminate() { this.terminated = true; }
  respond(response) { this.dispatchEvent(new MessageEvent("message", { data: response })); }
  complete(result = validResult) {
    const request = this.requests.at(-1);
    this.respond({ id: request.id, scope: request.scope, ok: true, result });
  }
}
const fixture = options => {
  const workers = [];
  const pool = createTerrainWorkerPool(() => { const worker = new TestWorker(); workers.push(worker); return worker; }, options);
  pool.setScope(scope); return { pool, workers };
};

await check("queued data copies only the supplied typed-array view, without detaching caller storage", () => {
  const whole = new Uint8Array(1024).fill(99); whole.set([1, 2, 3], 400);
  const input = { bytes: whole.subarray(400, 403), nested: { name: "fixture" } };
  const copy = copyTerrainWorkData(input, 256);
  assert.equal(copy.value.bytes.buffer.byteLength, 3); assert.equal(copy.value.bytes.byteOffset, 0);
  assert.deepEqual([...copy.value.bytes], [1, 2, 3]);
  const transferred = structuredClone(copy.value, { transfer: copy.transfer });
  assert.equal(copy.value.bytes.byteLength, 0); assert.equal(whole.byteLength, 1024);
  assert.deepEqual([...transferred.bytes], [1, 2, 3]);
});

await check("work snapshots bound byte size, nesting and record types without running getters", () => {
  assert.throws(() => copyTerrainWorkData({ bytes: new Uint8Array(100) }, 32));
  const cycle = {}; cycle.self = cycle; assert.throws(() => copyTerrainWorkData(cycle, 10000));
  let deep = {}; for (let i = 0; i < 30; i++) deep = { deep };
  assert.throws(() => copyTerrainWorkData(deep, 10000));
  for (const value of [new Date(), new AbortController().signal, () => {}, NaN, new BigInt64Array(1)])
    assert.throws(() => copyTerrainWorkData({ value }, 10000));
  let read = false;
  assert.throws(() => copyTerrainWorkData({ get bad() { read = true; return 1; } }, 10000));
  assert.equal(read, false);
});

await check("worker mesh inputs retain unknown coverage and suppress only verified neighbor faces", async () => {
  const missing = await runTerrainWork(meshJob());
  assert.equal(missing.value.blockIndices.length, 1536); assert(missing.value.faceFlags.every(value => value === 1));
  const adjacent = await runTerrainWork({ ...meshJob(), neighbors: [source([16, 0, 0])] });
  assert.equal(adjacent.value.blockIndices.length, 1280); assert(!adjacent.value.faceDirections.includes(1));
  const cut = await runTerrainWork({ ...meshJob(), cutawayY: 7, neighbors: [source([16, 0, 0])] });
  assert.equal(cut.value.faceFlags.filter(value => value === 2).length, 256);
  assert(cut.value.blockIndices.every(index => (index >> 8) <= 7));
});

await check("worker meshing rejects duplicated, diagonal and malformed neighbor sources", async () => {
  for (const neighbors of [[source([16, 0, 0]), source([16, 0, 0])], [source([16, 16, 0])], [source([32, 0, 0])],
    [{ ...source([16, 0, 0]), shapes: [] }]])
    await assert.rejects(runTerrainWork({ ...meshJob(), neighbors }));
});

await check("decoder requests cannot raise memory ceilings beyond worker policy", async () => {
  await assert.rejects(runTerrainWork({ kind: "column", options: { tags: { maxBytes: 17 * 1024 * 1024 } } }), /worker policy/);
  await assert.rejects(runTerrainWork({ kind: "subchunk", context: { maxBytes: 3 * 1024 * 1024 } }), /worker policy/);
  await assert.rejects(runTerrainWork({ kind: "subchunk", context: { maxLayers: 9 } }), /worker policy/);
});

await check("column and persistent-subchunk tasks preserve independent version and altitude checks", async () => {
  const compound = entries => new NbtCompound(new Map(Object.entries(entries)));
  const file = NbtFile.create();
  file.root = compound({ DataVersion: new NbtInt(100), xPos: new NbtInt(-1), zPos: new NbtInt(2), Status: new NbtString("full"),
    sections: new NbtList([compound({ Y: new NbtByte(-4), block_states: compound({ palette: new NbtList([
      compound({ Name: new NbtString("fixture:solid") }),
    ], 10) }) })], 10) });
  const job = { kind: "column", payload: { slot: 0, chunkX: -1, chunkZ: 2, timestampSeconds: 42, compressionId: 3, external: false, data: file.write() },
    context: { schema: GAME_COLUMN_TAG_SCHEMA, dataVersion: 100, chunkX: -1, chunkZ: 2, minSectionY: -4, maxSectionY: 19 },
    options: { tags: GAME_NBT_FORMATS.java, compressionModes: GAME_REGION_COMPRESSION } };
  const column = await runTerrainWork(job);
  assert.equal(column.kind, "column"); assert.equal(column.value.timestampSeconds, 42);
  assert.equal(column.value.sections[0].voxels.palette[0].id, "fixture:solid");
  await assert.rejects(runTerrainWork({ ...job, context: { ...job.context, dataVersion: 101 } }));
  const stateFile = NbtFile.create({ littleEndian: true });
  stateFile.root = compound({ name: new NbtString("fixture:solid"), states: compound({}), version: new NbtInt(100) });
  const state = stateFile.write(), bytes = new Uint8Array(4 + state.length); bytes.set([9, 1, 252, 0]); bytes.set(state, 4);
  const subchunkJob = { kind: "subchunk", bytes, context: { schema: GAME_SUBCHUNK_SCHEMA, sectionY: -4, paletteVersions: [100] } };
  const subchunk = await runTerrainWork(subchunkJob);
  assert.equal(subchunk.value.sectionY, -4); assert.equal(subchunk.value.layers[0].voxels.palette[0].id, "fixture:solid");
  await assert.rejects(runTerrainWork({ ...subchunkJob, context: { ...subchunkJob.context, sectionY: 0 } }));
});

await check("pool obeys worker and queue limits, reuses idle workers and releases byte accounting", async () => {
  const { pool, workers } = fixture({ maxWorkers: 2, maxJobs: 4 });
  const jobs = Array.from({ length: 4 }, () => pool.submit(scope, meshJob()));
  assert.equal(workers.length, 2); assert.equal(pool.getStats().active, 2); assert.equal(pool.getStats().queued, 2);
  await assert.rejects(pool.submit(scope, meshJob()), errorCode("budget"));
  workers[0].complete(); workers[1].complete(); workers[0].complete(); workers[1].complete();
  await Promise.all(jobs);
  assert.deepEqual(pool.getStats(), { pending: 0, queued: 0, active: 0, workers: 2, queuedBytes: 0 }); pool.dispose();
});

await check("queued requests capture immutable caller data before dispatch", async () => {
  const { pool, workers } = fixture();
  const first = pool.submit(scope, meshJob()), secondJob = meshJob();
  const second = pool.submit(scope, secondJob); secondJob.source.section.palette[0].id = "fixture:changed";
  secondJob.source.section.indices[0] = 5;
  workers[0].complete();
  assert.equal(workers[0].requests[1].work.source.section.palette[0].id, "fixture:solid");
  assert.equal(workers[0].requests[1].work.source.section.indices[0], 0);
  assert.equal(secondJob.source.section.indices.byteLength, 8192);
  workers[0].complete(); await Promise.all([first, second]); pool.dispose();
});

await check("every scope field invalidates active and queued work, even when a world ID returns later", async () => {
  for (const next of [{ ...scope, worldId: "other" }, { ...scope, dimension: "other" }, { ...scope, sourceId: "other" }, { ...scope, revision: 2 }]) {
    const { pool, workers } = fixture();
    const first = assert.rejects(pool.submit(scope, meshJob()), errorCode("stale"));
    const second = assert.rejects(pool.submit(scope, meshJob()), errorCode("stale"));
    pool.setScope(next); assert(workers[0].terminated); await Promise.all([first, second]);
    await assert.rejects(pool.submit(scope, meshJob()), errorCode("stale"));
    pool.setScope(scope); const fresh = pool.submit(scope, meshJob());
    workers[0].complete(); assert.equal(pool.getStats().active, 1);
    workers[1].complete(); await fresh; pool.dispose();
  }
});

await check("same-scope assignment preserves active work without mutating the stored identity", async () => {
  const { pool, workers } = fixture(); const job = pool.submit(scope, meshJob());
  const copy = { ...scope }; pool.setScope(copy); copy.worldId = "changed";
  assert.equal(workers[0].terminated, false); workers[0].complete(); await job; pool.dispose();
});

await check("queued cancellation leaves active CPU work alone; active cancellation terminates and replaces its worker", async () => {
  const { pool, workers } = fixture(); const runningAbort = new AbortController(), queuedAbort = new AbortController();
  const running = assert.rejects(pool.submit(scope, meshJob(), runningAbort.signal), errorCode("cancelled"));
  const queued = assert.rejects(pool.submit(scope, meshJob(), queuedAbort.signal), errorCode("cancelled"));
  queuedAbort.abort(); await queued; assert.equal(workers[0].terminated, false); assert.equal(pool.getStats().queued, 0);
  const successor = pool.submit(scope, meshJob()); runningAbort.abort(); await running;
  assert(workers[0].terminated); assert.equal(workers.length, 2); workers[1].complete(); await successor;
  assert.equal(pool.getStats().queuedBytes, 0); pool.dispose();
});

await check("pre-cancelled and oversized submissions create no worker or retained job", async () => {
  const { pool, workers } = fixture({ maxQueuedBytes: 100 });
  const abort = new AbortController(); abort.abort();
  await assert.rejects(pool.submit(scope, meshJob(), abort.signal), errorCode("cancelled"));
  await assert.rejects(pool.submit(scope, meshJob()), errorCode("budget"));
  assert.equal(workers.length, 0); assert.equal(pool.getStats().pending, 0); pool.dispose();
});

await check("wrong request IDs, scopes and result kinds fail closed and replace the worker", async () => {
  for (const mutate of [response => { response.id++; }, response => { response.scope = { ...scope, dimension: "other" }; },
    response => { response.result = { kind: "column", value: {} }; }]) {
    const { pool, workers } = fixture(); const failed = assert.rejects(pool.submit(scope, meshJob()), errorCode("protocol"));
    const next = pool.submit(scope, meshJob()); const request = workers[0].requests[0];
    const response = { id: request.id, scope: request.scope, ok: true, result: validResult }; mutate(response); workers[0].respond(response);
    await failed; assert(workers[0].terminated); workers[1].complete(); await next; pool.dispose();
  }
});

await check("worker decode errors are visible and do not strand subsequent jobs", async () => {
  const { pool, workers } = fixture(); const failed = assert.rejects(pool.submit(scope, meshJob()), error => error.code === "worker" && error.message === "Corrupt source");
  const next = pool.submit(scope, meshJob()), request = workers[0].requests[0];
  workers[0].respond({ id: request.id, scope: request.scope, ok: false, error: "Corrupt source" }); await failed;
  workers[0].complete(); await next; assert.equal(workers.length, 1); pool.dispose();
});

await check("message delivery failure terminates the faulty worker and drains the queue", async () => {
  const { pool, workers } = fixture(); const failed = assert.rejects(pool.submit(scope, meshJob()), errorCode("worker"));
  const next = pool.submit(scope, meshJob()); workers[0].dispatchEvent(new Event("messageerror", { cancelable: true }));
  await failed; assert(workers[0].terminated); workers[1].complete(); await next; pool.dispose();
});

await check("worker creation and post failures release all pending resources", async () => {
  for (const factory of [() => { throw new Error("No workers available"); }, () => { const worker = new TestWorker(); worker.failPost = true; return worker; }]) {
    const pool = createTerrainWorkerPool(factory); pool.setScope(scope);
    await assert.rejects(pool.submit(scope, meshJob()), errorCode("worker"));
    assert.deepEqual(pool.getStats(), { pending: 0, queued: 0, active: 0, workers: 0, queuedBytes: 0 }); pool.dispose();
  }
});

await check("deadline terminates stalled CPU work and makes the capacity available again", async () => {
  const { pool, workers } = fixture({ timeoutMs: 10 });
  await assert.rejects(pool.submit(scope, meshJob()), errorCode("timeout")); assert(workers[0].terminated);
  const next = pool.submit(scope, meshJob()); workers[1].complete(); await next; pool.dispose();
});

await check("dispose rejects running and queued jobs, closes workers and disallows further submission", async () => {
  const { pool, workers } = fixture();
  const running = assert.rejects(pool.submit(scope, meshJob()), errorCode("disposed"));
  const queued = assert.rejects(pool.submit(scope, meshJob()), errorCode("disposed"));
  pool.dispose(); pool.dispose(); await Promise.all([running, queued]); assert(workers[0].terminated);
  assert.equal(pool.getStats().pending, 0); assert.equal(pool.getStats().queuedBytes, 0);
  await assert.rejects(pool.submit(scope, meshJob()), errorCode("disposed")); assert.throws(() => pool.setScope(scope));
});

console.log(`${checks} terrain worker checks passed.`);
