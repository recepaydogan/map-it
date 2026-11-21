import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { GAME_SECTION_LAYOUTS, GAME_TERRAIN_PREVIEW_MATERIALS } from "../src/game-config.ts";
import { decodePalettedSection } from "../src/features/terrain/decode-paletted-section.ts";
import { meshVoxelSection } from "../src/features/terrain/mesh-voxel-section.ts";
import { voxelIndex, splitVoxelCoordinate } from "../src/features/terrain/voxel-section.ts";
import { readSectorRegion } from "../src/features/terrain/read-sector-region.ts";
import { parseRegionSnapshotName, planRegionSnapshot, planRegionSnapshots, regionSnapshotContainsPoint,
  REGION_SNAPSHOT_FILE_LIMIT } from "../src/features/terrain/region-snapshot-plan.ts";
import { selectRegionFolderFiles } from "../src/features/terrain/region-folder-selection.ts";
import { createRegionFolderViewportSource, REGION_FOLDER_FILE_INVENTORY_LIMIT } from "../src/features/terrain/region-folder-viewport-source.ts";
import { queryTerrainDirectoryPermission, readRegionDirectoryHandle, requestTerrainDirectoryPermission } from "../src/features/terrain/read-region-directory-handle.ts";
import { readLevelDbDirectoryHandle } from "../src/features/terrain/read-leveldb-directory-handle.ts";
import { createTerrainDirectoryHandleRepository, terrainDirectoryIdentityKey } from "../src/features/terrain/terrain-directory-handle-repository.ts";
import { classifyPreviewTerrainPalette, createPreviewTerrainTextures } from "../src/features/terrain/preview-terrain-materials.ts";

let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
const state = id => ({ id: `fixture:${id}`, properties: {} });
const states = count => Array.from({ length: count }, (_, i) => state(i));
const makeSection = () => ({ palette: states(3), indices: new Uint16Array(4096) });
const shapeOptions = { origin: [0, 0, 0], shapes: ["empty", "opaque-cube", "model"] };

// Independent test encoder: source-order coordinate traversal, padded binary words.
const packedFixture = (layout, bits, valueAt) => {
  const perWord = Math.floor(layout.wordBits / bits);
  const words = Array(Math.ceil(4096 / perWord)).fill(0n);
  let position = 0;
  for (let slow = 0; slow < 16; slow++) for (let middle = 0; middle < 16; middle++) for (let fast = 0; fast < 16; fast++) {
    const coordinates = Object.fromEntries([...layout.axisOrder].map((axis, index) => [axis, [slow, middle, fast][index]]));
    const value = valueAt(coordinates.x, coordinates.y, coordinates.z);
    words[Math.floor(position / perWord)] |= BigInt(value) << BigInt(position % perWord * bits);
    position++;
  }
  const bytes = new Uint8Array(words.length * layout.wordBits / 8);
  const view = new DataView(bytes.buffer);
  words.forEach((word, index) => layout.wordBits === 64
    ? view.setBigUint64(index * 8, word, layout.littleEndian)
    : view.setUint32(index * 4, Number(word), layout.littleEndian));
  return bytes;
};

check("singleton palettes retain their actual block, never default to empty", () => {
  const palette = [{ id: "fixture:solid", properties: { variant: "dense", active: true, stage: 2 } }];
  for (const layout of Object.values(GAME_SECTION_LAYOUTS)) {
    const result = decodePalettedSection(palette, new Uint8Array(), 0, layout);
    assert.equal(result.indices.length, 4096);
    assert(result.indices.every(index => index === 0));
    assert.deepEqual(result.palette, palette);
    assert.notEqual(result.palette[0].properties, palette[0].properties);
  }
});

check("64-bit big-endian golden words preserve top-bit values and padding", () => {
  const bytes = new Uint8Array(2048);
  bytes.set([0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10]);
  const result = decodePalettedSection(states(16), bytes, 4, GAME_SECTION_LAYOUTS.javaPadded);
  assert.deepEqual([...result.indices.slice(0, 16)], Array.from({ length: 16 }, (_, i) => i));
  assert.equal(result.indices[16], 0);
});

