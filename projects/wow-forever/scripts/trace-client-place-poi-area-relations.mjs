/** Trace native AreaTable relationships between named places and world POIs. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const profile = await readJson("data/client-research/area-poi-category-profile.json");
const settlements = await readJson("data/client-research/published-settlement-poi-evidence.json");
if (profile.source.build !== settlements.source.build
  || profile.source.sha256 !== settlements.source.sha256
  || profile.source.areaTable?.sha256 !== settlements.source.areaTable?.sha256) {
  throw new Error("Place and POI area records come from different client sources.");
}

const includedGroups = [[4, 0, 6], [4, 0, 2], [0, 0, 7], [0, 0, 6],
  [0, 0, 0], [1, 3, 4], [3, 0, 15]];
const points = includedGroups.flatMap(([iconId, uiCategory, uiPriority]) => {
  const group = profile.groups.find((entry) => entry.iconId === iconId
    && entry.uiCategory === uiCategory && entry.uiPriority === uiPriority);
  if (!group) throw new Error(`Missing native POI group ${iconId}:${uiCategory}:${uiPriority}.`);
  return group.records;
});
const records = points.flatMap((point) => settlements.markers.filter((place) =>
  point.poiId !== place.poiId
  && point.mapId === place.mapId
  && point.areaName === place.name
  && place.areaIds.includes(point.areaId)
  && Math.hypot(point.worldPosition[0] - place.worldPosition[0],
    point.worldPosition[1] - place.worldPosition[1]) <= 500).map((place) => ({
  pointPoiId: point.poiId,
  pointLocationId: `client-place-poi-${point.poiId}`,
  placePoiId: place.poiId,
  placeLocationId: place.locationId,
  mapId: point.mapId,
  areaId: point.areaId,
  areaName: point.areaName,
  worldDistance: Math.round(Math.hypot(point.worldPosition[0] - place.worldPosition[0],
    point.worldPosition[1] - place.worldPosition[1])),
}))).sort((left, right) => left.pointPoiId - right.pointPoiId);
if (records.length !== 12 || new Set(records.map(({ pointPoiId }) => pointPoiId)).size !== 12) {
  throw new Error(`Expected 12 uniquely placed native AreaTable relationships, got ${records.length}.`);
}
await writeFile(join(root, "data/client-research/place-poi-area-relations.json"),
  `${JSON.stringify({ source: profile.source,
    rule: "A named world POI shares its native AreaTable ID and exact area name with a published city/town POI on the same client map, within 500 world units.",
    caveat: "This identifies an area relationship, not an entrance, service, quest, or route.",
    records }, null, 2)}\n`);
console.log(`Traced ${records.length} native place/POI area relationships.`);
