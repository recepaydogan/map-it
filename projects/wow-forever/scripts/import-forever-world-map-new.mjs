/** Project the Forever-new map pins and nested quest offers from a saved world-map data response. */
import { readFile, writeFile } from "node:fs/promises";

const input = process.argv[2];
if (!input) throw new Error("Pass the saved Forever world-map data JavaScript file.");
const script = await readFile(input, "utf8");
const pageData = (name) => {
  const prefix = `WH.setPageData("wow.worldMap.classicplus.${name}",`;
  const line = script.split("\n").find((entry) => entry.startsWith(prefix));
  if (!line?.endsWith(");")) throw new Error(`Missing world-map ${name} data`);
  return JSON.parse(line.slice(prefix.length, -2));
};
const config = pageData("config");
const categories = pageData("categories");
const places = pageData("places");
const nodes = pageData("nodes");
const pois = pageData("pois");
const atlas = JSON.parse(await readFile("public/maps/world-atlas/metadata.json", "utf8"));
const zones = places.filter((place) => place.kind === "zone" && place.rect && place.uiMap);
const reportedRares = JSON.parse(await readFile("public/maps/world-atlas/locations-rares.json", "utf8"));
const rareZones = new Map(reportedRares.locations.map((rare) => [Number(rare.entityId), rare.region]));
for (const [id, region] of [[266901, "Mount Hyjal"], [247032, "Alterac Mountains"],
  [250936, "Zephras Isle"], [255887, "Zephras Isle"], [256028, "Zephras Isle"],
  [256492, "Zephras Isle"], [259385, "Zephras Isle"], [259388, "Zephras Isle"],
  [259394, "Zephras Isle"], [259398, "Zephras Isle"]]) rareZones.set(id, region);
const starterZones = new Set(["Durotar", "Mulgore", "Teldrassil", "Tirisfal Glades",
  "Elwynn Forest", "Dun Morogh"]);
const continents = config.continents;
const layers = new Map(atlas.terrainLayers.map((layer) => [layer.source?.mapId, layer]));
const round = (value) => Number(value.toFixed(3));

const project = (x, y, allowedZones) => {
  const continent = continents.find((entry) => x >= entry.canvasX
    && x < entry.canvasX + entry.width && y >= entry.canvasY
    && y < entry.canvasY + entry.height);
  const layer = layers.get(continent?.map);
  if (!continent || !layer) throw new Error(`No atlas layer for ${x}, ${y}`);
  let position;
  if (layer.source.placement === "overview-inset") {
    const { grid } = layer.source;
    position = {
      x: layer.originX + (x - continent.canvasX
        + (continent.originCol - grid.minX) * continent.pxPerChunk) * layer.scaleX,
      y: layer.originY + (y - continent.canvasY
        + (continent.originRow - grid.minY) * continent.pxPerChunk) * layer.scaleY,
    };
  } else {
    position = {
      x: layer.originX + (x - continent.canvasX) * layer.scaleX,
      y: layer.originY + (y - continent.canvasY) * layer.scaleY,
    };
  }
  if (position.x < atlas.bounds.minX || position.x > atlas.bounds.maxX
    || position.y < atlas.bounds.minY || position.y > atlas.bounds.maxY) {
    throw new Error(`Projected point outside atlas: ${x}, ${y}`);
  }
  const candidates = zones.filter((zone) => allowedZones.has(zone.name)
    && x >= zone.rect[0][0] && x <= zone.rect[1][0]
    && y >= zone.rect[0][1] && y <= zone.rect[1][1]);
  const zone = candidates.sort((a, b) =>
    (a.rect[1][0] - a.rect[0][0]) * (a.rect[1][1] - a.rect[0][1])
    - (b.rect[1][0] - b.rect[0][0]) * (b.rect[1][1] - b.rect[0][1]))[0];
  if (!zone) throw new Error(`No in-game zone for ${x}, ${y}`);
  return {
    x: round(position.x), y: round(position.y),
    regionId: "", region: zone.name,
    referenceCoordinates: {
      x: round((x - zone.rect[0][0]) / (zone.rect[1][0] - zone.rect[0][0]) * 100),
      y: round((y - zone.rect[0][1]) / (zone.rect[1][1] - zone.rect[0][1]) * 100),
    },
  };
};

