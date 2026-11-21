import { access, readFile, readdir } from "node:fs/promises";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const directoryIndex = args.indexOf("--data-directory");
const publishedV4 = fileURLToPath(new URL('../artifacts/peak-data-v4', import.meta.url));
const defaultDataDirectory = await access(join(publishedV4, 'catalog.json')).then(() => publishedV4,
  () => fileURLToPath(new URL('../artifacts/peak-data', import.meta.url)));
const dataDirectory = resolve(directoryIndex >= 0 ? args[directoryIndex + 1] : defaultDataDirectory);
const catalogPath = join(dataDirectory, "catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

const fail = (message) => {
  throw new Error(`PEAK data validation failed: ${message}`);
};

if (![3, 4].includes(catalog.schemaVersion)) fail("unexpected schema version");
const bounded = catalog.schemaVersion === 4;
if (catalog.source?.steamAppId !== 3527290) fail("wrong Steam app ID");
if (catalog.source?.overwolfGameId !== 26092) fail("wrong Overwolf game ID");
if (!Array.isArray(catalog.levels) || catalog.levels.length === 0) {
  fail("missing daily levels");
}
if (!bounded && catalog.rotation?.levelCount !== catalog.levels.length) {
  fail("rotation level count does not match the level list");
}
if (bounded) {
  const order = catalog.rotationEvidence?.sceneOrder;
  const window = catalog.dailyWindow?.levelIndices;
  if (!Number.isInteger(catalog.rotation?.levelCount) || catalog.rotation.levelCount < 7
      || !Array.isArray(order) || order.length !== catalog.rotation.levelCount
      || order.some((scene, index) => scene !== `Level_${index}`)
      || !Number.isInteger(catalog.rotationEvidence?.serverIndex)
      || !Array.isArray(window) || window.length !== 7 || catalog.levels.length !== 7
      || catalog.specialLevels?.length !== 7
      || window[0] !== catalog.rotationEvidence.serverIndex % catalog.rotation.levelCount
      || catalog.levels.some((level, offset) => level.index !== window[offset])) {
    fail("invalid bounded rotation evidence or seven-day coverage");
  }
}
const finalLevels = (catalog.specialLevels ?? []).filter((level) => level.kind === "final");
const finalIndices = catalog.finalWindow?.levelIndices;
if (catalog.dailyWindow && (catalog.dailyWindow.days !== 7
    || JSON.stringify(catalog.dailyWindow.levelIndices) !== JSON.stringify(finalIndices))) {
  fail("daily and final publication windows must match");
}
if (!Array.isArray(finalIndices) || finalIndices.length !== Math.min(7, catalog.levels.length)
    || catalog.finalWindow.days !== finalIndices.length
    || finalLevels.length !== finalIndices.length
    || finalIndices.some((index, offset) => !Number.isInteger(index)
      || index !== (finalIndices[0] + offset) % catalog.rotation.levelCount)
    || new Set(finalLevels.map((level) => level.scene)).size !== finalLevels.length
    || !finalIndices.every((index) => finalLevels.some((level) =>
      level.scene === `Level_${index}` && level.captureRootComponent === "Peak.VoidBiome"
      && level.biomes?.length === 1 && level.biomes[0] === "Void"))) {
  fail("missing verified seven-day final island window; keep the previous complete CDN release");
}

const expectedMarkerIcons = ["luggage", "campfire", "scout", "nest"];
for (const category of expectedMarkerIcons) {
  const iconPath = catalog.markerIcons?.[category];
  if (!iconPath) fail(`missing marker icon for ${category}`);
  if (!iconPath.endsWith(`/icons/${category}.png`)) {
    fail(`invalid marker icon for ${category}`);
  }
  await access(join(dataDirectory, "icons", `${category}.png`));
}

const markerIds = new Set();
const itemIds = new Set();
const itemDisplayIds = new Set();
const itemsWithoutUiIcons = new Set(catalog.itemIconCoverage?.withoutSprites ?? []);
if (!Number.isInteger(catalog.itemIconCoverage?.withSprites)
    || !Array.isArray(catalog.itemIconCoverage?.withoutSprites)
    || itemsWithoutUiIcons.size !== catalog.itemIconCoverage.withoutSprites.length
    || [...itemsWithoutUiIcons].some((displayId) => !Number.isInteger(displayId))) {
  fail("missing or invalid item icon coverage metadata");
}
const achievementIds = new Set((catalog.achievements ?? []).map((achievement) => achievement.id));
const guidebookIds = new Set((catalog.guidebook ?? []).map((page) => page.id));
const markerCategories = new Set([
  "luggage", "campfire", "scout", "nest", "forage", "guidebook", "respawn", "portal",
  "belltower", "creature", "environment", "trap", "bridge", "rope", "vine", "secret",
]);
const mapRevisionSuffix = (level) => {
  if (level.mapRevision === undefined) return "";
  if (typeof level.mapRevision !== "string" || level.mapRevision.length > 64
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(level.mapRevision)) {
    fail(`invalid map revision for ${level.scene}`);
  }
  return `-${level.mapRevision}`;
};
const validBiomeSlots = [
  new Set(["Shore"]),
  new Set(["Tropics", "Roots"]),
  new Set(["Alpine", "Mesa"]),
  new Set(["Caldera", "Gloom"]),
  new Set(["The Kiln", "The Citadel"]),
];
if (!Array.isArray(catalog.items) || catalog.items.length === 0) fail("missing item catalog");
for (const item of catalog.items) {
  if (!Number.isInteger(item.id) || itemIds.has(item.id)) fail(`invalid item ID ${item.id}`);
  itemIds.add(item.id);
  if (!Number.isInteger(item.displayId) || itemDisplayIds.has(item.displayId)) {
    fail(`invalid item display ID ${item.displayId}`);
  }
  itemDisplayIds.add(item.displayId);
  if (!item.name || !Array.isArray(item.tags)) fail(`invalid item ${item.id}`);
  if (!Array.isArray(item.effects) || typeof item.cookable !== "boolean") {
    fail(`missing gameplay metadata for item ${item.id}`);
  }
  const expectedIcon = `./data/peak/items/${item.displayId}.png`;
  if (itemsWithoutUiIcons.has(item.displayId)) {
    if (item.icon !== null) fail(`unexpected generated icon for item display ID ${item.displayId}`);
  } else {
    const digest = item.icon?.match(new RegExp(`^\\./data/peak/items/${item.displayId}-([a-f0-9]{64})\\.png$`))?.[1];
    if (item.icon !== expectedIcon && !digest) fail(`missing or invalid icon for item display ID ${item.displayId}`);
    const iconPath = join(dataDirectory, "items", `${item.displayId}${digest ? `-${digest}` : ""}.png`);
    await access(iconPath);
    if (digest && createHash("sha256").update(await readFile(iconPath)).digest("hex") !== digest) {
      fail(`item icon content hash mismatch for ${item.displayId}`);
    }
  }
}
if (catalog.itemIconCoverage.withSprites !== catalog.items.length - itemsWithoutUiIcons.size) {
  fail("item icon coverage count does not match the item catalog");
}

const lootPoolIds = new Set();
if (!Array.isArray(catalog.lootPools) || catalog.lootPools.length === 0) fail("missing loot pools");
for (const pool of catalog.lootPools) {
  if (!pool.id || lootPoolIds.has(pool.id)) fail(`invalid loot pool ${pool.id}`);
  lootPoolIds.add(pool.id);
  if (!Array.isArray(pool.items) || pool.items.length === 0) fail(`empty loot pool ${pool.id}`);
  for (const entry of pool.items) {
    if (!itemIds.has(entry.itemId)) fail(`unknown item ${entry.itemId} in ${pool.id}`);
    if (!Number.isFinite(entry.chance) || entry.chance <= 0 || entry.chance > 100) {
      fail(`invalid chance in ${pool.id}`);
    }
  }
}

let markerTotal = 0;
const allLevels = [
  ...catalog.levels.map((level, offset) => ({ level, index: bounded ? level.index : offset,
    slug: `level-${bounded ? level.index : offset}`, special: false })),
  ...(catalog.specialLevels ?? []).map((level) => ({
    level,
    index: null,
    slug: level.mapImage?.split("/").at(-1)
      ?.replace(`-${level.mapBuildId ?? catalog.source.buildId}${mapRevisionSuffix(level)}.webp`, "") ?? "special",
    special: true,
  })),
];
for (const { level, index, slug, special } of allLevels) {
  if (bounded) {
    const sceneIndex = Number(level.scene?.match(/^Level_(\d+)$/u)?.[1]);
    const range = level.assetBundle?.match(/^PEAK_Data\/StreamingAssets\/maps\/levels(\d+)-(\d+)\.assetbundle$/u);
    if (!range || sceneIndex < Number(range[1]) || sceneIndex > Number(range[2])
        || level.assetFile !== `BuildPlayer-Level_${sceneIndex}`) fail(`invalid scene bundle binding for ${level.scene}`);
  }
  const assetSlug = `${slug}-${level.mapBuildId ?? catalog.source.buildId}${mapRevisionSuffix(level)}`;
  if (special || !catalog.dailyWindow || catalog.dailyWindow.levelIndices.includes(index)) {
    if ((level.mapBuildId ?? catalog.source.buildId) !== catalog.source.buildId) fail(`stale map in active window: ${level.scene}`);
  }
  if (!special) {
    if (level.index !== index || level.scene !== `Level_${index}`) {
      fail(`invalid level ordering at index ${index}`);
    }
    if (level.assetFile !== (bounded ? `BuildPlayer-Level_${index}` : `level${index + 5}`)) fail(`wrong source asset for ${level.scene}`);
    if (!Array.isArray(level.biomes) || level.biomes.length !== validBiomeSlots.length
        || level.biomes.some((biome, slot) => !validBiomeSlots[slot].has(biome))) {
      fail(`invalid biome route for ${level.scene}`);
    }
    const expectedFinalBiome = level.biomes[3] === "Caldera" ? "The Kiln" : "The Citadel";
    if (level.biomes[4] !== expectedFinalBiome || level.title !== level.biomes.join(" · ")) {
      fail(`invalid official biome names or final pairing for ${level.scene}`);
    }
    if (!Number.isInteger(level.seed)) fail(`missing seed for ${level.scene}`);
  }
  if (level.mapImage !== `./data/peak/maps/${assetSlug}.webp`) {
    fail(`invalid map image for ${level.scene}`);
  }
  await access(join(dataDirectory, "maps", `${assetSlug}.webp`));
  if (bounded) {
    const tileDirectory = join(dataDirectory, 'maps', 'tiles', assetSlug);
    const expectedTiles = Array.from({ length: 16 }, (_, index) => `${index % 4}-${Math.floor(index / 4)}.webp`).sort();
    if (JSON.stringify((await readdir(tileDirectory)).sort()) !== JSON.stringify(expectedTiles)) {
      fail(`incomplete 4x4 tile grid for ${level.scene}`);
    }
    for (const path of [join(dataDirectory, 'maps', `${assetSlug}.webp`), ...expectedTiles.map(name => join(tileDirectory, name))]) {
      const metadata = await sharp(path).metadata();
      if (metadata.format !== 'webp' || metadata.width !== 4096 || metadata.height !== 4096) {
        fail(`invalid overview or tile dimensions for ${level.scene}`);
      }
    }
  }
  const projectionValues = Object.values(level.projection ?? {});
  if (projectionValues.length !== 8 || projectionValues.some((value) => !Number.isFinite(value))) {
    fail(`invalid map projection for ${level.scene}`);
  }
  const projection = level.projection;
  if (projection.worldXMax <= projection.worldXMin || projection.worldZMax <= projection.worldZMin
      || projection.mapXMax <= projection.mapXMin || projection.mapYMax <= projection.mapYMin) {
    fail(`degenerate map projection for ${level.scene}`);
  }

  const counts = {};
  for (const marker of level.markers) {
    markerTotal += 1;
    if (markerIds.has(marker.id)) fail(`duplicate marker ID ${marker.id}`);
    markerIds.add(marker.id);
    if (!marker.id.startsWith(`${slug}-${marker.category}-`)) {
      fail(`marker ${marker.id} is assigned to the wrong map`);
    }
    if (!markerCategories.has(marker.category)) fail(`unknown marker category ${marker.category}`);
    counts[marker.category] = (counts[marker.category] ?? 0) + 1;
    if (!Number.isFinite(marker.map.x) || !Number.isFinite(marker.map.y)
        || marker.map.x < 0 || marker.map.x > 100 || marker.map.y < 0 || marker.map.y > 100) {
      fail(`out-of-bounds projected marker ${marker.id}`);
    }
    if (!Number.isFinite(marker.world.x) || !Number.isFinite(marker.world.z)) {
      fail(`invalid world position for ${marker.id}`);
    }
    const p = level.projection;
    const projectedX = p.mapXMin + (marker.world.x - p.worldXMin) / (p.worldXMax - p.worldXMin) * (p.mapXMax - p.mapXMin);
    const projectedY = p.mapYMin + (p.worldZMax - marker.world.z) / (p.worldZMax - p.worldZMin) * (p.mapYMax - p.mapYMin);
    if (Math.abs(projectedX - marker.map.x) > 0.02 || Math.abs(projectedY - marker.map.y) > 0.02) {
      fail(`world/map projection mismatch for ${marker.id}`);
    }
    if (!marker.content?.name || !marker.content?.variant) {
      fail(`missing marker content for ${marker.id}`);
    }
    if (marker.source?.sceneAsset !== level.assetFile) {
      fail(`source/map mismatch for ${marker.id}`);
    }
    if (!["exact", "exact-zone", "spawn-point"].includes(marker.source?.kind)) {
      fail(`invalid location confidence for ${marker.id}`);
    }
    if (!Number.isInteger(marker.source?.pathId) || !marker.source?.component) {
      fail(`missing game-file provenance for ${marker.id}`);
    }
    if (special) {
      if (marker.biomeSlot !== null && marker.biomeSlot !== undefined) {
        fail(`unexpected biome association for ${marker.id}`);
      }
    }
    else if (!Number.isInteger(marker.biomeSlot) || marker.biomeSlot < 1 || marker.biomeSlot > level.biomes.length) {
      fail(`invalid biome association for ${marker.id}`);
    }
    if (marker.content.lootPoolId && !lootPoolIds.has(marker.content.lootPoolId)) {
      fail(`unknown loot pool for ${marker.id}`);
    }
    if (marker.content.variant === "luggage" && !marker.content.lootPoolId) {
      fail(`missing luggage pool for ${marker.id}`);
    }
    for (const item of marker.content.items ?? []) {
      if (!itemIds.has(item.itemId)) fail(`unknown marker item ${item.itemId} for ${marker.id}`);
    }
    const relatedAchievementIds = marker.content.relatedAchievementIds ?? [];
    if (new Set(relatedAchievementIds).size !== relatedAchievementIds.length) {
      fail(`duplicate achievement links for ${marker.id}`);
    }
    for (const achievementId of relatedAchievementIds) {
      if (!achievementIds.has(achievementId)) {
        fail(`unknown achievement ${achievementId} for ${marker.id}`);
      }
    }
    const hasJester = relatedAchievementIds.includes("Badge_57_Jester");
    if (hasJester !== (marker.content.lootPoolId === "1073741824")) {
      fail(`incorrect Jester association for ${marker.id}`);
    }
    if (marker.content.guidebookPageId && !guidebookIds.has(marker.content.guidebookPageId)) {
      fail(`unknown guidebook page for ${marker.id}`);
    }
  }

  for (const [category, count] of Object.entries(level.markerCounts)) {
    if (counts[category] !== count) {
      fail(`marker count mismatch for ${level.scene}/${category}`);
    }
  }
  if (Object.keys(counts).some((category) => level.markerCounts[category] !== counts[category])) {
    fail(`incomplete marker counts for ${level.scene}`);
  }
}

const anchor = Date.parse(catalog.rotation.anchorUtc);
const duration = catalog.rotation.durationHours * 60 * 60 * 1_000;
const rotationIndex = Math.floor((Date.now() - anchor) / duration);
const currentIndex = ((rotationIndex % catalog.rotation.levelCount) + catalog.rotation.levelCount)
  % catalog.rotation.levelCount;
const currentLevel = catalog.levels.find(level => level.index === currentIndex);

console.log(
  `Validated ${catalog.levels.length} daily levels, `
  + `${(catalog.specialLevels ?? []).length} special levels, and ${markerTotal} markers. `
  + (currentLevel ? `Current rotation: ${currentLevel.scene} (${currentLevel.title}), seed ${currentLevel.seed}.`
    : "Current rotation is outside this captured window; run --check-window before publication."),
);
