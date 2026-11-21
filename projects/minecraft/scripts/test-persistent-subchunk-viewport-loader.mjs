import assert from "node:assert/strict";
import { createPersistentSubchunkViewportLoader } from "../src/features/terrain/load-persistent-subchunk-viewport.ts";
import { encodePersistentSubchunkKey } from "../src/features/terrain/persistent-subchunk-key.ts";
import { voxelIndex } from "../src/features/terrain/voxel-section.ts";

const scope = { worldId: "world", sourceId: "owned-leveldb", dimension: "overworld", revision: 1 };
const profile = { expectedComparator: "leveldb.BytewiseComparator", paletteVersions: [100] };
const keySchema = { tag: 0x2f, omittedDimension: 0, dimensions: [0, 1, 2] };
const subchunkSchema = { versions: { 8: { altitudeByte: false }, 9: { altitudeByte: true } },
  stateName: "name", properties: "states", paletteVersion: "version",
  layout: { wordBits: 32, littleEndian: true, axisOrder: "xzy", allowedBits: [0, 1, 2, 3, 4, 5, 6, 8, 16] } };
const materials = { emptyIds: ["minecraft:air"], deferredTokens: ["water"], groups: [
  { id: "stone", color: [120, 120, 120], tokens: ["stone"] },
  { id: "other", color: [140, 100, 140], tokens: [] },
] };
const request = (chunkX, sectionY = 0) => ({ chunkX, chunkZ: 0, dimension: 0, sectionY });
const keyIdentity = value => [...encodePersistentSubchunkKey(value, keySchema)]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");
const voxels = (ids = ["minecraft:air", "minecraft:stone"], block = null) => {
  const value = { palette: ids.map(id => ({ id, properties: {} })), indices: new Uint16Array(4096) };
  if (block) value.indices[voxelIndex(...block)] = 1;
  return value;
};
const decoded = (...layers) => ({ storageVersion: 9, sectionY: 0,
  layers: layers.map(section => ({ voxels: section, paletteVersions: [100] })) });
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };

const fixture = (values = new Map(), decodedValues = new Map()) => {
  const snapshots = [], jobs = [], sources = [], cutaways = [], updates = [], active = new Map();
  const loadSnapshot = async (_files, options) => {
    snapshots.push(options);
    const selected = new Map();
    for (const key of options.desiredKeys) {
      const identity = [...key].map(byte => byte.toString(16).padStart(2, "0")).join("");
      const value = values.get(identity); if (value) selected.set(identity, new Uint8Array(value));
    }
    return { root: "Fixture World", manifestName: "MANIFEST-000007", selectedTables: [2], selectedLogs: [3],
      bytesRead: 4096, values: selected };
  };
  const pool = { setScope() {}, async submit(requestedScope, work) {
    jobs.push({ requestedScope, work });
    const value = decodedValues.get(work.bytes[0]);
    if (!value) throw new Error("fixture subchunk is missing");
    return { kind: "subchunk", value };
  } };
  const stream = {
    setSource(requestedScope, textures) { sources.push({ requestedScope, textures }); },
    setCutaway(requestedScope, value) { cutaways.push({ requestedScope, value }); },
    updateSections(requestedScope, entries, remove = []) {
      updates.push({ requestedScope, entries, remove });
      for (const id of remove) active.delete(id);
      for (const entry of entries) active.set(entry.id, entry);
    },
    async whenIdle() { return { sections: [...active.values()].map(entry => ({ id: entry.id,
      status: entry.sourceIncomplete ? "partial" : "ready", deferredModels: 0, error: null })) }; },
  };
  const loader = createPersistentSubchunkViewportLoader({ scope, profile, keySchema, subchunkSchema, materials,
    pool, stream, cutawayY: 80, loadSnapshot });
  return { loader, snapshots, jobs, sources, cutaways, updates, active };
};

await check("persistent viewport pins keys, palette versions, limits and source identity", async () => {
  const first = request(0), second = request(1);
  const values = new Map([[keyIdentity(first), new Uint8Array([1])], [keyIdentity(second), new Uint8Array([2])]]);
  const f = fixture(values, new Map([[1, decoded(voxels())], [2, decoded(voxels())]]));
  const progress = [];
  const result = await f.loader.load({ files: [{}], requests: [first, second] }, new AbortController().signal,
    value => progress.push({ ...value }));
  assert.equal(f.sources.length, 1); assert.equal(f.sources[0].textures.layers, 2);
  assert.deepEqual(f.cutaways, [{ requestedScope: scope, value: 80 }]);
  assert.equal(f.snapshots[0].expectedComparator, profile.expectedComparator);
  assert.deepEqual([...f.snapshots[0].desiredKeys[1]], [...encodePersistentSubchunkKey(second, keySchema)]);
  assert.deepEqual(f.jobs.map(job => job.work.context.paletteVersions), [[100], [100]]);
  assert(f.jobs.every(job => job.requestedScope === scope && job.work.kind === "subchunk"));
  assert.deepEqual(progress.at(-1), { decodedSubchunks: 2, totalSubchunks: 2, acceptedSections: 2, missingSubchunks: 0 });
  assert.equal(result.root, "Fixture World"); assert.equal(result.manifestName, "MANIFEST-000007");
  assert.equal(result.bytesRead, 4096); assert.deepEqual(result.selectedTables, [2]); assert.deepEqual(result.selectedLogs, [3]);
  f.loader.dispose();
});

