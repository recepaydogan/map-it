/** Import the selected Forever All layers from a saved Wowhead world-map response. */
import { readFile, writeFile, access } from "node:fs/promises";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the saved Wowhead Forever world-map JavaScript file.");
const source = await readFile(sourcePath, "utf8");
const data = new Map();
for (const line of source.trimEnd().split("\n")) {
  const match = /^WH\.setPageData\("wow\.worldMap\.classicplus\.([^\"]+)",([\s\S]*)\);$/.exec(line);
  if (!match || data.has(match[1])) throw new Error("Invalid or duplicate world-map data section");
  data.set(match[1], JSON.parse(match[2]));
}
const config = data.get("config");
const categories = data.get("categories");
const places = data.get("places");
const nodes = data.get("nodes");
const pois = data.get("pois");
const zoneRasters = data.get("zones");
if (!config?.continents || !Array.isArray(categories) || !Array.isArray(places)
  || !Array.isArray(nodes) || !Array.isArray(pois) || !Array.isArray(zoneRasters)) {
  throw new Error("Incomplete map response");
}
const atlas = JSON.parse(await readFile("public/maps/world-atlas/metadata.json", "utf8"));
const layers = new Map(atlas.terrainLayers.map((layer) => [layer.source?.mapId, layer]));
const zones = places.filter((place) => ["zone", "capital"].includes(place.kind)
  && place.rect && place.uiMap);
const zoneByArea = new Map(zones.map((zone) => [zone.area, zone]));
const categoryByKey = new Map(categories.map((category) => [category.key, category]));
const round = (value) => Number(value.toFixed(3));

const project = (canvasX, canvasY) => {
  if (![canvasX, canvasY].every(Number.isFinite)) throw new Error("Invalid source coordinate");
  const continent = config.continents.find((entry) => canvasX >= entry.canvasX
    && canvasX < entry.canvasX + entry.width && canvasY >= entry.canvasY
    && canvasY < entry.canvasY + entry.height);
  const layer = layers.get(continent?.map);
  if (!continent || !layer) throw new Error(`No atlas layer for ${canvasX}, ${canvasY}`);
  const x = layer.source.placement === "overview-inset"
    ? layer.originX + (canvasX - continent.canvasX
      + (continent.originCol - layer.source.grid.minX) * continent.pxPerChunk) * layer.scaleX
    : layer.originX + (canvasX - continent.canvasX) * layer.scaleX;
  const y = layer.source.placement === "overview-inset"
    ? layer.originY + (canvasY - continent.canvasY
      + (continent.originRow - layer.source.grid.minY) * continent.pxPerChunk) * layer.scaleY
    : layer.originY + (canvasY - continent.canvasY) * layer.scaleY;
  if (x < atlas.bounds.minX || x > atlas.bounds.maxX
    || y < atlas.bounds.minY || y > atlas.bounds.maxY) {
    throw new Error(`Source point outside atlas: ${canvasX}, ${canvasY}`);
  }
  const raster = zoneRasters.find((entry) => entry.map === continent.map);
  const row = Math.floor((canvasY - raster.y) / raster.cell);
  const column = Math.floor((canvasX - raster.x) / raster.cell);
  const spans = raster.rows.find((entry) => entry[0] === row);
  let area;
  for (let index = 1; spans && index < spans.length - 1; index += 2) {
    if (column >= spans[index] && column < spans[index + 2]) {
      area = spans[index + 1];
      break;
    }
  }
  const fallback = zones.filter((entry) => canvasX >= entry.rect[0][0]
    && canvasX <= entry.rect[1][0] && canvasY >= entry.rect[0][1]
    && canvasY <= entry.rect[1][1])
    .sort((left, right) => (left.rect[1][0] - left.rect[0][0])
      * (left.rect[1][1] - left.rect[0][1])
      - (right.rect[1][0] - right.rect[0][0])
      * (right.rect[1][1] - right.rect[0][1]))[0];
  const mapped = zoneByArea.get(area);
  const mappedContainsPoint = mapped && canvasX >= mapped.rect[0][0]
    && canvasX <= mapped.rect[1][0] && canvasY >= mapped.rect[0][1]
    && canvasY <= mapped.rect[1][1];
  const zone = mappedContainsPoint ? mapped : fallback;
  if (!zone) throw new Error(`No source zone for ${canvasX}, ${canvasY}`);
  return { x: round(x), y: round(y), regionId: "", region: zone.name,
    referenceCoordinates: {
      x: round((canvasX - zone.rect[0][0]) / (zone.rect[1][0] - zone.rect[0][0]) * 100),
      y: round((canvasY - zone.rect[0][1]) / (zone.rect[1][1] - zone.rect[0][1]) * 100),
    } };
};
const iconPath = async (icon) => {
  const path = `data/items/site-icons/${icon}.jpg`;
  await access(`public/${path}`);
  return path;
};
const metadata = { atlasBuild: atlas.source.build, positionStatus: "reference-world-map",
  content: "forever-all", capturedAt: "2026-10-15" };
