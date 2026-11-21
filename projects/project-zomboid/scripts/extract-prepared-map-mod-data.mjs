import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { buildMapBuildingLocations } from "./map-building-data.mjs";
import { buildMapCraftingData } from "./map-crafting-data.mjs";
import { buildContainerLootData } from "./map-container-loot-profiler.mjs";
import { buildMapForagingData } from "./map-foraging-data.mjs";
import { buildMapItemCatalog } from "./map-item-catalog.mjs";
import { readMapBuildings } from "./map-lotheader-parser.mjs";
import { readMapObjectLocations } from "./map-lotpack-object-parser.mjs";
import { buildMapObjectTileDefinitions, createMapObjectLabels } from "./map-object-definitions.mjs";
import { buildMapLootIndex } from "./map-loot-index.mjs";
import { buildMapSpawnData } from "./map-spawn-data.mjs";
import { getTileContainerTypes, parseTileDefinitions } from "./map-tile-definitions-parser.mjs";
import { buildMapVehicleSpawnData } from "./map-vehicle-spawn-data.mjs";
import { writePreparedMapModCatalog } from "./prepared-map-mod-catalog.mjs";
import {
  getPreparedMapTownAnchor,
  getPreparedMapTownName,
} from "./prepared-map-mod-town.mjs";

const argumentsByName = new Map(process.argv.slice(2).map((argument) => {
  const [name, ...valueParts] = argument.replace(/^--/, "").split("=");
  return [name, valueParts.join("=")];
}));
const gameRoot = resolve(argumentsByName.get("game-root") || process.env.PZ_GAME_DIR
  || "C:/Program Files (x86)/Steam/steamapps/common/ProjectZomboid");
const workshopRoot = resolve(argumentsByName.get("workshop-root")
  || "C:/Program Files (x86)/Steam/steamapps/workshop/content/108600");
const outputRoot = resolve(argumentsByName.get("root")
  || ".runtime-data/map-data/knox-country/isometric-mods");
const baseMetadataPath = resolve(argumentsByName.get("base-metadata")
  || "dist/map-data/knox-country/metadata.json");

const requiredPaths = [gameRoot, workshopRoot, outputRoot, baseMetadataPath];
for (const path of requiredPaths) {
  if (!existsSync(path)) throw new Error(`Required source was not found: ${path}`);
}

const readText = (path) => readFileSync(path, "utf8");
const collectFiles = (root, predicate) => {
  if (!existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (predicate(path)) files.push(path);
    }
  };
  visit(root);
  return files;
};
const findMediaRoot = (path) => {
  let current = path;
  while (dirname(current) !== current) {
    if (basename(current).toLowerCase() === "media") return current;
    current = dirname(current);
  }
  throw new Error(`Media root could not be resolved for ${path}.`);
};
const cellSetFromMapRoot = (mapRoot) => new Set(readdirSync(mapRoot)
  .map((name) => name.match(/^(?:world_)?(-?\d+)_(-?\d+)[.]lotheader$/))
  .filter(Boolean)
  .map((match) => `${match[1]},${match[2]}`));
const sameCells = (left, right) => left.size === right.size && [...left].every((cell) => right.has(cell));
const findMapRoot = (workshopId, overlay) => {
  const itemRoot = join(workshopRoot, workshopId);
  const candidates = [...new Set(collectFiles(itemRoot, (path) => basename(path) === "worldmap.xml"
    || extname(path).toLowerCase() === ".lotheader").map(dirname))]
    .filter((path) => basename(path) === overlay.mapFolder)
    .map((path) => ({ path, cells: cellSetFromMapRoot(path) }))
    .filter(({ cells }) => sameCells(cells, new Set(overlay.cells)))
    .sort((left, right) => Number(!left.path.toLowerCase().includes("\\common\\"))
      - Number(!right.path.toLowerCase().includes("\\common\\")));
  if (candidates.length === 0) {
    throw new Error(`${overlay.mapFolder} with its exact prepared cell set was not found in workshop item ${workshopId}.`);
  }
  return candidates[0].path;
};

