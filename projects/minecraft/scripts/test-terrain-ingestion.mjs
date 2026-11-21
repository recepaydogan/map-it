import assert from "node:assert/strict";
import { deflateRawSync, deflateSync, gzipSync } from "node:zlib";
import { NbtFile, NbtCompound, NbtInt, NbtByte, NbtString, NbtList, NbtLongArray, NbtIntArray } from "deepslate/nbt";
import { readBoundedNbt } from "../src/features/terrain/read-bounded-nbt.ts";
import { decompressBounded } from "../src/features/terrain/decompress-bounded.ts";
import { decodeBinaryString } from "../src/features/terrain/decode-binary-string.ts";
import { readPalettedColumn } from "../src/features/terrain/read-paletted-column.ts";
import { readRegionColumn } from "../src/features/terrain/read-region-column.ts";
import { readSectorRegion } from "../src/features/terrain/read-sector-region.ts";
import { readLayeredSubchunk } from "../src/features/terrain/read-layered-subchunk.ts";
import { levelDbCrc32c, maskLevelDbCrc32c, unmaskLevelDbCrc32c } from "../src/features/terrain/leveldb-crc32c.ts";
import { readLevelDbLog, readLevelDbWriteBatch } from "../src/features/terrain/read-leveldb-log.ts";
import { readLevelDbTable } from "../src/features/terrain/read-leveldb-table.ts";
import { parseLevelDbCurrent, readLevelDbManifest } from "../src/features/terrain/read-leveldb-manifest.ts";
import { loadLevelDbFolderSnapshot } from "../src/features/terrain/load-leveldb-folder-snapshot.ts";
import { loadPersistentSubchunkSnapshot } from "../src/features/terrain/load-persistent-subchunk-snapshot.ts";
import { encodePersistentSubchunkKey, parsePersistentSubchunkKey } from "../src/features/terrain/persistent-subchunk-key.ts";
import { meshVoxelSection } from "../src/features/terrain/mesh-voxel-section.ts";
import { GAME_COLUMN_TAG_SCHEMA, GAME_NBT_FORMATS, GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA, GAME_REGION_COMPRESSION, GAME_SUBCHUNK_SCHEMA } from "../src/game-config.ts";

let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const bytes = (...values) => Buffer.from(values);
const number = (method, width, value) => { const out = Buffer.alloc(width); out[method](value); return out; };
const u16 = value => number("writeUInt16BE", 2, value);
const i32 = value => number("writeInt32BE", 4, value);
const named = (type, name, payload) => Buffer.concat([bytes(type), u16(Buffer.byteLength(name)), Buffer.from(name), payload]);
const document = (...tags) => Buffer.concat([bytes(10, 0, 0), ...tags, bytes(0)]);
const textPayload = value => Buffer.concat([u16(Buffer.byteLength(value)), Buffer.from(value)]);
const parse = (data, extra = {}) => readBoundedNbt(data, { ...GAME_NBT_FORMATS.java, ...extra });

await check("bounded tags preserve signed 64-bit values in both byte orders", () => {
  for (const littleEndian of [false, true]) for (const value of [-9223372036854775808n, 9223372036854775807n, 0x123456789abcdefn]) {
    const length = littleEndian ? bytes(1, 0) : bytes(0, 1);
    const long = number(littleEndian ? "writeBigInt64LE" : "writeBigInt64BE", 8, value);
    const input = Buffer.concat([bytes(10, 0, 0, 4), length, bytes(120), long, bytes(0)]);
    assert.equal(parse(input, { littleEndian }).root.get("x").toBigInt(), value);
  }
});

await check("all primitive and array tag families decode without type coercion", () => {
  const input = document(
    named(1, "byte", bytes(255)), named(2, "short", number("writeInt16BE", 2, -1234)), named(3, "int", i32(-1234567)),
    named(5, "float", number("writeFloatBE", 4, 1.25)), named(6, "double", number("writeDoubleBE", 8, -5.125)),
    named(7, "bytes", Buffer.concat([i32(3), bytes(0, 127, 255)])), named(8, "text", textPayload("hello")),
    named(9, "list", Buffer.concat([bytes(3), i32(2), i32(4), i32(5)])),
    named(10, "compound", Buffer.concat([named(3, "nested", i32(42)), bytes(0)])),
    named(11, "ints", Buffer.concat([i32(2), i32(-1), i32(0x12345678)])),
    named(12, "longs", Buffer.concat([i32(1), number("writeBigInt64BE", 8, -9007199254740993n)])),
  );
  const { root, bytesRead } = parse(input);
  assert.equal(bytesRead, input.length);
  assert.equal(root.getNumber("byte"), -1); assert.equal(root.getNumber("short"), -1234);
  assert.equal(root.getNumber("int"), -1234567); assert.equal(root.getNumber("float"), 1.25);
  assert.equal(root.getNumber("double"), -5.125); assert.equal(root.getString("text"), "hello");
  assert.deepEqual(root.getByteArray("bytes").getItems().map(v => v.getAsNumber()), [0, 127, -1]);
  assert.deepEqual(root.getList("list").getItems().map(v => v.getAsNumber()), [4, 5]);
  assert.equal(root.getCompound("compound").getNumber("nested"), 42);
  assert.deepEqual(root.getIntArray("ints").getItems().map(v => v.getAsNumber()), [-1, 0x12345678]);
  assert.equal(root.getLongArray("longs").get(0).toBigInt(), -9007199254740993n);
});

