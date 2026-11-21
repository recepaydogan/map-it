/** Publish named world-map instance POIs joined to their client Map records. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const candidates = await readJson("data/client-research/instance-poi-candidates.json");
const english = await readJson("src/i18n/locales/en.json");
const instanceArtwork = await readJson("data/client-research/instance-artwork.json");
if (atlas.source?.build !== candidates.source.build
  || atlas.source.build !== instanceArtwork.source.build) {
  throw new Error("Instance POIs, artwork, and atlas belong to different client builds.");
}
const selected = candidates.records.filter(({ atlasPosition, matchingMaps }) =>
  atlasPosition && matchingMaps.length === 1
  && atlasPosition.x >= atlas.bounds.minX && atlasPosition.x <= atlas.bounds.maxX
  && atlasPosition.y >= atlas.bounds.minY && atlasPosition.y <= atlas.bounds.maxY);
for (const record of selected) {
  const localized = english.map?.publishedInstances?.[record.poiId];
  if (localized?.name !== record.name
    || (record.parentAreaName && localized?.region !== record.parentAreaName)) {
    throw new Error(`Add the client name and region for AreaPOI ${record.poiId} to map.publishedInstances in en.json.`);
  }
}
const iconsByInstanceName = new Map(instanceArtwork.records
  .filter(({ kind }) => kind === "icon")
  .map(({ instanceName, path }) => [instanceName, path]));
const backgroundsByInstanceName = new Map(instanceArtwork.records
  .filter(({ kind }) => kind === "background")
  .map(({ instanceName, path }) => [instanceName, path]));
const locations = selected.map((record) => ({
  id: `client-instance-poi-${record.poiId}`,
  name: "",
  nameKey: `map.publishedInstances.${record.poiId}.name`,
  category: "dungeon",
  label: "",
  subtype: "instance",
  regionId: "",
  region: "",
  ...(record.parentAreaName
    ? { regionKey: `map.publishedInstances.${record.poiId}.region` } : {}),
  ...(iconsByInstanceName.has(record.name)
    ? { iconPath: iconsByInstanceName.get(record.name) } : {}),
  ...(backgroundsByInstanceName.has(record.name)
    ? { artworkPath: backgroundsByInstanceName.get(record.name) } : {}),
  x: record.atlasPosition.x,
  y: record.atlasPosition.y,
}));
await writeFile(join(root, "public/maps/world-atlas/locations-instances.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-instance-poi-evidence.json"),
  `${JSON.stringify({ source: candidates.source,
    placementRule: "The client's named AreaPOI position on a world map, joined by exact normalized name to one non-world Map record.",
    caveat: "The POI locates the instance on the world map; an exact doorway, entry level range, and supported modes are not established by this join.",
    markers: selected.map((record) => ({
      locationId: `client-instance-poi-${record.poiId}`,
      poiId: record.poiId,
      name: record.name,
      instanceMapId: record.matchingMaps[0].id,
      worldMapId: record.worldMapId,
      areaId: record.areaId,
      parentAreaId: record.parentAreaId,
      worldPosition: record.worldPosition,
      atlasPosition: record.atlasPosition,
    })),
  }, null, 2)}\n`);
console.log(`Published ${locations.length} client-named instance map POIs.`);
