import assert from "node:assert/strict";
import { createRegionViewportLoader, loadRegionSnapshot } from "../src/features/terrain/load-region-snapshot.ts";
import { voxelIndex } from "../src/features/terrain/voxel-section.ts";

const scope = { worldId: "world", sourceId: "owned-file", dimension: "overworld", revision: 1 };
const profile = { dataVersion: 4082, minSectionY: -4, maxSectionY: 19 };
const schema = { version: "DataVersion", x: "xPos", z: "zPos", status: "Status", fullStatuses: ["full"], sections: "sections",
  sectionY: "Y", storage: "block_states", palette: "palette", stateName: "Name", properties: "Properties", data: "data", minBits: 4,
  layout: { wordBits: 64, littleEndian: false, axisOrder: "yzx", allowedBits: [0, 4] } };
const materials = { emptyIds: ["minecraft:air"], deferredTokens: ["stairs"], groups: [
  { id: "stone", color: [120, 120, 120], tokens: ["stone"] }, { id: "other", color: [140, 100, 140], tokens: [] },
] };
const payload = (slot, chunkX) => ({ slot, chunkX, chunkZ: 0, timestampSeconds: 1, compressionId: 2, external: false,
  data: new Uint8Array([slot + 1]) });
const section = (sectionY, ids = ["minecraft:air", "minecraft:stone"]) => ({ sectionY, voxels: {
  palette: ids.map(id => ({ id, properties: {} })), indices: new Uint16Array(4096),
} });
const plan = { regionX: 0, regionZ: 0, payloads: [payload(0, 0), payload(1, 1)], available: 2, missing: 1022, external: 0, deferred: 0 };
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const fixture = ({ sections = [section(0)], streamStates = [{ status: "ready" }] } = {}) => {
  const jobs = [], sources = [], cutaways = [], updates = []; const active = new Set();
  const pool = { setScope() {}, async submit(requestedScope, work) {
    jobs.push({ requestedScope, work });
    return { kind: "column", value: { chunkX: work.payload.chunkX, chunkZ: work.payload.chunkZ,
      dataVersion: work.context.dataVersion, timestampSeconds: work.payload.timestampSeconds, sections,
      structureCoverage: work.payload.chunkX === 1 ? "available" : "unavailable",
      structureStarts: work.payload.chunkX === 1 ? [{ key: "minecraft:village", id: "minecraft:village", chunkX: 1, chunkZ: 0,
        boundingBox: [16, 60, 0, 31, 80, 15] }] : [] } };
  } };
  const stream = { setSource(requestedScope, textures) { sources.push({ requestedScope, textures }); },
    setCutaway(requestedScope, value) { cutaways.push({ requestedScope, value }); },
    updateSections(requestedScope, entries, remove = []) {
      updates.push({ requestedScope, entries, remove }); sources.push({ requestedScope, entries });
      for (const id of remove) active.delete(id); for (const entry of entries) active.add(entry.id);
    },
    async whenIdle() { return { sections: [...active].map((id, index) => ({ id, ...(streamStates[index] ?? streamStates.at(-1)) })) }; } };
  return { pool, stream, jobs, sources, cutaways, updates, active };
};

await check("loader pins DataVersion, coordinates and schema for every owned region payload", async () => {
  const f = fixture(); const progress = [];
  const result = await loadRegionSnapshot({ scope, plan, profile, schema, tags: { littleEndian: false, stringEncoding: "modified-utf-8" },
    compressionModes: { 2: "deflate" }, materials, pool: f.pool, stream: f.stream, signal: new AbortController().signal,
    cutawayY: 80, onProgress: value => progress.push({ ...value }) });
  assert.equal(f.jobs.length, 2); assert.equal(f.jobs[0].work.context.dataVersion, 4082);
  assert.equal(f.jobs[1].work.context.chunkX, 1); assert.equal(f.jobs[0].work.context.schema, schema);
  assert.deepEqual(f.cutaways, [{ requestedScope: scope, value: 80 }]);
  assert.equal(result.acceptedSections, 2); assert.equal(result.palettes.size, 2);
  assert.deepEqual(result.structureEvidence.columns.map(column => column.coverage), ["unavailable", "available"]);
  assert.deepEqual(result.structureEvidence.starts.map(start => start.id), ["minecraft:village"]);
  assert(Object.isFrozen(result.structureEvidence) && Object.isFrozen(result.structureEvidence.columns)
    && Object.isFrozen(result.structureEvidence.starts));
  assert.equal(progress.at(-1).decodedColumns, 2); assert.equal(f.sources[0].textures.layers, 2);
});

await check("section budgets stop decoding and surface incomplete coverage", async () => {
  const f = fixture({ sections: [section(0), section(1)] });
  const result = await loadRegionSnapshot({ scope, plan, profile, schema, tags: { littleEndian: false, stringEncoding: "modified-utf-8" },
    compressionModes: { 2: "deflate" }, materials, pool: f.pool, stream: f.stream, signal: new AbortController().signal, maxSections: 1 });
  assert.equal(f.jobs.length, 1); assert.equal(result.acceptedSections, 1); assert.equal(result.sectionLimitReached, true);
  assert.equal(result.decodedColumns, 1); assert.equal(result.totalColumns, 2);
});

