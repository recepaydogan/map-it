import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMapBuildingLocations } from "./map-building-data.mjs";
import { buildMapCraftingData } from "./map-crafting-data.mjs";
import { buildMapForagingData } from "./map-foraging-data.mjs";
import { buildMapItemCatalog } from "./map-item-catalog.mjs";
import { buildMapLootIndex } from "./map-loot-index.mjs";
import { readMapBuildings } from "./map-lotheader-parser.mjs";
import { readMapObjectLocations } from "./map-lotpack-object-parser.mjs";
import { buildMapObjectTileDefinitions, createMapObjectLabels } from "./map-object-definitions.mjs";
import { buildContainerLootData } from "./map-container-loot-profiler.mjs";
import { buildMapSpawnData } from "./map-spawn-data.mjs";
import { getTileContainerTypes, parseTileDefinitions } from "./map-tile-definitions-parser.mjs";
import { buildMapVehicleSpawnData } from "./map-vehicle-spawn-data.mjs";
import { extractGameContentLocales } from "./extract-game-content-locales.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const defaultGameRoot = resolve(projectRoot, "..", "project-zomboid");
const gameRoot = resolve(process.env.PZ_GAME_DIR || defaultGameRoot);
const sourceMapsRoot = join(gameRoot, "media", "maps");
const sourceMapRoot = join(sourceMapsRoot, "Muldraugh, KY");
const sourcePyramid = join(sourceMapRoot, "pyramid.zip");
const sourceWorldMap = join(sourceMapRoot, "worldmap.xml");
const sourceObjects = join(sourceMapRoot, "objects.lua");
const sourceIconRoot = join(gameRoot, "media", "ui", "LootableMaps");
const sourceProceduralDistributions = join(gameRoot, "media", "lua", "server", "Items", "ProceduralDistributions.lua");
const sourceDistributions = join(gameRoot, "media", "lua", "server", "Items", "Distributions.lua");
const sourceSuburbsDistributions = join(gameRoot, "media", "lua", "server", "Items", "SuburbsDistributions.lua");
const sourceItemsRoot = join(gameRoot, "media", "lua", "server", "Items");
const sourceMediaRoot = join(gameRoot, "media");
const sourceScriptsRoot = join(gameRoot, "media", "scripts");
const sourceItemNames = join(gameRoot, "media", "lua", "shared", "Translate", "EN", "ItemName.json");
const sourceRecipeNames = join(gameRoot, "media", "lua", "shared", "Translate", "EN", "Recipes.json");
const sourceForagingDefinitions = join(gameRoot, "media", "lua", "shared", "Foraging", "forageZones.lua");
const sourceVehicleZoneDefinitions = join(gameRoot, "media", "lua", "shared", "VehicleZoneDefinition.lua");
const sourceVehicleNames = join(gameRoot, "media", "lua", "shared", "Translate", "EN", "IG_UI.json");
const sourceUiNames = join(gameRoot, "media", "lua", "shared", "Translate", "EN", "UI.json");
const sourceAppLocale = join(projectRoot, "src", "i18n", "locales", "en.json");
const targetRoot = resolve(projectRoot, "public", "map-data", "knox-country");
const runtimeMetadataPath = resolve(projectRoot, "dist", "map-data", "knox-country", "metadata.json");
const expectedParent = resolve(projectRoot, "public", "map-data");
const metadataOnly = process.argv.includes("--metadata-only");
const MAP_BACKGROUND = [160, 160, 164];
const categoryIconFiles = {
  medical: "map_medcross.png",
  police: "map_police.png",
  fire: "map_firet.png",
  fuel: "map_fuel.png",
  vehicle: "map_steeringwheel.png",
  supplies: "map_apple.png",
  food: "map_burger.png",
  industrial: "map_gears.png",
  community: "map_columns.png",
  lodging: "map_bed.png",
  military: "map_target.png",
  weapons: "map_gun.png",
};

/* World-overlay icons. Not tied to a location category, but drawn from the same
   in-game map symbol set so an overlay pin reads like every other pin. The tire
   is deliberately not the steering wheel: that one already marks garages, and
   the star is free of every location category. */
const overlayIconFiles = {
  "vehicle-spawn": "map_tire.png",
  "spawn-point": "map_star.png",
};

if (!targetRoot.startsWith(`${expectedParent}\\`) && targetRoot !== expectedParent) {
  throw new Error(`Unsafe map output path: ${targetRoot}`);
}

