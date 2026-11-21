/** Publish Darkspear Islands battleground POIs with their verified state links. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const trace = await readJson("data/client-research/darkspear-map-poi-trace.json");
const states = await readJson("data/client-research/area-poi-state-icon-trace.json");
const terrain = await readJson("public/maps/wdt-7251908/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
const poiTable = trace.source.tables.find(({ name }) => name === "AreaPOI");
if (trace.source.product !== terrain.source.product
  || trace.source.build !== terrain.source.build
  || states.source.build !== terrain.source.build
  || states.source.parentAreaPoi.sha256 !== poiTable?.sha256
  || trace.source.mapId !== 2997
  || trace.source.wdtFileDataId !== terrain.source.wdtFileDataId
  || trace.source.wdtSha256 !== terrain.source.wdtSha256
  || english.map.battlegroundMaps.darkspearIslands !== "Darkspear Islands") {
  throw new Error("Darkspear Islands objective sources belong to different client records.");
}
if (trace.pois.length !== 5 || trace.objects.length !== 0) {
  throw new Error("Darkspear Islands placed POI inventory changed in this build.");
}
const locations = [];
const markers = [];
for (const poi of trace.pois) {
  if (!poi.name || poi.iconId !== 900 || !poi.onExtractedTerrain
    || english.map.publishedBattlegroundObjectives?.[poi.poiId] !== poi.name) {
    throw new Error(`Darkspear Islands POI ${poi.poiId} has no verified objective label or placement.`);
  }
  const stateRows = states.rows.filter(({ parentPoi }) =>
    parentPoi?.poiId === poi.poiId && parentPoi.mapId === 2997);
  if (![2, 4].includes(stateRows.length)) {
    throw new Error(`Darkspear Islands POI ${poi.poiId} lacks expected source state records.`);
  }
  const { x, y } = poi.mapPosition;
  const tileX = Math.floor(x / terrain.tileSize);
  const tileY = Math.floor(y / terrain.tileSize);
  const tileKey = `${tileX},${tileY}`;
  if (x < terrain.bounds.minX || x >= terrain.bounds.maxX
    || y < terrain.bounds.minY || y >= terrain.bounds.maxY
    || !terrain.tileCoverage[0].includes(tileKey)) {
    throw new Error(`Darkspear Islands POI ${poi.poiId} lies outside native terrain.`);
  }
  const pixel = await sharp(join(root, "public/maps/wdt-7251908/tiles/0",
    `tile${tileX}x${tileY}.webp`)).ensureAlpha().extract({
    left: Math.floor(x - tileX * terrain.tileSize),
    top: Math.floor(y - tileY * terrain.tileSize), width: 1, height: 1,
  }).raw().toBuffer();
  if (pixel[3] === 0) throw new Error(`Darkspear Islands POI ${poi.poiId} sits on transparent terrain.`);
  const locationId = `client-darkspear-objective-poi-${poi.poiId}`;
  locations.push({ id: locationId, name: "",
    nameKey: `map.publishedBattlegroundObjectives.${poi.poiId}`,
    category: "battleground-objective", label: "", subtype: "client-area-poi",
    regionId: "", region: "", x, y });
  markers.push({ locationId, poiId: poi.poiId, name: poi.name,
    areaPoiStateIds: stateRows.map(({ id }) => id),
    sourceWorldPosition: poi.worldPosition, mapPosition: poi.mapPosition,
    nativeTile: tileKey, nativePixelAlpha: pixel[3] });
}
await writeFile(join(root, "public/maps/wdt-7251908/locations-objectives.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-darkspear-objective-evidence.json"),
  `${JSON.stringify({ source: { ...trace.source,
    areaPoiStateFileDataId: states.source.fileDataId,
    areaPoiStateSha256: states.source.sha256 },
    selectionRule: "Five exact-name Map 2997 icon-900 AreaPOIs with native tile positions and direct AreaPOIState parent relationships.",
    caveat: "State fields remain uninterpreted. The pins identify objectives but do not claim current control, interaction rules, or a battlemaster NPC.",
    markers }, null, 2)}\n`);
console.log(`Published ${locations.length} Darkspear Islands objectives with ${markers.reduce((sum, marker) => sum + marker.areaPoiStateIds.length, 0)} source state links.`);
