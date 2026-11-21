import assert from "node:assert/strict";
import { NbtCompound, NbtInt, NbtIntArray, NbtString } from "deepslate/nbt";
import { GAME_COLUMN_TAG_SCHEMA, GAME_JAVA_SAVED_STRUCTURE_TYPE_IDS, GAME_STRUCTURE_TYPES } from "../src/game-config.ts";
import { readSavedStructureStarts } from "../src/features/terrain/read-saved-structure-starts.ts";
import { savedStructureOccurrences } from "../src/features/worlds/saved-structure-occurrence.ts";
import { predictedStructuresWithoutSavedDuplicates, savedOccurrenceCoversCandidate,
  visibleSavedStructureOccurrences } from "../src/features/worlds/saved-structure-display.ts";

const compound = entries => new NbtCompound(new Map(Object.entries(entries)));
const schema = GAME_COLUMN_TAG_SCHEMA.structureStarts;
const context = { chunkX: -32, chunkZ: 64 };
const start = (overrides = {}) => compound({
  id: new NbtString("minecraft:village"),
  ChunkX: new NbtInt(context.chunkX),
  ChunkZ: new NbtInt(context.chunkZ),
  BB: new NbtIntArray(new Int32Array([-520, -64, 1016, -480, 84, 1056])),
  ...overrides,
});
const rootWith = starts => compound({ structures: compound({ starts: compound(starts) }) });
let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };

check("absent optional metadata remains unavailable rather than proving absence", () => {
  assert.deepEqual(readSavedStructureStarts(compound({}), schema, context), { coverage: "unavailable", starts: [] });
  assert.deepEqual(readSavedStructureStarts(compound({}), undefined, context), { coverage: "unavailable", starts: [] });
});

check("valid starts retain raw identity, exact bounding boxes and immutable evidence", () => {
  const result = readSavedStructureStarts(rootWith({
    "minecraft:village": start(),
    "minecraft:invalid": compound({ id: new NbtString("INVALID") }),
  }), schema, context);
  assert.deepEqual(result, { coverage: "available", starts: [{
    key: "minecraft:village", id: "minecraft:village", chunkX: -32, chunkZ: 64,
    boundingBox: [-520, -64, 1016, -480, 84, 1056],
  }] });
  assert(Object.isFrozen(result) && Object.isFrozen(result.starts));
  assert(Object.isFrozen(result.starts[0]) && Object.isFrozen(result.starts[0].boundingBox));
});

check("malformed structure envelopes and entries fail closed", () => {
  assert.throws(() => readSavedStructureStarts(compound({ structures: new NbtString("bad") }), schema, context), /root/);
  assert.throws(() => readSavedStructureStarts(compound({ structures: compound({}) }), schema, context), /starts/);
  assert.throws(() => readSavedStructureStarts(rootWith({ village: new NbtString("bad") }), schema, context), /start/);
  assert.throws(() => readSavedStructureStarts(rootWith({ village: start({ id: new NbtInt(1) }) }), schema, context), /identifier/);
});

check("coordinates and six-axis bounding boxes must match their containing column", () => {
  assert.throws(() => readSavedStructureStarts(rootWith({ village: start({ ChunkX: new NbtInt(-31) }) }), schema, context), /coordinates/);
  assert.throws(() => readSavedStructureStarts(rootWith({ village: start({ BB: new NbtIntArray(new Int32Array([0, 0, 0])) }) }), schema, context), /bounding box/);
  assert.throws(() => readSavedStructureStarts(rootWith({ village: start({
    BB: new NbtIntArray(new Int32Array([10, 0, 0, 9, 1, 1])),
  }) }), schema, context), /inverted/);
});

check("structure entry count is bounded even when every entry is an invalid sentinel", () => {
  const entries = Object.fromEntries(Array.from({ length: 257 }, (_, index) => [
    `invalid-${index}`, compound({ id: new NbtString("INVALID") }),
  ]));
  assert.throws(() => readSavedStructureStarts(rootWith(entries), schema, context), /limit/);
});

check("official registry aliases map to stable app types without collapsing saved evidence into candidates", () => {
  const configuredTypes = new Set(GAME_STRUCTURE_TYPES.map(type => type.id));
  const aliases = GAME_JAVA_SAVED_STRUCTURE_TYPE_IDS.flatMap(entry => entry.ids.map(id => [id, entry.type]));
  assert.equal(new Set(aliases.map(([id]) => id)).size, aliases.length);
  assert(aliases.every(([, type]) => configuredTypes.has(type)));
  const result = savedStructureOccurrences([
    { key: "minecraft:village_plains", id: "minecraft:village", chunkX: -32, chunkZ: 64,
      boundingBox: [-520, -64, 1016, -480, 84, 1056] },
    { key: "minecraft:unknown", id: "minecraft:unknown", chunkX: -32, chunkZ: 64,
      boundingBox: [0, 0, 0, 1, 1, 1] },
  ], { version: "1.20.6", dimension: "overworld" });
  assert.equal(result.length, 1); assert.equal(result[0].type, "village");
  assert.deepEqual(result[0].anchor, [-499.5, 85, 1036.5]);
  assert.equal(result[0].evidence, "saved-structure-start");
  assert(Object.isFrozen(result) && Object.isFrozen(result[0]) && Object.isFrozen(result[0].anchor));
});

