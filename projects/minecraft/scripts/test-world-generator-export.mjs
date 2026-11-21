import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { createStoredZip } from "../src/lib/stored-zip.ts";
import { createWorldGeneratorExport, resolveWorldGeneratorExport } from "../src/features/worlds/world-generator-export.ts";

let passed = 0;
const check = async (name, run) => {
  await run(); passed++; console.log(`PASS ${name}`);
};
const text = bytes => new TextDecoder().decode(bytes);
const world = (version = "1.21.3", biome = "minecraft:cherry_grove") => ({
  name: "Snow / Cherry world", edition: "java",
  generation: { version, seed: "-9223372036854775808", preset: "single-biome", settings: { biome } },
});
const flatWorld = (version = "1.21.3", settings = {}) => ({
  name: "Builder's world", edition: "java",
  generation: { version, seed: "9223372036854775807", preset: "flat", settings: {
    biome: "minecraft:snowy_plains", baseBlock: "minecraft:deepslate", baseHeight: 24,
    surfaceBlock: "minecraft:snow_block", surfaceHeight: 3,
    structures: true, features: false, lakes: true, ...settings,
  } },
});

await check("stored ZIP output is deterministic, UTF-8, caller-owned and broadly readable", () => {
  const source = new Uint8Array([1, 2, 3]);
  const first = createStoredZip([{ path: "folder/ü.txt", data: source }, { path: "plain.txt", data: "hello" }]);
  source[0] = 9;
  const second = createStoredZip([{ path: "folder/ü.txt", data: new Uint8Array([1, 2, 3]) }, { path: "plain.txt", data: "hello" }]);
  assert.deepEqual(first, second);
  const files = unzipSync(first);
  assert.deepEqual([...files["folder/ü.txt"]], [1, 2, 3]);
  assert.equal(text(files["plain.txt"]), "hello");
});

await check("stored ZIP rejects traversal, duplicates, empty archives and resource overflow", () => {
  for (const files of [[], [{ path: "../x", data: "x" }], [{ path: "a", data: "x" }, { path: "a", data: "y" }]])
    assert.throws(() => createStoredZip(files));
  assert.throws(() => createStoredZip([{ path: "large", data: new Uint8Array(8 * 1024 * 1024 + 1) }]));
});

await check("custom export capability is exact across edition, version, preset and settings", () => {
  assert.equal(resolveWorldGeneratorExport(world())?.profile.packFormat, 57);
  assert.equal(resolveWorldGeneratorExport(world("1.20.6"))?.profile.packFormat, 41);
  assert.equal(resolveWorldGeneratorExport(flatWorld())?.kind, "flat");
  assert.equal(resolveWorldGeneratorExport(flatWorld("1.20.6"))?.profile.packFormat, 41);
  for (const candidate of [
    { ...world(), edition: "bedrock" },
    { ...world("1.21.10") },
    { ...world(), generation: { ...world().generation, preset: "default" } },
    { ...world(), generation: { ...world().generation, settings: { biome: "minecraft:not_real" } } },
    { ...world(), generation: { ...world().generation, settings: { biome: "minecraft:plains", extra: true } } },
    { ...flatWorld("1.21.10") },
    { ...flatWorld(), edition: "bedrock" },
    flatWorld("1.21.3", { baseBlock: "minecraft:not_real" }),
    flatWorld("1.21.3", { baseHeight: 0 }),
    flatWorld("1.21.3", { baseHeight: 382, surfaceHeight: 2 }),
    flatWorld("1.21.3", { lakes: "true" }),
    { ...flatWorld(), generation: { ...flatWorld().generation, settings: { ...flatWorld().generation.settings, extra: true } } },
  ]) assert.equal(resolveWorldGeneratorExport(candidate), null);
});

await check("Java 1.21.3 export matches the official single-biome world-preset shape", () => {
  const output = createWorldGeneratorExport(world(), { packDescription: "Fixture pack", instructions: "Fixture instructions" });
  assert.equal(output.filename, "snow-cherry-world-java-1-21-3-single-biome.zip");
  const files = unzipSync(output.bytes);
  assert.deepEqual(Object.keys(files).sort(), ["README.txt", "data/minecraft/worldgen/world_preset/single_biome_surface.json", "pack.mcmeta"]);
  assert.deepEqual(JSON.parse(text(files["pack.mcmeta"])), { pack: { pack_format: 57, description: "Fixture pack" } });
  const preset = JSON.parse(text(files["data/minecraft/worldgen/world_preset/single_biome_surface.json"]));
  assert.deepEqual(preset.dimensions["minecraft:overworld"], { type: "minecraft:overworld", generator: {
    type: "minecraft:noise", biome_source: { type: "minecraft:fixed", biome: "minecraft:cherry_grove" }, settings: "minecraft:overworld",
  } });
  assert.deepEqual(preset.dimensions["minecraft:the_nether"].generator.biome_source,
    { type: "minecraft:multi_noise", preset: "minecraft:nether" });
  assert.equal(preset.dimensions["minecraft:the_end"].generator.settings, "minecraft:end");
  assert.equal("seed" in preset.dimensions["minecraft:overworld"].generator, false);
});

await check("Java custom-flat export matches the official world-preset shape and bounded settings", () => {
  const output = createWorldGeneratorExport(flatWorld(), { packDescription: "Flat fixture", instructions: "Flat instructions" });
  assert.equal(output.filename, "builder-s-world-java-1-21-3-flat.zip");
  assert.equal(output.kind, "flat");
  const files = unzipSync(output.bytes);
  assert.deepEqual(Object.keys(files).sort(), ["README.txt", "data/minecraft/worldgen/world_preset/flat.json", "pack.mcmeta"]);
  assert.deepEqual(JSON.parse(text(files["pack.mcmeta"])), { pack: { pack_format: 57, description: "Flat fixture" } });
  const preset = JSON.parse(text(files["data/minecraft/worldgen/world_preset/flat.json"]));
  assert.deepEqual(preset.dimensions["minecraft:overworld"], { type: "minecraft:overworld", generator: {
    type: "minecraft:flat", settings: {
      biome: "minecraft:snowy_plains", features: false, lakes: true,
      layers: [
        { block: "minecraft:bedrock", height: 1 },
        { block: "minecraft:deepslate", height: 24 },
        { block: "minecraft:snow_block", height: 3 },
      ],
      structure_overrides: ["minecraft:strongholds", "minecraft:villages"],
    },
  } });
  assert.equal(preset.dimensions["minecraft:the_nether"].generator.settings, "minecraft:nether");
  assert.equal(preset.dimensions["minecraft:the_end"].generator.settings, "minecraft:end");
  assert.equal("seed" in preset.dimensions["minecraft:overworld"].generator.settings, false);
});

await check("export preserves exact signed seed only in instructions and never fabricates chunks", () => {
  for (const fixture of [world(), flatWorld()]) {
    const output = createWorldGeneratorExport(fixture, { packDescription: "Pack",
      instructions: `Seed ${fixture.generation.seed}\nNo generated chunks` });
    const files = unzipSync(output.bytes);
    assert.match(text(files["README.txt"]), new RegExp(fixture.generation.seed));
    assert.equal(Object.keys(files).some(path => /region|level\.dat|\.mca$/i.test(path)), false);
  }
});

await check("blank user-facing export copy and unsupported context fail before allocation", () => {
  assert.throws(() => createWorldGeneratorExport(world(), { packDescription: "", instructions: "x" }));
  assert.throws(() => createWorldGeneratorExport(world("1.21.10"), { packDescription: "x", instructions: "x" }));
});

console.log(`${passed} world generator export checks passed.`);