check("32-bit little-endian golden words transpose Y-fastest storage into X-fastest storage", () => {
  const bytes = new Uint8Array(2048);
  bytes.set([0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe]);
  const result = decodePalettedSection(states(16), bytes, 4, GAME_SECTION_LAYOUTS.bedrockPadded);
  for (let y = 0; y < 16; y++) assert.equal(result.indices[voxelIndex(0, y, 0)], y);
  assert.equal(result.indices[voxelIndex(1, 0, 0)], 0);
});

check("all configured nonzero bit widths decode every coordinate, including padded words", () => {
  for (const layout of Object.values(GAME_SECTION_LAYOUTS)) for (const bits of layout.allowedBits.filter(Boolean)) {
    const count = Math.min(4096, 2 ** bits);
    const at = (x, y, z) => (x * 157 + y * 41 + z * 23) % count;
    const bytes = packedFixture(layout, bits, at);
    // Nonzero view offset checks that buffer boundaries are respected.
    const envelope = new Uint8Array(bytes.length + 7);
    envelope.set(bytes, 3);
    const result = decodePalettedSection(states(count), envelope.subarray(3, 3 + bytes.length), bits, layout);
    for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++)
      assert.equal(result.indices[voxelIndex(x, y, z)], at(x, y, z));
  }
});

check("unused high padding bits cannot leak into neighboring values", () => {
  const layout = GAME_SECTION_LAYOUTS.javaPadded;
  const bytes = new Uint8Array(Math.ceil(4096 / 12) * 8);
  bytes[0] = 0xf0; // Four padding bits above twelve five-bit values.
  bytes[8] = 0xf0;
  assert(decodePalettedSection(states(17), bytes, 5, layout).indices.every(index => index === 0));
});

check("malformed size, bit width, singleton and palette indices are rejected", () => {
  const layout = GAME_SECTION_LAYOUTS.javaPadded;
  assert.throws(() => decodePalettedSection([], new Uint8Array(), 0, layout));
  assert.throws(() => decodePalettedSection(states(2), new Uint8Array(), 0, layout));
  assert.throws(() => decodePalettedSection(states(1), new Uint8Array(8), 0, layout));
  for (const bits of [-1, 1.5, 3, 17, Infinity, NaN])
    assert.throws(() => decodePalettedSection(states(2), new Uint8Array(2048), bits, layout));
  for (const size of [0, 2047, 2049])
    assert.throws(() => decodePalettedSection(states(2), new Uint8Array(size), 4, layout));
  assert.throws(() => decodePalettedSection(states(17), new Uint8Array(2048), 4, layout));
  const invalid = new Uint8Array(2048); invalid[7] = 3;
  assert.throws(() => decodePalettedSection(states(2), invalid, 4, layout));
  assert.throws(() => decodePalettedSection([{ id: "", properties: {} }], new Uint8Array(), 0, layout));
  assert.throws(() => decodePalettedSection([{ id: "fixture:x", properties: { invalid: NaN } }], new Uint8Array(), 0, layout));
});

check("negative block coordinates split with floor division, not truncation", () => {
  for (const [coordinate, section, local] of [[-17, -2, 15], [-16, -1, 0], [-1, -1, 15], [0, 0, 0], [16, 1, 0]])
    assert.deepEqual(splitVoxelCoordinate(coordinate), { section, local });
  assert.throws(() => splitVoxelCoordinate(0.5));
  assert.throws(() => splitVoxelCoordinate(Number.MAX_SAFE_INTEGER + 1));
});

check("isolated cubes produce outward faces and exact picking metadata", () => {
  const section = makeSection(); section.indices[voxelIndex(3, 5, 7)] = 1;
  const mesh = meshVoxelSection(section, shapeOptions);
  assert.equal(mesh.triangles.length, 36);
  assert.equal(mesh.positions.length, 72);
  assert(mesh.blockIndices.every(index => index === voxelIndex(3, 5, 7)));
  assert(mesh.paletteIndices.every(index => index === 1));
  assert.deepEqual([...mesh.faceDirections], [0, 1, 2, 3, 4, 5]);
  assert(mesh.faceFlags.every(flag => flag === 0));
  for (let face = 0; face < 6; face++) {
    const start = face * 12;
    const a = mesh.positions.slice(start, start + 3), b = mesh.positions.slice(start + 3, start + 6), c = mesh.positions.slice(start + 6, start + 9);
    const ab = b.map((value, index) => value - a[index]), ac = c.map((value, index) => value - a[index]);
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    assert.equal(cross.reduce((sum, value, index) => sum + value * mesh.normals[start + index], 0), 1);
  }
});

