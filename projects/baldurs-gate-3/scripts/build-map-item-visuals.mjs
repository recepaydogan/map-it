import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

/**
 * Map markers for items show the item's own inventory icon and its real object
 * group instead of a generic category glyph. The full item database is 18 MB,
 * far too large to load just to draw markers, so this step distils the handful
 * of fields the map needs into one small lookup keyed by content id.
 */

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const mapsDirectory = path.join(projectRoot, "public", "maps");
const itemDatabasePath = path.join(projectRoot, "public", "data", "item-database.json");
const mapRegistryPath = path.join(projectRoot, "src", "features", "map", "map-registry.ts");
const outputPath = path.join(mapsDirectory, "item-visuals.json");

/** Marker categories that stand for a single carryable item. */
const ITEM_CATEGORIES = new Set(["valuable-item", "key-item", "permanent-upgrade", "chest", "loot-container"]);
const isItemCategory = (category) => ITEM_CATEGORIES.has(category) || category.startsWith("item-");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const normalizeIdentity = (value) => value.trim().toLocaleLowerCase("en-US");

const addToIndex = (index, key, item) => {
  if (typeof key !== "string" || !key.trim()) return;
  const normalized = normalizeIdentity(key);
  const matches = index.get(normalized) ?? [];
  matches.push(item);
  index.set(normalized, matches);
};

/** Mirrors resolveItemDatabaseEntry in src/features/items/item-database-match.ts. */
const chooseBestMatch = (candidates, names) => {
  if (candidates.length <= 1) return candidates[0];
  const wanted = names.filter(Boolean).map(normalizeIdentity);
  const exact = candidates.find((item) => wanted.includes(normalizeIdentity(item.name))
    || Object.values(item.localizedNames ?? {}).some((name) => wanted.includes(normalizeIdentity(name))));
  return exact ?? candidates.find((item) => item.unique) ?? candidates[0];
};

const toSprite = (icon) => (icon?.atlas !== undefined
  && icon.u1 !== undefined && icon.u2 !== undefined
  && icon.v1 !== undefined && icon.v2 !== undefined
  ? { atlas: icon.atlas, u1: icon.u1, u2: icon.u2, v1: icon.v1, v2: icon.v2 }
  : undefined);

const itemDatabase = readJson(itemDatabasePath);
const byTemplateId = new Map();
const byStatsId = new Map();
const byName = new Map();
/** Placed items can override the icon of the template they are built from. */
const spriteByIconId = new Map();
for (const item of itemDatabase.items) {
  addToIndex(byTemplateId, item.id, item);
  for (const templateId of item.templateIds ?? []) addToIndex(byTemplateId, templateId, item);
  addToIndex(byStatsId, item.statsId, item);
  addToIndex(byName, item.name, item);
  for (const localizedName of Object.values(item.localizedNames ?? {})) {
    addToIndex(byName, localizedName, item);
  }
  const sprite = toSprite(item.icon);
  if (sprite && typeof item.icon.id === "string" && !spriteByIconId.has(item.icon.id)) {
    spriteByIconId.set(item.icon.id, sprite);
  }
}

const resolveItem = (entity, locationName) => {
  const names = [entity?.title, entity?.localizedTitles?.en, locationName];
  // Stats constrain the root when available; root-only references retain their
  // defaults instead of borrowing an unrelated generated variant's identity.
  const templateMatches = entity?.templateId
    ? byTemplateId.get(normalizeIdentity(entity.templateId)) ?? []
    : [];
  if (templateMatches.length > 0) {
    const exact = templateMatches.filter((item) => entity?.statsId
      ? normalizeIdentity(item.statsId) === normalizeIdentity(entity.statsId)
      : !item.generation);
    return chooseBestMatch(exact, names);
  }
  const statsMatches = entity?.statsId ? byStatsId.get(normalizeIdentity(entity.statsId)) ?? [] : [];
  if (statsMatches.length > 0) return chooseBestMatch(statsMatches, names);
  for (const name of names) {
    if (typeof name !== "string" || !name.trim()) continue;
    const nameMatches = byName.get(normalizeIdentity(name)) ?? [];
    if (nameMatches.length > 0) return chooseBestMatch(nameMatches, names);
  }
  return undefined;
};

const registrySource = fs.readFileSync(mapRegistryPath, "utf8");
const mapIds = readRegisteredMapIds(registrySource);

const visuals = {};
const atlases = new Set();
let itemLocationCount = 0;
let unresolved = 0;

for (const mapId of mapIds) {
  const mapDirectory = path.join(mapsDirectory, mapId);
  const metadata = readJson(path.join(mapDirectory, "metadata.json"));
  const contentPayload = typeof metadata.contentSource === "string" && metadata.contentSource
    ? readJson(path.join(mapDirectory, metadata.contentSource))
    : { entities: [] };
  const contentEntities = Array.isArray(contentPayload.entities)
    ? contentPayload.entities
    : Object.values(contentPayload.entities ?? {});
  const contentById = new Map(contentEntities
    .filter((entity) => entity && typeof entity.id === "string")
    .map((entity) => [entity.id, entity]));
  const locationSources = Array.isArray(metadata.locationSources) ? metadata.locationSources : [];

  for (const source of locationSources) {
    const payload = readJson(path.join(mapDirectory, source));
    const locations = Array.isArray(payload) ? payload : payload.locations ?? [];
    for (const location of locations) {
      if (!isItemCategory(location.category)) continue;
      if (typeof location.contentId !== "string") continue;
      itemLocationCount += 1;
      if (visuals[location.contentId]) continue;
      const entity = contentById.get(location.contentId);
      const item = resolveItem(entity, location.name);
      if (!item) {
        unresolved += 1;
        continue;
      }
      const sprite = (typeof entity?.iconId === "string" ? spriteByIconId.get(entity.iconId) : undefined)
        ?? toSprite(item.icon);
      if (sprite) atlases.add(sprite.atlas);
      const subtype = typeof item.subtype === "string" ? item.subtype.trim() : "";
      // "None" is how the game data spells "no object group"; the panel then
      // falls back to the database category label.
      const group = subtype && subtype !== "None" && subtype !== item.type ? subtype : "";
      visuals[location.contentId] = {
        itemId: item.id,
        ...(sprite ? { sprite } : {}),
        ...(group ? { group } : {}),
        category: item.category,
        rarity: item.rarity,
        ...(item.unique ? { unique: true } : {}),
      };
    }
  }
}

const output = {
  schemaVersion: 1,
  sourceBuild: itemDatabase.sourceBuild,
  atlases: [...atlases].sort(),
  items: Object.fromEntries(Object.entries(visuals).sort(([left], [right]) => left.localeCompare(right, "en"))),
};

writeGeneratedFile(outputPath, `${JSON.stringify(output)}\n`);
const resolved = Object.keys(output.items).length;
console.log(`Wrote ${path.relative(projectRoot, outputPath)}: ${resolved} items `
  + `across ${itemLocationCount} item markers (${unresolved} unresolved), `
  + `${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB.`);