await check("modified UTF-8 handles encoded null and supplementary UTF-16 pairs", () => {
  const encoded = bytes(65, 0xc0, 0x80, 0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80);
  const input = document(named(8, "s", Buffer.concat([u16(encoded.length), encoded])));
  assert.equal(parse(input).root.getString("s"), "A\0😀");
  for (const bad of [[0], [0xff], [0xc0], [0xc1, 0x81], [0xe0, 0x80, 0x80], [0xc2, 0x41], [0xf0, 0x9f, 0x98, 0x80]])
    assert.throws(() => decodeBinaryString(bytes(...bad), "modified-utf-8"));
  assert.equal(decodeBinaryString(Buffer.from("😀"), "utf-8"), "😀");
  assert.throws(() => decodeBinaryString(bytes(0xc0, 0x80), "utf-8"));
});

await check("unsigned string lengths and supplied input view boundaries are respected", () => {
  const value = "x".repeat(40000);
  const input = document(named(8, "s", textPayload(value)));
  assert.equal(parse(input).root.getString("s"), value);
  const envelope = Buffer.concat([bytes(99, 99), input, bytes(99)]);
  assert.equal(parse(envelope.subarray(2, 2 + input.length)).bytesRead, input.length);
  assert.throws(() => parse(envelope.subarray(2, 2 + input.length - 1)));
});

await check("malformed tags, duplicate names, truncation and unrequested suffixes fail", () => {
  const samples = [bytes(), bytes(3, 0, 0), bytes(10, 0), document(named(99, "bad", bytes())),
    document(named(3, "x", i32(1)), named(3, "x", i32(2))),
    document(named(9, "list", Buffer.concat([bytes(0), i32(1)]))),
    document(named(9, "list", Buffer.concat([bytes(3), i32(-1)]))),
    document(named(7, "array", i32(-1))), document(named(12, "array", i32(1000000))),
    Buffer.concat([document(), bytes(1)])];
  for (const input of samples) assert.throws(() => parse(input));
  const input = document(named(3, "x", i32(42)));
  for (let end = 0; end < input.length; end++) assert.throws(() => parse(input.subarray(0, end)));
  assert.equal(parse(Buffer.concat([input, bytes(1)]), { allowTrailing: true }).bytesRead, input.length);
});

await check("nested and aggregate allocation budgets fail before unbounded allocation", () => {
  let inner = bytes(0);
  for (let depth = 0; depth < 5; depth++) inner = Buffer.concat([named(10, "n", inner), bytes(0)]);
  assert.throws(() => parse(Buffer.concat([bytes(10, 0, 0), inner]), { maxDepth: 3 }));
  assert.throws(() => parse(document(), { maxBytes: 3 }));
  assert.throws(() => parse(document(named(8, "s", textPayload("12345"))), { maxStringBytes: 5 }));
  assert.throws(() => parse(document(named(11, "a", Buffer.concat([i32(3), i32(1), i32(2), i32(3)]))), { maxElements: 4 }));
  for (const maxDepth of [0, -1, Infinity, 129]) assert.throws(() => parse(document(), { maxDepth }));
  const cancelled = new AbortController(); cancelled.abort();
  assert.throws(() => parse(document(), { signal: cancelled.signal }), { name: "AbortError" });
});

await check("gzip, zlib and uncompressed payloads produce identical bytes", async () => {
  const raw = document(named(3, "x", i32(42)));
  for (const [mode, input] of [["none", raw], ["gzip", gzipSync(raw)], ["deflate", deflateSync(raw)]]) {
    const result = await decompressBounded(input, mode);
    assert.deepEqual([...result], [...raw]);
    assert(result.buffer !== input.buffer, "Output must own its bytes, including Buffer inputs");
  }
});