check("interior faces disappear while section-boundary coverage stays explicit", () => {
  const section = makeSection(); section.indices.fill(1);
  const unknown = meshVoxelSection(section, shapeOptions);
  assert.equal(unknown.blockIndices.length, 6 * 16 * 16);
  assert(unknown.faceFlags.every(flag => flag === 1));
  const known = meshVoxelSection(section, { ...shapeOptions, neighbor: () => "opaque-cube" });
  assert.equal(known.blockIndices.length, 0);
  const exposed = meshVoxelSection(section, { ...shapeOptions, neighbor: () => "empty" });
  assert.equal(exposed.blockIndices.length, unknown.blockIndices.length);
  assert(exposed.faceFlags.every(flag => flag === 0));
});

check("Y cutaway is inclusive in world coordinates and exposes a marked top cap", () => {
  const section = makeSection(); section.indices.fill(1);
  const mesh = meshVoxelSection(section, { ...shapeOptions, origin: [-16, -64, -32], cutawayY: -62, neighbor: () => "opaque-cube" });
  assert.equal(mesh.blockIndices.length, 256);
  assert(mesh.blockIndices.every(index => Math.floor(index / 256) === 2));
  assert(mesh.faceDirections.every(direction => direction === 3));
  assert(mesh.faceFlags.every(flag => flag === 2));
  assert.equal(Math.max(...mesh.positions.filter((_, index) => index % 3 === 1)), 3);
  assert.equal(meshVoxelSection(section, { ...shapeOptions, cutawayY: -1 }).blockIndices.length, 0);
});

check("large world coordinates retain exact origins and small local geometry", () => {
  const section = makeSection(); section.indices[4095] = 1;
  const origin = [29999984, -64, -30000000];
  const seen = [];
  const mesh = meshVoxelSection(section, { ...shapeOptions, origin, neighbor: (...position) => { seen.push(position); return "unknown"; } });
  assert.deepEqual(mesh.origin, origin);
  assert(mesh.positions.every(value => value >= 15 && value <= 16));
  assert(seen.some(([x, y, z]) => x === 30000000 && y === -49 && z === -29999985));
});

check("non-cube and fluid geometry is deferred explicitly, never substituted with cubes", () => {
  const section = makeSection(); section.indices[100] = 2;
  const mesh = meshVoxelSection(section, shapeOptions);
  assert.deepEqual([...mesh.deferredModelIndices], [100]);
  assert.equal(mesh.triangles.length, 0);
});

check("meshing rejects corrupt indices, unclassified states and invalid coordinates", () => {
  const section = makeSection(); section.indices[0] = 3;
  assert.throws(() => meshVoxelSection(section, shapeOptions));
  section.indices[0] = 1;
  assert.throws(() => meshVoxelSection(section, { ...shapeOptions, shapes: ["empty"] }));
  assert.throws(() => meshVoxelSection(section, { ...shapeOptions, origin: [1, 0, 0] }));
  assert.throws(() => meshVoxelSection(section, { ...shapeOptions, cutawayY: NaN }));
  assert.throws(() => meshVoxelSection(section, { ...shapeOptions, neighbor: () => "invalid" }));
  assert.throws(() => meshVoxelSection(section, { ...shapeOptions, neighbor: () => undefined }));
  assert.throws(() => meshVoxelSection(section, { ...shapeOptions, shapes: new Array(3) }));
  assert.throws(() => meshVoxelSection(section, { ...shapeOptions, origin: new Array(3) }));
});

check("both configured layouts feed the same mesh without axis transposition", () => {
  const at = (x, y, z) => (x === 3 && y === 5 && z === 7 ? 1 : 0);
  const meshes = Object.values(GAME_SECTION_LAYOUTS).map(layout => {
    const section = decodePalettedSection(states(2), packedFixture(layout, 4, at), 4, layout);
    return meshVoxelSection(section, { origin: [0, 0, 0], shapes: ["empty", "opaque-cube"] });
  });
  assert.deepEqual(meshes[0], meshes[1]);
});

const regionFixture = () => {
  const bytes = new Uint8Array(4 * 4096);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, (2 << 8) | 1, false);
  view.setUint32(4096, 0xfedcba98, false);
  view.setUint32(8192, 5, false);
  view.setUint8(8196, 2);
  bytes.set([10, 20, 30, 40], 8197);
  return { bytes, view };
};

