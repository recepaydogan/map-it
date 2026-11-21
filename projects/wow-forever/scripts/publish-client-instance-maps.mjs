/** Link published instance POIs to complete, locally extracted client maps. */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const published = await readJson("data/client-research/published-instance-poi-evidence.json");
const identities = await readJson("data/client-research/wdt-map-identities.json");
const layerPath = "public/maps/world-atlas/locations-instances.json";
const layer = await readJson(layerPath);
const mapTable = published.source.tables.find(({ name }) => name === "Map");
if (published.source.product !== identities.source.product
  || published.source.build !== identities.source.build
  || mapTable?.sha256 !== identities.source.sha256) {
  throw new Error("Instance POIs and WDT identities use different Map records.");
}

const byLocation = new Map();
const evidence = [];
for (const marker of published.markers) {
  const candidates = identities.records.filter(({ maps }) =>
    maps.some(({ mapId }) => mapId === marker.instanceMapId));
  if (candidates.length !== 1) continue;
  const candidate = candidates[0];
  if (candidate.maps.length !== 1 || candidate.maps[0].name !== marker.name) continue;
  const wdtId = candidate.wdtFileDataId;
  const mapPath = `public/maps/wdt-${wdtId}`;
  if (!existsSync(join(root, mapPath, "metadata.json"))) continue;
  const terrain = await readJson(`${mapPath}/metadata.json`);
  if (terrain.source?.product !== published.source.product
    || terrain.source?.build !== published.source.build
    || terrain.source?.wdtFileDataId !== wdtId
    || terrain.source?.tileCount !== candidate.tileCount
    || terrain.source?.missingFileDataIds?.length
    || terrain.tileCoverage?.[0]?.length !== candidate.tileCount) {
    throw new Error(`Incomplete or mismatched client terrain for WDT ${wdtId}.`);
  }
  for (const coordinate of terrain.tileCoverage[0]) {
    const [x, y] = coordinate.split(",");
    if (!existsSync(join(root, mapPath, "tiles", "0", `tile${x}x${y}.webp`))) {
      throw new Error(`Missing native tile ${coordinate} in WDT ${wdtId}.`);
    }
  }
  const relatedMapId = marker.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  byLocation.set(marker.locationId, relatedMapId);
  evidence.push({ locationId: marker.locationId, poiId: marker.poiId,
    instanceMapId: marker.instanceMapId, wdtFileDataId: wdtId,
    relatedMapId, nativeTileCount: candidate.tileCount,
    wdtSha256: terrain.source.wdtSha256 });
}
layer.locations = layer.locations.map((location) => {
  const updated = { ...location };
  delete updated.relatedMapId;
  const relatedMapId = byLocation.get(location.id);
  if (relatedMapId) updated.relatedMapId = relatedMapId;
  return updated;
});
await writeFile(join(root, layerPath), `${JSON.stringify(layer, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-instance-map-links.json"),
  `${JSON.stringify({ source: { product: published.source.product,
    build: published.source.build, mapTableSha256: mapTable.sha256 },
  rule: "The published AreaPOI joins one client Map record, which joins one extracted WDT with all native minimap tiles locally available.",
  caveat: "This is the client map's terrain, not a verified entrance coordinate or a complete room and floor guide.",
  links: evidence }, null, 2)}\n`);
console.log(`Linked ${evidence.length} instance POIs to complete local client maps.`);