await check("viewport refresh reuses unchanged subchunks and atomically evicts departed geometry", async () => {
  const first = request(0), shared = request(1), added = request(2);
  const values = new Map([[keyIdentity(first), new Uint8Array([1])], [keyIdentity(shared), new Uint8Array([2])],
    [keyIdentity(added), new Uint8Array([3])]]);
  const f = fixture(values, new Map([[1, decoded(voxels())], [2, decoded(voxels())], [3, decoded(voxels())]]));
  await f.loader.load({ files: [{}], requests: [first, shared] }, new AbortController().signal);
  await f.loader.load({ files: [{}], requests: [shared, added] }, new AbortController().signal);
  assert.deepEqual(f.jobs.map(job => job.work.bytes[0]), [1, 2, 3]);
  assert.deepEqual(f.updates[1].entries.map(entry => entry.id), [JSON.stringify([2, 0, 0])]);
  assert.deepEqual(f.updates[1].remove, [JSON.stringify([0, 0, 0])]);
  assert.deepEqual(f.loader.getLoadedSectionCoverage().map(item => item.origin), [[16, 0, 0], [32, 0, 0]]);
  f.loader.dispose();
});

await check("secondary persistent layers stay partial while base blocks remain selectable and sampled", async () => {
  const selected = request(-1);
  const base = voxels(undefined, [4, 2, 5]);
  const fluid = voxels(["minecraft:air", "minecraft:water"], [4, 3, 5]);
  const f = fixture(new Map([[keyIdentity(selected), new Uint8Array([4])]]), new Map([[4, decoded(base, fluid)]]));
  const result = await f.loader.load({ files: [{}], requests: [selected] }, new AbortController().signal);
  const entry = f.updates[0].entries[0];
  assert.equal(entry.sourceIncomplete, true); assert.equal(result.partialSections, 1);
  assert.deepEqual(result.palettes.get(entry.id).map(state => state.id), ["minecraft:air", "minecraft:stone"]);
  assert.deepEqual(f.loader.sampleHighestLoadedVoxel(-11.1, 5.2), { blockY: 2, topY: 3,
    sectionId: JSON.stringify([-1, 0, 0]) });
  const coverage = f.loader.getLoadedSectionCoverage();
  assert.deepEqual(coverage, [{ id: JSON.stringify([-1, 0, 0]), origin: [-16, 0, 0] }]);
  assert(Object.isFrozen(coverage) && Object.isFrozen(coverage[0]) && Object.isFrozen(coverage[0].origin));
  f.loader.dispose();
});

await check("known empty and missing subchunks remain distinct without invented geometry", async () => {
  const empty = request(0), missing = request(1);
  const f = fixture(new Map([[keyIdentity(empty), new Uint8Array([5])]]), new Map([[5, decoded()]]));
  const result = await f.loader.load({ files: [{}], requests: [empty, missing] }, new AbortController().signal);
  assert.equal(result.acceptedSections, 1); assert.equal(result.missingSubchunks, 1); assert.equal(result.palettes.size, 0);
  assert.equal(f.updates.length, 0); assert.equal(f.loader.sampleHighestLoadedVoxel(0, 0), null);
  assert.deepEqual(f.loader.getLoadedSectionCoverage(), [{ id: JSON.stringify([0, 0, 0]), origin: [0, 0, 0] }]);
  f.loader.dispose();
});

await check("invalid, cancelled and disposed persistent viewport requests fail before publication", async () => {
  const selected = request(0), abort = new AbortController(); abort.abort(new Error("fixture cancelled"));
  const f = fixture(new Map([[keyIdentity(selected), new Uint8Array([1])]]), new Map([[1, decoded(voxels())]]));
  await assert.rejects(f.loader.load({ files: [{}], requests: [selected] }, abort.signal), /fixture cancelled/);
  await assert.rejects(f.loader.load({ files: [{}], requests: [selected, selected] }, new AbortController().signal), /Duplicate/);
  assert.equal(f.jobs.length, 0); assert.equal(f.updates.length, 0);
  f.loader.dispose(); f.loader.dispose();
  assert.throws(() => f.loader.getLoadedSectionCoverage(), /disposed/);
  await assert.rejects(f.loader.load({ files: [{}], requests: [selected] }, new AbortController().signal), /disposed/);
  assert.throws(() => createPersistentSubchunkViewportLoader({ scope, profile: { ...profile, paletteVersions: [] },
    keySchema, subchunkSchema, materials, pool: {}, stream: {} }), /profile/);
});

console.log(`${checks} persistent subchunk viewport loader checks passed.`);