await check("deferred block models remain partial instead of becoming cubes", async () => {
  const f = fixture({ sections: [section(0, ["minecraft:air", "minecraft:oak_stairs"])], streamStates: [{ status: "partial" }] });
  const result = await loadRegionSnapshot({ scope, plan: { ...plan, payloads: [plan.payloads[0]] }, profile, schema,
    tags: { littleEndian: false, stringEncoding: "modified-utf-8" }, compressionModes: { 2: "deflate" }, materials,
    pool: f.pool, stream: f.stream, signal: new AbortController().signal });
  const entry = f.sources.find(value => value.entries).entries[0];
  assert.deepEqual(entry.source.shapes, ["empty", "model"]); assert.equal(result.partialSections, 1);
});

await check("cancelled and invalid cutaway requests are rejected before worker decoding", async () => {
  const cancelled = new AbortController(); cancelled.abort(new Error("fixture cancelled")); const f = fixture();
  await assert.rejects(loadRegionSnapshot({ scope, plan, profile, schema, tags: { littleEndian: false, stringEncoding: "modified-utf-8" },
    compressionModes: { 2: "deflate" }, materials, pool: f.pool, stream: f.stream, signal: cancelled.signal }), /fixture cancelled/);
  assert.equal(f.jobs.length, 0);
  await assert.rejects(loadRegionSnapshot({ scope, plan, profile, schema, tags: { littleEndian: false, stringEncoding: "modified-utf-8" },
    compressionModes: { 2: "deflate" }, materials, pool: f.pool, stream: f.stream, signal: new AbortController().signal,
    cutawayY: 1.5 }), /cutaway/);
});

await check("viewport refresh retains overlap and atomically evicts only departed sections", async () => {
  const f = fixture();
  const loader = createRegionViewportLoader({ scope, profile, schema, tags: { littleEndian: false, stringEncoding: "modified-utf-8" },
    compressionModes: { 2: "deflate" }, materials, pool: f.pool, stream: f.stream });
  const first = await loader.load({ ...plan, payloads: [payload(0, 0), payload(1, 1)] }, new AbortController().signal);
  const second = await loader.load({ ...plan, payloads: [payload(1, 1), payload(2, 2)] }, new AbortController().signal);
  assert.equal(f.sources.filter(item => item.textures).length, 1);
  assert.deepEqual(f.jobs.map(job => job.work.payload.chunkX), [0, 1, 2]);
  assert.deepEqual(f.updates[1].entries.map(entry => entry.id), [JSON.stringify([2, 0, 0])]);
  assert.deepEqual(f.updates[1].remove, [JSON.stringify([0, 0, 0])]);
  assert.equal(first.acceptedSections, 2); assert.equal(second.acceptedSections, 2);
  assert.deepEqual([...second.palettes.keys()], [JSON.stringify([1, 0, 0]), JSON.stringify([2, 0, 0])]);
  assert.deepEqual(loader.getLoadedStructureEvidence().columns.map(column => column.chunkX), [1, 2]);
  assert.deepEqual(loader.getLoadedStructureEvidence().starts.map(start => start.chunkX), [1]);
  loader.dispose();
});

await check("viewport sampling and coverage expose only retained owned sections", async () => {
  const low = section(0), high = section(1);
  low.voxels.indices[voxelIndex(4, 15, 5)] = 1; high.voxels.indices[voxelIndex(4, 2, 5)] = 1;
  const f = fixture({ sections: [low, high] });
  const loader = createRegionViewportLoader({ scope, profile, schema, tags: { littleEndian: false, stringEncoding: "modified-utf-8" },
    compressionModes: { 2: "deflate" }, materials, pool: f.pool, stream: f.stream });
  await loader.load({ ...plan, payloads: [payload(0, 0)] }, new AbortController().signal);
  const firstCoverage = loader.getLoadedSectionCoverage();
  assert.deepEqual(firstCoverage, [
    { id: JSON.stringify([0, 0, 0]), origin: [0, 0, 0] },
    { id: JSON.stringify([0, 1, 0]), origin: [0, 16, 0] },
  ]);
  assert(Object.isFrozen(firstCoverage) && firstCoverage.every(item => Object.isFrozen(item) && Object.isFrozen(item.origin)));
  assert.deepEqual(loader.sampleHighestLoadedVoxel(4.9, 5.1), { blockY: 18, topY: 19, sectionId: JSON.stringify([0, 1, 0]) });
  assert.equal(loader.sampleHighestLoadedVoxel(3, 5), null);
  await loader.load({ ...plan, payloads: [payload(1, 1)] }, new AbortController().signal);
  assert.deepEqual(loader.getLoadedSectionCoverage().map(item => item.origin), [[16, 0, 0], [16, 16, 0]]);
  assert.equal(loader.sampleHighestLoadedVoxel(4, 5), null);
  assert.deepEqual(loader.sampleHighestLoadedVoxel(20, 5), { blockY: 18, topY: 19, sectionId: JSON.stringify([1, 1, 0]) });
  assert.throws(() => loader.sampleHighestLoadedVoxel(Number.NaN, 0), /coordinate/);
  loader.dispose(); assert.throws(() => loader.sampleHighestLoadedVoxel(20, 5), /disposed/);
  assert.throws(() => loader.getLoadedSectionCoverage(), /disposed/);
  assert.throws(() => loader.getLoadedStructureEvidence(), /disposed/);
});

console.log(`${checks} region snapshot loader checks passed.`);
