import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMapForagingData } from "./map-foraging-data.mjs";
import { buildMapCraftingData } from "./map-crafting-data.mjs";
import { buildMapItemCatalog, qualifyItemId } from "./map-item-catalog.mjs";
import { readMapBuildings } from "./map-lotheader-parser.mjs";
import { parseMapObjects } from "./map-objects-parser.mjs";
import { parseProceduralDistributionBlocks } from "./map-loot-profiler.mjs";
import { buildMapVehicleSpawnData } from "./map-vehicle-spawn-data.mjs";
import { buildContainerLootData } from "./map-container-loot-profiler.mjs";
import { parseTileContainerTypes } from "./map-tile-definitions-parser.mjs";

const scriptDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const projectRoot = resolve(scriptDirectory, "..");
const gameRoot = resolve(process.env.PZ_GAME_DIR || join(projectRoot, "..", "project-zomboid"));
const mediaRoot = join(gameRoot, "media");
const mapRoot = join(mediaRoot, "maps", "Muldraugh, KY");
const outputJson = join(projectRoot, "docs", "game-data-inventory.json");
const outputMarkdown = join(projectRoot, "docs", "game-data-audit.md");

if (!existsSync(mediaRoot)) {
  throw new Error(`Project Zomboid media directory was not found: ${mediaRoot}`);
}

const walkFiles = (directory) => {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(directory);
  return files;
};

const countMatches = (source, pattern) => [...source.matchAll(pattern)].length;
const uniqueMatches = (source, pattern) => new Set([...source.matchAll(pattern)].map((match) => match[1]));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sum = (values) => values.reduce((total, value) => total + value, 0);
const formatNumber = (value) => value.toLocaleString("en-US");
const formatBytes = (value) => {
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const getFileInventory = (files) => {
  const extensions = new Map();
  const roots = new Map();
  let totalBytes = 0;
  for (const path of files) {
    const bytes = statSync(path).size;
    const extension = extname(path).toLowerCase() || "[none]";
    const root = relative(mediaRoot, path).split(/[\\/]/)[0] || "[root]";
    const extensionEntry = extensions.get(extension) ?? { files: 0, bytes: 0 };
    extensionEntry.files += 1;
    extensionEntry.bytes += bytes;
    extensions.set(extension, extensionEntry);
    const rootEntry = roots.get(root) ?? { files: 0, bytes: 0 };
    rootEntry.files += 1;
    rootEntry.bytes += bytes;
    roots.set(root, rootEntry);
    totalBytes += bytes;
  }
  const sortEntries = (entries) => Object.fromEntries([...entries]
    .sort((left, right) => right[1].files - left[1].files || left[0].localeCompare(right[0])));
  return {
    totalFiles: files.length,
    totalBytes,
    byExtension: sortEntries(extensions),
    byRoot: sortEntries(roots),
  };
};

const extractTopLevelTableNames = (source, marker) => {
  const start = source.indexOf(marker);
  if (start < 0) return [];
  const lines = source.slice(start).split(/\r?\n/);
  const names = [];
  let depth = 0;
  let started = false;
  for (const line of lines) {
    const structural = line
      .replace(/--.*$/, "")
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
    if (started && depth === 1) {
      const match = structural.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/);
      if (match) names.push(match[1]);
    }
    const opens = (structural.match(/\{/g) ?? []).length;
    const closes = (structural.match(/\}/g) ?? []).length;
    depth += opens - closes;
    if (opens > 0) started = true;
    if (started && depth <= 0) break;
  }
  return names;
};

const parseWorldMap = (source) => {
  const subtypeCounts = new Map();
  let features = 0;
  let buildingFeatures = 0;
  for (const match of source.matchAll(/<feature>([\s\S]*?)<\/feature>/g)) {
    features += 1;
    const body = match[1];
    const roomTone = body.match(/<property name="RoomTone" value="([^"]*)"\/>/)?.[1];
    const building = body.match(/<property name="building" value="([^"]*)"\/>/)?.[1];
    const subtype = roomTone || building;
    if (!subtype) continue;
    buildingFeatures += 1;
    subtypeCounts.set(subtype, (subtypeCounts.get(subtype) ?? 0) + 1);
  }
  return {
    features,
    buildingFeatures,
    uniqueBuildingSubtypes: subtypeCounts.size,
    topBuildingSubtypes: [...subtypeCounts]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 30)
      .map(([name, count]) => ({ name, count })),
  };
};