for (const source of [
  sourcePyramid,
  sourceWorldMap,
  sourceObjects,
  sourceProceduralDistributions,
  sourceDistributions,
  sourceSuburbsDistributions,
  sourceItemNames,
  sourceRecipeNames,
  sourceForagingDefinitions,
  sourceVehicleZoneDefinitions,
  sourceVehicleNames,
  sourceUiNames,
]) {
  if (!existsSync(source)) {
    throw new Error(
      `Project Zomboid map source was not found at ${source}. Set PZ_GAME_DIR to the game directory.`,
    );
  }
}

const towns = [
  { id: "louisville", name: "Louisville", x: 13240, y: 2550 },
  { id: "valley-station", name: "Valley Station", x: 12595, y: 5330 },
  { id: "west-point", name: "West Point", x: 11620, y: 6850 },
  { id: "riverside", name: "Riverside", x: 6200, y: 5400 },
  { id: "muldraugh", name: "Muldraugh", x: 10800, y: 9850 },
  { id: "rosewood", name: "Rosewood", x: 8100, y: 11600 },
  { id: "march-ridge", name: "March Ridge", x: 9883, y: 12812 },
  { id: "fallas-lake", name: "Fallas Lake", x: 7213, y: 8288 },
  { id: "echo-creek", name: "Echo Creek", x: 3573, y: 10899 },
  { id: "brandenburg", name: "Brandenburg", x: 2152, y: 6089 },
  { id: "ekron", name: "Ekron", x: 411, y: 9761 },
  { id: "irvington", name: "Irvington", x: 1912, y: 14381 },
];

const spawnPointSources = towns.flatMap((town) => {
  const source = join(sourceMapsRoot, `${town.name}, KY`, "spawnpoints.lua");
  return existsSync(source) ? [{ townId: town.id, town: town.name, content: readFileSync(source, "utf8") }] : [];
});

const xml = readFileSync(sourceWorldMap, "utf8");
const itemNames = JSON.parse(readFileSync(sourceItemNames, "utf8"));
const clutterSources = readdirSync(sourceItemsRoot)
  .filter((name) => /^Distribution_.+Junk[.]lua$/.test(name))
  .map((name) => readFileSync(join(sourceItemsRoot, name), "utf8"));
const tileDefinitionSources = readdirSync(sourceMediaRoot)
  .filter((name) => name.endsWith(".tiles.txt"))
  .map((name) => readFileSync(join(sourceMediaRoot, name), "utf8"));
const tileDefinitions = parseTileDefinitions(tileDefinitionSources);
const tileContainerTypes = getTileContainerTypes(tileDefinitions);
const buildings = readMapBuildings(sourceMapRoot, tileContainerTypes);
const containerLootData = buildContainerLootData({
  buildings,
  distributionsSource: readFileSync(sourceDistributions, "utf8"),
  proceduralSource: readFileSync(sourceProceduralDistributions, "utf8"),
  suburbsDistributionsSource: readFileSync(sourceSuburbsDistributions, "utf8"),
  clutterSources,
  itemNames,
});
const buildingData = buildMapBuildingLocations({
  buildings,
  worldMapXml: xml,
  towns,
  buildingLootProfileIds: containerLootData.buildingLootProfileIds,
});
const objectLocations = readMapObjectLocations({
  mapRoot: sourceMapRoot,
  objectDefinitions: buildMapObjectTileDefinitions(tileDefinitions),
  objectLabels: createMapObjectLabels(JSON.parse(readFileSync(sourceAppLocale, "utf8"))),
  towns,
  sourceId: "base",
});
const locations = [...buildingData.locations, ...objectLocations];

const scriptSources = [];
const collectScriptSources = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectScriptSources(path);
    else if (entry.name.endsWith(".txt")) scriptSources.push(readFileSync(path, "utf8"));
  }
};
collectScriptSources(sourceScriptsRoot);
const items = buildMapItemCatalog(scriptSources, itemNames, containerLootData.lootItemIds);
const crafting = buildMapCraftingData(
  scriptSources,
  JSON.parse(readFileSync(sourceRecipeNames, "utf8")),
);
const lootIndex = buildMapLootIndex(
  locations,
  containerLootData.lootProfiles,
  undefined,
);

const tileRoot = join(targetRoot, "tiles");
const iconRoot = join(targetRoot, "icons");
const tileFiles = [];
const collectTileFiles = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) collectTileFiles(fullPath);
    else if (entry.name.endsWith(".png")) tileFiles.push(fullPath);
  }
};

