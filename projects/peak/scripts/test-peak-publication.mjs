import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repo = fileURLToPath(new URL("../", import.meta.url));
const source = join(repo, "artifacts", "peak-data");
const catalog = JSON.parse(await readFile(join(source, "catalog.json")));
const root = await mkdtemp(join(tmpdir(), "peak-publication-test-"));
const run = (script, args) => spawnSync(process.execPath, [join(repo, "scripts", script), ...args], { encoding: "utf8" });
try {
  for (const directory of ["maps", "icons", "items"]) {
    await symlink(join(source, directory), join(root, directory), "junction");
  }
  const check = async (mutate, valid, message, options = []) => {
    const fixture = structuredClone(catalog);
    mutate(fixture);
    await writeFile(join(root, "catalog.json"), JSON.stringify(fixture));
    const result = run("upload-peak-cdn.mjs", ["--source-root", root, "--catalog-only", "--dry-run", ...options]);
    assert.equal(result.status === 0, valid, result.stdout + result.stderr);
    if (!valid) {
      assert.match(result.stderr, message);
      assert.ok(!result.stdout.includes("PEAK CDN upload plan"));
    }
  };
  await check(c => { c.levels[0].markers[0].biomeSlot = 5; }, true);
  await check(c => { c.levels[0].markers[0].biomeSlot = 6; }, false, /invalid biome association/);
  await check(c => { c.levels[0].biomes.pop(); }, false, /invalid biome route/);
  await check(c => { c.levels[0].biomes[3] = "Volcano"; }, false, /invalid biome route/);
  await check(c => { c.levels[0].biomes[4] = c.levels[0].biomes[3] === "Caldera" ? "The Citadel" : "The Kiln"; }, false, /final pairing/);
  await check(c => { c.levels[0].title = "Tower"; }, false, /official biome names/);
  await check(c => { c.specialLevels[0].markers[0].biomeSlot = 5; }, false, /unexpected biome association/);
  await check(c => { c.specialLevels[0].biomes = ["The Kiln"]; }, false, /final island window/);
  await check(c => { c.dailyWindow = { days: 7, levelIndices: [] }; }, false, /publication windows must match/);
  await check(c => { c.items.find(item => item.icon).icon = './data/peak/items/../invalid.png'; }, false, /invalid icon/);
  await check(c => { const item = c.items.find(item => item.icon); item.icon = `./data/peak/items/${item.displayId}-not-a-content-hash.png`; }, false, /invalid icon/);
  await check(c => { c.dailyWindow = structuredClone(c.finalWindow); }, true);
  await check(c => {
    c.dailyWindow = structuredClone(c.finalWindow);
    c.levels[c.finalWindow.levelIndices[0]].mapBuildId = "stale-build";
  }, false, /stale map in active window/);
  const bounded = c => {
    c.schemaVersion = 4;
    c.rotation.levelCount = 208;
    c.dailyWindow = structuredClone(c.finalWindow);
    c.rotationEvidence = { serverIndex: c.dailyWindow.levelIndices[0],
      sceneOrder: Array.from({ length: 208 }, (_, index) => `Level_${index}`) };
    c.levels = c.dailyWindow.levelIndices.map(index => c.levels[index]);
    for (const level of [...c.levels, ...c.specialLevels]) {
      level.assetFile = 'BuildPlayer-' + level.scene;
      level.assetBundle = 'PEAK_Data/StreamingAssets/maps/levels0-31.assetbundle';
      for (const marker of level.markers) marker.source.sceneAsset = level.assetFile;
    }
  };
  await check(bounded, true, null, ['--catalog-key', 'catalog-v4.json']);
  await check(bounded, false, /matching publication key/);
  await check(c => { bounded(c); c.levels.pop(); }, false, /seven-day coverage/, ['--catalog-key', 'catalog-v4.json']);
  await check(c => { bounded(c); c.levels[0].index = c.levels[1].index; }, false, /seven-day coverage/, ['--catalog-key', 'catalog-v4.json']);
  await check(c => { bounded(c); c.levels[0].assetBundle = '../unknown'; }, false, /bundle binding/, ['--catalog-key', 'catalog-v4.json']);
  await check(c => { bounded(c); c.rotationEvidence.sceneOrder[3] = 'WilIsland'; }, false, /rotation evidence/, ['--catalog-key', 'catalog-v4.json']);
  await writeFile(join(root, "catalog.json"), await readFile(join(source, "catalog.json")));
  const matching = run("upload-peak-cdn.mjs", ["--source-root", root, "--validation-root", source, "--catalog-only", "--dry-run"]);
  assert.equal(matching.status, 0, matching.stdout + matching.stderr);
  // The same JSON with different bytes must not bypass the release binding.
  await writeFile(join(root, "catalog.json"), JSON.stringify(catalog, null, 3));
  const changed = run("upload-peak-cdn.mjs", ["--source-root", root, "--validation-root", source, "--catalog-only", "--dry-run"]);
  assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /Upload catalog differs/);
  console.log("Publication regressions passed: slot 5, invalid routes, pairing, titles, special separation, release binding. No uploads performed.");
} finally {
  await rm(root, { recursive: true, force: true });
}