await check("decompression rejects over-budget expansion, corruption and unknown modes", async () => {
  const bomb = gzipSync(Buffer.alloc(1024 * 1024));
  await assert.rejects(decompressBounded(bomb, "gzip", { maxOutputBytes: 1024 }), /output byte limit/);
  await assert.rejects(decompressBounded(bomb, "gzip", { maxInputBytes: 1 }));
  await assert.rejects(decompressBounded(bytes(0, 1, 2), "gzip"));
  await assert.rejects(decompressBounded(bomb.subarray(0, bomb.length - 3), "gzip"));
  await assert.rejects(decompressBounded(bomb, "lz4"));
  await assert.rejects(decompressBounded(bytes(1, 2), "none", { maxOutputBytes: 1 }));
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(decompressBounded(bomb, "gzip", { signal: cancelled.signal }), { name: "AbortError" });
  const during = new AbortController();
  const pending = decompressBounded(gzipSync(Buffer.alloc(1024 * 1024)), "gzip", { signal: during.signal });
  during.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

const compound = entries => new NbtCompound(new Map(Object.entries(entries)));
const columnFixture = () => {
  const storage = compound({ palette: new NbtList([compound({ Name: new NbtString("fixture:solid"),
    Properties: compound({ axis: new NbtString("y") }) })], 10) });
  const section = compound({ Y: new NbtByte(-4), block_states: storage });
  const root = compound({ DataVersion: new NbtInt(100), xPos: new NbtInt(-32), zPos: new NbtInt(64),
    Status: new NbtString("full"), sections: new NbtList([section], 10) });
  const context = { schema: GAME_COLUMN_TAG_SCHEMA, dataVersion: 100, chunkX: -32, chunkZ: 64, minSectionY: -4, maxSectionY: 19 };
  return { root, section, storage, context };
};

await check("column schema extracts exact section altitude and keeps absent coverage unknown", () => {
  const { root, context } = columnFixture();
  const result = readPalettedColumn(root, context);
  assert.equal(result.sections.length, 24);
  assert.equal(result.sections[0].sectionY, -4);
  assert.equal(result.sections[0].voxels.palette[0].id, "fixture:solid");
  assert.equal(result.sections[0].voxels.palette[0].properties.axis, "y");
  assert(result.sections.slice(1).every(s => s.voxels === null));
  assert.equal(result.structureCoverage, "unavailable"); assert.deepEqual(result.structureStarts, []);
});

await check("column schema carries source-backed structure starts separately from voxel sections", () => {
  const { root, context } = columnFixture();
  root.set("structures", compound({ starts: compound({ "minecraft:village_plains": compound({
    id: new NbtString("minecraft:village"), ChunkX: new NbtInt(-32), ChunkZ: new NbtInt(64),
    BB: new NbtIntArray(new Int32Array([-520, -64, 1016, -480, 84, 1056])),
  }) }) }));
  const result = readPalettedColumn(root, context);
  assert.equal(result.structureCoverage, "available"); assert.equal(result.structureStarts.length, 1);
  assert.equal(result.structureStarts[0].key, "minecraft:village_plains");
  assert.deepEqual(result.structureStarts[0].boundingBox, [-520, -64, 1016, -480, 84, 1056]);
});

await check("column identity and generation status cannot silently match another source", () => {
  const { root, context } = columnFixture();
  for (const change of [{ dataVersion: 101 }, { chunkX: -31 }, { chunkZ: 63 }, { minSectionY: 0 }])
    assert.throws(() => readPalettedColumn(root, { ...context, ...change }));
  root.set("Status", new NbtString("noise"));
  assert.throws(() => readPalettedColumn(root, context));
  root.set("Status", new NbtString("full")); root.set("DataVersion", new NbtString("100"));
  assert.throws(() => readPalettedColumn(root, context));
});

await check("lighting-only sections do not create empty block terrain", () => {
  const { root, context, section } = columnFixture();
  section.delete("block_states");
  root.getList("sections").add(compound({ Y: new NbtByte(-5) }));
  assert(readPalettedColumn(root, context).sections.every(s => s.voxels === null));
});

await check("duplicate sections, missing palettes and packed tag type mismatches fail", () => {
  const duplicate = columnFixture(); duplicate.root.getList("sections").add(duplicate.section);
  assert.throws(() => readPalettedColumn(duplicate.root, duplicate.context));
  const missing = columnFixture(); missing.storage.delete("palette");
  assert.throws(() => readPalettedColumn(missing.root, missing.context));
  const wrong = columnFixture(); wrong.storage.set("data", new NbtString("invalid"));
  assert.throws(() => readPalettedColumn(wrong.root, wrong.context));
});

await check("packed block-state words feed canonical geometry through the tag adapter", () => {
  const { root, context, storage } = columnFixture();
  storage.set("palette", new NbtList([compound({ Name: new NbtString("fixture:empty") }), compound({ Name: new NbtString("fixture:solid") })], 10));
  const words = Array(256).fill(0n); words[0] = 1n;
  storage.set("data", new NbtLongArray(words));
  const section = readPalettedColumn(root, context).sections[0].voxels;
  assert.equal(section.indices[0], 1);
  assert(section.indices.slice(1).every(index => index === 0));
  assert.equal(meshVoxelSection(section, { origin: [-512, -64, 1024], shapes: ["empty", "opaque-cube"] }).blockIndices.length, 6);
});

await check("compressed region snapshot runs end-to-end into normalized voxel sections", async () => {
  const { root, context } = columnFixture();
  const file = NbtFile.create(); file.root = root;
  const compressed = deflateSync(file.write());
  const region = Buffer.alloc(3 * 4096);
  region.writeUInt32BE((2 << 8) | 1, 0); region.writeUInt32BE(123, 4096);
  region.writeUInt32BE(compressed.length + 1, 8192); region[8196] = 2; compressed.copy(region, 8197);
  const entry = readSectorRegion(region, -1, 2)[0];
  region.fill(0);
  const result = await readRegionColumn(entry, context, { tags: GAME_NBT_FORMATS.java, compressionModes: GAME_REGION_COMPRESSION });
  assert.equal(result.chunkX, -32); assert.equal(result.chunkZ, 64);
  assert.equal(result.timestampSeconds, 123);
  assert.equal(result.sections[0].voxels.palette[0].id, "fixture:solid");
  await assert.rejects(readRegionColumn({ ...entry, external: true }, context, { tags: GAME_NBT_FORMATS.java, compressionModes: GAME_REGION_COMPRESSION }));
  await assert.rejects(readRegionColumn({ ...entry, compressionId: 4 }, context, { tags: GAME_NBT_FORMATS.java, compressionModes: GAME_REGION_COMPRESSION }));
});

const persistentEntry = (id, version = 100) => {
  const file = NbtFile.create({ littleEndian: true });
  file.root = compound({ name: new NbtString(id), version: new NbtInt(version),
    states: compound({ axis: new NbtString("y"), active: new NbtByte(1), level: new NbtInt(3) }) });
  return file.write();
};
const subchunkContext = { schema: GAME_SUBCHUNK_SCHEMA, sectionY: -4, paletteVersions: [100] };

await check("layered persistent subchunks retain both base and fluid layers", () => {
  const input = Buffer.concat([bytes(9, 2, 252, 0), persistentEntry("fixture:base"), bytes(0), persistentEntry("fixture:fluid")]);
  const result = readLayeredSubchunk(input, subchunkContext);
  assert.equal(result.sectionY, -4);
  assert.equal(result.layers.length, 2);
  assert.equal(result.layers[0].voxels.palette[0].id, "fixture:base");
  assert.equal(result.layers[1].voxels.palette[0].id, "fixture:fluid");
  assert.deepEqual(result.layers[0].voxels.palette[0].properties, { axis: "y", active: 1, level: 3 });
  assert.deepEqual(result.layers[0].paletteVersions, [100]);
});

await check("version-eight storage uses source-key altitude and permits explicit zero layers", () => {
  const input = Buffer.concat([bytes(8, 1, 0), persistentEntry("fixture:base")]);
  assert.equal(readLayeredSubchunk(input, subchunkContext).sectionY, -4);
  assert.deepEqual(readLayeredSubchunk(bytes(8, 0), subchunkContext).layers, []);
  assert.deepEqual(readLayeredSubchunk(bytes(9, 0, 252), subchunkContext).layers, []);
});

await check("persistent multi-entry palette words transpose into canonical block coordinates", () => {
  const words = Buffer.alloc(512); words[0] = 2; // Y=1 at X=0,Z=0 is source index 1.
  const input = Buffer.concat([bytes(9, 1, 252, 2), words, number("writeInt32LE", 4, 2),
    persistentEntry("fixture:empty"), persistentEntry("fixture:solid")]);
  const section = readLayeredSubchunk(input, subchunkContext).layers[0].voxels;
  assert.equal(section.indices[256], 1);
  assert.equal(section.indices[1], 0);
  assert.equal(meshVoxelSection(section, { origin: [0, -64, 0], shapes: ["empty", "opaque-cube"] }).blockIndices.length, 6);
});

await check("persistent storage rejects version, altitude, runtime flags and allocation mismatches", () => {
  for (const input of [bytes(7, 0), bytes(9, 0, 253), bytes(9, 1, 252, 1), bytes(9, 1, 252, 14),
    bytes(9, 1, 252, 2), bytes(8, 0, 1), bytes(8, 9)])
    assert.throws(() => readLayeredSubchunk(input, subchunkContext));
  const unsupported = Buffer.concat([bytes(9, 1, 252, 0), persistentEntry("fixture:base", 101)]);
  assert.throws(() => readLayeredSubchunk(unsupported, subchunkContext));
  const valid = Buffer.concat([bytes(9, 1, 252, 0), persistentEntry("fixture:base")]);
  assert.throws(() => readLayeredSubchunk(valid, { ...subchunkContext, maxBytes: 4 }));
  for (let end = 0; end < valid.length; end++) assert.throws(() => readLayeredSubchunk(valid.subarray(0, end), subchunkContext));
});

const levelVarint = value => {
  const result = [];
  do { const byte = value & 0x7f; value = Math.floor(value / 128); result.push(byte | (value ? 0x80 : 0)); } while (value);
  return Buffer.from(result);
};
const levelBigVarint = value => {
  const result = [];
  do { const byte = Number(value & 0x7fn); value >>= 7n; result.push(byte | (value ? 0x80 : 0)); } while (value);
  return Buffer.from(result);
};
const levelString = value => Buffer.concat([levelVarint(value.length), value]);
const levelBatch = (sequence, operations) => {
  const header = Buffer.alloc(12); header.writeBigUInt64LE(sequence); header.writeUInt32LE(operations.length, 8);
  return Buffer.concat([header, ...operations.map(operation => operation.type === "put"
    ? Buffer.concat([bytes(1), levelString(operation.key), levelString(operation.value)])
    : Buffer.concat([bytes(0), levelString(operation.key)]))]);
};
const levelPhysical = (type, payload) => {
  const header = Buffer.alloc(7), checked = Buffer.concat([bytes(type), payload]);
  header.writeUInt32LE(maskLevelDbCrc32c(levelDbCrc32c(checked))); header.writeUInt16LE(payload.length, 4); header[6] = type;
  return Buffer.concat([header, payload]);
};

await check("LevelDB CRC32C and masking match the standard vector", () => {
  const crc = levelDbCrc32c(Buffer.from("123456789"));
  assert.equal(crc, 0xe3069283); assert.equal(unmaskLevelDbCrc32c(maskLevelDbCrc32c(crc)), crc);
});

await check("LevelDB WAL records retain atomic put/delete order and exact sequence", () => {
  const batch = levelBatch(9007199254740991n, [
    { type: "put", key: Buffer.from("alpha"), value: bytes(1, 2, 3) },
    { type: "delete", key: Buffer.from("beta") },
  ]);
  const record = readLevelDbLog(levelPhysical(1, batch))[0], writes = readLevelDbWriteBatch(record);
  assert.deepEqual(writes.map(write => [write.sequence, write.type, Buffer.from(write.key).toString(), write.value && [...write.value]]), [
    [9007199254740991n, "put", "alpha", [1, 2, 3]], [9007199254740992n, "delete", "beta", null],
  ]);
  batch.fill(0); assert.equal(Buffer.from(writes[0].key).toString(), "alpha");
});

await check("LevelDB WAL fragments cross 32 KiB blocks without trusting padding", () => {
  const logical = levelBatch(4n, [{ type: "put", key: Buffer.from("large"), value: Buffer.alloc(33000, 7) }]);
  const split = 32761, log = Buffer.concat([levelPhysical(2, logical.subarray(0, split)), levelPhysical(4, logical.subarray(split))]);
  const records = readLevelDbLog(log, { maxLogicalRecordBytes: 64 * 1024 });
  assert.equal(records.length, 1); assert.equal(readLevelDbWriteBatch(records[0]).at(0).value.length, 33000);
  const padded = Buffer.concat([levelPhysical(1, levelBatch(1n, [])), Buffer.alloc(32768 - 19), levelPhysical(1, levelBatch(2n, []))]);
  assert.equal(readLevelDbLog(padded).length, 2);
});

await check("LevelDB WAL and WriteBatch corruption fail closed under explicit limits", () => {
  const full = levelPhysical(1, levelBatch(1n, [{ type: "put", key: bytes(1), value: bytes(2) }]));
  for (const mutate of [copy => { copy[0] ^= 1; }, copy => { copy[6] = 5; }, copy => { copy[4] = 0xff; }]) {
    const copy = Buffer.from(full); mutate(copy); assert.throws(() => readLevelDbLog(copy));
  }
  assert.throws(() => readLevelDbLog(levelPhysical(3, bytes(1))));
  assert.throws(() => readLevelDbLog(levelPhysical(2, bytes(1))));
  assert.throws(() => readLevelDbLog(full, { maxBytes: full.length - 1 }));
  const wrongCount = levelBatch(1n, []); wrongCount.writeUInt32LE(1, 8); assert.throws(() => readLevelDbWriteBatch(wrongCount));
  const unknown = levelBatch(1n, [{ type: "put", key: bytes(1), value: bytes(2) }]); unknown[12] = 2;
  assert.throws(() => readLevelDbWriteBatch(unknown));
});

await check("persistent subchunk keys preserve signed coordinates, altitude and dimensions", () => {
  for (const key of [
    { chunkX: -2147483648, chunkZ: 2147483647, dimension: 0, sectionY: -4 },
    { chunkX: -33, chunkZ: 65, dimension: 1, sectionY: 19 },
    { chunkX: 7, chunkZ: -9, dimension: 2, sectionY: -128 },
  ]) {
    const encoded = encodePersistentSubchunkKey(key, GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA);
    assert.deepEqual(parsePersistentSubchunkKey(encoded, GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA), key);
    assert.equal(encoded.length, key.dimension === 0 ? 10 : 14);
  }
  const wrongTag = encodePersistentSubchunkKey({ chunkX: 0, chunkZ: 0, dimension: 0, sectionY: 0 }, GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA);
  wrongTag[8] = 0x30; assert.equal(parsePersistentSubchunkKey(wrongTag, GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA), null);
  assert.equal(parsePersistentSubchunkKey(bytes(1, 2, 3), GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA), null);
  assert.throws(() => encodePersistentSubchunkKey({ chunkX: 0, chunkZ: 0, dimension: 3, sectionY: 0 }, GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA));
});

const levelInternalKey = (key, sequence, type = 1) => {
  const trailer = Buffer.alloc(8); trailer.writeBigUInt64LE((sequence << 8n) | BigInt(type)); return Buffer.concat([key, trailer]);
};
const commonPrefix = (left, right) => {
  let count = 0; while (count < left.length && count < right.length && left[count] === right[count]) count++; return count;
};
const levelBlock = (entries, restartInterval = 2) => {
  const chunks = [], restarts = [0]; let offset = 0, prior = Buffer.alloc(0), sinceRestart = 0;
  for (const entry of entries) {
    let shared = sinceRestart < restartInterval ? commonPrefix(prior, entry.key) : 0;
    if (sinceRestart >= restartInterval) { restarts.push(offset); sinceRestart = 0; shared = 0; }
    const delta = entry.key.subarray(shared), encoded = Buffer.concat([levelVarint(shared), levelVarint(delta.length),
      levelVarint(entry.value.length), delta, entry.value]);
    chunks.push(encoded); offset += encoded.length; prior = entry.key; sinceRestart++;
  }
  const tail = Buffer.alloc((restarts.length + 1) * 4);
  restarts.forEach((value, index) => tail.writeUInt32LE(value, index * 4)); tail.writeUInt32LE(restarts.length, restarts.length * 4);
  return Buffer.concat([...chunks, tail]);
};
const levelTableBlock = (content, type) => {
  const stored = type === 2 ? deflateSync(content) : type === 4 ? deflateRawSync(content) : content;
  const trailer = Buffer.alloc(5); trailer[0] = type; trailer.writeUInt32LE(maskLevelDbCrc32c(levelDbCrc32c(Buffer.concat([stored, bytes(type)]))), 1);
  return { bytes: Buffer.concat([stored, trailer]), size: stored.length };
};
const levelHandle = (offset, size) => Buffer.concat([levelVarint(offset), levelVarint(size)]);
const levelTableFromEntries = (type, entries) => {
  const data = levelTableBlock(levelBlock(entries), type);
  const indexContent = levelBlock([{ key: Buffer.from([0xff]), value: levelHandle(0, data.size) }]);
  const index = levelTableBlock(indexContent, 0), footer = Buffer.alloc(48); let cursor = 0;
  for (const value of [0, 0]) { const encoded = levelVarint(value); encoded.copy(footer, cursor); cursor += encoded.length; }
  const indexHandle = levelHandle(data.bytes.length, index.size); indexHandle.copy(footer, cursor);
  bytes(0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb).copy(footer, 40);
  return Buffer.concat([data.bytes, index.bytes, footer]);
};
const levelTable = type => levelTableFromEntries(type, [
    { key: levelInternalKey(Buffer.from("alpha"), 9n), value: bytes(1, 2, 3) },
    { key: levelInternalKey(Buffer.from("beta"), 8n, 0), value: Buffer.alloc(0) },
    { key: levelInternalKey(Buffer.from("gamma"), 7n), value: Buffer.alloc(7000, 4) },
  ]);

await check("LevelDB sorted tables decode uncompressed, zlib and raw-deflate Bedrock blocks", () => {
  for (const type of [0, 2, 4]) {
    const records = readLevelDbTable(levelTable(type));
    assert.deepEqual(records.map(record => [Buffer.from(record.key).toString(), record.sequence, record.type, record.value.length]), [
      ["alpha", 9n, "put", 3], ["beta", 8n, "delete", 0], ["gamma", 7n, "put", 7000],
    ]);
  }
});

await check("LevelDB sorted tables reject damaged footer, blocks, handles and decompression expansion", () => {
  const valid = levelTable(0);
  for (const mutate of [copy => { copy[copy.length - 1] ^= 1; }, copy => { copy[0] ^= 1; }, copy => { copy[valid.length - 48] = 0xff; }]) {
    const copy = Buffer.from(valid); mutate(copy); assert.throws(() => readLevelDbTable(copy));
  }
  assert.throws(() => readLevelDbTable(levelTable(2), { maxBlockBytes: 1024 }));
  assert.throws(() => readLevelDbTable(valid, { maxBytes: valid.length - 1 }));
  assert.throws(() => readLevelDbTable(levelTableFromEntries(0, [
    { key: levelInternalKey(Buffer.from("b"), 1n), value: bytes(1) },
    { key: levelInternalKey(Buffer.from("a"), 1n), value: bytes(1) },
  ])));
  assert.throws(() => readLevelDbTable(levelTableFromEntries(0, [
    { key: levelInternalKey(Buffer.from("deleted"), 1n, 0), value: bytes(1) },
  ])));
});

const levelManifestFile = (level, file, size, smallest, largest) => Buffer.concat([
  levelVarint(7), levelVarint(level), levelBigVarint(BigInt(file)), levelBigVarint(BigInt(size)), levelString(smallest), levelString(largest),
]);
await check("LevelDB CURRENT and MANIFEST replay select only active sorted tables and logs", () => {
  assert.equal(parseLevelDbCurrent(Buffer.from("MANIFEST-000042\n")), "MANIFEST-000042");
  const smallest = levelInternalKey(Buffer.from("a"), 9n), largest = levelInternalKey(Buffer.from("z"), 1n);
  const first = Buffer.concat([
    levelVarint(1), levelString(Buffer.from("leveldb.BytewiseComparator")),
    levelVarint(2), levelBigVarint(40n), levelVarint(3), levelBigVarint(50n), levelVarint(4), levelBigVarint(9007199254740993n),
    levelManifestFile(0, 10, 2000, smallest, largest), levelManifestFile(2, 11, 3000, smallest, largest),
  ]);
  const second = Buffer.concat([
    levelVarint(6), levelVarint(0), levelBigVarint(10n), levelVarint(9), levelBigVarint(39n),
    levelManifestFile(1, 12, 4000, smallest, largest),
  ]);
  const manifest = readLevelDbManifest(Buffer.concat([levelPhysical(1, first), levelPhysical(1, second)]),
    { expectedComparator: "leveldb.BytewiseComparator" });
  assert.equal(manifest.logNumber, 40); assert.equal(manifest.previousLogNumber, 39);
  assert.equal(manifest.nextFileNumber, 50); assert.equal(manifest.lastSequence, 9007199254740993n);
  assert.deepEqual(manifest.files.map(file => [file.level, file.number, file.size]), [[1, 12, 4000], [2, 11, 3000]]);
});

await check("LevelDB CURRENT and MANIFEST reject ambiguous, corrupt or unbounded metadata", () => {
  for (const input of [Buffer.from("MANIFEST-1\n"), Buffer.from("../MANIFEST-000001\n"), Buffer.from("MANIFEST-000001"), Buffer.alloc(200)])
    assert.throws(() => parseLevelDbCurrent(input));
  const base = Buffer.concat([levelVarint(1), levelString(Buffer.from("leveldb.BytewiseComparator")), levelVarint(2), levelVarint(1),
    levelVarint(3), levelVarint(2), levelVarint(4), levelVarint(3)]);
  assert.throws(() => readLevelDbManifest(levelPhysical(1, Buffer.concat([base, levelVarint(8)]))));
  assert.throws(() => readLevelDbManifest(levelPhysical(1, base), { expectedComparator: "other.Comparator" }));
  const conflict = Buffer.concat([base, levelVarint(1), levelString(Buffer.from("other.Comparator"))]);
  assert.throws(() => readLevelDbManifest(levelPhysical(1, conflict)));
  const badLevel = Buffer.concat([base, levelManifestFile(7, 1, 100, levelInternalKey(bytes(1), 1n), levelInternalKey(bytes(2), 1n))]);
  assert.throws(() => readLevelDbManifest(levelPhysical(1, badLevel)));
  const duplicateFile = Buffer.concat([base,
    levelManifestFile(0, 1, 100, levelInternalKey(bytes(1), 1n), levelInternalKey(bytes(2), 1n)),
    levelManifestFile(1, 1, 100, levelInternalKey(bytes(1), 1n), levelInternalKey(bytes(2), 1n))]);
  assert.throws(() => readLevelDbManifest(levelPhysical(1, duplicateFile)));
  const invertedRange = Buffer.concat([base,
    levelManifestFile(0, 1, 100, levelInternalKey(bytes(2), 1n), levelInternalKey(bytes(1), 1n))]);
  assert.throws(() => readLevelDbManifest(levelPhysical(1, invertedRange)));
});

const folderFile = (path, data) => {
  const file = new File([data], path.split("/").at(-1), { lastModified: 123 });
  Object.defineProperty(file, "webkitRelativePath", { value: path }); return file;
};
const hex = value => Buffer.from(value).toString("hex");
await check("bounded LevelDB folder snapshots apply active tables, WAL updates and tombstones", async () => {
  const table = levelTable(4), smallest = levelInternalKey(Buffer.from("alpha"), 9n), largest = levelInternalKey(Buffer.from("gamma"), 7n);
  const edit = Buffer.concat([
    levelVarint(1), levelString(Buffer.from("leveldb.BytewiseComparator")), levelVarint(2), levelVarint(40),
    levelVarint(3), levelVarint(50), levelVarint(4), levelVarint(9), levelManifestFile(0, 10, table.length, smallest, largest),
  ]);
  const wal = levelPhysical(1, levelBatch(10n, [
    { type: "put", key: Buffer.from("alpha"), value: bytes(9) }, { type: "delete", key: Buffer.from("gamma") },
  ]));
  const selected = [folderFile("Fixture/db/CURRENT", Buffer.from("MANIFEST-000042\n")),
    folderFile("Fixture/db/MANIFEST-000042", levelPhysical(1, edit)), folderFile("Fixture/db/000010.ldb", table),
    folderFile("Fixture/db/000040.log", wal), folderFile("Fixture/db/000099.ldb", bytes(1, 2, 3)),
    folderFile("Fixture/level.dat", bytes(1))];
  const snapshot = await loadLevelDbFolderSnapshot(selected, { expectedComparator: "leveldb.BytewiseComparator",
    desiredKeys: [Buffer.from("alpha"), Buffer.from("gamma")] });
  assert.equal(snapshot.root, "Fixture"); assert.deepEqual(snapshot.selectedTables, [10]); assert.deepEqual(snapshot.selectedLogs, [40]);
  assert.deepEqual([...snapshot.values.get(hex(Buffer.from("alpha")))], [9]); assert.equal(snapshot.values.has(hex(Buffer.from("gamma"))), false);
});

await check("LevelDB folder snapshots reject mixed roots, missing active files and resource overflow", async () => {
  const table = levelTable(0), smallest = levelInternalKey(Buffer.from("a"), 1n), largest = levelInternalKey(Buffer.from("z"), 1n);
  const edit = Buffer.concat([levelVarint(1), levelString(Buffer.from("leveldb.BytewiseComparator")), levelVarint(2), levelVarint(0),
    levelVarint(3), levelVarint(2), levelVarint(4), levelVarint(1), levelManifestFile(0, 1, table.length, smallest, largest)]);
  const current = folderFile("One/db/CURRENT", Buffer.from("MANIFEST-000001\n"));
  const manifest = folderFile("One/db/MANIFEST-000001", levelPhysical(1, edit));
  await assert.rejects(loadLevelDbFolderSnapshot([current, manifest], { expectedComparator: "leveldb.BytewiseComparator", desiredKeys: [bytes(98)] }));
  await assert.rejects(loadLevelDbFolderSnapshot([current, manifest, folderFile("Two/db/000001.ldb", table)],
    { expectedComparator: "leveldb.BytewiseComparator", desiredKeys: [bytes(98)] }));
  await assert.rejects(loadLevelDbFolderSnapshot([current, manifest, folderFile("One/db/000001.ldb", table)],
    { expectedComparator: "leveldb.BytewiseComparator", desiredKeys: [bytes(98)], maxTotalBytes: 32 }));
});

await check("persistent subchunk snapshots run from LevelDB keys through canonical voxel sections", async () => {
  const request = { chunkX: -3, chunkZ: 5, dimension: 0, sectionY: -4 };
  const absent = { chunkX: -3, chunkZ: 5, dimension: 0, sectionY: -3 };
  const key = encodePersistentSubchunkKey(request, GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA);
  const value = Buffer.concat([bytes(9, 1, 252, 0), persistentEntry("fixture:leveldb")]);
  const internal = levelInternalKey(key, 8n), table = levelTableFromEntries(4, [{ key: internal, value }]);
  const edit = Buffer.concat([
    levelVarint(1), levelString(Buffer.from("leveldb.BytewiseComparator")), levelVarint(2), levelVarint(0),
    levelVarint(3), levelVarint(2), levelVarint(4), levelVarint(8), levelManifestFile(0, 1, table.length, internal, internal),
  ]);
  const selected = [folderFile("World/db/CURRENT", Buffer.from("MANIFEST-000001\n")),
    folderFile("World/db/MANIFEST-000001", levelPhysical(1, edit)), folderFile("World/db/000001.ldb", table)];
  const snapshot = await loadPersistentSubchunkSnapshot(selected, {
    expectedComparator: "leveldb.BytewiseComparator", requests: [request, absent],
    keySchema: GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA, subchunkSchema: GAME_SUBCHUNK_SCHEMA, paletteVersions: [100],
  });
  assert.equal(snapshot.root, "World"); assert.deepEqual(snapshot.selectedTables, [1]); assert.deepEqual(snapshot.selectedLogs, []);
  assert.deepEqual(snapshot.missing, [absent]); assert.equal(snapshot.sections.length, 1);
  assert.deepEqual(snapshot.sections[0].key, request); assert.equal(snapshot.sections[0].subchunk.sectionY, -4);
  assert.equal(snapshot.sections[0].subchunk.layers[0].voxels.palette[0].id, "fixture:leveldb");
  assert.equal(snapshot.sections[0].subchunk.layers[0].voxels.indices.length, 4096);
});

await check("persistent subchunk snapshots reject ambiguous requests and unsupported palettes", async () => {
  const request = { chunkX: 0, chunkZ: 0, dimension: 0, sectionY: 0 };
  await assert.rejects(loadPersistentSubchunkSnapshot([], {
    expectedComparator: "leveldb.BytewiseComparator", requests: [request, request], keySchema: GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA,
    subchunkSchema: GAME_SUBCHUNK_SCHEMA, paletteVersions: [100],
  }), /Duplicate/);
  await assert.rejects(loadPersistentSubchunkSnapshot([], {
    expectedComparator: "leveldb.BytewiseComparator", requests: [request], keySchema: GAME_PERSISTENT_SUBCHUNK_KEY_SCHEMA,
    subchunkSchema: GAME_SUBCHUNK_SCHEMA, paletteVersions: [],
  }), /Invalid/);
});

console.log(`Terrain ingestion checks passed: ${checks}`);
