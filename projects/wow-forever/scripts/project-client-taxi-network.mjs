/** Preserve atlas positions for client flight routes without naming their nodes. */
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
const paths = network.paths.map((path) => ({
  id: path.id,
  fromTaxiNodeId: path.fromTaxiNodeId,
  toTaxiNodeId: path.toTaxiNodeId,
  nodes: path.nodes.flatMap((node) => {
    const atlasPosition = project(node.mapId, node.position);
    return atlasPosition ? [{ id: node.id, sequence: node.sequence, mapId: node.mapId,
      worldPosition: node.position, atlasPosition }] : [];
  }),
})).filter((path) => path.nodes.length);
const nodeCount = paths.reduce((total, path) => total + path.nodes.length, 0);
const outsideAtlas = paths.flatMap((path) => path.nodes).filter(({ atlasPosition: { x, y } }) =>
  x < atlas.bounds.minX || x > atlas.bounds.maxX
  || y < atlas.bounds.minY || y > atlas.bounds.maxY).length;
const output = join(root, "data/client-research/taxi-path-atlas-projection.json");
await writeFile(output, `${JSON.stringify({ source: {
  product: network.source.product, build: network.source.build,
  atlasUiMapAssignmentFileDataId: atlas.source.uiMapAssignmentFileDataId,
  atlasUiMapAssignmentSha256: atlas.source.uiMapAssignmentSha256,
  endpointTableLocallyAvailable: false,
}, note: "Flight route geometry only. No endpoint name, service location, or faction is verified.",
summary: { paths: paths.length, nodes: nodeCount, outsideAtlas }, paths }, null, 2)}\n`);
console.log(`Projected ${nodeCount} flight route nodes across ${paths.length} paths; ${outsideAtlas} outside atlas bounds.`);
