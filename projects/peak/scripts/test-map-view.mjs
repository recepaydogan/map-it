import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = (await readFile(new URL("../src/features/map/map-data.ts", import.meta.url), "utf8"))
  .replaceAll("import.meta.env.VITE_PEAK_CDN_BASE_URL", '"https://cdn.example.test"');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const daily = (index) => ({ index, scene: `Level_${index}`, kind: "daily", markers: [], markerCounts: {} });
const final = { scene: "WilIsland", kind: "final", markers: [], markerCounts: {} };
const finalDaily = { ...final, scene: "Level_1" };
const finalFirstDay = { ...final, scene: "Level_0" };
let now = Date.parse("2026-09-04T01:00:00Z");
let catalog = {
  source: { gameVersion: "2.4.b" },
  rotation: { anchorUtc: "2026-09-04T00:00:00Z", durationHours: 24, levelCount: 2 },
  levels: [daily(0), daily(1)], specialLevels: [final, finalDaily, finalFirstDay], items: [], lootPools: [],
};
let stateIndex = 0;
const exports = {};
runInNewContext(compiled, {
  exports, Date, URL, console,
  require: (name) => {
    if (name === "react") return {
      useEffect: () => {}, useMemo: (callback) => callback(),
      useState: () => [[catalog, null, false, now][stateIndex++], () => {}],
    };
    if (name === "react-i18next") return { useTranslation: () => ({ t: (key) => key }) };
    throw new Error(`Unexpected import: ${name}`);
  },
});
const select = (view, scene) => {
  stateIndex = 0;
  return exports.usePeakMapData(view, scene);
};
assert.equal(exports.getMapSlug("https://cdn.example.test/maps/level-0-25306743-lava-v1.webp"), "level-0-25306743-lava-v1");
assert.equal(exports.getMapTileSource("level-0-25306743-lava-v1", 1, 2), "https://cdn.example.test/maps/tiles/level-0-25306743-lava-v1/1-2.webp");
assert.equal(select("final", "Level_1").level, finalDaily, "final tab selects the matching day's final biome");
assert.equal(select("daily", "Level_1").level, catalog.levels[1], "daily tab follows the live daily scene");
assert.equal(select("daily", "WilIsland").level, catalog.levels[0], "fallback scene must not select the final island");
assert.equal(select("final", null).hasFinalLevel, true);
assert.equal(select("final", null).level, finalFirstDay, "final tab follows today's rotation when the game is closed");
now += 24 * 60 * 60 * 1000;
assert.equal(select("final", null).level, finalDaily, "final tab advances with the daily rotation");
assert.equal(select("final", "WilIsland").level, final, "fallback scene uses its own final subtree");
now -= 24 * 60 * 60 * 1000;
catalog = { ...catalog, specialLevels: [] };
assert.equal(select("final", null).level, catalog.levels[0], "missing special data keeps a working daily map");
assert.equal(select("daily", null).hasFinalLevel, false);
catalog = { ...catalog, specialLevels: [finalDaily] };
assert.equal(select("daily", null).hasFinalLevel, false, "another day's final must not substitute for today's final");
assert.equal(select("final", "Level_1").level, finalDaily, "live scene selects its final even outside today's rotation");

catalog = { ...catalog, schemaVersion: 4,
  rotation: { anchorUtc: '2026-09-04T00:00:00Z', durationHours: 24, levelCount: 208 },
  levels: [205, 206, 207, 0, 1, 2, 3].map(daily),
  specialLevels: [205, 206, 207, 0, 1, 2, 3].map(index => ({ ...final, scene: `Level_${index}` })),
};
now = Date.parse(catalog.rotation.anchorUtc) + 205 * 86400000 + 1000;
assert.equal(select('daily', null).level.index, 205, 'bounded catalog uses explicit rotation index');
assert.deepEqual(Array.from(select('daily', null).forecast, entry => entry.level.index), [206, 207, 0, 1, 2, 3]);
assert.equal(select('final', null).level.scene, 'Level_205');
assert.equal(exports.resolveDailyLevel(catalog, now, { levelIndex: 623, resetAt: now + 1000 }).level.index, 207);
now += 3 * 86400000;
assert.equal(select('daily', null).level.index, 0, 'rotation wraps at 208, not seven');
assert.deepEqual(Array.from(select('daily', null).forecast, entry => entry.level.index), [1, 2, 3]);
now += 4 * 86400000;
assert.equal(select('daily', null).level.index, 3, 'expired window retains its last complete map');
assert.equal(select('daily', null).forecast.length, 0, 'missing future entries are never fabricated');

assert.deepEqual(
  [...exports.getRouteBiomeTranslationKeys(["Shore", "Tropics", "Alpine", "Volcano"])],
  ["beach", "tropics", "alpine", "caldera", "thekiln"],
  "legacy Caldera routes gain The Kiln without exposing the internal enum name",
);
assert.deepEqual(
  [...exports.getRouteBiomeTranslationKeys(["Shore", "Roots", "Mesa", "Swamp"])],
  ["beach", "roots", "mesa", "gloom", "thecitadel"],
  "legacy Gloom routes gain The Citadel without exposing the internal enum name",
);
assert.deepEqual(
  [...exports.getRouteBiomeTranslationKeys(["Shore", "Roots", "Mesa", "Gloom", "The Citadel"])],
  ["beach", "roots", "mesa", "gloom", "thecitadel"],
  "new catalogs preserve the official five-biome route",
);
assert.equal(
  exports.getLiveBiomeTranslationKey(["Shore", "Roots", "Mesa", "Swamp"], "TheKiln"),
  "thecitadel",
  "the reused live segment enum follows the current route variant",
);
assert.equal(
  exports.getLiveBiomeTranslationKey(["Void"], "Void"),
  "void",
  "NADIR remains separate from the fifth daily biome",
);
console.log("Map view, bounded rotation and biome-label regressions passed (24 assertions).");
