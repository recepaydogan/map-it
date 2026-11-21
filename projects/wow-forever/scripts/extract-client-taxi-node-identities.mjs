/** Join named client taxi nodes to route geometry without guessing NPC spawns. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const candidates = await readJson("data/client-research/taxi-node-candidates.json");
const tableRecord = catalog.identified.find(({ name }) => name === "TaxiNodes");
if (!tableRecord) throw new Error("TaxiNodes is not identified in the client.");
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const unpackPosition = (value) => {
  if (typeof value !== "bigint") throw new Error("Expected packed taxi node position.");
  const bytes = Buffer.alloc(12);
  for (let index = 0; index < 3; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return [0, 4, 8].map((offset) => bytes.readFloatLE(offset));
};
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const bytes = storage.readFile(fileName(tableRecord.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== tableRecord.layoutHash
    || atlas.source?.build !== storage.getProductInfo().buildNumber
    || candidates.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("Taxi node, atlas, or route evidence belongs to another client build.");
  }
  const project = createClientWorldProjector(atlas);
  const routeByTaxiId = new Map(candidates.nodes.map((node) => [node.taxiNodeId, node]));
  const nodes = reader.getAllIDs().map((id) => {
    const row = reader.getRowData(id);
    if (!Array.isArray(row) || row[4]?.data !== id) {
      throw new Error(`Invalid TaxiNodes record ${id}.`);
    }
    const name = row[0].string;
    const mapId = row[5].data;
    const worldPosition = unpackPosition(row[1].data);
    const atlasPosition = project(mapId, worldPosition);
    const route = routeByTaxiId.get(id);
    const closeObservations = route?.observations.filter((observation) =>
      observation.mapId === mapId
      && Math.hypot(worldPosition[0] - observation.worldPosition[0],
        worldPosition[1] - observation.worldPosition[1]) <= 15
      && Math.abs(worldPosition[2] - observation.worldPosition[2]) <= 30) ?? [];
    const hasDeparture = closeObservations.some(({ direction }) => direction === "departure");
    const hasArrival = closeObservations.some(({ direction }) => direction === "arrival");
    const routeCorroborated = closeObservations.length >= 2 && hasDeparture && hasArrival;
    const meanEndpoint = routeCorroborated ? [0, 1, 2].map((axis) =>
      closeObservations.reduce((sum, observation) =>
        sum + observation.worldPosition[axis], 0) / closeObservations.length) : null;
    const routeEndpointDistance = meanEndpoint
      ? Math.hypot(worldPosition[0] - meanEndpoint[0],
        worldPosition[1] - meanEndpoint[1],
        worldPosition[2] - meanEndpoint[2]) : null;
    const closePathIds = new Set(closeObservations.map(({ pathId }) => pathId));
    const closeConnections = route?.connections.filter(({ pathId }) => closePathIds.has(pathId)) ?? [];
    return { id, name, mapId, worldPosition, atlasPosition,
      mountCreatureIds: row[14].data, flags: row[8].data,
      routeStatus: routeCorroborated ? "position-candidate" : route?.status ?? "no-route",
      routeObservationCount: closeObservations.length,
      routeEndpointDistance,
      outgoingTaxiNodeIds: [...new Set(closeConnections
        .filter(({ direction }) => direction === "outgoing")
        .map(({ otherTaxiNodeId }) => otherTaxiNodeId))].sort((a, b) => a - b),
      connectedTaxiNodeIds: [...new Set(closeConnections.map(({ otherTaxiNodeId }) => otherTaxiNodeId))]
        .sort((a, b) => a - b),
      routePathIds: [...closePathIds]
        .sort((a, b) => a - b) };
  });
  const output = join(root, "data/client-research/taxi-node-identities.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    table: tableRecord.name,
    fileDataId: tableRecord.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections,
    routeEvidence: "taxi-node-candidates.json",
  }, note: "TaxiNodes positions and names are client records. Only route endpoints on the same map near the exact node position corroborate a flight point; special cross-map transport endpoints are excluded. Route endpoints may differ from the service NPC's exact position.",
  nodes }, null, 2)}\n`);
  console.log(`Identified ${nodes.length} named taxi nodes; ${nodes.filter(({ routeEndpointDistance }) => routeEndpointDistance !== null).length} have positioned route corroboration.`);
} finally {
  storage.close();
}