const requested = [
  ["herb-wilted-peacebloom", 308, "gatherable-wilted-peacebloom", "herbalism"],
  ["herb-stunted-silverleaf", 308, "gatherable-stunted-silverleaf", "herbalism"],
  ["ore-chunk-of-amber", 21, "gatherable-chunk-of-amber", "mining"],
  ["ore-large-chunk-of-amber", 49, "gatherable-large-chunk-of-amber", "mining"],
  ["ore-poor-copper-vein", 247, "gatherable-poor-copper-vein", "mining"],
];
const nativeGatheringIcons = {
  "herb-wilted-peacebloom": "herbs.png",
  "herb-stunted-silverleaf": "silverleaf.png",
  "ore-chunk-of-amber": "chunk-of-amber.png",
  "ore-large-chunk-of-amber": "chunk-of-amber.png",
  "ore-poor-copper-vein": "ore-veins.png",
};
const gatherables = requested.flatMap(([key, expected, category, subtype]) => {
  const node = nodes.find((entry) => entry.category === key);
  const kind = categories.find((entry) => entry.key === key);
  if (!node || !kind?.new || node.points.length !== expected || !kind.image) {
    throw new Error(`Review changed gathering data: ${key}`);
  }
  const iconPath = `maps/client-icons/gathering/${nativeGatheringIcons[key]}`;
  return node.points.map(([x, y], index) => ({
    id: `forever-new-${key}-${index + 1}`,
    entityId: String(kind.object), name: kind.name, category, label: "", subtype,
    ...project(x, y, starterZones), iconPath,
    descriptionKey: "map.gathering.observedPinDescription",
  }));
});
if (gatherables.length !== 933) throw new Error(`Expected 933 gathering points, got ${gatherables.length}`);
const rarePins = pois.filter((poi) => poi.new && ["rare", "rare-elite"].includes(poi.category));
if (rarePins.length !== 24 || new Set(rarePins.map((poi) => poi.npc)).size !== 24) {
  throw new Error(`Review changed rare data: ${rarePins.length} pins`);
}
const rares = rarePins.map((poi) => ({
  id: `forever-new-rare-${poi.npc}`,
  aliasIds: [`reported-rare-${poi.npc}`],
  entityId: String(poi.npc), name: poi.name,
  category: poi.category,
  label: "", subtype: poi.category,
  ...project(poi.x, poi.y, new Set([rareZones.get(poi.npc)])),
}));
const questCategories = new Map([
  ["quest-giver", "quest"],
  ["dungeon-quest-giver", "dungeon-quest"],
  ["repeatable-quest-giver", "repeatable-quest"],
]);
const questPins = pois.filter((poi) => poi.new === true && questCategories.has(poi.category));
const questIds = new Map();
const questGiverIds = new Map();
const allZoneNames = new Set(zones.map((zone) => zone.name));
const questGivers = questPins.map((poi) => {
  const ordinal = (questGiverIds.get(poi.npc) ?? 0) + 1;
  questGiverIds.set(poi.npc, ordinal);
  const id = `forever-new-quest-giver-${poi.npc}-${ordinal}`;
  const questOffers = poi.quests.map(([questId, title, level]) => {
    if (!Number.isInteger(questId) || typeof title !== "string" || !Number.isFinite(level)) {
      throw new Error(`Invalid quest offered by ${poi.name}`);
    }
    const existing = questIds.get(questId);
    if (existing && (existing.title !== title || existing.level !== level)) {
      throw new Error(`Conflicting quest ${questId} on world map`);
    }
    if (!existing) questIds.set(questId, { id: String(questId), title, level });
    return { id: String(questId), name: title, level };
  });
  return {
    id, entityId: String(poi.npc), name: poi.name,
    category: "npc", label: "", subtype: poi.category,
    ...project(poi.x, poi.y, allZoneNames),
    questInfo: { faction: ["Neutral", "Alliance", "Horde"][poi.side] },
    questOffers,
  };
});
if (questGivers.length !== 170 || questIds.size !== 386
  || questGivers.filter((point) => point.subtype === "quest-giver").length !== 161
  || questGivers.filter((point) => point.subtype === "dungeon-quest-giver").length !== 9) {
  throw new Error(`Review changed quest data: ${questGivers.length} givers, ${questIds.size} quests`);
}
const metadata = { atlasBuild: atlas.source.build, positionStatus: "observed", content: "forever-new" };
await writeFile("public/maps/world-atlas/locations-forever-new-gatherables.json",
  `${JSON.stringify({ version: 1, projection: metadata, locations: gatherables }, null, 2)}\n`);
await writeFile("public/maps/world-atlas/locations-forever-new-rares.json",
  `${JSON.stringify({ version: 1, projection: metadata, locations: rares }, null, 2)}\n`);
await writeFile("public/maps/world-atlas/locations-forever-new-quest-givers.json",
  `${JSON.stringify({ version: 1, projection: metadata, locations: questGivers }, null, 2)}\n`);
await import("./enrich-forever-new-quest-offers.mjs");
await import("./build-forever-new-quest-locations.mjs");
await writeFile("public/data/quests/world-map-new-quests.json",
  `${JSON.stringify({ version: 1, filter: "new", quests: [...questIds.values()].sort((a, b) =>
    Number(a.id) - Number(b.id)) }, null, 2)}\n`);
console.log(`Projected ${gatherables.length} gatherables, ${rares.length} rare creatures, and ${questGivers.length} quest givers with ${questIds.size} distinct quests.`);