check("conflicting raw structure identities are rejected instead of choosing one", () => {
  assert.deepEqual(savedStructureOccurrences([{ key: "minecraft:village_plains", id: "minecraft:fortress",
    chunkX: 0, chunkZ: 0, boundingBox: [0, 0, 0, 1, 1, 1] }], { version: "1.20.6", dimension: "overworld" }), []);
});

check("saved occurrence mapping is gated by exact vanilla release and dimension", () => {
  const trial = [{ key: "minecraft:trial_chambers", id: "minecraft:trial_chambers", chunkX: 0, chunkZ: 0,
    boundingBox: [0, -20, 0, 20, 20, 20] }];
  assert.equal(savedStructureOccurrences(trial, { version: "1.18.2", dimension: "overworld" }).length, 0);
  assert.equal(savedStructureOccurrences(trial, { version: "1.21.3", dimension: "nether" }).length, 0);
  assert.equal(savedStructureOccurrences(trial, { version: "1.21.3", dimension: "overworld" }).length, 1);
});

check("saved occurrences obey the same category and personal-state filters as predictions", () => {
  const [occurrence] = savedStructureOccurrences([{ key: "minecraft:village_plains", id: "minecraft:village",
    chunkX: 0, chunkZ: 0, boundingBox: [0, 60, 0, 20, 80, 20] }], { version: "1.20.6", dimension: "overworld" });
  const reference = JSON.stringify(["overworld", occurrence.id]);
  const base = { visibleCategories: ["village"], expandedGroup: null, search: "", hideFound: false, favoritesOnly: false };
  assert.equal(visibleSavedStructureOccurrences([occurrence], "overworld", { found: [], favorites: [] }, base).length, 1);
  assert.equal(visibleSavedStructureOccurrences([occurrence], "overworld", { found: [reference], favorites: [] },
    { ...base, hideFound: true }).length, 0);
  assert.equal(visibleSavedStructureOccurrences([occurrence], "overworld", { found: [], favorites: [] },
    { ...base, favoritesOnly: true }).length, 0);
  assert.equal(visibleSavedStructureOccurrences([occurrence], "overworld", { found: [], favorites: [reference] },
    { ...base, favoritesOnly: true }).length, 1);
});

check("saved bounding-box evidence suppresses only nearby same-type predictions for display", () => {
  const [occurrence] = savedStructureOccurrences([{ key: "minecraft:village_plains", id: "minecraft:village",
    chunkX: 0, chunkZ: 0, boundingBox: [0, 60, 0, 20, 80, 20] }], { version: "1.20.6", dimension: "overworld" });
  const nearby = { id: "near", type: "village", x: 30, y: null, z: 10 };
  const otherType = { id: "other", type: "desert-pyramid", x: 10, y: null, z: 10 };
  const far = { id: "far", type: "village", x: 40, y: null, z: 10 };
  assert(savedOccurrenceCoversCandidate(occurrence, nearby));
  assert(!savedOccurrenceCoversCandidate(occurrence, otherType));
  assert.deepEqual(predictedStructuresWithoutSavedDuplicates([nearby, otherType, far], [occurrence]), [otherType, far]);
  assert.throws(() => savedOccurrenceCoversCandidate(occurrence, nearby, -1), /margin/);
});

check("hidden saved evidence never falls back to a weaker duplicate prediction", () => {
  const [occurrence] = savedStructureOccurrences([{ key: "minecraft:village_plains", id: "minecraft:village",
    chunkX: 0, chunkZ: 0, boundingBox: [0, 60, 0, 20, 80, 20] }], { version: "1.20.6", dimension: "overworld" });
  const nearby = { id: "predicted-village", type: "village", x: 10, y: null, z: 10 };
  const reference = JSON.stringify(["overworld", occurrence.id]);
  const hiddenSaved = visibleSavedStructureOccurrences([occurrence], "overworld", { found: [reference], favorites: [] },
    { visibleCategories: ["village"], expandedGroup: null, search: "", hideFound: true, favoritesOnly: false });
  assert.deepEqual(hiddenSaved, []);
  assert.deepEqual(predictedStructuresWithoutSavedDuplicates([nearby], [occurrence]), []);
});

console.log(`${checks} saved structure start checks passed.`);