const baseMediaRoot = join(gameRoot, "media");
const baseItemsRoot = join(baseMediaRoot, "lua", "server", "Items");
const baseMetadata = JSON.parse(readText(baseMetadataPath));
const objectLabels = createMapObjectLabels(JSON.parse(readText(resolve("src/i18n/locales/en.json"))));
const baseItemIds = new Set((baseMetadata.items ?? []).map(({ id }) => id));
const itemNames = JSON.parse(readText(join(baseMediaRoot, "lua", "shared", "Translate", "EN", "ItemName.json")));
const recipeNames = JSON.parse(readText(join(baseMediaRoot, "lua", "shared", "Translate", "EN", "Recipes.json")));
const uiNames = JSON.parse(readText(join(baseMediaRoot, "lua", "shared", "Translate", "EN", "UI.json")));
const vehicleNames = JSON.parse(readText(join(baseMediaRoot, "lua", "shared", "Translate", "EN", "IG_UI.json")));
const distributionsSource = readText(join(baseItemsRoot, "Distributions.lua"));
const proceduralSource = readText(join(baseItemsRoot, "ProceduralDistributions.lua"));
const suburbsDistributionsSource = readText(join(baseItemsRoot, "SuburbsDistributions.lua"));
const clutterSources = readdirSync(baseItemsRoot)
  .filter((name) => /^Distribution_.+Junk[.]lua$/.test(name))
  .map((name) => readText(join(baseItemsRoot, name)));
const foragingDefinitions = readText(join(baseMediaRoot, "lua", "shared", "Foraging", "forageZones.lua"));
const vehicleDefinitions = readText(join(baseMediaRoot, "lua", "shared", "VehicleZoneDefinition.lua"));
const baseTileDefinitionSources = readdirSync(baseMediaRoot)
  .filter((name) => name.endsWith(".tiles.txt"))
  .map((name) => readText(join(baseMediaRoot, name)));
