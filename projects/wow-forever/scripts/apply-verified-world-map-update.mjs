/** Apply the reviewed map response while retaining IDs for unchanged locations. */
import { readFile, writeFile } from "node:fs/promises";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the reviewed world-map response.");
const apply = process.argv.includes("--apply");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const source = new Map();
for (const line of (await readFile(sourcePath, "utf8")).trim().split(/\r?\n/)) {
  const match = /^WH\.setPageData\("wow\.worldMap\.classicplus\.([^\"]+)",(.+)\);$/.exec(line);
  if (!match || source.has(match[1])) throw new Error("Invalid map response");
  source.set(match[1], JSON.parse(match[2]));
}
const atlas = await read("public/maps/world-atlas/metadata.json");
const config = source.get("config"), pois = source.get("pois"), nodes = source.get("nodes");
const categories = new Map(source.get("categories").map((entry) => [entry.key, entry]));
const zones = source.get("places").filter((entry) => ["zone", "capital"].includes(entry.kind) && entry.rect && entry.uiMap);
const zoneByArea = new Map(zones.map((zone) => [zone.area, zone]));
const round = (value) => Number(value.toFixed(3));
function project(x, y) {
  const continent = config.continents.find((entry) => x >= entry.canvasX && x < entry.canvasX + entry.width
    && y >= entry.canvasY && y < entry.canvasY + entry.height);
  const layer = atlas.terrainLayers.find((entry) => entry.source?.mapId === continent?.map);
  if (!continent || !layer) throw new Error("Unknown continent");
  const inset = layer.source.placement === "overview-inset";
  const ax = layer.originX + (x - continent.canvasX + (inset ? (continent.originCol - layer.source.grid.minX) * continent.pxPerChunk : 0)) * layer.scaleX;
  const ay = layer.originY + (y - continent.canvasY + (inset ? (continent.originRow - layer.source.grid.minY) * continent.pxPerChunk : 0)) * layer.scaleY;
  const raster = source.get("zones").find((entry) => entry.map === continent.map);
  const row = Math.floor((y - raster.y) / raster.cell), column = Math.floor((x - raster.x) / raster.cell);
  const spans = raster.rows.find((entry) => entry[0] === row);
  let area;
  for (let index = 1; spans && index < spans.length - 1; index += 2) {
    if (column >= spans[index] && column < spans[index + 2]) { area = spans[index + 1]; break; }
  }
  const contains = (zone) => zone && x >= zone.rect[0][0] && x <= zone.rect[1][0] && y >= zone.rect[0][1] && y <= zone.rect[1][1];
  const mapped = zoneByArea.get(area);
  const zone = contains(mapped) ? mapped : zones.filter(contains).sort((a, b) =>
    (a.rect[1][0] - a.rect[0][0]) * (a.rect[1][1] - a.rect[0][1])
    - (b.rect[1][0] - b.rect[0][0]) * (b.rect[1][1] - b.rect[0][1]))[0];
  if (!zone || ax < atlas.bounds.minX || ax > atlas.bounds.maxX || ay < atlas.bounds.minY || ay > atlas.bounds.maxY) throw new Error("Invalid projected position");
  return { x: round(ax), y: round(ay), regionId: "", region: zone.name, referenceCoordinates: {
    x: round((x - zone.rect[0][0]) / (zone.rect[1][0] - zone.rect[0][0]) * 100),
    y: round((y - zone.rect[0][1]) / (zone.rect[1][1] - zone.rect[0][1]) * 100),
  } };
}
const changes = {};
const writes = new Map();
const root = "public/maps/world-atlas/";
function reconcile(old, targets, identity, maxDistance) {
  const available = new Set(old), paired = new Map();
  // Reserve every exact match before pairing moved points, so a new point can
  // never steal an unchanged point's persistent ID.
  for (const target of targets) {
    const match = old.find((point) => available.has(point) && identity(point) === identity(target)
      && Math.hypot(point.x - target.x, point.y - target.y) < 0.002);
    if (match) { paired.set(target, match); available.delete(match); }
  }
  const pairs = [];
  for (const target of targets.filter((point) => !paired.has(point))) {
    for (const point of available) if (identity(point) === identity(target)) {
      const distance = Math.hypot(point.x - target.x, point.y - target.y);
      if (distance <= maxDistance) pairs.push({ target, point, distance });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);
  for (const pair of pairs) if (!paired.has(pair.target) && available.has(pair.point)) {
    paired.set(pair.target, pair.point); available.delete(pair.point);
  }
  const ids = new Set(old.map((point) => point.id));
  let added = 0, moved = 0, updated = 0;
  const locations = targets.map((target) => {
    const previous = paired.get(target);
    if (previous) {
      if (Math.hypot(previous.x - target.x, previous.y - target.y) >= 0.002) moved++;
      const next = { ...previous, ...target, id: previous.id };
      if (target.category.startsWith("gatherable-") && !target.droppedBy) delete next.droppedBy;
      if (JSON.stringify(next) !== JSON.stringify(previous)) updated++;
      return next;
    }
    let ordinal = 1;
    const stem = `forever-all-${target.subtype}-${target.entityId ?? target.itemId ?? "point"}`;
    while (ids.has(`${stem}-${ordinal}`)) ordinal++;
    const id = `${stem}-${ordinal}`; ids.add(id); added++;
    return { ...target, id };
  });
  return { locations, counts: { before: old.length, after: locations.length, added, removed: available.size, moved, updated } };
}
async function update(name, targets, identity, distance) {
  const path = `${root}locations-forever-all-${name}.json`, catalog = await read(path);
  const result = reconcile(catalog.locations, targets, identity, distance);
  changes[name] = result.counts;
  writes.set(path, { ...catalog, projection: { ...catalog.projection, capturedAt: "2026-10-21" }, locations: result.locations });
  return result.locations;
}
const gathering = { gatherables: [], "new-gathering": [] };
for (const node of nodes) {
  const category = categories.get(node.category);
  const group = ["herbalism", "mining"].includes(category?.group) ? "gatherables"
    : ["fishing", "cloth", "leather"].includes(category?.group) ? "new-gathering" : null;
  if (!group) continue;
  const iconPath = `data/items/site-icons/${category.image}.jpg`;
  // Art must already be present locally; never invent a fallback item image.
  await readFile(`public/${iconPath}`);
  for (const [x, y, , creatures] of node.points) gathering[group].push({
    ...(group === "gatherables" ? { entityId: String(category.object) } : { itemId: String(category.item) }),
    name: category.name, category: `gatherable-${category.key}`, label: "", subtype: category.key,
    ...project(x, y), iconPath,
    ...(creatures?.length ? { droppedBy: creatures.map(([id, name]) => ({ id: String(id), name })) } : {}),
  });
}
for (const [name, targets] of Object.entries(gathering)) await update(name, targets, (point) => point.category, 20);
const gatheringItems = new Map();
for (const point of writes.get(`${root}locations-forever-all-new-gathering.json`).locations) {
  if (!gatheringItems.has(point.itemId)) gatheringItems.set(point.itemId, { group: point.subtype.split("-")[0], regions: new Map(), creatures: new Map() });
  const item = gatheringItems.get(point.itemId);
  const region = item.regions.get(point.region) ?? { name: point.region, markerId: point.id, count: 0 };
  region.count++; item.regions.set(point.region, region);
  for (const creature of point.droppedBy ?? []) {
    const entry = item.creatures.get(creature.id) ?? { id: creature.id, name: creature.name, regions: new Set() };
    entry.regions.add(point.region); item.creatures.set(creature.id, entry);
  }
}
writes.set("public/data/items/forever-gathering-sources.json", { version: 1,
  items: Object.fromEntries([...gatheringItems].map(([id, item]) => [id, { group: item.group,
    regions: [...item.regions.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    creatures: [...item.creatures.values()].map((entry) => ({ ...entry, regions: [...entry.regions].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
  }])) });
await update("rares", pois.filter((point) => ["rare", "rare-elite"].includes(point.category)).map((point) => ({
  entityId: String(point.npc), name: point.name, category: point.category, label: "", subtype: point.category, ...project(point.x, point.y),
})), (point) => `${point.category}:${point.entityId}`, 2000);

const giverNames = ["quest-givers", "new-quest-givers"];
const priorities = { normal: 0, repeatable: 1, dungeon: 2 };
for (const name of giverNames) {
  const path = `${root}locations-forever-all-${name}.json`, catalog = await read(path);
  let updated = 0;
  const locations = catalog.locations.map((point) => {
    const candidates = pois.filter((poi) => poi.npc === Number(point.entityId) && poi.category.endsWith("quest-giver"));
    const nearest = candidates.toSorted((a, b) => Math.hypot(project(a.x, a.y).x - point.x, project(a.x, a.y).y - point.y)
      - Math.hypot(project(b.x, b.y).x - point.x, project(b.x, b.y).y - point.y))[0];
    const related = candidates.filter((poi) => poi.x === nearest?.x && poi.y === nearest?.y);
    if (!related.length) throw new Error(`Quest giver disappeared: ${point.id}`);
    const offers = new Map();
    for (const poi of related) for (const [id, title, level] of poi.quests) {
      const kind = poi.category === "dungeon-quest-giver" ? "dungeon" : poi.category === "repeatable-quest-giver" ? "repeatable" : "normal";
      const previous = offers.get(String(id));
      if (!previous || priorities[kind] > priorities[previous.kind]) offers.set(String(id), {
        ...point.questOffers.find((offer) => offer.id === String(id)), id: String(id), name: title,
        // The current quest page and NPC list agree on 43; the map cache says 40.
        level: id === 79361 ? 43 : level, kind,
      });
    }
    const primary = related.find((poi) => poi.category === point.subtype) ?? related[0];
    const next = { ...point, ...project(primary.x, primary.y), questInfo: { ...point.questInfo,
      // Umi's detailed quest page confirms availability to both factions.
      faction: point.entityId === "10305" ? point.questInfo.faction : ["Neutral", "Alliance", "Horde"][primary.side] }, questOffers: [...offers.values()] };
    if (JSON.stringify(next) !== JSON.stringify(point)) updated++;
    return next;
  });
  changes[name] = { updated };
  writes.set(path, { ...catalog, projection: { ...catalog.projection, capturedAt: "2026-10-21" }, locations });
}
const currentGivers = giverNames.flatMap((name) => writes.get(`${root}locations-forever-all-${name}.json`).locations);
const questPath = `${root}locations-forever-all-quests.json`, quests = await read(questPath);
const questTargets = currentGivers.flatMap((giver) => giver.questOffers.map((offer) => {
  const previous = quests.locations.find((quest) => quest.questGiverMarkerId === giver.id && quest.questId === offer.id);
  return { ...previous, id: previous?.id ?? `forever-all-quest-${offer.id}-${giver.id}`, name: offer.name,
    category: offer.kind === "dungeon" ? "dungeon-quest" : offer.kind === "repeatable" ? "repeatable-quest" : "quest",
    label: "", subtype: "forever-all-quest", x: giver.x, y: giver.y, regionId: giver.regionId, region: giver.region,
    referenceCoordinates: giver.referenceCoordinates, questInfo: offer.id === "93465"
      ? { ...giver.questInfo, faction: "Horde", requiredLevel: 30 } : giver.questInfo,
    questId: offer.id, questLevel: offer.level, questGiverMarkerId: giver.id, questGiverName: giver.name };
}));
writes.set(questPath, { ...quests, projection: { ...quests.projection, capturedAt: "2026-10-21" }, locations: questTargets });
changes.quests = { before: quests.locations.length, after: questTargets.length };

const trainerPath = `${root}locations-forever-all-new-trainers.json`, trainers = await read(trainerPath);
const rogvar = pois.find((poi) => poi.npc === 1386 && poi.category === "profession-trainer-alchemy");
if (!rogvar) throw new Error("Reviewed Rogvar position is absent");
if (!trainers.locations.some((point) => point.entityId === "1386")) trainers.locations.push({
  id: "forever-all-profession-trainer-1386-1", entityId: "1386", name: rogvar.name, category: "profession-trainer",
  label: "", subtype: rogvar.category, trainerTitleKey: "map.professionTrainerTypes.alchemy", trainerFaction: "Horde", ...project(rogvar.x, rogvar.y),
});
writes.set(trainerPath, { ...trainers, projection: { ...trainers.projection, capturedAt: "2026-10-21" } });
const trainerIndexPath = "public/data/professions/map-trainers.json", trainerIndex = await read(trainerIndexPath);
if (!trainerIndex.trainers.some((point) => point.n === "Rogvar")) trainerIndex.trainers.push({
  profession: "alchemy", markerId: "forever-all-profession-trainer-1386-1", npc: 1386,
  n: "Rogvar", sub: "Master Alchemist", side: "Horde", zone: project(rogvar.x, rogvar.y).region,
});
writes.set(trainerIndexPath, trainerIndex);

const newPois = pois.filter((poi) => poi.category === "battlemaster");
if (newPois.length !== 47) throw new Error("Reviewed battlemaster count changed");
// NPC tooltip roles and unique nearest positions identify the eight older,
// generically named city pins. Keep their IDs while correcting names/positions.
const cityBattlemasterNpcs = { "948977": 14981, "948978": 263349, "948979": 15008, "948980": 7410,
  "949373": 12197, "949376": 14982, "949377": 263643, "949378": 857 };
const communityPath = `${root}locations-mapgenie-community.json`, community = await read(communityPath);
const consumedBattlemasters = new Set();
for (const [suffix, npc] of Object.entries(cityBattlemasterNpcs)) {
  const point = community.locations.find((entry) => entry.id === `mapgenie-battlemaster-${suffix}`);
  const candidates = newPois.filter((poi) => poi.npc === npc).toSorted((a, b) =>
    Math.hypot(project(a.x, a.y).x - point.x, project(a.x, a.y).y - point.y)
      - Math.hypot(project(b.x, b.y).x - point.x, project(b.x, b.y).y - point.y));
  const poi = candidates[0], position = project(poi.x, poi.y);
  if (!point || Math.hypot(position.x - point.x, position.y - point.y) > 150) throw new Error(`City battlemaster moved beyond reviewed match: ${npc}`);
  point.detailLabelKey = point.nameKey ?? point.detailLabelKey;
  delete point.nameKey;
  Object.assign(point, { entityId: String(npc), name: poi.name, ...position });
  consumedBattlemasters.add(poi);
}
writes.set(communityPath, community);
const ordinals = new Map();
const services = newPois.filter((poi) => !consumedBattlemasters.has(poi)).map((poi) => {
  const ordinal = (ordinals.get(poi.npc) ?? 0) + 1; ordinals.set(poi.npc, ordinal);
  return { id: `forever-all-battlemaster-${poi.npc}-${ordinal}`, entityId: String(poi.npc), name: poi.name,
    category: "battlemaster", label: "", subtype: "battlemaster", ...project(poi.x, poi.y) };
});
const berdun = pois.find((poi) => poi.npc === 240482 && poi.category === "innkeeper");
if (!berdun) throw new Error("Reviewed innkeeper is absent");
services.push({ id: "forever-all-innkeeper-240482-1", entityId: "240482", name: berdun.name,
  category: "innkeeper", label: "", subtype: "innkeeper", ...project(berdun.x, berdun.y) });
const skyborne = pois.filter((poi) => ["ley-line", "elemental-convergence"].includes(poi.category));
if (skyborne.filter((poi) => poi.category === "ley-line").length !== 92
  || skyborne.filter((poi) => poi.category === "elemental-convergence").length !== 64) throw new Error("Reviewed Skyborne counts changed");
services.push(...skyborne.map((poi) => ({
  id: `forever-all-${poi.category}-${Math.round(poi.x * 10)}-${Math.round(poi.y * 10)}`,
  name: poi.name, category: poi.category, label: "", subtype: poi.category, ...project(poi.x, poi.y),
})));
writes.set(`${root}locations-forever-all-updates.json`, { version: 1,
  projection: { atlasBuild: atlas.source.build, positionStatus: "reference-world-map", capturedAt: "2026-10-21" }, locations: services });
const instancePath = `${root}locations-instances.json`, instances = await read(instancePath);
if (!instances.locations.some((point) => point.id === "forever-all-dungeon-scarlet-monastery")) {
  const poi = pois.find((point) => point.category === "dungeon" && point.name === "Scarlet Monastery");
  if (!poi) throw new Error("Reviewed dungeon is missing");
  instances.locations.push({ id: "forever-all-dungeon-scarlet-monastery", name: poi.name, category: "dungeon",
    label: "", subtype: "instance", ...project(poi.x, poi.y), reference: { category: "zone", id: "796" } });
}
for (const name of ["Temple of Ahn'Qiraj", "Ruins of Ahn'Qiraj", "Barrow Deeps", "Hyjal Summit", "Blackwing Lair", "Molten Core", "Naxxramas"]) {
  const poi = pois.find((point) => point.category === "raid" && point.name === name);
  if (!poi) throw new Error(`Reviewed raid location disappeared: ${name}`);
  const id = `forever-all-raid-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (instances.locations.some((point) => point.id === id)) continue;
  const upcoming = ["Barrow Deeps", "Hyjal Summit"].includes(name);
  instances.locations.push({ id, name, category: "raid", label: "", subtype: "reference-instance",
    detailLabelKey: upcoming ? "map.instanceFacts.upcomingRaid" : "map.instanceFacts.referenceLocation",
    ...project(poi.x, poi.y),
  });
}
writes.set(instancePath, instances);
// Keep quest page levels consistent with the source-linked marker offers.
const detailsPath = "public/data/quests/quest-details.json", details = await read(detailsPath);
for (const id of ["79358"]) {
  const offer = currentGivers.flatMap((point) => point.questOffers).find((point) => point.id === id);
  if (!offer || !details.quests[id] || details.quests[id].title !== offer.name) throw new Error(`Quest identity mismatch: ${id}`);
  details.quests[id].level = offer.level;
  details.quests[id].experience = 3150;
  details.quests[id].money = "50s";
}
details.quests["93465"] ??= { id: "93465", title: "Notes on Draenethyst", level: 40, minimumLevel: 30,
  faction: "Horde", experience: 3150, money: "50s", startsAt: "Azore Aldamort", endsAt: "Azore Aldamort",
  objective: "Take Gimashi's notes on Draenethyst, and bring them back to Azore Aldamort.",
  description: "I suppose it would be more accurate to say I know someone who knows a thing or two about draenethyst. You see, the warlocks of the Burning Blade have been studying it. It is a substance from beyond the dark portal, so it follows that those involved with darker arts might wish to harness it to their own ends. We cannot allow this, obviously. The specific warlock you seek is named Gimashi. She can be found atop her tower, which is in a ravine to the southeast. Her notes will have the answers you seek.",
  evidence: "community-reported", detailEvidence: "community-reported" };
writes.set(detailsPath, details);
for (const [path, catalog] of writes) {
  if (catalog.locations && new Set(catalog.locations.map((point) => point.id)).size !== catalog.locations.length) throw new Error(`Duplicate IDs in ${path}`);
  if (apply) await writeFile(path, `${JSON.stringify(catalog, null, [detailsPath, instancePath, trainerIndexPath, communityPath].includes(path) ? 2 : undefined)}\n`);
}
console.log(JSON.stringify({ applied: apply, changes, battlemasterAdditions: services.filter((point) => point.category === "battlemaster").length,
  updatedCityBattlemasters: consumedBattlemasters.size, skyborne: skyborne.length,
  trainers: trainers.locations.length, instances: instances.locations.length }, null, 2));