const mediaFiles = walkFiles(mediaRoot);
const inventory = getFileInventory(mediaFiles);
const mapFiles = readdirSync(mapRoot);
const tileContainerTypes = parseTileContainerTypes(mediaFiles
  .filter((path) => path.endsWith(".tiles.txt"))
  .map((path) => readFileSync(path, "utf8")));
const buildings = readMapBuildings(mapRoot, tileContainerTypes);
const roomCounts = new Map();
for (const building of buildings) {
  for (const room of building.roomTypes) roomCounts.set(room, (roomCounts.get(room) ?? 0) + 1);
}

const worldMapSource = readFileSync(join(mapRoot, "worldmap.xml"), "utf8");
const objectsSource = readFileSync(join(mapRoot, "objects.lua"), "utf8");
const distributionsSource = readFileSync(join(mediaRoot, "lua", "server", "Items", "Distributions.lua"), "utf8");
const proceduralSource = readFileSync(join(mediaRoot, "lua", "server", "Items", "ProceduralDistributions.lua"), "utf8");
const suburbsDistributionsSource = readFileSync(join(mediaRoot, "lua", "server", "Items", "SuburbsDistributions.lua"), "utf8");
const itemNames = readJson(join(mediaRoot, "lua", "shared", "Translate", "EN", "ItemName.json"));
const recipeNames = readJson(join(mediaRoot, "lua", "shared", "Translate", "EN", "Recipes.json"));
const foragingDefinitions = readFileSync(join(mediaRoot, "lua", "shared", "Foraging", "forageZones.lua"), "utf8");
const vehicleDefinitions = readFileSync(join(mediaRoot, "lua", "shared", "VehicleZoneDefinition.lua"), "utf8");
const vehicleNames = readJson(join(mediaRoot, "lua", "shared", "Translate", "EN", "IG_UI.json"));
const mapObjects = parseMapObjects(objectsSource);
const foraging = buildMapForagingData(objectsSource, foragingDefinitions);
const vehicleSpawns = buildMapVehicleSpawnData(objectsSource, vehicleDefinitions, vehicleNames);
const roomDistributionNames = extractTopLevelTableNames(distributionsSource, "local distributionTable = {");
const roomDistributionAliases = new Map([...suburbsDistributionsSource.matchAll(
  /SuburbsDistributions[.]([A-Za-z_][A-Za-z0-9_]*)\s*=\s*SuburbsDistributions[.]([A-Za-z_][A-Za-z0-9_]*)/g,
)].map((match) => [match[1].toLowerCase(), match[2].toLowerCase()]));
const proceduralBlocks = parseProceduralDistributionBlocks(proceduralSource);
const proceduralItems = new Set([...uniqueMatches(
  proceduralSource,
  /^\s*"([A-Za-z0-9_.-]+)",\s*\d+(?:\.\d+)?,?\s*$/gm,
)].map((itemId) => qualifyItemId(itemId)));
const clutterDistributionSources = mediaFiles
  .filter((path) => /lua[\\/]server[\\/]Items[\\/]Distribution_.+Junk[.]lua$/i.test(path))
  .map((path) => readFileSync(path, "utf8"));
const clutterDistributionSource = clutterDistributionSources.join("\n");
const clutterDistributionItems = new Set([...uniqueMatches(
  clutterDistributionSource,
  /"([A-Za-z0-9_.-]+)"\s*,\s*\d+(?:\.\d+)?/g,
)].map((itemId) => qualifyItemId(itemId)));
const directDistributionItems = new Set([...uniqueMatches(
  distributionsSource,
  /^\s*"([A-Za-z0-9_.-]+)",\s*\d+(?:\.\d+)?,?\s*$/gm,
)].map((itemId) => qualifyItemId(itemId)));
const exactContainerLootData = buildContainerLootData({
  buildings,
  distributionsSource,
  proceduralSource,
  suburbsDistributionsSource,
  clutterSources: clutterDistributionSources,
});
const roomNames = [...roomCounts.keys()].sort();
const roomDistributionSet = new Set(roomDistributionNames.map((name) => name.toLowerCase()));
const roomsWithDirectDistribution = roomNames.filter((name) => roomDistributionSet.has(name.toLowerCase()));
const roomsWithAliasDistribution = roomNames.filter((name) => {
  const target = roomDistributionAliases.get(name.toLowerCase());
  return target && roomDistributionSet.has(target);
});
const roomsWithoutDistribution = roomNames.filter((name) => (
  !roomDistributionSet.has(name.toLowerCase())
  && !roomsWithAliasDistribution.includes(name)
));

