/** Publish one Alterac Valley objective pin per named group of client state POIs. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const trace = await readJson("data/client-research/razorfen-graveyard-client-trace.json");
const terrain = await readJson("public/maps/wdt-790112/metadata.json");
const identities = await readJson("data/client-research/wdt-map-identities.json");
const english = await readJson("src/i18n/locales/en.json");
const wdt = identities.records.find(({ wdtFileDataId }) =>
  wdtFileDataId === terrain.source.wdtFileDataId);
if (trace.source.product !== terrain.source.product
  || trace.source.build !== terrain.source.build
  || identities.source.build !== terrain.source.build
  || wdt?.maps.length !== 1 || wdt.maps[0].mapId !== 30
  || wdt.maps[0].name !== english.map.battlegroundMaps.alteracValley
  || terrain.source.tileCount !== wdt.tileCount
  || terrain.source.missingFileDataIds.length) {
  throw new Error("Alterac Valley objective POIs and native terrain use inconsistent client records.");
}
const grouped = new Map();
for (const poi of trace.areaPoiRows.filter(({ mapId, name }) =>
  mapId === 30 && !name.endsWith(" Graveyard"))) {
  if (!poi.name || poi.iconId !== 132) {
    throw new Error(`Alterac Valley objective POI ${poi.poiId} has no named native position.`);
  }
  const rows = grouped.get(poi.name) ?? [];
  rows.push(poi);
  grouped.set(poi.name, rows);
}
if (grouped.size !== 12) throw new Error("Alterac Valley objective names changed in this build.");
const project = ([worldX, worldY]) => ({
  x: (32 - worldY / (1600 / 3) - terrain.source.grid.minX) * terrain.tileSize,
  y: (32 - worldX / (1600 / 3) - terrain.source.grid.minY) * terrain.tileSize,
});
const locations = [];
const markers = [];
for (const [name, rows] of grouped) {
  const center = [0, 1].map((axis) => rows.reduce((sum, row) =>
    sum + row.worldPosition[axis], 0) / rows.length);
  const representative = [...rows].sort((left, right) =>
    Math.hypot(left.worldPosition[0] - center[0], left.worldPosition[1] - center[1])
      - Math.hypot(right.worldPosition[0] - center[0], right.worldPosition[1] - center[1])
      || left.poiId - right.poiId)[0];
  const maxSeparation = Math.max(...rows.flatMap((left) => rows.map((right) =>
    Math.hypot(left.worldPosition[0] - right.worldPosition[0],
      left.worldPosition[1] - right.worldPosition[1]))));
  if (maxSeparation > 20
    || english.map.publishedBattlegroundObjectives?.[representative.poiId] !== name) {
    throw new Error(`Alterac Valley objective ${name} has ambiguous state positions or label.`);
  }
  const { x, y } = project(representative.worldPosition);
  const tileX = Math.floor(x / terrain.tileSize);
  const tileY = Math.floor(y / terrain.tileSize);
  const tileKey = `${tileX},${tileY}`;
  if (x < terrain.bounds.minX || x >= terrain.bounds.maxX
    || y < terrain.bounds.minY || y >= terrain.bounds.maxY
    || !terrain.tileCoverage[0].includes(tileKey)) {
    throw new Error(`Alterac Valley objective ${name} lies outside native terrain.`);
  }
  const pixel = await sharp(join(root, "public/maps/wdt-790112/tiles/0",
    `tile${tileX}x${tileY}.webp`)).ensureAlpha().extract({
    left: Math.floor(x - tileX * terrain.tileSize),
    top: Math.floor(y - tileY * terrain.tileSize), width: 1, height: 1,
  }).raw().toBuffer();
  if (pixel[3] === 0) throw new Error(`Alterac Valley objective ${name} sits on transparent terrain.`);
  const locationId = `client-alterac-objective-poi-${representative.poiId}`;
  locations.push({ id: locationId, name: "",
    nameKey: `map.publishedBattlegroundObjectives.${representative.poiId}`,
    category: "battleground-objective", label: "", subtype: "client-area-poi",
    regionId: "", region: "", x, y });
  markers.push({ name, locationId, representativePoiId: representative.poiId,
    sourcePoiIds: rows.map(({ poiId }) => poiId).sort((a, b) => a - b),
    sourceWorldPosition: representative.worldPosition,
    mapPosition: { x, y }, maxSourceSeparationWorldUnits: maxSeparation,
    nativeTile: tileKey, nativePixelAlpha: pixel[3] });
}
await writeFile(join(root, "public/maps/wdt-790112/locations-objectives.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-alterac-objective-evidence.json"),
  `${JSON.stringify({ source: { product: trace.source.product, build: trace.source.build,
    mapId: 30, wdtFileDataId: terrain.source.wdtFileDataId,
    wdtSha256: terrain.source.wdtSha256,
    areaPoiTable: trace.source.tables.find(({ name }) => name === "AreaPOI") },
    selectionRule: "Non-graveyard, exact-name icon-132 AreaPOI groups on Map 30 with state positions within 20 world units; use the original row nearest the group center.",
    caveat: "These are objective locations, not current faction control states, interactive NPCs, or a Razorfen Kraul graveyard.",
    markers }, null, 2)}\n`);
console.log(`Published ${locations.length} Alterac Valley objectives from ${markers.reduce((sum, marker) => sum + marker.sourcePoiIds.length, 0)} native POI rows.`);