if (metadataOnly) {
  if (existsSync(tileRoot)) collectTileFiles(tileRoot);
} else {
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(tileRoot, { recursive: true });
  mkdirSync(iconRoot, { recursive: true });
  const { default: sharp } = await import("sharp");
  for (const [category, filename] of Object.entries({ ...categoryIconFiles, ...overlayIconFiles })) {
    const source = join(sourceIconRoot, filename);
    if (!existsSync(source)) continue;
    await sharp(source)
      .trim()
      .resize(48, 48, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: 8,
        bottom: 8,
        left: 8,
        right: 8,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toFile(join(iconRoot, `${category}.png`));
  }
  execFileSync("tar", ["-xf", sourcePyramid, "-C", tileRoot], { stdio: "inherit" });
  collectTileFiles(tileRoot);

  const removeMapBackground = async (filePath) => {
    const { data: pixels, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
    const output = Buffer.alloc(info.width * info.height * 4);
    let hasTransparentPixels = false;
    for (let sourceIndex = 0, outputIndex = 0; sourceIndex < pixels.length; sourceIndex += info.channels, outputIndex += 4) {
      const red = pixels[sourceIndex];
      const green = pixels[sourceIndex + 1];
      const blue = pixels[sourceIndex + 2];
      const background = red === MAP_BACKGROUND[0] && green === MAP_BACKGROUND[1] && blue === MAP_BACKGROUND[2];
      output[outputIndex] = red;
      output[outputIndex + 1] = green;
      output[outputIndex + 2] = blue;
      output[outputIndex + 3] = background ? 0 : 255;
      hasTransparentPixels ||= background;
    }
    if (!hasTransparentPixels) return;
    const temporaryPath = `${filePath}.tmp.png`;
    await sharp(output, {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).png({ compressionLevel: 9 }).toFile(temporaryPath);
    rmSync(filePath);
    renameSync(temporaryPath, filePath);
  };

  for (let index = 0; index < tileFiles.length; index += 16) {
    await Promise.all(tileFiles.slice(index, index + 16).map(removeMapBackground));
  }
}

const metadata = {
  schemaVersion: 2,
  gameBuild: "42",
  generatedAt: new Date().toISOString(),
  source: "Local Project Zomboid installation",
  bounds: { minX: 0, minY: 0, maxX: 19968, maxY: 16128 },
  tileSize: 256,
  detailLevels: [0, 1, 2, 3, 4],
  towns,
  locations,
  items,
  crafting,
  lootIndex,
  lootProfiles: containerLootData.lootProfiles,
  foraging: buildMapForagingData(
    readFileSync(sourceObjects, "utf8"),
    readFileSync(sourceForagingDefinitions, "utf8"),
  ),
  vehicleSpawns: buildMapVehicleSpawnData(
    readFileSync(sourceObjects, "utf8"),
    readFileSync(sourceVehicleZoneDefinitions, "utf8"),
    JSON.parse(readFileSync(sourceVehicleNames, "utf8")),
  ),
  spawnPoints: buildMapSpawnData(
    spawnPointSources,
    JSON.parse(readFileSync(sourceUiNames, "utf8")),
  ),
  statistics: {
    towns: towns.length,
    searchableLocations: locations.length,
    objectMarkers: objectLocations.length,
  },
};

const metadataPath = join(targetRoot, "metadata.json");
writeFileSync(metadataPath, JSON.stringify(metadata));
const languageCount = extractGameContentLocales({ gameRoot, metadata, targetRoot });
if (metadataOnly && existsSync(dirname(runtimeMetadataPath))) {
  copyFileSync(metadataPath, runtimeMetadataPath);
}
console.log(
  `Imported ${buildingData.locations.length} buildings and ${objectLocations.length} useful object markers (${buildingData.matchedFeatures}/${buildingData.totalFeatures} matched world features), ${containerLootData.containerPlacementCount} placed containers, ${items.length} items, ${crafting.totalRecipes} crafting definitions, ${Object.keys(metadata.lootProfiles).length} container loot profiles, ${metadata.foraging.totalZones} foraging zones, ${metadata.vehicleSpawns.totalZones} named vehicle spawn zones, ${metadata.spawnPoints.totalPoints} player spawn points, ${languageCount} game-content languages, and ${tileFiles.length} Knox Country tiles from ${gameRoot}.`,
);