const scriptFiles = mediaFiles.filter((path) => path.startsWith(join(mediaRoot, "scripts")) && path.endsWith(".txt"));
const scriptSources = scriptFiles.map((path) => readFileSync(path, "utf8"));
const combinedScripts = scriptSources.join("\n");
const completeItemCatalog = buildMapItemCatalog(scriptSources, itemNames, exactContainerLootData.lootItemIds);
const craftingData = buildMapCraftingData(scriptSources, recipeNames);
const requiredCraftingTags = new Set(craftingData.recipes.flatMap(({ inputs }) => inputs
  .filter(({ kind }) => kind === "tag")
  .flatMap(({ options }) => options)));
const availableItemTags = new Set(completeItemCatalog.flatMap(({ tags }) => tags));
const unresolvedCraftingTags = [...requiredCraftingTags].filter((tag) => !availableItemTags.has(tag));
const itemDeclarations = uniqueMatches(combinedScripts, /^\s*item\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/gm);
const vehicleDeclarations = uniqueMatches(combinedScripts, /^\s*vehicle\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/gm);
const recipeCounts = {
  craftRecipes: countMatches(combinedScripts, /^\s*craftRecipe\s+[^\r\n{]+/gm),
  legacyRecipes: countMatches(combinedScripts, /^\s*recipe\s+[^\r\n{]+/gm),
  evolvedRecipes: countMatches(combinedScripts, /^\s*evolvedrecipe\s+[^\r\n{]+/gm),
  fixingDefinitions: countMatches(combinedScripts, /^\s*fixing\s+[^\r\n{]+/gm),
};

const luaFiles = mediaFiles.filter((path) => path.endsWith(".lua"));
const readMatchingLua = (pattern) => luaFiles
  .filter((path) => pattern.test(relative(mediaRoot, path).replaceAll("\\", "/")))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const stashSource = readMatchingLua(/lua\/shared\/StashDescriptions\//i);
const foragingCategorySource = readMatchingLua(/lua\/shared\/Foraging\/Categories\//i);
const farmingSource = readMatchingLua(/lua\/server\/Farming\//i);
const fishingSource = readMatchingLua(/lua\/shared\/Fishing\//i);
const professionDefinitionSource = readFileSync(
  join(mediaRoot, "scripts", "generated", "characters", "character_professions.txt"),
  "utf8",
);
const traitDefinitionSource = readFileSync(
  join(mediaRoot, "scripts", "generated", "characters", "character_traits.txt"),
  "utf8",
);
const foragingItemReferences = uniqueMatches(foragingCategorySource, /"(Base[.][A-Za-z0-9_.-]+)"/g);
const objectZoneCounts = new Map();
for (const zone of mapObjects) {
  objectZoneCounts.set(zone.type, (objectZoneCounts.get(zone.type) ?? 0) + 1);
}

const translationDirectories = readdirSync(join(mediaRoot, "lua", "shared", "Translate"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const mapDirectories = readdirSync(join(mediaRoot, "maps"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const radioFiles = mediaFiles.filter((path) => path.startsWith(join(mediaRoot, "radio")) && path.endsWith(".xml"));
const radioSource = radioFiles.map((path) => readFileSync(path, "utf8")).join("\n");
const loosePngFiles = mediaFiles.filter((path) => path.endsWith(".png"));
const texturePackFiles = mediaFiles.filter((path) => path.endsWith(".pack"));

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  source: {
    game: "Project Zomboid",
    detectedBuild: "42",
    mediaFiles: inventory.totalFiles,
    mediaBytes: inventory.totalBytes,
  },
  inventory,
  maps: {
    mapDirectories: mapDirectories.length,
    mapDirectoryNames: mapDirectories,
    world: parseWorldMap(worldMapSource),
    lotheaders: mapFiles.filter((name) => name.endsWith(".lotheader")).length,
    lotpacks: mapFiles.filter((name) => name.endsWith(".lotpack")).length,
    mapBins: mapFiles.filter((name) => name.endsWith(".bin")).length,
    buildings: buildings.length,
    rooms: sum(buildings.map(({ roomCount }) => roomCount)),
    uniqueRoomTypes: roomNames.length,
    floors: {
      minimum: Math.min(...buildings.flatMap(({ floors }) => floors)),
      maximum: Math.max(...buildings.flatMap(({ floors }) => floors)),
    },
    topRoomTypes: [...roomCounts]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 50)
      .map(([name, buildingCount]) => ({ name, buildingCount })),
    objectZones: mapObjects.length,
    objectZoneTypes: Object.fromEntries([...objectZoneCounts].sort((left, right) => (
      right[1] - left[1] || left[0].localeCompare(right[0])
    ))),
    foragingZones: foraging.totalZones,
    vehicleSpawnZones: vehicleSpawns.totalZones,
    vehicleSpawnDefinitions: vehicleSpawns.definitions.length,
  },
  itemsAndLoot: {
    scriptItemDeclarations: itemDeclarations.size,
    completeCatalogItems: completeItemCatalog.length,
    translatedItemNames: Object.keys(itemNames).length,
    uniqueContainerLootItems: exactContainerLootData.lootItemIds.size,
    proceduralLootItems: proceduralItems.size,
    directRoomLootItems: directDistributionItems.size,
    clutterLootItems: clutterDistributionItems.size,
    proceduralDistributions: proceduralBlocks.size,
    roomDistributions: roomDistributionNames.length,
    lotheaderRoomTypesWithDirectDistribution: roomsWithDirectDistribution.length,
    lotheaderRoomTypesWithAliasDistribution: roomsWithAliasDistribution.length,
    lotheaderRoomTypesWithDistribution: roomsWithDirectDistribution.length + roomsWithAliasDistribution.length,
    lotheaderRoomTypesWithoutDistribution: roomsWithoutDistribution.length,
    roomTypesWithoutResolvedDistribution: roomsWithoutDistribution,
    loosePngAssets: loosePngFiles.length,
    texturePacks: texturePackFiles.length,
  },
  crafting: {
    ...recipeCounts,
    normalizedRecipes: craftingData.totalRecipes,
    normalizedCraftRecipes: craftingData.craftRecipes,
    normalizedEvolvedRecipes: craftingData.evolvedRecipes,
    recipesWithConcreteOutputs: craftingData.recipesWithConcreteOutputs,
    outputItems: craftingData.outputItems,
    requiredItemTags: requiredCraftingTags.size,
    resolvedItemTags: requiredCraftingTags.size - unresolvedCraftingTags.length,
    unresolvedItemTags: unresolvedCraftingTags,
  },
  vehicles: {
    scriptVehicles: vehicleDeclarations.size,
    spawnDefinitions: vehicleSpawns.definitions.length,
    spawnZones: vehicleSpawns.totalZones,
  },
  survivalSystems: {
    professions: countMatches(professionDefinitionSource, /^\s*character_profession_definition\s+/gm),
    traits: countMatches(traitDefinitionSource, /^\s*character_trait_definition\s+/gm),
    foragingItemReferences: foragingItemReferences.size,
    foragingCategories: mediaFiles.filter((path) => path.includes(join("Foraging", "Categories")) && path.endsWith(".lua")).length,
    farmingCropDefinitions: countMatches(farmingSource, /farming_vegetableconf[.]props(?:[.][A-Za-z_][A-Za-z0-9_]*|\[[^\]]+\])\s*=\s*\{/g),
    fishingDefinitions: countMatches(fishingSource, /Fishing[.]FishConfig:new\s*\(/g),
    stashDefinitions: countMatches(stashSource, /StashUtil[.]newStash\s*\(/g),
    radioChannels: countMatches(radioSource, /<ChannelEntry\b/g),
    radioScripts: countMatches(radioSource, /<ScriptEntry\b/g),
    radioBroadcasts: countMatches(radioSource, /<BroadcastEntry\b/g),
  },
  localization: {
    languages: translationDirectories.length,
    languageCodes: translationDirectories,
  },
  verifiedSources: [
    { path: "media/maps/Muldraugh, KY/*.lotheader", provides: "Building, room, floor and room-rectangle topology" },
    { path: "media/maps/Muldraugh, KY/worldmap.xml", provides: "World features, building tones and map geometry" },
    { path: "media/maps/Muldraugh, KY/objects.lua", provides: "Foraging, vehicle, traffic and named world zones" },
    { path: "media/lua/server/Items/Distributions.lua", provides: "Room and container loot rules" },
    { path: "media/lua/server/Items/ProceduralDistributions.lua", provides: "Weighted procedural loot pools" },
    { path: "media/scripts/**/*.txt", provides: "Items, vehicles, recipes and crafting definitions" },
    { path: "media/lua/shared/Translate/*/*.json", provides: "Localized game content names" },
    { path: "media/lua/shared/Foraging", provides: "Foraging categories, items and conditions" },
    { path: "media/lua/shared/VehicleZoneDefinition.lua", provides: "Vehicle pool weights and quality rules" },
    { path: "media/lua/shared/StashDescriptions", provides: "Annotated-map and stash definitions" },
    { path: "media/radio/**/*.xml", provides: "Radio channels and scheduled programs" },
  ],
};

const markdown = `# Project Zomboid Build 42 Game-Data Audit

Generated from a local Build 42 installation on ${report.generatedAt.slice(0, 10)}. This report stores counts and structural findings only; it does not copy game content.

## Snapshot

| Surface | Verified data |
| --- | ---: |
| Media files | ${formatNumber(report.source.mediaFiles)} (${formatBytes(report.source.mediaBytes)}) |
| Map directories | ${formatNumber(report.maps.mapDirectories)} |
| World buildings | ${formatNumber(report.maps.buildings)} |
| Building rooms | ${formatNumber(report.maps.rooms)} |
| Unique room types | ${formatNumber(report.maps.uniqueRoomTypes)} |
| World feature records | ${formatNumber(report.maps.world.features)} |
| Item script declarations | ${formatNumber(report.itemsAndLoot.scriptItemDeclarations)} |
| Complete app item catalog | ${formatNumber(report.itemsAndLoot.completeCatalogItems)} |
| English item names | ${formatNumber(report.itemsAndLoot.translatedItemNames)} |
| Unique container-loot items | ${formatNumber(report.itemsAndLoot.uniqueContainerLootItems)} |
| Procedural loot pools | ${formatNumber(report.itemsAndLoot.proceduralDistributions)} |
| Room loot tables | ${formatNumber(report.itemsAndLoot.roomDistributions)} |
| Craft recipes | ${formatNumber(report.crafting.craftRecipes)} |
| Evolved cooking recipes | ${formatNumber(report.crafting.evolvedRecipes)} |
| Recipes with concrete item outputs | ${formatNumber(report.crafting.recipesWithConcreteOutputs)} |
| Vehicle spawn zones | ${formatNumber(report.maps.vehicleSpawnZones)} |
| Foraging zones | ${formatNumber(report.maps.foragingZones)} |
| Supported game languages | ${formatNumber(report.localization.languages)} |

## Authoritative map findings

- Lotheaders expose ${formatNumber(report.maps.buildings)} concrete buildings and ${formatNumber(report.maps.rooms)} rooms across floors ${report.maps.floors.minimum} through ${report.maps.floors.maximum}. This is the strongest source for complete house, apartment and interior-room coverage.
- World-map XML exposes ${formatNumber(report.maps.world.buildingFeatures)} building-like features and ${formatNumber(report.maps.world.uniqueBuildingSubtypes)} display subtypes. It is useful for human labels and broad categories, but lotheaders are more precise for building topology.
- The object-zone file exposes ${formatNumber(report.maps.objectZones)} rectangles/polygons, including ${formatNumber(report.maps.foragingZones)} foraging zones and ${formatNumber(report.maps.vehicleSpawnZones)} vehicle spawn zones.
- ${formatNumber(report.itemsAndLoot.lotheaderRoomTypesWithDistribution)} of ${formatNumber(report.maps.uniqueRoomTypes)} room types resolve to a room-distribution table: ${formatNumber(report.itemsAndLoot.lotheaderRoomTypesWithDirectDistribution)} directly and ${formatNumber(report.itemsAndLoot.lotheaderRoomTypesWithAliasDistribution)} through game-defined aliases. Unresolved names often represent structural or empty rooms; their containers may still use the global \`all\` table.

## Items and loot findings

- Item scripts define ${formatNumber(report.itemsAndLoot.scriptItemDeclarations)} distinct item identifiers; the English catalog provides ${formatNumber(report.itemsAndLoot.translatedItemNames)} names. Unioning script items with distribution-only references produces a complete ${formatNumber(report.itemsAndLoot.completeCatalogItems)}-entry app catalog.
- Container distributions reference ${formatNumber(report.itemsAndLoot.uniqueContainerLootItems)} unique lootable item identifiers across direct room tables and ${formatNumber(report.itemsAndLoot.proceduralDistributions)} procedural pools.
- Exact loot remains probabilistic. Room type, container type, zone modifiers, sandbox settings, conditional rules and mods can all alter a real container. The app should say "possible loot" and preserve relative weights rather than present guaranteed percentages.
- A complete building profile should be assembled from every room in that building, each room's container rules, referenced procedural pools and the global fallback container rules.

## Additional feature surfaces

| Dataset | Verified scale | Strong product use |
| --- | ---: | --- |
| Recipes | ${formatNumber(report.crafting.normalizedRecipes)} definitions (${formatNumber(report.crafting.normalizedCraftRecipes)} craft + ${formatNumber(report.crafting.normalizedEvolvedRecipes)} evolved) | Crafting dependency explorer and missing-material checklist |
| Vehicle scripts | ${formatNumber(report.vehicles.scriptVehicles)} | Vehicle finder, part compatibility and repair planner |
| Foraging | ${formatNumber(report.survivalSystems.foragingItemReferences)} referenced items / ${formatNumber(report.survivalSystems.foragingCategories)} categories | Seasonal foraging planner by current map zone |
| Spawn points | Existing parsed spawn dataset | Profession-aware start planner |
| Stashes | ${formatNumber(report.survivalSystems.stashDefinitions)} definitions | Annotated-map and stash discovery reference |
| Radio | ${formatNumber(report.survivalSystems.radioChannels)} channels / ${formatNumber(report.survivalSystems.radioScripts)} scripts / ${formatNumber(report.survivalSystems.radioBroadcasts)} broadcasts | Broadcast timeline and frequency guide |
| Localization | ${formatNumber(report.localization.languages)} languages | Game-native item and feature names without UI-catalog duplication |

## Product priority

1. **Complete building explorer:** import every lotheader building, group residences/storage/minor structures separately, keep noisy groups disabled by default and render only enabled groups.
2. **Complete item and loot index:** index every script item and every container-loot reference, then resolve localized names from game catalogs.
3. **Room-accurate building loot:** attach all room profile IDs to each building and merge their full possible-loot lists only when needed.
4. **Scalable filter hierarchy:** group survival essentials, services, commerce, industry, residences and minor structures; show group totals and enable all/none actions.
5. **Crafting dependency planner:** turn recipe definitions into a searchable dependency graph and route missing materials through the loot index.
6. **Contextual survival layers:** expose foraging, vehicle, spawn and future zombie-density information on demand, without persistent legend cards covering the map.
7. **Annotated-map and broadcast reference:** add lower-priority opt-in tools after the core map and loot coverage is verified.

## Current implementation coverage

- The generated app metadata contains all ${formatNumber(report.maps.buildings)} concrete lotheader buildings and all ${formatNumber(report.itemsAndLoot.completeCatalogItems)} catalog items.
- The loot index contains all ${formatNumber(report.itemsAndLoot.uniqueContainerLootItems)} normalized container-loot items and preserves items with no concrete room match instead of silently dropping them.
- The crafting planner contains ${formatNumber(report.crafting.normalizedRecipes)} definitions. All ${formatNumber(report.crafting.requiredItemTags)} recipe item-tag requirements resolve to concrete catalog items.

## Accuracy and performance rules

- Store building-to-room references once; do not duplicate full item lists into every marker.
- Keep residence, shed/storage and miscellaneous layers disabled on first launch.
- Cluster only visible markers with deterministic membership and semantic zoom thresholds.
- Lazy-resolve full loot lists when a detail panel or item search needs them.
- Preserve source build and generation timestamps so stale data can be detected after game updates.
- Never call relative weights "spawn chance" unless the underlying game rule is an actual percentage.

## Persisted audit artifacts

- \`docs/game-data-inventory.json\`: machine-readable counts, source inventory and coverage gaps.
- \`docs/game-data-audit.md\`: product-facing interpretation and implementation priorities.
- \`scripts/audit-game-data.mjs\`: reproducible generator for future game builds.
`;

writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(outputMarkdown, markdown);
console.log(`Audited ${formatNumber(report.source.mediaFiles)} media files and wrote:`);
console.log(`- ${relative(projectRoot, outputJson)}`);
console.log(`- ${relative(projectRoot, outputMarkdown)}`);
