/** Inventory non-flight transport path geometry without treating node IDs as dock names. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const network = await readJson("data/client-research/taxi-path-network.json");
const taxi = await readJson("data/client-research/taxi-node-identities.json");
const settlements = await readJson("data/client-research/published-settlement-poi-evidence.json");
const overlays = await readJson("data/client-research/published-marker-evidence.json");
const points = await readJson("data/client-research/published-point-of-interest-evidence.json");
const boatSigns = await readJson("data/client-research/boat-signs.json");
const transportSigns = await readJson("data/client-research/transport-sign-trace.json");
const build = network.source.build;
if ([taxi, settlements, overlays, points, boatSigns, transportSigns]
  .some(({ source }) => source.build !== build)) {
  throw new Error("Transport paths and positioned client evidence use different builds.");
}
const byTaxiId = new Map(taxi.nodes.map((node) => [node.id, node]));
const transportNodes = taxi.nodes.filter(({ name }) =>
  /^(Transport,|Generic,)|\bFerry\b/i.test(name));
const transportIds = new Set(transportNodes.map(({ id }) => id));
const placeRecords = [...settlements.markers, ...points.markers,
  ...overlays.markers].map((place) => ({
  locationId: place.locationId, name: place.name,
  mapId: place.mapId ?? place.sourceIds?.worldMapId,
  worldPosition: place.worldPosition,
})).filter(({ mapId, worldPosition }) =>
  (mapId === 0 || mapId === 1) && worldPosition?.length >= 2);
const signs = [...boatSigns.signs, ...transportSigns.signs];
const near = (position, mapId, records, limit = 3) => records
  .filter((record) => record.mapId === mapId)
  .map((record) => ({ id: record.locationId ?? record.objectId,
    name: record.name,
    horizontalWorldDistance: Math.hypot(
      position[0] - record.worldPosition[0],
      position[1] - record.worldPosition[1]),
  })).sort((left, right) =>
    left.horizontalWorldDistance - right.horizontalWorldDistance).slice(0, limit);
const distance = (left, right) => left.mapId === right.mapId
  ? Math.hypot(left.position[0] - right.position[0],
    left.position[1] - right.position[1]) : null;
const routePaths = network.paths.filter(({ fromTaxiNodeId, toTaxiNodeId }) =>
  transportIds.has(fromTaxiNodeId) || transportIds.has(toTaxiNodeId));
const records = routePaths.map((path) => {
  const first = path.nodes[0];
  const last = path.nodes.at(-1);
  const repeatedWaypoints = [];
  for (let index = 0; index < path.nodes.length; index += 1) {
    for (let later = index + 2; later < path.nodes.length; later += 1) {
      const gap = distance(path.nodes[index], path.nodes[later]);
      if (gap !== null && gap <= 1) repeatedWaypoints.push({
        firstSequence: index, repeatedSequence: later,
        horizontalWorldDistance: gap,
      });
    }
  }
  const reverseByNodeIds = routePaths.filter((other) =>
    other.id !== path.id && other.fromTaxiNodeId === path.toTaxiNodeId
    && other.toTaxiNodeId === path.fromTaxiNodeId).map(({ id }) => id);
  const reverseByGeometry = first && last ? routePaths.filter((other) => {
    if (other.id === path.id || other.nodes.length < 2) return false;
    const endpointGap = distance(first, other.nodes.at(-1));
    const startGap = distance(last, other.nodes[0]);
    return endpointGap !== null && startGap !== null
      && endpointGap <= 100 && startGap <= 100;
  }).map(({ id }) => id) : [];
  const endpoint = (node, taxiId) => {
    if (!node) return null;
    const identity = byTaxiId.get(taxiId);
    return { routeMapId: node.mapId, worldPosition: node.position,
      taxiNodeId: taxiId, taxiNodeName: identity?.name ?? null,
      taxiNodeMapId: identity?.mapId ?? null,
      taxiNodeWorldDistance: identity?.mapId === node.mapId
        ? Math.hypot(node.position[0] - identity.worldPosition[0],
          node.position[1] - identity.worldPosition[1]) : null,
      nearestPlaces: near(node.position, node.mapId, placeRecords),
      nearestPlacedSigns: near(node.position, node.mapId, signs),
    };
  };
  return { pathId: path.id, fromTaxiNodeId: path.fromTaxiNodeId,
    toTaxiNodeId: path.toTaxiNodeId, routeWaypointCount: path.nodes.length,
    routeMapIds: [...new Set(path.nodes.map(({ mapId }) => mapId))],
    start: endpoint(first, path.fromTaxiNodeId),
    end: endpoint(last, path.toTaxiNodeId),
    repeatedWaypoints, reverseByNodeIds, reverseByGeometry };
});
const report = { source: { product: network.source.product, build,
  taxiPathTables: network.source.tables,
  taxiNodes: { fileDataId: taxi.source.fileDataId,
    sha256: taxi.source.sha256 } },
  rule: "Inventory every TaxiPath touching a TaxiNode explicitly named Transport, Generic, or Ferry. Compare its first and last geometry to the actual named node coordinates and nearby positioned places. A route name, shared ID, or nearby place alone does not identify a boarding point or service.",
  transportTaxiNodes: transportNodes.map(({ id, name, mapId, worldPosition }) =>
    ({ id, name, mapId, worldPosition })),
  pathCount: records.length,
  pathGeometryCount: records.filter(({ routeWaypointCount }) =>
    routeWaypointCount > 0).length,
  records };
await writeFile(join(root, "data/client-research/transport-path-audit.json"),
  `${JSON.stringify(report, null, 2)}\n`);
console.log(`Audited ${records.length} transport-related TaxiPaths, ${report.pathGeometryCount} with geometry.`);