const output = async (name, locations) => {
  await writeFile(`public/maps/world-atlas/locations-forever-all-${name}.json`,
    `${JSON.stringify({ version: 1, projection: metadata, locations })}\n`);
};

if (process.argv[3] === "--new-layers-only") {
  const newGroups = ["fishing", "cloth", "leather"];
  const newCategories = categories.filter((category) => newGroups.includes(category.group));
  if (newCategories.length !== 38) throw new Error(`Expected 38 new gathering categories, got ${newCategories.length}`);
  const gatheringLocations = [];
  for (const category of newCategories) {
    if (!Number.isInteger(category.item) || !category.image) {
      throw new Error(`Incomplete new gathering category ${category.key}`);
    }
    const node = nodes.find((entry) => entry.category === category.key);
    if (!node?.points?.length) throw new Error(`Missing points for ${category.key}`);
    const image = await iconPath(category.image);
    node.points.forEach(([canvasX, canvasY, , creatures], index) => {
      if (creatures !== undefined && (!Array.isArray(creatures)
        || creatures.some((entry) => !Number.isInteger(entry[0]) || typeof entry[1] !== "string"))) {
        throw new Error(`Invalid creature list for ${category.key}`);
      }
      gatheringLocations.push({
        id: `forever-all-${category.key}-${index + 1}`,
        itemId: String(category.item), name: category.name,
        category: `gatherable-${category.key}`, label: "", subtype: category.key,
        ...project(canvasX, canvasY), iconPath: image,
        ...(creatures?.length ? { droppedBy: creatures.map(([id, name]) => ({ id: String(id), name })) } : {}),
      });
    });
  }
  const trainerPois = pois.filter((poi) => poi.category.startsWith("profession-trainer-"));
  if (trainerPois.length !== 290) throw new Error(`Expected 290 profession trainer POIs, got ${trainerPois.length}`);
  const appTrainers = JSON.parse(await readFile("public/maps/world-atlas/locations-profession-trainers.json", "utf8"));
  const en = JSON.parse(await readFile("src/i18n/locales/en.json", "utf8"));
  const translated = (key) => key?.split(".").reduce((value, part) => value?.[part], en);
  const existing = appTrainers.locations.map((point) => ({
    name: translated(point.nameKey) ?? point.name, x: point.x, y: point.y,
  }));
  const trainerLocations = [];
  const trainerOrdinals = new Map();
  let duplicates = 0;
  for (const poi of trainerPois) {
    if (!Number.isInteger(poi.npc) || !poi.name || !categoryByKey.has(poi.category)) {
      throw new Error(`Invalid profession trainer: ${poi.name}`);
    }
    const position = project(poi.x, poi.y);
    if (existing.some((point) => point.name.toLowerCase() === poi.name.toLowerCase()
      && Math.hypot(point.x - position.x, point.y - position.y) < 150)) {
      duplicates++;
      continue;
    }
    const ordinal = (trainerOrdinals.get(poi.npc) ?? 0) + 1;
    trainerOrdinals.set(poi.npc, ordinal);
    trainerLocations.push({
      id: `forever-all-profession-trainer-${poi.npc}-${ordinal}`,
      entityId: String(poi.npc), name: poi.name, category: "profession-trainer",
      label: "", subtype: poi.category,
      trainerTitleKey: `map.professionTrainerTypes.${poi.category.slice("profession-trainer-".length)}`,
      ...(poi.side === 1 || poi.side === 2 ? { trainerFaction: poi.side === 1 ? "Alliance" : "Horde" } : {}),
      ...position,
    });
  }
  const priorQuestGivers = JSON.parse(await readFile("public/maps/world-atlas/locations-forever-all-quest-givers.json", "utf8"));
  const newQuestGivers = pois.filter((poi) => poi.category === "quest-giver"
    && !priorQuestGivers.locations.some((point) => point.entityId === String(poi.npc)));
  if (newQuestGivers.length !== 1 || newQuestGivers[0].npc !== 254775) {
    throw new Error(`Expected only Karana as a new quest giver, got ${newQuestGivers.length}`);
  }
  const questGiverLocations = newQuestGivers.map((poi) => ({
    id: `forever-all-quest-giver-${poi.npc}-1`,
    entityId: String(poi.npc), name: poi.name, category: "npc", label: "",
    subtype: poi.category, ...project(poi.x, poi.y),
    questInfo: { faction: ["Neutral", "Alliance", "Horde"][poi.side] },
    questOffers: poi.quests.map(([id, name, level]) => ({ id: String(id), name, level, kind: "normal" })),
  }));
  const newMetadata = { ...metadata, capturedAt: "2026-10-19" };
  for (const [name, locations] of [["new-gathering", gatheringLocations],
    ["new-trainers", trainerLocations], ["new-quest-givers", questGiverLocations]]) {
    await writeFile(`public/maps/world-atlas/locations-forever-all-${name}.json`,
      `${JSON.stringify({ version: 1, projection: newMetadata, locations })}\n`);
  }
  const gatheringItems = {};
  for (const point of gatheringLocations) {
    const entry = gatheringItems[point.itemId] ??= {
      group: point.subtype.split("-")[0], regions: new Map(), creatures: new Map(),
    };
    const region = entry.regions.get(point.region) ?? { name: point.region, markerId: point.id, count: 0 };
    region.count++;
    entry.regions.set(point.region, region);
    for (const creature of point.droppedBy ?? []) {
      const existing = entry.creatures.get(creature.id);
      if (existing && existing.name !== creature.name) {
        throw new Error(`Conflicting creature names for ${creature.id}`);
      }
      const source = existing ?? { id: creature.id, name: creature.name, regions: new Set() };
      source.regions.add(point.region);
      entry.creatures.set(creature.id, source);
    }
  }
  const itemSources = Object.fromEntries(Object.entries(gatheringItems).map(([id, entry]) => [id, {
    group: entry.group,
    regions: [...entry.regions.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    creatures: [...entry.creatures.values()]
      .map((creature) => ({ ...creature, regions: [...creature.regions].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
  }]));
  await writeFile("public/data/items/forever-gathering-sources.json",
    `${JSON.stringify({ version: 1, items: itemSources })}\n`);
  console.log(JSON.stringify({ gathering: gatheringLocations.length, trainers: trainerLocations.length,
    questGivers: questGiverLocations.length, itemSources: Object.keys(itemSources).length,
    existingTrainerDuplicates: duplicates, categories: newCategories.length }));
  process.exit(0);
}

const gathering = [];
for (const node of nodes) {
  const category = categoryByKey.get(node.category);
  if (!["herbalism", "mining"].includes(category?.group)) continue;
  if (!Number.isInteger(category.object) || !category.image) {
    throw new Error(`Incomplete gathering category ${category.key}`);
  }
  const image = await iconPath(category.image);
  node.points.forEach(([canvasX, canvasY], index) => gathering.push({
    id: `forever-all-${category.key}-${index + 1}`,
    entityId: String(category.object), name: category.name,
    category: `gatherable-${category.key}`,
    label: "", subtype: category.key,
    ...project(canvasX, canvasY), iconPath: image,
  }));
}
const rare = [];
const questGivers = [];
const books = [];
const ordinals = new Map();
for (const poi of pois) {
  if (!["rare", "rare-elite", "quest-giver", "dungeon-quest-giver",
    "repeatable-quest-giver", "library-book"].includes(poi.category)) continue;
  const key = `${poi.category}:${poi.npc ?? poi.item}`;
  const ordinal = (ordinals.get(key) ?? 0) + 1;
  ordinals.set(key, ordinal);
  const position = project(poi.x, poi.y);
  if (poi.category === "rare" || poi.category === "rare-elite") {
    if (!Number.isInteger(poi.npc)) throw new Error(`Rare lacks NPC ID: ${poi.name}`);
    rare.push({ id: `forever-all-${poi.category}-${poi.npc}-${ordinal}`,
      entityId: String(poi.npc), name: poi.name, category: poi.category,
      label: "", subtype: poi.category, ...position });
  } else if (poi.category === "library-book") {
    if (!Number.isInteger(poi.item) || !poi.image) throw new Error(`Book lacks item art: ${poi.name}`);
    books.push({ id: `forever-all-book-${poi.item}-${ordinal}`,
      itemId: String(poi.item), name: poi.name, category: "book",
      label: "", subtype: "library-book", ...position,
      iconPath: await iconPath(poi.image) });
  } else {
    if (!Number.isInteger(poi.npc) || !Array.isArray(poi.quests) || !poi.quests.length) {
      throw new Error(`Quest giver lacks offers: ${poi.name}`);
    }
    const offers = poi.quests.map(([id, name, level]) => {
      if (!Number.isInteger(id) || !name || !Number.isInteger(level)) {
        throw new Error(`Invalid offer from ${poi.name}`);
      }
      return { id: String(id), name, level,
        kind: poi.category === "dungeon-quest-giver" ? "dungeon"
          : poi.category === "repeatable-quest-giver" ? "repeatable" : "normal" };
    });
    questGivers.push({ id: `forever-all-${poi.category}-${poi.npc}-${ordinal}`,
      entityId: String(poi.npc), name: poi.name, category: "npc", label: "",
      subtype: poi.category, ...position,
      questInfo: { faction: ["Neutral", "Alliance", "Horde"][poi.side] },
      questOffers: offers });
  }
}
const herbCount = gathering.filter((point) => point.category.startsWith("gatherable-herb-")).length;
const miningCount = gathering.filter((point) => point.category.startsWith("gatherable-ore-")).length;
const restoreLegacyIds = async (name, targets, identity, maxDistance) => {
  const prior = JSON.parse(await readFile(`public/maps/world-atlas/locations-forever-new-${name}.json`, "utf8"));
  const used = new Set();
  let matched = 0;
  for (const old of prior.locations) {
    const candidate = targets.filter((point) => !used.has(point)
      && identity(old) === identity(point))
      .map((point) => ({ point, distance: Math.hypot(point.x - old.x, point.y - old.y) }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (!candidate || candidate.distance > maxDistance) continue;
    candidate.point.id = old.id;
    used.add(candidate.point);
    matched++;
  }
  return matched;
};
const preservedIds = {
  gathering: await restoreLegacyIds("gatherables", gathering, (point) => point.entityId, 25),
  rares: await restoreLegacyIds("rares", rare, (point) => point.entityId, 250),
  questGivers: await restoreLegacyIds("quest-givers", questGivers, (point) => point.entityId, 25),
};
const priorBooks = JSON.parse(await readFile("public/maps/world-atlas/locations-books.json", "utf8"));
const english = JSON.parse(await readFile("src/i18n/locales/en.json", "utf8"));
const usedBooks = new Set();
preservedIds.books = 0;
for (const old of priorBooks.locations) {
  const name = old.name || old.nameKey?.split(".").reduce((value, key) => value?.[key], english);
  const match = books.filter((point) => !usedBooks.has(point) && point.name === name)
    .map((point) => ({ point, distance: Math.hypot(point.x - old.x, point.y - old.y) }))
    .sort((left, right) => left.distance - right.distance)[0];
  if (!match || match.distance > 20) continue;
  match.point.aliasIds = [old.id];
  match.point.bookId = old.bookId;
  usedBooks.add(match.point);
  preservedIds.books++;
}
const bookGroups = new Map(books.filter((point) => point.bookId)
  .map((point) => [point.itemId, point.bookId]));
for (const point of books) point.bookId ??= bookGroups.get(point.itemId) ?? `item-${point.itemId}`;
// Wowhead has separate rows for the same NPC when it offers several quest
// kinds. One location and one offer list keeps all kinds in one NPC panel.
const mergedQuestGivers = [];
const giverByIdentity = new Map();
for (const giver of questGivers) {
  const identity = `${giver.entityId}:${giver.x}:${giver.y}`;
  const existing = giverByIdentity.get(identity);
  if (existing) {
    existing.questOffers.push(...giver.questOffers);
    existing.aliasIds = [...(existing.aliasIds ?? []), giver.id];
  } else {
    giverByIdentity.set(identity, giver);
    mergedQuestGivers.push(giver);
  }
}
const offerPriority = { normal: 0, repeatable: 1, dungeon: 2 };
for (const giver of mergedQuestGivers) {
  const byId = new Map();
  for (const offer of giver.questOffers) {
    const previous = byId.get(offer.id);
    if (!previous || offerPriority[offer.kind] > offerPriority[previous.kind]) byId.set(offer.id, offer);
  }
  giver.questOffers = [...byId.values()];
}
const questLocations = mergedQuestGivers.flatMap((giver) => giver.questOffers.map((offer) => ({
  id: `forever-all-quest-${offer.id}-${giver.id}`,
  name: offer.name,
  category: offer.kind === "dungeon" ? "dungeon-quest"
    : offer.kind === "repeatable" ? "repeatable-quest" : "quest",
  label: "", subtype: "forever-all-quest",
  x: giver.x, y: giver.y, regionId: giver.regionId, region: giver.region,
  referenceCoordinates: giver.referenceCoordinates,
  questInfo: giver.questInfo,
  questId: offer.id, questLevel: offer.level,
  questGiverMarkerId: giver.id, questGiverName: giver.name,
})));
preservedIds.quests = await restoreLegacyIds("quests", questLocations, (point) => point.questId, 25);
const counts = {
  herbs: herbCount,
  mining: miningCount,
  herbTypes: new Set(gathering.filter((point) => point.category.startsWith("gatherable-herb-"))
    .map((point) => point.category)).size,
  miningTypes: new Set(gathering.filter((point) => point.category.startsWith("gatherable-ore-"))
    .map((point) => point.category)).size,
  questGivers: questGivers.filter((point) => point.subtype === "quest-giver").length,
  dungeonQuestGivers: questGivers.filter((point) => point.subtype === "dungeon-quest-giver").length,
  repeatableQuestGivers: questGivers.filter((point) => point.subtype === "repeatable-quest-giver").length,
  mergedQuestGivers: mergedQuestGivers.length,
  books: books.length,
  rares: rare.filter((point) => point.category === "rare").length,
  rareElites: rare.filter((point) => point.category === "rare-elite").length,
  questPins: questLocations.length,
  distinctQuests: new Set(questLocations.map((point) => point.questId)).size,
};
if (counts.herbs !== 10_627 || counts.mining !== 9_094
  || counts.herbTypes !== 34 || counts.miningTypes !== 27
  || counts.questGivers !== 1_568 || counts.dungeonQuestGivers !== 190
  || counts.repeatableQuestGivers !== 101 || counts.mergedQuestGivers !== 1_679 || counts.books !== 39
  || counts.rares !== 325 || counts.rareElites !== 99
  || counts.questPins !== 4_701
  || new Set([...gathering, ...rare, ...mergedQuestGivers, ...books, ...questLocations]
    .map((point) => point.id)).size !== gathering.length + rare.length
      + mergedQuestGivers.length + books.length + questLocations.length) {
  const ids = [...gathering, ...rare, ...mergedQuestGivers, ...books, ...questLocations].map((point) => point.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  throw new Error(`Review changed All counts: ${JSON.stringify({ ...counts, duplicates: [...new Set(duplicates)].slice(0, 10) })}`);
}
await Promise.all([
  output("gatherables", gathering), output("rares", rare),
  output("quest-givers", mergedQuestGivers), output("quests", questLocations),
  output("books", books),
]);
console.log(JSON.stringify({ ...counts, preservedIds }, null, 2));
