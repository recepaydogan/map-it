/** Publish one pin per named Arathi Basin objective, collapsing control-state POIs. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const trace = await readJson("data/client-research/arathi-map-poi-trace.json");
const states = await readJson("data/client-research/area-poi-state-icon-trace.json");
const terrain = await readJson("public/maps/wdt-790377/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
if (trace.source.product !== terrain.source.product
  || trace.source.build !== terrain.source.build
  || states.source.build !== terrain.source.build
  || states.source.parentAreaPoi.sha256 !== trace.source.tables.find(({ name }) => name === "AreaPOI")?.sha256
  || trace.source.mapId !== 529
  || trace.source.wdtFileDataId !== terrain.source.wdtFileDataId
  || trace.source.wdtSha256 !== terrain.source.wdtSha256
  || english.map.battlegroundMaps.arathiBasin !== "Arathi Basin") {
  throw new Error("Arathi Basin POIs and native terrain use inconsistent client records.");
}
const grouped = new Map();
for (const poi of trace.pois) {
  if (!poi.name || poi.iconId !== 132 || !poi.onExtractedTerrain) {
    throw new Error(`Arathi Basin POI ${poi.poiId} lacks a named native map position.`);
  }
  const rows = grouped.get(poi.name) ?? [];
  rows.push(poi);
  grouped.set(poi.name, rows);
}
if (grouped.size !== 5 || trace.pois.length !== 25) {
  throw new Error("The native Arathi Basin objective groups changed in this build.");
}
const locations = [];
const markers = [];
for (const [name, rows] of grouped) {
  rows.sort((left, right) => left.poiId - right.poiId);
  const representative = rows[0];
  const maxSeparation = Math.max(...rows.flatMap((left) => rows.map((right) =>
    Math.hypot(left.worldPosition[0] - right.worldPosition[0],
      left.worldPosition[1] - right.worldPosition[1]))));
  if (rows.length !== 5 || maxSeparation > 1
    || english.map.publishedBattlegroundObjectives?.[representative.poiId] !== name) {
    throw new Error(`Arathi Basin objective ${name} has ambiguous state positions or label.`);
  }
  const { x, y } = representative.mapPosition;
  const tileX = Math.floor(x / terrain.tileSize);
  const tileY = Math.floor(y / terrain.tileSize);
  const tileKey = `${tileX},${tileY}`;
  if (x < terrain.bounds.minX || x >= terrain.bounds.maxX
    || y < terrain.bounds.minY || y >= terrain.bounds.maxY
    || !terrain.tileCoverage[0].includes(tileKey)) {
    throw new Error(`Arathi Basin objective ${name} lies outside the native terrain.`);
  }
  const pixel = await sharp(join(root, "public/maps/wdt-790377/tiles/0",
    `tile${tileX}x${tileY}.webp`)).ensureAlpha().extract({
    left: Math.floor(x - tileX * terrain.tileSize),
    top: Math.floor(y - tileY * terrain.tileSize), width: 1, height: 1,
  }).raw().toBuffer();
  if (pixel[3] === 0) throw new Error(`Arathi Basin objective ${name} sits on a transparent tile pixel.`);
  const locationId = `client-arathi-objective-poi-${representative.poiId}`;
  locations.push({ id: locationId, name: "",
    nameKey: `map.publishedBattlegroundObjectives.${representative.poiId}`,
    category: "battleground-objective", label: "", subtype: "client-area-poi",
    regionId: "", region: "", x, y });
  markers.push({ name, locationId, representativePoiId: representative.poiId,
    sourcePoiIds: rows.map(({ poiId }) => poiId),
    linkedAreaPoiStateIds: states.rows.filter(({ parentPoi }) =>
      rows.some(({ poiId }) => poiId === parentPoi?.poiId)
      && parentPoi.mapId === 529).map(({ id }) => id),
    sourcePriorities: rows.map(({ uiPriority }) => uiPriority),
    worldPosition: representative.worldPosition, mapPosition: representative.mapPosition,
    maxSourceSeparationWorldUnits: maxSeparation, nativeTile: tileKey,
    nativePixelAlpha: pixel[3] });
}
await writeFile(join(root, "public/maps/wdt-790377/locations-objectives.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-arathi-objective-evidence.json"),
  `${JSON.stringify({ source: { ...trace.source,
    areaPoiStateFileDataId: states.source.fileDataId,
    areaPoiStateSha256: states.source.sha256 },
    selectionRule: "Each of five exact-name Map 529 AreaPOI groups contains five icon-132 state rows within one world unit; the lowest POI ID supplies the map position.",
    caveat: "These are battleground objective locations, not a current Alliance/Horde control state or a service NPC.",
    markers }, null, 2)}\n`);
console.log(`Published ${locations.length} Arathi Basin objectives from ${trace.pois.length} native POI rows.`);
