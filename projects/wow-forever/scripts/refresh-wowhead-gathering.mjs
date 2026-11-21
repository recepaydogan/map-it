/** Import the selected Forever All layers from a saved Wowhead world-map response. */
import { readFile, writeFile as writeRaw, rename } from "node:fs/promises";

const writeFile = async (path, value) => {
  const temporary = `${path}.november-update.tmp`;
  await writeRaw(temporary, value);
  await rename(temporary, path);
};

const sourcePath = process.argv[2] ?? "data/site-research/wowhead-audit-2026-11-02/world-map.js";
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

// Match coordinates rather than source ordering: saved/found marker IDs must survive refreshes.
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const removedIds = new Set();
const updatedPoints = new Map();
for (const [filename, groups] of [["gatherables", ["herbalism", "mining"]], ["new-gathering", ["fishing", "cloth", "leather"]]]) {
  const path = `public/maps/world-atlas/locations-forever-all-${filename}.json`;
  const catalog = await readJson(path);
  const oldByPosition = new Map(catalog.locations.map((p) => [`${p.subtype}:${p.x}:${p.y}`, p]));
  const nextOrdinal = new Map();
  for (const p of catalog.locations) nextOrdinal.set(p.subtype, Math.max(nextOrdinal.get(p.subtype) ?? 0, Number(p.id.split("-").at(-1))));
  const locations = [];
  for (const node of nodes) {
    const category = categoryByKey.get(node.category);
    if (!groups.includes(category?.group)) continue;
    for (const [cx, cy, , creatures] of node.points) {
      const position = project(cx, cy);
      const previous = oldByPosition.get(`${node.category}:${position.x}:${position.y}`);
      const ordinal = (nextOrdinal.get(node.category) ?? 0) + 1;
      if (!previous) nextOrdinal.set(node.category, ordinal);
      const point = { ...previous,
        id: previous?.id ?? `forever-all-${node.category}-${ordinal}`,
        ...(category.item ? { itemId: String(category.item) } : { entityId: String(category.object) }),
        name: category.name, category: `gatherable-${node.category}`, label: "", subtype: node.category,
        ...position, iconPath: `data/items/site-icons/${category.image}.jpg`,
      };
      delete point.droppedBy;
      if (creatures?.length) point.droppedBy = creatures.map(([id, name]) => ({ id: String(id), name }));
      locations.push(point);
      updatedPoints.set(point.id, point);
    }
  }
  const retained = new Set(locations.map((p) => p.id));
  for (const p of catalog.locations) if (!retained.has(p.id)) removedIds.add(p.id);
  await writeFile(path, `${JSON.stringify({ ...catalog, projection: { ...catalog.projection, capturedAt: "2026-11-02" }, locations })}\n`);
  console.log(`${filename}: ${catalog.locations.length} → ${locations.length}`);
}
const searchPath = "public/data/map-search/index.json";
const search = await readJson(searchPath);
const indexed = new Set();
search.locations = search.locations.filter(({ point }) => !removedIds.has(point.id)).map((entry) => {
  const point = updatedPoints.get(entry.point.id);
  if (!point) return entry;
  indexed.add(point.id);
  const { droppedBy: _creatures, ...searchPoint } = point;
  return { ...entry, point: { ...entry.point, ...searchPoint, label: entry.point.label } };
});
for (const point of updatedPoints.values()) if (!indexed.has(point.id)) {
  const { droppedBy: _creatures, ...searchPoint } = point;
  search.locations.push({ mapId: "azeroth", mapName: "Azeroth", point: searchPoint, count: 1 });
}
search.source.markerCount = search.locations.length;
await writeFile(searchPath, `${JSON.stringify(search)}\n`);
const sources = {};
for (const p of updatedPoints.values()) {
  if (!p.itemId) continue;
  const item = sources[p.itemId] ??= { group: p.subtype.split("-")[0], regions: [], creatures: [] };
  let region = item.regions.find((r) => r.name === p.region);
  if (!region) item.regions.push(region = { name: p.region, markerId: p.id, count: 0 });
  region.count++;
  for (const c of p.droppedBy ?? []) {
    let creature = item.creatures.find((entry) => entry.id === c.id);
    if (!creature) item.creatures.push(creature = { ...c, regions: [] });
    if (!creature.regions.includes(p.region)) creature.regions.push(p.region);
  }
}
for (const item of Object.values(sources)) {
  item.regions.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  item.creatures.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const c of item.creatures) c.regions.sort();
}
await writeFile("public/data/items/forever-gathering-sources.json", `${JSON.stringify({ version: 1, items: sources })}\n`);

// Fill the already-known vendor POIs omitted by the old layer importer.
const vendorPath = "public/maps/world-atlas/locations-forever-vendors.json";
const registry = await readFile("src/features/map/map-registry.ts", "utf8");
const filenames = [...registry.match(/locationFiles:\s*\[([^\]]+)\]/)[1].matchAll(/"([^\"]+)"/g)].map((m) => m[1]);
const english = await readJson("src/i18n/locales/en.json");
const englishName = (point) => point.name || point.nameKey?.split(".").reduce((v, k) => v?.[k], english) || "";
const existing = (await Promise.all(filenames.filter((f) => !f.includes("forever-vendors")).map(async (f) =>
  (await readJson(`public/maps/world-atlas/${f}`)).locations))).flat();
let priorVendors = [];
try { priorVendors = (await readJson(vendorPath)).locations; } catch { /* First import. */ }
const vendorLocations = [];
const ordinals = new Map();
for (const poi of pois.filter((p) => ["ammunition", "reagents", "innkeeper"].includes(p.category))) {
  const position = project(poi.x, poi.y);
  if (vendorLocations.some((p) => p.entityId === String(poi.npc) && p.x === position.x && p.y === position.y)) continue;
  if (existing.some((p) => englishName(p).toLowerCase() === poi.name.toLowerCase() && Math.hypot(p.x - position.x, p.y - position.y) < 150)) continue;
  const ordinal = (ordinals.get(poi.npc) ?? 0) + 1;
  ordinals.set(poi.npc, ordinal);
  const previous = priorVendors.find((p) => p.entityId === String(poi.npc) && p.x === position.x && p.y === position.y);
  vendorLocations.push({ id: previous?.id ?? `wowhead-vendor-${poi.npc}-${ordinal}`, entityId: String(poi.npc), name: poi.name,
    category: poi.category === "ammunition" ? "ammunition-vendor" : poi.category === "reagents" ? "reagent-vendor" : "innkeeper",
    label: "", subtype: poi.category, ...position });
}
await writeFile(vendorPath, `${JSON.stringify({ version: 1, locations: vendorLocations })}\n`);
const vendorSearch = await readJson(searchPath);
vendorSearch.locations = vendorSearch.locations.filter((entry) => !entry.point.id.startsWith("wowhead-vendor-"));
for (const point of vendorLocations) vendorSearch.locations.push({ mapId: "azeroth", mapName: "Azeroth", point, count: 1 });
vendorSearch.source.markerCount = vendorSearch.locations.length;
await writeFile(searchPath, `${JSON.stringify(vendorSearch)}\n`);
console.log(`Imported ${vendorLocations.length} vendor locations missing from existing layers.`);
