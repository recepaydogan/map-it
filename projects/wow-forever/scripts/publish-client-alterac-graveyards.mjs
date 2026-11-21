/** Publish named Alterac Valley graveyard POIs without duplicate state rows. */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const trace = await readJson("data/client-research/razorfen-graveyard-client-trace.json");
const terrain = await readJson("public/maps/wdt-790112/metadata.json");
const identities = await readJson("data/client-research/wdt-map-identities.json");
const profile = await readJson("data/client-research/area-poi-category-profile.json");
const atlasIcons = await readJson("data/client-research/atlas-icons.json");
const english = await readJson("src/i18n/locales/en.json");
const poiTable = trace.source.tables.find(({ name }) => name === "AreaPOI");
const wdt = identities.records.find(({ wdtFileDataId }) =>
  wdtFileDataId === terrain.source.wdtFileDataId);
const graveyardGlyph = atlasIcons.records.find(({ name }) =>
  name === "poi-graveyard-neutral");
if (trace.source.product !== terrain.source.product
  || trace.source.build !== terrain.source.build
  || trace.source.build !== identities.source.build
  || trace.source.build !== atlasIcons.source.build
  || poiTable?.sha256 !== profile.source.sha256
  || wdt?.maps.length !== 1 || wdt.maps[0].mapId !== 30
  || wdt.maps[0].name !== english.map.battlegroundMaps.alteracValley
  || !graveyardGlyph || !existsSync(join(root, "public", graveyardGlyph.path))) {
  throw new Error("Alterac graveyard POIs and extracted terrain have inconsistent client sources.");
}
const candidates = trace.areaPoiRows.filter(({ mapId, name }) =>
  mapId === 30 && name.endsWith(" Graveyard"));
const grouped = new Map();
for (const poi of candidates) {
  const records = grouped.get(poi.name) ?? [];
  records.push(poi);
  grouped.set(poi.name, records);
}
if (!grouped.size) throw new Error("No named Alterac Valley graveyards in local AreaPOI.");
const { grid } = terrain.source;
const worldTileSize = 1600 / 3;
const project = ([worldX, worldY]) => ({
  x: (32 - worldY / worldTileSize - grid.minX) * terrain.tileSize,
  y: (32 - worldX / worldTileSize - grid.minY) * terrain.tileSize,
});
const locations = [];
const evidence = [];
for (const [name, records] of grouped) {
  records.sort((left, right) => left.poiId - right.poiId);
  const representative = records[0];
  const maxSeparation = Math.max(...records.flatMap((left) => records.map((right) =>
    Math.hypot(left.worldPosition[0] - right.worldPosition[0],
      left.worldPosition[1] - right.worldPosition[1]))));
  if (maxSeparation > 1) throw new Error(`Same-name graveyard POIs differ in position: ${name}.`);
  if (english.map.publishedGraveyards?.[representative.poiId] !== name) {
    throw new Error(`Add exact graveyard AreaPOI ${representative.poiId} name to en.json.`);
  }
  const { x, y } = project(representative.worldPosition);
  const tile = `${Math.floor(x / terrain.tileSize)},${Math.floor(y / terrain.tileSize)}`;
  if (x < terrain.bounds.minX || x > terrain.bounds.maxX
    || y < terrain.bounds.minY || y > terrain.bounds.maxY
    || !terrain.tileCoverage[0].includes(tile)) {
    throw new Error(`Graveyard ${name} lies outside available native terrain.`);
  }
  locations.push({ id: `client-graveyard-poi-${representative.poiId}`,
    name: "", nameKey: `map.publishedGraveyards.${representative.poiId}`,
    category: "graveyard", label: "", subtype: "client-area-poi",
    regionId: "", region: "", x, y });
  evidence.push({ name, locationId: `client-graveyard-poi-${representative.poiId}`,
    representativePoiId: representative.poiId,
    sourcePoiIds: records.map(({ poiId }) => poiId),
    sourceWorldPosition: representative.worldPosition,
    mapPosition: { x, y }, maxSourceSeparationWorldUnits: maxSeparation });
}
await writeFile(join(root, "public/maps/wdt-790112/locations-graveyards.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-alterac-graveyard-evidence.json"),
  `${JSON.stringify({ source: { product: trace.source.product, build: trace.source.build,
    areaPoiFileDataId: poiTable.fileDataId, areaPoiSha256: poiTable.sha256,
    mapId: 30, wdtFileDataId: terrain.source.wdtFileDataId,
    wdtSha256: terrain.source.wdtSha256,
    nativeGraveyardGlyph: { path: graveyardGlyph.path,
      atlasMemberId: graveyardGlyph.memberId,
      textureSha256: graveyardGlyph.textureSha256 } },
  selectionRule: "AreaPOI rows on client Map 30 whose exact names end in Graveyard; same-name rows within one world unit are one map location. Use the lowest POI ID's original position.",
  caveat: "These are client POI positions, not a specific spirit healer or guaranteed current battleground control state. No Map 47 Razorfen graveyard POI was found.",
  markers: evidence }, null, 2)}\n`);
console.log(`Published ${locations.length} named Alterac Valley graveyards from ${candidates.length} client POI rows.`);
