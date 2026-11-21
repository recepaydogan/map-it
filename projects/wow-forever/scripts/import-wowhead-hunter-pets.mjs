/** Import the selected Forever All layers from a saved Wowhead world-map response. */
import { readFile, writeFile, access } from "node:fs/promises";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the saved Wowhead Forever world-map JavaScript file.");
const source = (await readFile(sourcePath, "utf8")).replace(/^\uFEFF/, "");
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
const petCategories = categories.filter((entry) => entry.group === "hunter-pets");
if (petCategories.length !== 18) throw new Error("Unexpected hunter pet category count");
const petPois = pois.filter((entry) => categoryByKey.get(entry.category)?.group === "hunter-pets");
const seen = new Map();
const locations = petPois.map((poi) => {
  const key = `${poi.category}-${poi.npc}`;
  const ordinal = (seen.get(key) ?? 0) + 1;
  seen.set(key, ordinal);
  if (!poi.npc || !poi.name) throw new Error("Incomplete hunter pet");
  return { id: `wowhead-${key}-${ordinal}`, name: poi.name, category: poi.category,
    label: "", labelKey: `map.hunterPets.${poi.category.slice("hunter-pet-".length)}`,
    subtype: poi.category, entityId: String(poi.npc),
    petLevels: poi.levels || undefined,
    petAbilities: categoryByKey.get(poi.category).abilities.map(([id, name]) => ({ id, name })),
    ...project(poi.x, poi.y) };
});
if (new Set(locations.map((point) => point.id)).size !== locations.length) throw new Error("Duplicate hunter pet IDs");
await writeFile("public/maps/world-atlas/locations-forever-hunter-pets.json", `${JSON.stringify({version: 1, projection: {atlasBuild: atlas.source.build, positionStatus: "reference-world-map", content: "wowhead-hunter-pets"}, locations})}\n`);
console.log(JSON.stringify({families: petCategories.length, markers: locations.length}));