check("region payload extraction preserves coordinates, unsigned timestamps and missing coverage", () => {
  const { bytes } = regionFixture();
  const entries = readSectorRegion(bytes, -2, -1);
  assert.equal(entries.length, 1024);
  assert.deepEqual(entries[0], { slot: 0, chunkX: -64, chunkZ: -32, timestampSeconds: 0xfedcba98,
    compressionId: 2, external: false, data: new Uint8Array([10, 20, 30, 40]) });
  assert(entries.slice(1).every(entry => entry === null));
  bytes.fill(0);
  assert.equal(entries[0].data[0], 10);
});

check("last region slot and nonzero input view offsets are respected", () => {
  const { bytes, view } = regionFixture();
  view.setUint32(1023 * 4, (3 << 8) | 1, false);
  view.setUint32(12288, 2, false); view.setUint8(12292, 3); view.setUint8(12293, 42);
  const envelope = new Uint8Array(bytes.length + 11); envelope.set(bytes, 7);
  const entries = readSectorRegion(envelope.subarray(7, 7 + bytes.length), -1, -1);
  assert.equal(entries[1023].chunkX, -1);
  assert.equal(entries[1023].chunkZ, -1);
  assert.deepEqual([...entries[1023].data], [42]);
});

check("region headers, file size limits and sector allocations are validated before extraction", () => {
  const { bytes } = regionFixture();
  for (const size of [0, 4096, 8191, 12289]) assert.throws(() => readSectorRegion(bytes.subarray(0, size), 0, 0));
  assert.throws(() => readSectorRegion(bytes, 0, 0, 8192));
  assert.throws(() => readSectorRegion(bytes, NaN, 0));
  assert.throws(() => readSectorRegion(bytes, Number.MAX_SAFE_INTEGER, 0));
  assert.throws(() => readSectorRegion(bytes, 0, 0, Infinity));
  for (const location of [1, (1 << 8) | 1, 2 << 8, (4 << 8) | 1, (2 << 8) | 255]) {
    const broken = regionFixture(); broken.view.setUint32(0, location, false);
    assert.throws(() => readSectorRegion(broken.bytes, 0, 0));
  }
});

check("region overlap and invalid payload lengths fail rather than returning partial success", () => {
  const overlap = regionFixture(); overlap.view.setUint32(4, (2 << 8) | 1, false);
  assert.throws(() => readSectorRegion(overlap.bytes, 0, 0));
  for (const length of [0, 1, 4093, 0xffffffff]) {
    const broken = regionFixture(); broken.view.setUint32(8192, length, false);
    assert.throws(() => readSectorRegion(broken.bytes, 0, 0));
  }
});

check("external and unknown compression records stay explicit without opening other files", () => {
  const { bytes, view } = regionFixture();
  view.setUint32(8192, 1, false); view.setUint8(8196, 130);
  const external = readSectorRegion(bytes, 0, 0)[0];
  assert.equal(external.external, true);
  assert.equal(external.compressionId, 2);
  assert.equal(external.data.length, 0);
  view.setUint32(8192, 5, false);
  assert.throws(() => readSectorRegion(bytes, 0, 0));
  view.setUint8(8196, 4);
  const unsupported = readSectorRegion(bytes, 0, 0)[0];
  assert.equal(unsupported.compressionId, 4);
  assert.equal(unsupported.external, false);
});

check("region snapshot planning validates file coordinates and selects center-first bounded columns", () => {
  assert.deepEqual(parseRegionSnapshotName("r.-2.17.mca"), { regionX: -2, regionZ: 17 });
  for (const name of ["level.dat", "r.1.x.mca", "r.9007199254740992.0.mca", "r.17592186044416.0.mca"]) assert.equal(parseRegionSnapshotName(name), null);
  const { bytes, view } = regionFixture();
  view.setUint32(33 * 4, (3 << 8) | 1, false);
  view.setUint32(12288, 2, false); view.setUint8(12292, 3); view.setUint8(12293, 99);
  const plan = planRegionSnapshot("r.-2.-1.mca", bytes, { x: -63 * 16 + 8, z: -31 * 16 + 8 }, 1);
  assert.equal(plan.available, 2); assert.equal(plan.missing, 1022); assert.equal(plan.external, 0); assert.equal(plan.deferred, 1);
  assert.equal(plan.payloads[0].slot, 33); assert.equal(plan.payloads[0].chunkX, -63); assert.equal(plan.payloads[0].chunkZ, -31);
  bytes.fill(0, 12288); view.setUint32(12288, 1, false); view.setUint8(12292, 131);
  const external = planRegionSnapshot("r.-2.-1.mca", bytes, { x: 0, z: 0 });
  assert.equal(external.external, 1); assert.equal(external.payloads.length, 1);
  assert.throws(() => planRegionSnapshot("wrong.mca", bytes, { x: 0, z: 0 }));
  assert.throws(() => planRegionSnapshot("r.0.0.mca", bytes, { x: NaN, z: 0 }));
});