const catalog = JSON.parse(readText(join(outputRoot, "catalog.json")));
const requestedModKeys = new Set((argumentsByName.get("mods") ?? "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean));
const selectedMods = requestedModKeys.size > 0
  ? catalog.mods.filter(({ key }) => requestedModKeys.has(key))
  : catalog.mods;
if (selectedMods.length !== requestedModKeys.size && requestedModKeys.size > 0) {
  const knownKeys = new Set(catalog.mods.map(({ key }) => key));
  const unknownKeys = [...requestedModKeys].filter((key) => !knownKeys.has(key));
  throw new Error(`Unknown prepared mod keys: ${unknownKeys.join(", ")}.`);
}

const mergeForaging = (target, source) => {
  target.totalZones += source.totalZones;
  for (const [kind, zones] of Object.entries(source.zones)) target.zones[kind].push(...zones);
};
const mergeVehicleSpawns = (target, source) => {
  const definitionIndex = new Map(target.definitions.map(({ id }, index) => [id, index]));
  const remap = source.definitions.map((definition) => {
    if (!definitionIndex.has(definition.id)) {
      definitionIndex.set(definition.id, target.definitions.length);
      target.definitions.push(definition);
    }
    return definitionIndex.get(definition.id);
  });
  target.zones.push(...source.zones.map(([index, ...coordinates]) => [remap[index], ...coordinates]));
  target.totalZones = target.zones.length;
};

for (const mod of selectedMods) {
  if (!mod.workshopId) throw new Error(`Prepared mod ${mod.key} has no workshop ID.`);
  const locations = [];
  const lootProfiles = {};
  const lootItemIds = new Set();
  const towns = [];
  const mediaRoots = new Set();
  const spawnPointSources = [];
  let matchedWorldFeatures = 0;
  let totalWorldFeatures = 0;
  let buildingsCount = 0;
  let containerPlacementCount = 0;
  let objectMarkerCount = 0;
  let foraging;
  let vehicleSpawns = { definitions: [], zones: [], totalZones: 0 };

  for (const [overlayIndex, overlay] of mod.overlays.entries()) {
    const mapRoot = findMapRoot(mod.workshopId, overlay);
    const mediaRoot = findMediaRoot(mapRoot);
    mediaRoots.add(mediaRoot);
    const modLuaFiles = collectFiles(join(mediaRoot, "lua"), (path) => extname(path).toLowerCase() === ".lua");
    const distributionAddonSources = modLuaFiles
      .map(readText)
      .filter((source) => /SuburbsDistributions|ProceduralDistributions/.test(source));
    const tileDefinitionSources = collectFiles(mediaRoot, (path) => path.endsWith(".tiles.txt")).map(readText);
    const tileDefinitions = parseTileDefinitions([...baseTileDefinitionSources, ...tileDefinitionSources]);
    const tileContainerTypes = getTileContainerTypes(tileDefinitions);
    const idPrefix = `mod:${mod.key}:${overlayIndex}`;
    const buildings = readMapBuildings(mapRoot, tileContainerTypes).map((building) => ({
      ...building,
      id: `${idPrefix}:${building.id}`,
    }));
    const containerLootData = buildContainerLootData({
      buildings,
      distributionsSource,
      proceduralSource,
      suburbsDistributionsSource,
      clutterSources,
      roomDistributionSources: distributionAddonSources,
      proceduralAddonSources: distributionAddonSources,
    });
    const townAnchor = getPreparedMapTownAnchor(
      buildings,
      overlay.cells,
      overlay.source.mapInfo.cell_size,
    );
    const town = {
      id: `${idPrefix}:town`,
      name: getPreparedMapTownName(overlay.mapFolder, mod.displayName),
      x: townAnchor.x,
      y: townAnchor.y,
    };
    towns.push(town);
    const worldMapPath = join(mapRoot, "worldmap.xml");
    const buildingData = buildMapBuildingLocations({
      buildings,
      worldMapXml: existsSync(worldMapPath) ? readText(worldMapPath) : "",
      towns: [town],
      buildingLootProfileIds: containerLootData.buildingLootProfileIds,
    });
    const objectLocations = readMapObjectLocations({
      mapRoot,
      objectDefinitions: buildMapObjectTileDefinitions(tileDefinitions),
      objectLabels,
      towns: [town],
      sourceId: idPrefix,
    });
    locations.push(...buildingData.locations, ...objectLocations);
    Object.assign(lootProfiles, containerLootData.lootProfiles);
    for (const itemId of containerLootData.lootItemIds) lootItemIds.add(itemId);
    buildingsCount += buildings.length;
    containerPlacementCount += containerLootData.containerPlacementCount;
    objectMarkerCount += objectLocations.length;
    matchedWorldFeatures += buildingData.matchedFeatures;
    totalWorldFeatures += buildingData.totalFeatures;

    const objectsPath = join(mapRoot, "objects.lua");
    if (existsSync(objectsPath)) {
      const objectsSource = readText(objectsPath);
      const overlayForaging = buildMapForagingData(objectsSource, foragingDefinitions);
      if (!foraging) foraging = overlayForaging;
      else mergeForaging(foraging, overlayForaging);
      mergeVehicleSpawns(vehicleSpawns, buildMapVehicleSpawnData(objectsSource, vehicleDefinitions, vehicleNames));
    }
    const spawnPointsPath = join(mapRoot, "spawnpoints.lua");
    if (existsSync(spawnPointsPath)) {
      spawnPointSources.push({ townId: town.id, town: town.name, content: readText(spawnPointsPath) });
    }
  }

  const modScriptSources = [...mediaRoots].flatMap((mediaRoot) => collectFiles(
    join(mediaRoot, "scripts"),
    (path) => extname(path).toLowerCase() === ".txt",
  ).map(readText));
  const items = buildMapItemCatalog(modScriptSources, itemNames, lootItemIds)
    .filter(({ id }) => !baseItemIds.has(id));
  const crafting = buildMapCraftingData(modScriptSources, recipeNames);
  const spawnPoints = buildMapSpawnData(spawnPointSources, uiNames);
  const data = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    towns,
    locations,
    items,
    crafting,
    lootIndex: buildMapLootIndex(locations, lootProfiles),
    lootProfiles,
    ...(foraging ? { foraging } : {}),
    vehicleSpawns,
    spawnPoints,
    statistics: {
      buildings: buildingsCount,
      searchableLocations: locations.length,
      objectMarkers: objectMarkerCount,
      containerPlacements: containerPlacementCount,
      lootProfiles: Object.keys(lootProfiles).length,
      customItems: items.length,
      craftingRecipes: crafting.totalRecipes,
      matchedWorldFeatures,
      totalWorldFeatures,
      foragingZones: foraging?.totalZones ?? 0,
      vehicleSpawnZones: vehicleSpawns.totalZones,
      spawnPoints: spawnPoints.totalPoints,
    },
  };
  writeFileSync(join(outputRoot, mod.key, "data.json"), `${JSON.stringify(data)}\n`);
  console.log(`${mod.displayName}: ${buildingsCount} buildings, ${objectMarkerCount} useful object markers, ${containerPlacementCount} containers, ${Object.keys(lootProfiles).length} loot profiles, ${items.length} custom items, ${data.statistics.foragingZones} forage zones, ${data.statistics.vehicleSpawnZones} vehicle zones, ${data.statistics.spawnPoints} spawn points.`);
}

writePreparedMapModCatalog(outputRoot);
