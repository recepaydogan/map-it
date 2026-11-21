/** Publish client-classified city and town AreaPOIs beyond the overlay-backed seeds. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const candidates = await readJson("data/client-research/settlement-poi-candidates.json");
const overlayBacked = await readJson("data/client-research/published-marker-evidence.json");
const english = await readJson("src/i18n/locales/en.json");
if (atlas.source?.build !== candidates.source.build
  || atlas.source.build !== overlayBacked.source.build) {
  throw new Error("The settlement POIs, overlays, and atlas belong to different builds.");
}
const alreadyPublished = new Set(overlayBacked.markers.map(({ sourceIds }) => sourceIds.areaPoiId));
const selected = candidates.records.filter(({ poiId }) => !alreadyPublished.has(poiId));
for (const record of selected) {
  if (english.map?.publishedSettlements?.[record.poiId] !== record.name) {
    throw new Error(`Add the client place name for AreaPOI ${record.poiId} to en.json.`);
  }
  if (record.regionName
    && english.map?.publishedSettlementRegions?.[record.poiId] !== record.regionName) {
    throw new Error(`Add the client region for AreaPOI ${record.poiId} to en.json.`);
  }
}
const locations = selected.map((record) => ({
  id: `client-settlement-poi-${record.poiId}`,
  name: "",
  nameKey: `map.publishedSettlements.${record.poiId}`,
  category: record.category,
  label: "",
  subtype: record.category,
  regionId: "",
  region: "",
  ...(record.regionName
    ? { regionKey: `map.publishedSettlementRegions.${record.poiId}` } : {}),
  x: record.atlasPosition.x,
  y: record.atlasPosition.y,
}));
await writeFile(join(root, "public/maps/world-atlas/locations-settlements.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-settlement-poi-evidence.json"),
  `${JSON.stringify({ source: candidates.source,
    selectionRule: "Named world-map AreaPOIs with the native major-city icon ID 29/priority 5 or town icon ID 5/priority 4 or 6. The client uses several UI categories for these icons; overlay-backed seeds are excluded to prevent duplicates.",
    positionNote: "The marker uses the client's map POI position, not a specific NPC or building coordinate.",
    markers: selected.map((record) => ({
      locationId: `client-settlement-poi-${record.poiId}`,
      poiId: record.poiId,
      name: record.name,
      category: record.category,
      mapId: record.mapId,
      worldPosition: record.worldPosition,
      atlasPosition: record.atlasPosition,
      areaIds: record.areaIds,
      parentAreaId: record.parentAreaId,
      regionName: record.regionName,
      iconId: record.iconId,
      uiCategory: record.uiCategory,
      uiPriority: record.uiPriority,
    })),
  }, null, 2)}\n`);
console.log(`Published ${locations.length} additional client-classified city and town POIs.`);