check("multi-region planning is globally focus-first, bounded and duplicate-safe", () => {
  const first = regionFixture(), second = regionFixture();
  const plan = planRegionSnapshots([
    { name: "r.0.0.mca", bytes: first.bytes }, { name: "r.1.0.mca", bytes: second.bytes },
  ], { x: 512, z: 0 }, 2);
  assert.deepEqual(plan.regions.map(region => [region.regionX, region.regionZ]), [[0, 0], [1, 0]]);
  assert.equal(plan.regionX, 1); assert.equal(plan.regionZ, 0);
  assert.equal(plan.payloads[0].chunkX, 32); assert.equal(plan.payloads[1].chunkX, 0);
  assert.equal(plan.available, 2); assert.equal(plan.missing, 2046); assert.equal(plan.totalBytes, first.bytes.length + second.bytes.length);
  assert.equal(regionSnapshotContainsPoint(plan, 512, 0), true);
  assert.equal(regionSnapshotContainsPoint(plan, 511.99, 0), true);
  assert.equal(regionSnapshotContainsPoint(plan, -0.01, 0), false);
  assert.throws(() => planRegionSnapshots([
    { name: "r.0.0.mca", bytes: first.bytes }, { name: "R.0.0.MCA", bytes: second.bytes },
  ], { x: 0, z: 0 }), /Duplicate/);
  assert.throws(() => planRegionSnapshots(Array.from({ length: REGION_SNAPSHOT_FILE_LIMIT + 1 }, (_, index) =>
    ({ name: `r.${index}.0.mca`, bytes: first.bytes })), { x: 0, z: 0 }), /file count/);
});

check("folder selection isolates the active dimension and retains only a bounded nearest region set", () => {
  const file = (name, path, size = 12288) => ({ name, webkitRelativePath: path, size });
  const files = [
    file("r.0.0.mca", "Fixture/region/r.0.0.mca"),
    file("r.2.0.mca", "Fixture/DIM-1/region/r.2.0.mca"),
    file("r.1.0.mca", "Fixture/DIM-1/region/r.1.0.mca"),
    file("r.1.0.mca", "Fixture/DIM-1/entities/r.1.0.mca"),
    file("notes.txt", "Fixture/DIM-1/region/notes.txt", 4),
  ];
  const selected = selectRegionFolderFiles(files, ["DIM-1", "region"], { x: 512, z: 0 }, 1);
  assert.equal(selected.matchedFiles, 2); assert.equal(selected.files[0].name, "r.1.0.mca"); assert.equal(selected.folderLabel, "Fixture");
  const overworld = selectRegionFolderFiles(files, ["region"], { x: 0, z: 0 }, 8, 64 * 1024 * 1024,
    [["DIM-1", "region"], ["DIM1", "region"]]);
  assert.equal(overworld.matchedFiles, 1); assert.equal(overworld.files[0].webkitRelativePath, "Fixture/region/r.0.0.mca");
  assert.throws(() => selectRegionFolderFiles([
    file("r.1.0.mca", "Fixture/DIM-1/region/r.1.0.mca"),
    file("R.1.0.MCA", "Fixture/DIM-1/region/R.1.0.MCA"),
  ], ["DIM-1", "region"], { x: 0, z: 0 }), /duplicate/);
  assert.throws(() => selectRegionFolderFiles([
    file("r.0.0.mca", "Parent/World A/DIM-1/region/r.0.0.mca"),
    file("r.1.0.mca", "Parent/World B/DIM-1/region/r.1.0.mca"),
  ], ["DIM-1", "region"], { x: 0, z: 0 }), /world root/);
  assert.throws(() => selectRegionFolderFiles(files, ["DIM1", "region"], { x: 0, z: 0 }), /no region files/);
});

