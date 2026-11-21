import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getIsometricOverlayPlacement } from "../src/features/map/map-isometric-overlay.ts";
import { isTileInIsometricRanges } from "../src/features/map/map-isometric-tile-ranges.ts";
import { parsePreparedMapModCatalog } from "../src/features/map/prepared-map-mod-catalog.ts";
import { createPreparedMapModMetadata } from "../src/features/map/prepared-map-mod-data.ts";
import {
  createPreparedMapModPackages,
  togglePreparedMapModPackage,
} from "../src/features/map/prepared-map-mod-packages.ts";
import { writePreparedMapModCatalog } from "./prepared-map-mod-catalog.mjs";

const temporaryRoot = mkdtempSync(join(tmpdir(), "pzim-prepared-mod-test-"));
try {
  const overlayRoot = join(temporaryRoot, "example-mod", "example-map");
  mkdirSync(overlayRoot, { recursive: true });
  const manifest = {
    id: "example-mod:example-map",
    tileSourceKind: "direct",
    renderer: "pzmap2dzi",
    rendererCommit: "test-renderer",
    sourceFingerprint: "sha256:test",
    generatedAt: "2026-08-12T00:00:00.000Z",
    cellRange: [40, 20, 2, 1],
    layerRange: [0, 2],
    complete: true,
    mapInfo: {
      w: 4096,
      h: 2048,
      x0: 512,
      y0: -256,
      sqr: 128,
      scale: 1,
      minlayer: 0,
      maxlayer: 2,
      cell_size: 256,
      cell_rects: [[40, 20, 2, 1]],
    },
    floors: [{
      floor: 0,
      tileSize: 1024,
      format: "webp",
      width: 4096,
      height: 2048,
      levels: [0, 1, 2],
      tileRanges: { "2": [[0, 1, 2]] },
    }],
    preparedMod: {
      key: "example-mod",
      modId: "ExampleMod",
      displayName: "Example Mod",
      workshopId: "1234",
      builds: ["42"],
      kind: "add-on",
      mapFolder: "Example Map",
      cells: ["40,20", "41,20"],
    },
  };
  writeFileSync(join(overlayRoot, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(temporaryRoot, "example-mod", "data.json"), JSON.stringify({ schemaVersion: 1 }));

  const generated = writePreparedMapModCatalog(temporaryRoot);
  const parsed = parsePreparedMapModCatalog(generated);
  assert.equal(parsed.mods.length, 1);
  assert.equal(parsed.mods[0]?.dataUrl, "/map-data/knox-country/isometric-mods-v2/example-mod/data.json");
  assert.equal(parsed.mods[0]?.overlays[0]?.source.basePath, "/map-data/knox-country/isometric-mods-v2/example-mod/example-map");
  const parsedFromCdn = parsePreparedMapModCatalog(
    generated,
    "https://cdn.example.test/b42/knox-country/isometric-mods/catalog.json",
  );
  assert.equal(
    parsedFromCdn.mods[0]?.overlays[0]?.source.basePath,
    "https://cdn.example.test/b42/knox-country/isometric-mods/example-mod/example-map",
  );
  assert.equal(
    parsedFromCdn.mods[0]?.dataUrl,
    "https://cdn.example.test/b42/knox-country/isometric-mods/example-mod/data.json",
  );
  assert.deepEqual(parsed.mods[0]?.overlays[0]?.cells, ["40,20", "41,20"]);
  const parsedSource = parsed.mods[0].overlays[0].source;
  const parsedFloor = parsedSource.floors[0];
  assert.equal(isTileInIsometricRanges(parsedFloor.tileRanges, 2, 1, 0), true);
  assert.equal(isTileInIsometricRanges(parsedFloor.tileRanges, 2, 0, 0), false);
  assert.equal(isTileInIsometricRanges(parsedFloor.tileRanges, 1, 1, 0), false);

  const packageMods = [
    { ...parsed.mods[0], key: "snake-factory", displayName: "Snake's ModPack Build 42 - Factory" },
    { ...parsed.mods[0], key: "snake-ville", displayName: "Snake's ModPack Build 42 - SnakeVille" },
  ];
  const packages = createPreparedMapModPackages(packageMods);
  assert.equal(packages.length, 1);
  assert.equal(packages[0].key, "workshop:1234");
  assert.equal(packages[0].displayName, "Snake's ModPack Build 42");
  assert.deepEqual(packages[0].mods.map(({ key }) => key), ["snake-factory", "snake-ville"]);
  assert.equal(createPreparedMapModPackages([{ ...packageMods[0], workshopId: "5678" }])[0].key, "mod:snake-factory");
  assert.deepEqual(togglePreparedMapModPackage([], ["snake-factory", "snake-ville"]), {
    activeKeys: ["snake-factory", "snake-ville"],
    activating: true,
  });
  assert.deepEqual(togglePreparedMapModPackage(["snake-factory"], ["snake-factory", "snake-ville"]), {
    activeKeys: ["snake-factory", "snake-ville"],
    activating: true,
  });
  assert.deepEqual(togglePreparedMapModPackage(
    ["other", "snake-factory", "snake-ville"],
    ["snake-factory", "snake-ville"],
  ), {
    activeKeys: ["other"],
    activating: false,
  });

  const base = {
    ...parsed.mods[0].overlays[0].source,
    id: "base",
    mapInfo: { ...parsed.mods[0].overlays[0].source.mapInfo, w: 8192, x0: 1024, y0: 256 },
  };
  assert.deepEqual(getIsometricOverlayPlacement(base, parsed.mods[0].overlays[0].source), {
    x: 0.0625,
    y: 0.0625,
    width: 0.5,
  });

  const mergedData = createPreparedMapModMetadata(
    {
      id: "knox-country",
      displayName: "Knox Country",
      description: "",
      creator: "",
      bounds: { minX: 0, minY: 0, maxX: 10000, maxY: 10000 },
      towns: [{ id: "knox", name: "Knox", x: 100, y: 100 }],
      locations: [
        { id: "knox-location", name: "Knox", category: "other", label: "Knox", subtype: "building", townId: "knox", town: "Knox", x: 100, y: 100 },
        { id: "base-object-overridden", name: "Well", category: "object-water", label: "Water sources", subtype: "object:well", townId: "knox", town: "Knox", x: 10400, y: 5200 },
      ],
      items: [{ id: "Base.Axe", name: "Axe", lootable: true }],
      statistics: {},
      tileSource: { kind: "static", basePath: "/", tilePattern: "{x}-{y}" },
    },
    {
      schemaVersion: 1,
      generatedAt: "",
      towns: [{ id: "mod-town", name: "Mod Town", x: 10400, y: 5200 }],
      locations: [
        { id: "mod-location", name: "Mod", category: "other", label: "Mod", subtype: "building", townId: "mod-town", town: "Mod Town", x: 10400, y: 5200 },
        { id: "mod-object", name: "Generator", category: "object-power", label: "Generators", subtype: "object:generator", townId: "mod-town", town: "Mod Town", x: 10401, y: 5201 },
      ],
      items: [],
      crafting: { recipes: [], totalRecipes: 0, craftRecipes: 0, evolvedRecipes: 0, recipesWithConcreteOutputs: 0, outputItems: 0 },
      lootIndex: [],
      lootProfiles: {},
      statistics: {},
    },
    ["40,20", "41,20"],
    256,
  );
  assert.deepEqual(mergedData.locations.map(({ id }) => id), ["knox-location", "mod-location", "mod-object"]);
  assert.equal(mergedData.locations.some(({ id }) => id === "base-object-overridden"), false);
  assert.equal(mergedData.locations.find(({ id }) => id === "mod-object")?.category, "object-power");
  assert.deepEqual(mergedData.bounds, { minX: 0, minY: 0, maxX: 10752, maxY: 10000 });
  assert.equal(mergedData.items?.[0]?.name, "Axe");

  const invalid = structuredClone(generated);
  invalid.mods[0].overlays[0].source.layerRange = [0];
  assert.throws(() => parsePreparedMapModCatalog(invalid), /two integers/);

  const gameRoot = join(temporaryRoot, "game");
  const modRoot = join(temporaryRoot, "workshop-item", "mods", "ExampleMod");
  mkdirSync(join(gameRoot, "media", "maps", "Muldraugh, KY"), { recursive: true });
  mkdirSync(join(gameRoot, "media", "texturepacks"), { recursive: true });
  mkdirSync(join(modRoot, "42", "media", "maps", "Example Map"), { recursive: true });
  writeFileSync(join(modRoot, "42", "mod.info"), "id=ExampleMod\nname=Example Mod\n");
  writeFileSync(join(modRoot, "42", "media", "maps", "Example Map", "40_20.lotheader"), "test");
  writeFileSync(join(modRoot, "42", "media", "maps", "Example Map", "41_20.lotheader"), "test");
  const plan = JSON.parse(execFileSync(process.execPath, [
    join(import.meta.dirname, "prepare-isometric-map-mod.mjs"),
    `--game-root=${gameRoot}`,
    `--mod-root=${modRoot}`,
    "--workshop-id=1234",
    "--plan",
  ], { encoding: "utf8" }));
  assert.equal(plan.modId, "ExampleMod");
  assert.equal(plan.maps[0].cells, 2);
  assert.deepEqual(plan.maps[0].cellRange, [40, 20, 2, 1]);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("Prepared map mod catalog, merged data and placement tests passed.");
