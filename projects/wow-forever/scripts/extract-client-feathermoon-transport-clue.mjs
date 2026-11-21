/** Preserve the named Feathermoon transport path without guessing its dock. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const nodes = await readJson("data/client-research/taxi-node-identities.json");
const network = await readJson("data/client-research/taxi-path-network.json");
const settlements = await readJson("data/client-research/settlement-poi-candidates.json");
if (atlas.source?.build !== nodes.source.build
  || atlas.source.build !== network.source.build
  || atlas.source.build !== settlements.source.build) {
  throw new Error("The transport path and atlas belong to different builds.");
}
const transport = nodes.nodes.find(({ name }) => name === "Transport, Feathermoon - Feralas");
const settlement = settlements.records.find(({ name }) => name === "Feathermoon Stronghold");
if (!transport || !settlement) throw new Error("Missing named Feathermoon client records.");
const paths = network.paths.filter(({ fromTaxiNodeId, toTaxiNodeId }) =>
  fromTaxiNodeId === transport.id || toTaxiNodeId === transport.id);
const project = createClientWorldProjector(atlas);
const records = paths.map((path) => ({
  pathId: path.id,
  fromTaxiNodeId: path.fromTaxiNodeId,
  toTaxiNodeId: path.toTaxiNodeId,
  fromName: nodes.nodes.find(({ id }) => id === path.fromTaxiNodeId)?.name ?? null,
  toName: nodes.nodes.find(({ id }) => id === path.toTaxiNodeId)?.name ?? null,
  routeNodeCount: path.nodes.length,
  routeMapIds: [...new Set(path.nodes.map(({ mapId }) => mapId))],
  start: path.nodes.length ? {
    worldPosition: path.nodes[0].position,
    atlasPosition: project(path.nodes[0].mapId, path.nodes[0].position),
  } : null,
  end: path.nodes.length ? {
    worldPosition: path.nodes.at(-1).position,
    atlasPosition: project(path.nodes.at(-1).mapId, path.nodes.at(-1).position),
  } : null,
  route: path.nodes.map(({ id, mapId, position }) => ({ id, mapId,
    worldPosition: position, atlasPosition: project(mapId, position) })),
  repeatedWaypointPairs: path.nodes.flatMap((left, leftIndex) =>
    path.nodes.slice(leftIndex + 1).flatMap((right) => {
      const distance = Math.hypot(...left.position.map((value, axis) =>
        value - right.position[axis]));
      return distance <= 0.01 ? [{ firstNodeId: left.id,
        repeatedNodeId: right.id, distance }] : [];
    })),
  allWaypointAltitudesZero: path.nodes.every(({ position }) => position[2] === 0),
}));
await writeFile(join(root, "data/client-research/feathermoon-transport-clue.json"),
  `${JSON.stringify({ source: {
    product: nodes.source.product, build: nodes.source.build,
    taxiNodes: nodes.source,
    taxiPath: network.source,
    settlementEvidence: "settlement-poi-candidates.json",
  }, transport: { taxiNodeId: transport.id, name: transport.name,
    mapId: transport.mapId, worldPosition: transport.worldPosition,
    atlasPosition: transport.atlasPosition,
    horizontalWorldDistanceToFeathermoon: Math.hypot(
      transport.worldPosition[0] - settlement.worldPosition[0],
      transport.worldPosition[1] - settlement.worldPosition[1]) },
  settlement: { poiId: settlement.poiId, name: settlement.name,
    worldPosition: settlement.worldPosition, atlasPosition: settlement.atlasPosition },
  paths: records,
  caveat: "The client names a transport node and route near Feathermoon. Repeated waypoints show a loop, while the generic target node and zero-altitude geometry do not identify a boarding dock, direction, schedule, or active service. No boat pin is published.",
  }, null, 2)}\n`);
console.log(`Preserved Feathermoon transport node ${transport.id} and ${records.length} route(s).`);