await (async () => {
  const reads = new Map();
  const file = (regionX, read = async () => new ArrayBuffer(12288)) => ({ name: `r.${regionX}.0.mca`,
    webkitRelativePath: `Fixture/region/r.${regionX}.0.mca`, size: 12288, lastModified: 100 + regionX,
    arrayBuffer: async () => { reads.set(regionX, (reads.get(regionX) ?? 0) + 1); return read(); } });
  const source = createRegionFolderViewportSource({ files: [file(0), file(1), file(2)], directorySegments: ["region"], maxFiles: 2 });
  const initial = await source.load({ x: 0, z: 0 });
  assert.deepEqual(initial.files.map(item => item.name), ["r.0.0.mca", "r.1.0.mca"]);
  assert.equal(initial.matchedFiles, 3); assert.equal(initial.folderLabel, "Fixture");
  assert.equal(source.needsLoad({ x: 511, z: 0 }), false); assert.equal(source.needsLoad({ x: 512, z: 0 }), true);
  const moved = await source.load({ x: 1024, z: 0 });
  assert.deepEqual(moved.files.map(item => item.name), ["r.2.0.mca", "r.1.0.mca"]);
  assert.deepEqual(Object.fromEntries(reads), { 0: 1, 1: 1, 2: 1 });

  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const superseded = createRegionFolderViewportSource({ files: [file(0, async () => { await gate; return new ArrayBuffer(12288); }), file(1)],
    directorySegments: ["region"], maxFiles: 1 });
  const oldLoad = superseded.load({ x: 0, z: 0 });
  const newLoad = superseded.load({ x: 512, z: 0 });
  assert.equal((await newLoad).files[0].name, "r.1.0.mca"); release();
  await assert.rejects(oldLoad, error => error instanceof Error && error.name === "AbortError");
  superseded.dispose(); assert.equal(superseded.needsLoad({ x: 0, z: 0 }), false); assert.equal(superseded.getSnapshot(), null);
  await assert.rejects(() => superseded.load({ x: 0, z: 0 }), error => error instanceof Error && error.name === "AbortError");
  assert.throws(() => createRegionFolderViewportSource({ files: new Array(REGION_FOLDER_FILE_INVENTORY_LIMIT + 1).fill(file(0)),
    directorySegments: ["region"] }), /oversized/);
  checks++; console.log("PASS folder viewport source refreshes bounded nearest regions, reuses bytes and rejects stale work");
})();

