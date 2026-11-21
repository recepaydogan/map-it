import assert from "node:assert/strict";
import { BIOME_TILE_LIMIT, clampBiomeCamera, planBiomeTiles, tileKey } from "../src/features/generation/biome-viewport.ts";
import { resolveBiomePreview, resolveDimensionBiomePreview } from "../src/features/generation/resolve-biome-preview.ts";
import { GAME_BIOME_PREVIEWS, GAME_CUSTOM_WORLD_BIOMES, GAME_WORLD_CATALOG, GAME_WORLD_MAP_PREVIEWS } from "../src/game-config.ts";

let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
const viewport = { width: 840, height: 720, camera: { x: -311.5, z: -777.25, zoom: 0.25 }, blockY: 64 };
check("negative-coordinate viewport has complete single coverage with bounded, nonoverlapping cells", () => {
  const tiles = planBiomeTiles(viewport), cells = new Set();
  for (const tile of tiles) {
    assert(tile.width <= 256 && tile.height <= 256);
    for (let z = tile.cellZ; z < tile.cellZ + tile.height; z++) for (let x = tile.cellX; x < tile.cellX + tile.width; x++) {
      const key = `${x}:${z}`; assert(!cells.has(key)); cells.add(key);
    }
  }
  const scale = tiles[0].scale;
  for (let z = Math.floor((viewport.camera.z - viewport.height / viewport.camera.zoom / 2) / scale);
    z <= Math.floor((viewport.camera.z + viewport.height / viewport.camera.zoom / 2) / scale); z++)
    for (let x = Math.floor((viewport.camera.x - viewport.width / viewport.camera.zoom / 2) / scale);
      x <= Math.floor((viewport.camera.x + viewport.width / viewport.camera.zoom / 2) / scale); x++) assert(cells.has(`${x}:${z}`));
});
check("zoom chooses explicit native sampling and never stretches coarse tiles as block-detail data", () => {
  for (const [zoom, scale] of [[8, 1], [1, 1], [.9, 1], [.25, 4], [.24, 4], [.0625, 16], [1 / 64, 64]])
    assert(planBiomeTiles({ ...viewport, camera: { ...viewport.camera, zoom } }).every(tile => tile.scale === scale));
});
check("tile identities include scale, width, altitude and negative origins without collisions", () => {
  const tile = planBiomeTiles(viewport)[0], keys = new Set([tileKey(tile)]);
  for (const field of ["scale", "cellX", "cellZ", "width", "height", "blockY"]) keys.add(tileKey({ ...tile, [field]: tile[field] + 1 }));
  assert.equal(keys.size, 7);
});
check("world boundary tiles are clipped to supported sample coordinates, never wrapped", () => {
  for (const sign of [-1, 1]) for (const zoom of [1 / 64, .25, 8]) {
    const tiles = planBiomeTiles({ ...viewport, camera: { x: sign * 30000000, z: sign * 30000000, zoom } });
    assert(tiles.length > 0);
    for (const tile of tiles) {
      assert(tile.cellX * tile.scale >= -30000000 && tile.cellZ * tile.scale >= -30000000);
      assert((tile.cellX + tile.width - 1) * tile.scale <= 30000000);
      assert((tile.cellZ + tile.height - 1) * tile.scale <= 30000000);
    }
  }
});
check("4K and compact viewports are bounded and prioritize near-center loading", () => {
  for (const [width, height] of [[320, 480], [840, 720], [1440, 900], [3840, 2160]]) {
    const tiles = planBiomeTiles({ ...viewport, width, height }); assert(tiles.length <= BIOME_TILE_LIMIT);
    const distance = tile => Math.hypot(tile.cellX * tile.scale - viewport.camera.x, tile.cellZ * tile.scale - viewport.camera.z);
    assert(tiles.every((tile, i) => i === 0 || distance(tile) >= distance(tiles[i - 1])));
  }
  for (const zoom of [1 / 64, .02, .06, .08, .2, .5, .9, 1, 8])
    assert(planBiomeTiles({ ...viewport, width: 3840, height: 2160, camera: { ...viewport.camera, zoom } }).length <= BIOME_TILE_LIMIT);
});
check("nonfinite, oversized and invalid-altitude viewports fail rather than allocating indefinitely", () => {
  for (const patch of [{ width: 0 }, { height: Infinity }, { width: 8193 }, { blockY: 1.5 }, { blockY: 2049 }, { camera: { x: NaN, z: 0, zoom: 1 } }])
    assert.throws(() => planBiomeTiles({ ...viewport, ...patch }));
  assert.deepEqual(clampBiomeCamera({ x: 1e10, z: -1e10, zoom: 100 }), { x: 30000000, z: -30000000, zoom: 8 });
});
check("every edition, version and world type offered by the form resolves to a map generator", () => {
  for (const [edition, catalog] of Object.entries(GAME_WORLD_CATALOG)) {
    for (const version of catalog.versions) for (const preset of catalog.presets) {
      if ("versions" in preset && !preset.versions.includes(version)) continue;
      const settings = preset.id === "single-biome" || preset.id === "flat"
        ? { biome: GAME_CUSTOM_WORLD_BIOMES[0].id } : {};
      const config = resolveBiomePreview({ edition, generation: { version, seed: "1", preset: preset.id, settings } }, GAME_WORLD_MAP_PREVIEWS);
      assert(config, `Missing ${edition} ${version} ${preset.id}`);
      assert.equal(config.kind, preset.id === "flat" || preset.id === "single-biome" ? "uniform" : "seeded");
      if (config.kind === "seeded") {
        const profile = config.generationProfiles[JSON.stringify([version, preset.id])];
        const expected = preset.id === "large-biomes" ? `${version}:large-biomes` : version;
        assert.equal(profile, expected);
        assert(config.profiles.includes(profile));
      }
      for (const dimension of [-1, 0, 1]) {
        const source = resolveDimensionBiomePreview({ edition, generation: { version, seed: "1", preset: preset.id, settings } },
          config, dimension, GAME_BIOME_PREVIEWS);
        assert(source, `Missing ${edition} ${version} ${preset.id} dimension ${dimension}`);
        assert.equal(source.config.kind, config.kind === "uniform" && dimension === 0 ? "uniform" : "seeded");
      }
    }
  }
});
check("source resolver rejects unknown or modified seeded generators and unknown uniform biomes", () => {
  const seeded = { edition: "java", generation: { version: "1.21.10", seed: "1", preset: "default", settings: {} } };
  for (const patch of [{ version: "unadvertised" }, { preset: "custom" }, { settings: { custom: true } }])
    assert.equal(resolveBiomePreview({ ...seeded, generation: { ...seeded.generation, ...patch } }, GAME_WORLD_MAP_PREVIEWS), null);
  assert.equal(resolveBiomePreview({ ...seeded, edition: "other" }, GAME_WORLD_MAP_PREVIEWS), null);
  assert.equal(resolveBiomePreview({ edition: "java", generation: { version: "1.21.3", seed: "1", preset: "single-biome",
    settings: { biome: "minecraft:not_a_biome" } } }, GAME_WORLD_MAP_PREVIEWS), null);
});
console.log(`${checks} biome viewport and capability checks passed.`);
