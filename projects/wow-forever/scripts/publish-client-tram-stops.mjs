/** Place the two world-side Deeprun Tram entrances from client triggers. */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const trace = await readJson("data/client-research/tram-route-audit.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
const expected = [
  { triggerId: 2173, city: "Stormwind", cityPoiId: 16,
    otherTriggerId: 2175 },
  { triggerId: 2175, city: "Ironforge", cityPoiId: 8,
    otherTriggerId: 2173 },
];
if (trace.source.build !== atlas.source.build
  || trace.mapRows.length !== 1
  || trace.mapRows[0].mapId !== 369
  || trace.mapRows[0].name !== "Deeprun Tram"
  || trace.insideTramAreaTriggers.length !== 2
  || trace.insideTramAreaTriggers.some(({ mapId }) => mapId !== 369)
  || trace.worldTriggerCandidates.length !== expected.length
  || trace.taxiPathIdsOnTramMap.length
  || trace.namedPlacedObjects.length) {
  throw new Error("The local Deeprun Tram trigger pattern changed.");
}
for (const [id, rawField] of [[2166, 18654], [2171, 18655],
  [2173, 18656], [2175, 18657]]) {
  const trigger = [...trace.insideTramAreaTriggers,
    ...trace.worldTriggerCandidates].find((record) => record.id === id);
  if (trigger?.rawFields[13] !== rawField) {
    throw new Error(`Deeprun Tram trigger ${id} no longer matches the local sequence.`);
  }
}
const project = createClientWorldProjector(atlas);
const layer = atlas.terrainLayers.find(({ source }) => source.mapId === 0);
if (!layer) throw new Error("Eastern Kingdoms terrain is missing.");
const locations = [];
const evidence = [];
for (const spec of expected) {
  const trigger = trace.worldTriggerCandidates.find(({ id }) =>
    id === spec.triggerId && id !== spec.otherTriggerId);
  const nearbyCity = trigger?.nearbyCities.find(({ name, locationId }) =>
    name === spec.city && locationId === `client-settlement-poi-${spec.cityPoiId}`);
  if (!trigger || trigger.mapId !== 0
    || !nearbyCity || nearbyCity.distanceWorld > 900
    || trigger.nearbyCities[0].name !== spec.city
    || !english.map?.transportStops?.names?.tram?.[spec.triggerId]) {
    throw new Error(`Unverified world-side tram trigger ${spec.triggerId}.`);
  }
  const position = project(0, trigger.position);
  if (!position || position.x < atlas.bounds.minX
    || position.x > atlas.bounds.maxX
    || position.y < atlas.bounds.minY
    || position.y > atlas.bounds.maxY) {
    throw new Error(`Tram trigger ${spec.triggerId} is outside the atlas.`);
  }
  const sourceX = (position.x - layer.originX) / layer.scaleX;
  const sourceY = (position.y - layer.originY) / layer.scaleY;
  const tileX = Math.floor(sourceX / layer.tileSize);
  const tileY = Math.floor(sourceY / layer.tileSize);
  const tile = `${tileX},${tileY}`;
  if (!layer.tileCoverage[0].includes(tile)) {
    throw new Error(`Tram trigger ${spec.triggerId} has no native tile.`);
  }
  const tilePath = resolve(root, "public/maps/world-atlas", layer.basePath,
    `tiles/0/tile${tileX}x${tileY}.webp`);
  const { data, info } = await sharp(tilePath).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const pixelX = Math.floor(sourceX - tileX * layer.tileSize);
  const pixelY = Math.floor(sourceY - tileY * layer.tileSize);
  const alpha = data[(pixelY * info.width + pixelX) * info.channels + 3];
  if (!alpha) throw new Error(`Tram trigger ${spec.triggerId} is off terrain.`);
  const id = `client-tram-stop-${spec.triggerId}`;
  locations.push({ id, name: "",
    nameKey: `map.transportStops.names.tram.${spec.triggerId}`,
    category: "transport", label: "", subtype: "tram-stop",
    regionId: "", region: "",
    regionKey: `map.publishedSettlements.${spec.cityPoiId}`,
    descriptionKey: "map.transportStops.availability",
    x: position.x, y: position.y,
    linkedMarkerGroups: [{ titleKey: "map.transportStops.routeStops",
      links: [{ mapId: "azeroth",
        markerId: `client-tram-stop-${spec.otherTriggerId}`,
        nameKey: `map.transportStops.places.${spec.city === "Ironforge"
          ? "stormwind" : "ironforge"}` }] }],
  });
  evidence.push({ locationId: id, triggerId: spec.triggerId,
    sourceMapId: trigger.mapId, worldPosition: trigger.position,
    atlasPosition: position, terrain: { tile, alpha },
    nearestCity: nearbyCity, otherTriggerId: spec.otherTriggerId });
}
await writeFile(join(root, "public/maps/world-atlas/locations-tram-stops.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root,
  "data/client-research/published-tram-stop-evidence.json"),
  `${JSON.stringify({ source: trace.source,
    rule: "Deeprun Tram is client Map 369. Two triggers occur within that map and two adjacent-ID world triggers occur near Stormwind and Ironforge on opaque native terrain. Publish the world-side positions with reciprocal navigation, as a geographic inference rather than a proven teleport join.",
    caveat: "The local AreaTrigger fields do not explicitly pair each world entrance with an interior endpoint or prove current service and timing.",
    markers: evidence }, null, 2)}\n`);
console.log(`Published ${locations.length} inferred Deeprun Tram world entrances.`);
