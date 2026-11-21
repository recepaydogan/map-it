/** Reconstruct taxi endpoint candidates from repeated local flight paths. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const network = await readJson("data/client-research/taxi-path-network.json");
if (atlas.source?.product !== network.source.product
  || atlas.source.build !== network.source.build) {
  throw new Error("The atlas and taxi network belong to different client builds.");
}
const project = createClientWorldProjector(atlas);
const observationsByNode = new Map();
const connectionsByNode = new Map();
for (const path of network.paths) {
  if (!path.nodes.length) continue;
  for (const [nodeId, otherNodeId, direction] of [
    [path.fromTaxiNodeId, path.toTaxiNodeId, "outgoing"],
    [path.toTaxiNodeId, path.fromTaxiNodeId, "incoming"],
  ]) {
    const connections = connectionsByNode.get(nodeId) ?? [];
    connections.push({ pathId: path.id, otherTaxiNodeId: otherNodeId, direction });
    connectionsByNode.set(nodeId, connections);
  }
  for (const [nodeId, node, direction] of [
    [path.fromTaxiNodeId, path.nodes[0], "departure"],
    [path.toTaxiNodeId, path.nodes.at(-1), "arrival"],
  ]) {
    const observations = observationsByNode.get(nodeId) ?? [];
    observations.push({ pathId: path.id, direction, mapId: node.mapId,
      routeNodeId: node.id, worldPosition: node.position });
    observationsByNode.set(nodeId, observations);
  }
}
const nodes = [...observationsByNode].map(([taxiNodeId, observations]) => {
  const mapIds = [...new Set(observations.map(({ mapId }) => mapId))];
  const worldPosition = [0, 1, 2].map((axis) => observations.reduce((sum, observation) =>
    sum + observation.worldPosition[axis], 0) / observations.length);
  const maxHorizontalDeviation = Math.max(...observations.map(({ worldPosition: position }) =>
    Math.hypot(position[0] - worldPosition[0], position[1] - worldPosition[1])));
  const hasDeparture = observations.some(({ direction }) => direction === "departure");
  const hasArrival = observations.some(({ direction }) => direction === "arrival");
  const consistent = taxiNodeId > 0 && mapIds.length === 1
    && observations.length >= 2 && hasDeparture && hasArrival
    && maxHorizontalDeviation <= 30;
  const atlasPosition = consistent ? project(mapIds[0], worldPosition) : null;
  return { taxiNodeId, mapIds, observationCount: observations.length,
    hasDeparture, hasArrival, maxHorizontalDeviation,
    worldPosition: consistent ? worldPosition : null,
    atlasPosition, status: atlasPosition ? "position-candidate" : "unresolved",
    connections: connectionsByNode.get(taxiNodeId) ?? [], observations };
}).sort((a, b) => a.taxiNodeId - b.taxiNodeId);
const positionedCount = nodes.filter(({ status }) => status === "position-candidate").length;
const output = join(root, "data/client-research/taxi-node-candidates.json");
await writeFile(output, `${JSON.stringify({ source: {
  product: network.source.product, build: network.source.build,
  pathTableFileDataId: network.source.tables.find(({ name }) => name === "TaxiPath").fileDataId,
  nodeTableFileDataId: network.source.tables.find(({ name }) => name === "TaxiPathNode").fileDataId,
}, candidateRule: "At least two route endpoints on one map, including an arrival and a departure, within 30 world units of their mean.",
note: "This stage groups route endpoints before joining readable TaxiNodes identities. Special transport paths can create distant outliers; the identity stage excludes them.",
summary: { taxiNodeIds: nodes.length, positionedCandidates: positionedCount }, nodes }, null, 2)}\n`);
console.log(`Found ${positionedCount} positioned taxi endpoint candidates among ${nodes.length} referenced TaxiNode IDs.`);
