/** Place route-specific transport pause markers on native map terrain. */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const stops = await readJson("data/client-research/transport-stop-candidates.json");
const network = await readJson("data/client-research/taxi-path-network.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const settlements = await readJson("data/client-research/published-settlement-poi-evidence.json");
const overlays = await readJson("data/client-research/published-marker-evidence.json");
const points = await readJson("data/client-research/published-point-of-interest-evidence.json");
const survey = await readJson("data/client-research/map-placement-survey.json");
const taxi = await readJson("data/client-research/taxi-node-identities.json");
const build = stops.source.build;
if ([network, atlas, settlements, overlays, points, survey, taxi]
  .some(({ source }) => source.build !== build)
  || stops.source.sha256 !== network.source.tables.find(({ name }) =>
    name === "TaxiPathNode")?.sha256) {
  throw new Error("Transport pauses and map positions belong to different builds.");
}
const project = createClientWorldProjector(atlas);
const namedPlaces = [...settlements.markers, ...points.markers,
  ...overlays.markers].map((place) => ({
  id: place.locationId, name: place.name,
  mapId: place.mapId ?? place.sourceIds?.worldMapId,
  worldPosition: place.worldPosition,
})).filter(({ worldPosition }) => worldPosition?.length >= 2);
const namedObjects = survey.maps.flatMap(({ mapId, gameObjects }) =>
  gameObjects.map((object) => ({ id: object.objectId,
    name: object.name, mapId, worldPosition: object.worldPosition })));
const taxiNodes = taxi.nodes.map(({ id, name, mapId, worldPosition }) =>
  ({ id, name, mapId, worldPosition }));
const nearest = (record, candidates) => candidates.filter(({ mapId }) =>
  mapId === record.mapId).map((candidate) => ({
    id: candidate.id, name: candidate.name,
    distanceWorld: Math.hypot(
      candidate.worldPosition[0] - record.worldPosition[0],
      candidate.worldPosition[1] - record.worldPosition[1]),
  })).sort((left, right) => left.distanceWorld - right.distanceWorld)
  .slice(0, 4);
const tileCache = new Map();
const terrain = async ({ mapId, atlasPosition }) => {
  const layer = atlas.terrainLayers.find(({ source }) => source.mapId === mapId);
  if (!layer) throw new Error(`No native terrain for Map ${mapId}.`);
  const sourceX = (atlasPosition.x - layer.originX) / layer.scaleX;
  const sourceY = (atlasPosition.y - layer.originY) / layer.scaleY;
  const tileX = Math.floor(sourceX / layer.tileSize);
  const tileY = Math.floor(sourceY / layer.tileSize);
  const tile = `${tileX},${tileY}`;
  if (!layer.tileCoverage[0].includes(tile)) return { tile, alpha: null };
  const tilePath = resolve(root, "public/maps/world-atlas", layer.basePath,
    `tiles/0/tile${tileX}x${tileY}.webp`);
  if (!tileCache.has(tilePath)) {
    tileCache.set(tilePath, await sharp(tilePath).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true }));
  }
  const { data, info } = tileCache.get(tilePath);
  const pixelX = Math.floor(sourceX - tileX * layer.tileSize);
  const pixelY = Math.floor(sourceY - tileY * layer.tileSize);
  if (pixelX < 0 || pixelX >= info.width
    || pixelY < 0 || pixelY >= info.height) {
    throw new Error(`Projected stop is outside tile ${tile}.`);
  }
  return { tile, alpha: data[(pixelY * info.width + pixelX)
    * info.channels + 3] };
};
const pathById = new Map(network.paths.map((path) => [path.id, path]));
const rowsByPath = Map.groupBy(stops.records.filter(({ pauseCandidate }) =>
  pauseCandidate), ({ pathId }) => pathId);
const lines = [];
for (const [pathId, rows] of rowsByPath) {
  const unique = [];
  for (const row of rows) {
    const existing = unique.find((candidate) => candidate.mapId === row.mapId
      && Math.hypot(candidate.worldPosition[0] - row.worldPosition[0],
        candidate.worldPosition[1] - row.worldPosition[1]) <= 1);
    if (existing) existing.sourceRouteNodeIds.push(row.routeNodeId);
    else unique.push({ ...row, sourceRouteNodeIds: [row.routeNodeId] });
  }
  if (unique.length < 2) continue;
  const path = pathById.get(pathId);
  const placedStops = await Promise.all(unique.map(async (row) => {
    const atlasPosition = project(row.mapId, row.worldPosition);
    if (!atlasPosition || !Number.isFinite(atlasPosition.x)
      || !Number.isFinite(atlasPosition.y)
      || atlasPosition.x < atlas.bounds.minX
      || atlasPosition.x > atlas.bounds.maxX
      || atlasPosition.y < atlas.bounds.minY
      || atlasPosition.y > atlas.bounds.maxY) {
      throw new Error(`Transport stop ${row.routeNodeId} is outside the atlas.`);
    }
    return { stopId: `client-transport-stop-${pathId}-${row.sequence}`,
      pathId, sequence: row.sequence, mapId: row.mapId,
      worldPosition: row.worldPosition, atlasPosition,
      rawFields: row.rawFields,
      sourceRouteNodeIds: row.sourceRouteNodeIds,
      terrain: await terrain({ mapId: row.mapId, atlasPosition }),
      nearbyPlaces: nearest(row, namedPlaces),
      nearbyNamedObjects: nearest(row, namedObjects),
      nearbyTaxiNodes: nearest(row, taxiNodes) };
  }));
  lines.push({ pathId, fromTaxiNodeId: path.fromTaxiNodeId,
    toTaxiNodeId: path.toTaxiNodeId,
    sourceWaypointCount: path.nodes.length,
    repeatedStopCount: rows.length - unique.length,
    stops: placedStops });
}
lines.sort((left, right) => left.pathId - right.pathId);
const report = { source: { product: network.source.product, build,
  taxiPathTables: network.source.tables,
  placedGameObjects: survey.source.tables.find(({ name }) =>
    name === "GameObjects") },
  rule: "Distinct pause-candidate waypoints on each TaxiPath are projected using the exact client world map and sampled against extracted opaque terrain. Nearby named objects and places are clues; proximity does not prove a boarding service, faction restriction, schedule, or reverse-direction availability.",
  lineCount: lines.length,
  routeSpecificStopCount: lines.reduce((count, line) =>
    count + line.stops.length, 0),
  transparentStops: lines.flatMap(({ pathId, stops: markers }) => markers
    .filter(({ terrain: pixel }) => pixel.alpha === null || pixel.alpha === 0)
    .map(({ stopId }) => ({ pathId, stopId }))),
  lines };
await writeFile(join(root, "data/client-research/transport-stop-relations.json"),
  `${JSON.stringify(report, null, 2)}\n`);
console.log(`Traced ${report.routeSpecificStopCount} stops on ${report.lineCount} routes; ${report.transparentStops.length} are outside opaque native terrain.`);