await (async () => {
  const identity = { worldId: "world-a", edition: "java", version: "1.21.3", dimension: "nether" };
  const repository = createTerrainDirectoryHandleRepository({ factory: new IDBFactory(), name: "fixture-terrain-handles", now: () => 42 });
  assert.equal(await repository.get(identity), null);
  await repository.put(identity, { kind: "directory", token: "opaque-native-handle" });
  assert.deepEqual(await repository.get(identity), { schemaVersion: 1, id: terrainDirectoryIdentityKey(identity), ...identity,
    handle: { kind: "directory", token: "opaque-native-handle" }, updatedAt: 42 });
  const other = { ...identity, dimension: "overworld" };
  await repository.put(other, { kind: "directory", token: "other-dimension" });
  await repository.remove(identity); assert.equal(await repository.get(identity), null); assert((await repository.get(other)) !== null);
  await repository.removeWorld(identity.worldId); assert.equal(await repository.get(other), null);
  assert.throws(() => terrainDirectoryIdentityKey({ ...identity, worldId: "" })); repository.close();

  const bytes = new Uint8Array(12288); bytes[0] = 7;
  const fileHandle = name => ({ kind: "file", name, getFile: async () => ({ name, size: bytes.length, lastModified: 9,
    arrayBuffer: async () => bytes.buffer.slice(0) }) });
  const directory = (name, children, permission = "granted") => ({ kind: "directory", name,
    getDirectoryHandle: async segment => { const child = children[segment]; if (!child || child.kind !== "directory") throw new Error("missing"); return child; },
    entries: async function* () { for (const item of Object.entries(children)) yield item; },
    queryPermission: async () => permission, requestPermission: async () => permission });
  const region = directory("region", { "r.0.0.mca": fileHandle("r.0.0.mca"), "notes.txt": fileHandle("notes.txt") });
  const nether = directory("DIM-1", { region });
  const root = directory("Fixture", { "DIM-1": nether });
  assert.equal(await queryTerrainDirectoryPermission(root), "granted");
  assert.equal(await requestTerrainDirectoryPermission(root), "granted");
  const inventory = await readRegionDirectoryHandle(root, ["DIM-1", "region"]);
  assert.equal(inventory.length, 1); assert.equal(inventory[0].webkitRelativePath, "Fixture/DIM-1/region/r.0.0.mca");
  assert.deepEqual(new Uint8Array(await inventory[0].arrayBuffer()).slice(0, 1), new Uint8Array([7]));
  await assert.rejects(() => readRegionDirectoryHandle(root, ["DIM1", "region"]), /missing/);
  const db = directory("db", { CURRENT: fileHandle("CURRENT"), "MANIFEST-000001": fileHandle("MANIFEST-000001"),
    "000001.ldb": fileHandle("000001.ldb"), "LOCK": fileHandle("LOCK") });
  const bedrockRoot = directory("Bedrock Fixture", { db });
  const levelDbInventory = await readLevelDbDirectoryHandle(bedrockRoot);
  assert.deepEqual(levelDbInventory.map(item => item.name), ["000001.ldb", "CURRENT", "MANIFEST-000001"]);
  assert(levelDbInventory.every(item => item.webkitRelativePath.startsWith("Bedrock Fixture/db/")));
  await assert.rejects(() => readLevelDbDirectoryHandle(directory("Broken", { db: directory("db", {
    "000001.ldb": fileHandle("000001.ldb"),
  }) })), /not a readable Bedrock/);
  checks++; console.log("PASS retained directory handles stay context-scoped and read only the authorized dimension path");
})();

check("schematic terrain resources classify safe cubes and defer unsupported block models", () => {
  const resources = classifyPreviewTerrainPalette([
    { id: "minecraft:air", properties: {} }, { id: "minecraft:stone", properties: {} },
    { id: "minecraft:oak_stairs", properties: { facing: "north" } }, { id: "fixture:unknown", properties: {} },
  ], GAME_TERRAIN_PREVIEW_MATERIALS);
  assert.deepEqual(resources.shapes, ["empty", "opaque-cube", "model", "opaque-cube"]);
  const stone = GAME_TERRAIN_PREVIEW_MATERIALS.groups.findIndex(group => group.id === "stone");
  const fallback = GAME_TERRAIN_PREVIEW_MATERIALS.groups.length - 1;
  assert.deepEqual(resources.materials[1].map(face => face.tile), [stone * 3 + 1, stone * 3 + 1, stone * 3 + 2,
    stone * 3, stone * 3 + 1, stone * 3 + 1]);
  assert.deepEqual(resources.materials[3].map(face => face.tile), [fallback * 3 + 1, fallback * 3 + 1, fallback * 3 + 2,
    fallback * 3, fallback * 3 + 1, fallback * 3 + 1]);
  const textures = createPreviewTerrainTextures(GAME_TERRAIN_PREVIEW_MATERIALS);
  assert.equal(textures.layers, GAME_TERRAIN_PREVIEW_MATERIALS.groups.length * 3);
  assert.equal(textures.rgba.length, 16 * 16 * textures.layers * 4);
  assert(textures.rgba.every((value, index) => index % 4 !== 3 || value === 255));
  const layer = index => textures.rgba.slice(index * 16 * 16 * 4, (index + 1) * 16 * 16 * 4);
  assert.notDeepEqual(layer(stone * 3), layer(stone * 3 + 1));
  assert.notDeepEqual(layer(stone * 3 + 1), layer(stone * 3 + 2));
  assert(new Set(Array.from(layer(stone * 3 + 1)).filter((_, index) => index % 4 !== 3)).size > 8);
  assert.deepEqual(createPreviewTerrainTextures(GAME_TERRAIN_PREVIEW_MATERIALS), textures);
  assert.throws(() => createPreviewTerrainTextures({ ...GAME_TERRAIN_PREVIEW_MATERIALS,
    groups: [{ id: "bad", color: [0, 0, 0], tokens: [], pattern: "blur" }] }));
});

console.log(`Terrain checks passed: ${checks}`);
